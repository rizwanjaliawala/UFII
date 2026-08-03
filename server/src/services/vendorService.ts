import { canonicalVendorName, vendorKey } from "@tms/shared";
import { query } from "../db/pool.js";
import { config } from "../config/index.js";
import { getContainerRepository } from "../repositories/containerRepository.js";
import { RISK_SQL, isoDay } from "../repositories/aggregates.js";

/**
 * Vendor performance (doc 03 §Vendor Management).
 *
 * Attribution is deliberately split, because the source data distinguishes
 * three party roles and conflating them corrupts both scores and cost:
 *
 *   operational KPIs  → `trucker`          (they control pickup timing)
 *   D&D cost          → `responsible_party` (they absorbed the charge)
 *
 * Two of the documented KPIs — average response time and update compliance —
 * require Outlook data that does not exist yet. They are reported as
 * unavailable rather than as zero: a 0h response time would read as
 * "instant", which is the opposite of the truth.
 */

export interface VendorKpi {
  name: string;
  key: string;

  activeContainers: number;
  totalContainers: number;
  completed: number;

  /** Gated out on or before LFD, over containers where both dates exist. */
  onTimePickupRate: number | null;
  onTimeSample: number;
  atRisk: number;
  overdue: number;

  /** Sum of D&D invoices where this vendor is the responsible party. */
  ddCostResponsible: number;
  /** Sum where this vendor was the trucker, regardless of who paid. */
  ddCostAsTrucker: number;
  invoiceCount: number;
  creditNoteTotal: number;

  /** 0–100 from the metrics that exist. Null when the sample is too small. */
  score: number | null;
}

export interface VendorSummary {
  generatedAt: string;
  source: "sheets" | "neon";
  vendors: VendorKpi[];
  totals: { vendors: number; ddCost: number; credits: number };
  unavailable: { metric: string; reason: string; phase: string }[];
}

/**
 * Composite score.
 *
 * Deliberately built only from metrics we actually measure. Response time and
 * update compliance are documented KPIs but need Outlook, so including them
 * as zero would drag every vendor down for a reason that is not their fault.
 *
 * On-time pickup dominates because it is the outcome that costs money; D&D
 * per container is the financial consequence of missing it.
 */
const WEIGHTS = { onTime: 0.6, ddCost: 0.4 } as const;

/** $500+ of D&D per active container scores zero; $0 scores 100. */
const DD_CEILING_PER_CONTAINER = 500;

function scoreVendor(kpi: Omit<VendorKpi, "score">): number | null {
  // Below this the rate is noise — three containers is not a track record.
  if (kpi.onTimeSample < 5) return null;

  const onTime = (kpi.onTimePickupRate ?? 0) * 100;
  const perContainer =
    kpi.activeContainers > 0
      ? kpi.ddCostResponsible / kpi.activeContainers
      : kpi.ddCostResponsible;
  const cost = Math.max(0, 100 * (1 - perContainer / DD_CEILING_PER_CONTAINER));

  return Math.round(onTime * WEIGHTS.onTime + cost * WEIGHTS.ddCost);
}

export interface VendorTrendPoint {
  month: string;
  containers: number;
  onTimeRate: number | null;
  onTimeSample: number;
  ddCost: number;
}

export interface VendorDetail {
  kpi: VendorKpi | null;
  trend: VendorTrendPoint[];
  terminals: { name: string; count: number }[];
  recentInvoices: {
    invoiceNumber: string;
    amount: number;
    containers: number;
    responsibleParty: string | null;
    paymentStatus: string | null;
  }[];
}

/**
 * One vendor in depth — the drill-down behind a scorecard.
 *
 * The trend is grouped by the month a container was picked up, not by the
 * source sheet's tab name. The tabs are monthly but a container can appear in
 * a later tab than its own movement, so grouping by tab would attribute
 * performance to the wrong month.
 *
 * `onTimeRate` is null for a month with too few completed moves for the same
 * reason the headline score is — a single late pickup in a two-container
 * month reads as 50% and would dominate the line.
 */
const TREND_MIN_SAMPLE = 3;

export async function getVendorDetail(
  key: string,
  now = new Date(),
): Promise<VendorDetail> {
  const summary = await getVendorSummary(now);
  const kpi = summary.vendors.find((v) => v.key === key) ?? null;

  if (!config.database.configured || !kpi) {
    return { kpi, trend: [], terminals: [], recentInvoices: [] };
  }

  const [trend, terminals, invoices] = await Promise.all([
    query<{
      month: string;
      containers: number;
      on_time: number;
      completed: number;
      dd_cost: string | null;
    }>(
      `WITH moves AS (
         SELECT to_char(COALESCE(gate_out_date, appointment_date, eta), 'YYYY-MM') AS month,
                container_number,
                (gate_out_date IS NOT NULL
                 AND last_free_day IS NOT NULL
                 AND gate_out_date <= last_free_day) AS on_time,
                (gate_out_date IS NOT NULL AND last_free_day IS NOT NULL) AS scored
           FROM containers
          WHERE trucker_key = $1
            AND COALESCE(gate_out_date, appointment_date, eta) IS NOT NULL
       )
       SELECT m.month,
              COUNT(*)::int                                   AS containers,
              COUNT(*) FILTER (WHERE m.on_time)::int          AS on_time,
              COUNT(*) FILTER (WHERE m.scored)::int           AS completed,
              COALESCE(SUM(l.amount), 0)::text                AS dd_cost
         FROM moves m
         LEFT JOIN invoice_lines l ON l.container_number = m.container_number
        GROUP BY m.month
        ORDER BY m.month`,
      [key],
    ),
    query<{ name: string; count: number }>(
      `SELECT terminal AS name, COUNT(*)::int AS count
         FROM containers
        WHERE trucker_key = $1 AND terminal IS NOT NULL AND terminal <> ''
        GROUP BY terminal ORDER BY count DESC LIMIT 8`,
      [key],
    ),
    query<{
      invoice_number: string;
      total_amount: string | null;
      containers: number;
      responsible_party: string | null;
      source_payment_status: string | null;
    }>(
      `SELECT i.invoice_number, i.total_amount, i.responsible_party,
              i.source_payment_status,
              COUNT(l.container_number)::int AS containers
         FROM invoices i
         JOIN invoice_lines l ON l.invoice_number = i.invoice_number
        WHERE i.trucker_key = $1
        GROUP BY i.invoice_number, i.total_amount, i.responsible_party,
                 i.source_payment_status
        ORDER BY i.invoice_number DESC
        LIMIT 10`,
      [key],
    ),
  ]);

  return {
    kpi,
    trend: trend.rows
      // A NULL month means no usable date on any of the three columns. It
      // cannot be placed on a timeline, so it is left off rather than
      // bucketed somewhere convenient and wrong.
      .filter((row) => !!row.month)
      .map((row) => ({
        month: row.month,
        containers: row.containers,
        onTimeSample: row.completed,
        onTimeRate:
          row.completed >= TREND_MIN_SAMPLE ? row.on_time / row.completed : null,
        ddCost: Number(row.dd_cost ?? 0),
      })),
    terminals: terminals.rows,
    recentInvoices: invoices.rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      amount: Number(row.total_amount ?? 0),
      containers: row.containers,
      responsibleParty: row.responsible_party,
      paymentStatus: row.source_payment_status,
    })),
  };
}

export async function getVendorSummary(now = new Date()): Promise<VendorSummary> {
  const repository = await getContainerRepository();

  const unavailable = [
    {
      metric: "Average response time",
      reason: "Requires Outlook message history",
      phase: "Phase 3",
    },
    {
      metric: "Update compliance",
      reason: "Requires the reminder log",
      phase: "Phase 3",
    },
  ];

  if (repository.kind !== "neon" || !config.database.configured) {
    // Sheet path: containers only, no invoice data to attribute cost from.
    const containers = await repository.getAll();
    const groups = new Map<string, VendorKpi>();

    for (const container of containers) {
      const name = canonicalVendorName(container.trucker);
      if (!name) continue;
      const key = vendorKey(name)!;
      const entry =
        groups.get(key) ??
        ({
          name,
          key,
          activeContainers: 0,
          totalContainers: 0,
          completed: 0,
          onTimePickupRate: null,
          onTimeSample: 0,
          atRisk: 0,
          overdue: 0,
          ddCostResponsible: 0,
          ddCostAsTrucker: 0,
          invoiceCount: 0,
          creditNoteTotal: 0,
          score: null,
        } satisfies VendorKpi);

      entry.totalContainers++;
      groups.set(key, entry);
    }

    return {
      generatedAt: now.toISOString(),
      source: "sheets",
      vendors: [...groups.values()].sort((a, b) => b.totalContainers - a.totalContainers),
      totals: { vendors: groups.size, ddCost: 0, credits: 0 },
      unavailable: [
        ...unavailable,
        {
          metric: "D&D cost attribution",
          reason: "Invoices live in the database; run an ingest first",
          phase: "Now",
        },
      ],
    };
  }

  const today = isoDay(now);

  // Operational metrics, grouped by the canonical trucker key so a vendor
  // spelled two ways in the sheets counts once.
  const operational = await query<{
    key: string;
    display: string;
    total: number;
    active: number;
    completed: number;
    at_risk: number;
    overdue: number;
    on_time: number;
    on_time_sample: number;
  }>(
    `SELECT trucker_key AS key,
            MIN(trucker) AS display,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE COALESCE(status_override, src_status)
                    IN ('Pending','Pickup Scheduled','Picked Up'))::int AS active,
            COUNT(*) FILTER (
              WHERE COALESCE(status_override, src_status)
                    NOT IN ('Pending','Pickup Scheduled','Picked Up'))::int AS completed,
            COUNT(*) FILTER (WHERE ${RISK_SQL} IN ('overdue','critical'))::int AS at_risk,
            COUNT(*) FILTER (WHERE ${RISK_SQL} = 'overdue')::int AS overdue,
            COUNT(*) FILTER (
              WHERE gate_out_date IS NOT NULL AND last_free_day IS NOT NULL
                AND gate_out_date <= last_free_day)::int AS on_time,
            COUNT(*) FILTER (
              WHERE gate_out_date IS NOT NULL AND last_free_day IS NOT NULL)::int AS on_time_sample
       FROM containers
      WHERE trucker_key IS NOT NULL AND trucker_key <> ''
      GROUP BY trucker_key`,
    [today],
  );

  // Cost follows the responsible party, not the trucker.
  const responsible = await query<{ key: string; total: string; invoices: number }>(
    `SELECT LOWER(TRIM(responsible_party)) AS key,
            COALESCE(SUM(total_amount), 0)::text AS total,
            COUNT(*)::int AS invoices
       FROM invoices
      WHERE responsible_party IS NOT NULL AND responsible_party <> ''
      GROUP BY 1`,
  );

  const asTrucker = await query<{ key: string; total: string }>(
    `SELECT trucker_key AS key, COALESCE(SUM(total_amount), 0)::text AS total
       FROM invoices
      WHERE trucker_key IS NOT NULL AND trucker_key <> ''
      GROUP BY 1`,
  );

  const credits = await query<{ key: string; total: string }>(
    `SELECT LOWER(TRIM(company)) AS key, COALESCE(SUM(amount), 0)::text AS total
       FROM credit_notes
      WHERE company IS NOT NULL AND company <> ''
      GROUP BY 1`,
  );

  // Cost tables store the party name as written; re-key through the same
  // canonicaliser so they line up with the container groups.
  const byCanonicalKey = (rows: { key: string; total: string }[]) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = vendorKey(row.key);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + Number(row.total));
    }
    return map;
  };

  const responsibleCost = byCanonicalKey(responsible.rows);
  const responsibleCounts = new Map<string, number>();
  for (const row of responsible.rows) {
    const key = vendorKey(row.key);
    if (key) responsibleCounts.set(key, (responsibleCounts.get(key) ?? 0) + row.invoices);
  }
  const truckerCost = byCanonicalKey(asTrucker.rows);
  const creditTotals = byCanonicalKey(credits.rows);

  const vendors: VendorKpi[] = operational.rows.map((row) => {
    const name = canonicalVendorName(row.display) ?? row.display;
    const key = vendorKey(name) ?? row.key;

    const base: Omit<VendorKpi, "score"> = {
      name,
      key,
      activeContainers: row.active,
      totalContainers: row.total,
      completed: row.completed,
      onTimePickupRate: row.on_time_sample > 0 ? row.on_time / row.on_time_sample : null,
      onTimeSample: row.on_time_sample,
      atRisk: row.at_risk,
      overdue: row.overdue,
      ddCostResponsible: responsibleCost.get(key) ?? 0,
      ddCostAsTrucker: truckerCost.get(key) ?? 0,
      invoiceCount: responsibleCounts.get(key) ?? 0,
      creditNoteTotal: creditTotals.get(key) ?? 0,
    };

    return { ...base, score: scoreVendor(base) };
  });

  // Merge any rows that canonicalised onto the same vendor.
  const merged = new Map<string, VendorKpi>();
  for (const vendor of vendors) {
    const existing = merged.get(vendor.key);
    if (!existing) {
      merged.set(vendor.key, vendor);
      continue;
    }
    existing.totalContainers += vendor.totalContainers;
    existing.activeContainers += vendor.activeContainers;
    existing.completed += vendor.completed;
    existing.atRisk += vendor.atRisk;
    existing.overdue += vendor.overdue;
    existing.onTimeSample += vendor.onTimeSample;
  }

  const list = [...merged.values()].sort(
    (a, b) => b.totalContainers - a.totalContainers,
  );

  return {
    generatedAt: now.toISOString(),
    source: "neon",
    vendors: list,
    totals: {
      vendors: list.length,
      ddCost: list.reduce((sum, v) => sum + v.ddCostResponsible, 0),
      credits: list.reduce((sum, v) => sum + v.creditNoteTotal, 0),
    },
    unavailable,
  };
}
