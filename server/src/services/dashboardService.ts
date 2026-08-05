import { canonicalVendorName, daysUntil, type LfdRisk } from "@tms/shared";
import { getContainerRepository } from "../repositories/containerRepository.js";
import type { GroupCount } from "../repositories/aggregates.js";
import { query } from "../db/pool.js";
import { pgDate } from "../db/dates.js";
import { config } from "../config/index.js";

/**
 * Dashboard aggregation (doc 03 §Dashboard).
 *
 * Counting is delegated to the repository, which does it in SQL on the Neon
 * path and in Node on the sheet path. This service only shapes the result for
 * the UI — it never loads the container set itself.
 *
 * Where a data source is not yet connected, the section reports
 * `available: false` rather than a zero: a zero reads as "nothing owing" when
 * the truth is "not measured yet".
 */

export interface AttentionItem {
  id: string;
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  hint: string;
  href: string;
}

export interface DashboardSummary {
  generatedAt: string;
  source: {
    kind: "sheets" | "neon";
    /** Everything ever ingested. The database is a cumulative store. */
    containers: number;
    loadedAt: string | null;
    /**
     * How many containers the source sheets held at the last sync.
     *
     * Reported separately because the two legitimately differ: containers
     * drop out of the monthly tabs over time and are deliberately kept here
     * forever. Showing only the total would make the fleet look inflated;
     * showing only the source count would look like history had been lost.
     */
    sourceContainers: number | null;
    lastSyncAt: string | null;
    cumulative: true;
  };
  kpis: {
    activeContainers: number;
    atPort: number;
    inTransit: number;
    completed: number;
    arrivingToday: number;
    appointmentsToday: number;
    lfdDueToday: number;
    overdue: number;
  };
  risk: Record<LfdRisk, number>;
  attention: AttentionItem[];
  lfdBoard: {
    containerNumber: string;
    lastFreeDay: string | null;
    daysRemaining: number | null;
    risk: LfdRisk;
    trucker: string | null;
    terminal: string | null;
  }[];
  byTerminal: GroupCount[];
  byPod: GroupCount[];
  byTrucker: GroupCount[];
  upcoming: { date: string; label: string; count: number }[];
  unavailable: { module: string; reason: string; phase: string }[];
}

/**
 * The risk board is a worklist, not a report — only containers needing action,
 * most urgent first, capped.
 */
const BOARD_LIMIT = 40;

export async function getDashboardSummary(now = new Date()): Promise<DashboardSummary> {
  const repository = await getContainerRepository();
  const [totals, stats] = await Promise.all([
    repository.aggregates(now),
    repository.stats(),
  ]);

  const [lfdBoard, lastSync] = await Promise.all([
    getLfdBoard(repository.kind, now),
    getLastSync(),
  ]);

  const attention: AttentionItem[] = (
    [
      {
        id: "overdue",
        label: "Past Last Free Day",
        count: totals.risk.overdue,
        severity: "critical",
        hint: "Still at the terminal with demurrage accruing",
        href: "/containers?risk=overdue",
      },
      {
        id: "lfd-today",
        label: "Last Free Day is today",
        count: totals.risk.critical,
        severity: "critical",
        hint: "Must move today to avoid demurrage",
        href: "/containers?risk=critical",
      },
      {
        id: "lfd-soon",
        label: "Last Free Day within 2 days",
        count: totals.risk.warning,
        severity: "warning",
        hint: "Book an appointment now",
        href: "/containers?risk=warning",
      },
      {
        id: "missing-appointment",
        label: "No appointment booked",
        count: totals.missingAppointment,
        severity: "warning",
        hint: "Active container with no appointment date",
        href: "/containers",
      },
      {
        id: "missing-pu",
        label: "No pickup number",
        count: totals.missingPu,
        severity: "warning",
        hint: "PU is not in the source sheet — arrives via OCR or manual entry",
        href: "/containers",
      },
      {
        id: "unassigned",
        label: "No trucker assigned",
        count: totals.unassigned,
        severity: "warning",
        hint: "Active container with no haulier",
        href: "/containers",
      },
      {
        id: "stale",
        label: "No movement in 3+ days",
        count: totals.stale,
        severity: "info",
        hint: "Active container with no recent update",
        href: "/containers",
      },
    ] satisfies AttentionItem[]
  ).filter((item) => item.count > 0);

  // Vendor names are canonicalised for display so one vendor cannot appear
  // twice under different spellings.
  const canonicalise = (rows: GroupCount[]): GroupCount[] => {
    const merged = new Map<string, GroupCount>();
    for (const row of rows) {
      const name = canonicalVendorName(row.name) ?? row.name;
      const entry = merged.get(name) ?? { name, total: 0, atRisk: 0, active: 0 };
      entry.total += row.total;
      entry.atRisk += row.atRisk;
      entry.active += row.active;
      merged.set(name, entry);
    }
    return [...merged.values()].sort((a, b) => b.total - a.total);
  };

  return {
    generatedAt: now.toISOString(),
    source: {
      kind: repository.kind,
      containers: totals.total,
      loadedAt: stats?.loadedAt ?? null,
      sourceContainers: lastSync?.sourceContainers ?? null,
      lastSyncAt: lastSync?.at ?? null,
      cumulative: true,
    },
    kpis: {
      activeContainers: totals.activeContainers,
      atPort: totals.atPort,
      inTransit: totals.inTransit,
      completed: totals.completed,
      arrivingToday: totals.arrivingToday,
      appointmentsToday: totals.appointmentsToday,
      lfdDueToday: totals.lfdDueToday,
      overdue: totals.risk.overdue,
    },
    risk: totals.risk,
    attention,
    lfdBoard,
    byTerminal: totals.byTerminal.slice(0, 8),
    byPod: totals.byPod.slice(0, 8),
    byTrucker: canonicalise(totals.byTrucker).slice(0, 8),
    upcoming: totals.upcoming.map((day, index) => ({
      ...day,
      label:
        index === 0
          ? "Today"
          : new Date(`${day.date}T00:00:00`).toLocaleDateString("en-US", {
              weekday: "short",
              day: "numeric",
            }),
    })),
    unavailable: [
      {
        module: "Cost Analysis",
        reason: "Invoice amounts are ingested but not yet costed per container",
        phase: "Phase 4",
      },
      {
        module: "Email Intelligence",
        reason: "Outlook Desktop integration is not yet built",
        phase: "Phase 3",
      },
      { module: "AI Insights", reason: "Agents are not yet implemented", phase: "Phase 4" },
    ],
  };
}

/**
 * The most recent successful sync.
 *
 * `containers_upserted` is how many the SOURCE held — it is the count of rows
 * the sheets offered, not the size of the store. Older runs predate the
 * column split and report null rather than a number that would be wrong.
 */
async function getLastSync(): Promise<{ at: string; sourceContainers: number } | null> {
  if (!config.database.configured) return null;

  try {
    const { rows } = await query<{ started_at: Date; containers_upserted: number }>(
      `SELECT started_at, containers_upserted
         FROM sync_runs
        WHERE status = 'Success' AND containers_upserted > 0
        ORDER BY started_at DESC
        LIMIT 1`,
    );
    const row = rows[0];
    return row
      ? { at: row.started_at.toISOString(), sourceContainers: row.containers_upserted }
      : null;
  } catch {
    return null;
  }
}

/**
 * The at-risk worklist.
 *
 * On Neon this is a single indexed query returning 40 rows rather than the
 * whole fleet. On the sheet path it falls back to filtering in memory, which
 * is already loaded there.
 */
async function getLfdBoard(
  kind: "sheets" | "neon",
  now: Date,
): Promise<DashboardSummary["lfdBoard"]> {
  if (kind === "neon" && config.database.configured) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { rows } = await query<{
      container_number: string;
      last_free_day: Date | null;
      days_remaining: number | null;
      risk: string;
      trucker: string | null;
      terminal: string | null;
    }>(
      `SELECT container_number,
              last_free_day,
              (last_free_day - $1::date) AS days_remaining,
              CASE
                WHEN (last_free_day - $1::date) < 0 THEN 'overdue'
                WHEN (last_free_day - $1::date) = 0 THEN 'critical'
                ELSE 'warning'
              END AS risk,
              trucker, terminal
         FROM containers
        WHERE gate_out_date IS NULL
          AND COALESCE(status_override, src_status)
              NOT IN ('Picked Up','Delivered','Empty Returned','Closed')
          AND last_free_day IS NOT NULL
          AND (last_free_day - $1::date) <= 2
        ORDER BY last_free_day ASC
        LIMIT ${BOARD_LIMIT}`,
      [today],
    );

    return rows.map((row) => ({
      containerNumber: row.container_number,
      lastFreeDay: pgDate(row.last_free_day),
      daysRemaining: row.days_remaining,
      risk: row.risk as LfdRisk,
      trucker: row.trucker,
      terminal: row.terminal,
    }));
  }

  const { getContainerRepository: getRepo } = await import(
    "../repositories/containerRepository.js"
  );
  const containers = await (await getRepo()).getAll();
  const { lfdRisk } = await import("@tms/shared");

  return containers
    .filter((c) => {
      const r = lfdRisk(c, now);
      return r === "overdue" || r === "critical" || r === "warning";
    })
    .sort((a, b) => {
      const da = a.lastFreeDay ? daysUntil(a.lastFreeDay, now) : 9999;
      const db = b.lastFreeDay ? daysUntil(b.lastFreeDay, now) : 9999;
      return da - db;
    })
    .slice(0, BOARD_LIMIT)
    .map((c) => ({
      containerNumber: c.containerNumber,
      lastFreeDay: c.lastFreeDay,
      daysRemaining: c.lastFreeDay ? daysUntil(c.lastFreeDay, now) : null,
      risk: lfdRisk(c, now),
      trucker: c.trucker,
      terminal: c.terminal,
    }));
}
