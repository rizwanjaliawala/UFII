import {
  canonicalVendorName,
  normalizeAmount,
  normalizeContainerNumber,
  normalizeDate,
  normalizeInteger,
  normalizeName,
  vendorKey,
  type Container,
} from "@tms/shared";
import { requireSourceSheetId } from "../config/index.js";
import { syncLogger } from "../utils/logger.js";
import { query, transaction } from "../db/pool.js";
import { loadContainers } from "./containerService.js";
import {
  CsvSourceReader,
  buildHeaderIndex,
  cell,
} from "../integrations/google/csvSource.js";

/**
 * Ingest: source sheets → Neon.
 *
 * The governing rule (doc 06, doc 12): a re-ingest refreshes operational data
 * and must NEVER destroy operator input. The UPSERT below therefore lists the
 * ingested columns explicitly on UPDATE — `pickup_number`, `status_override`,
 * the notes, tags and flags are deliberately absent, so they survive untouched.
 * A blanket `SET (col) = (EXCLUDED.col)` would silently wipe them.
 */

export interface IngestResult {
  runId: number | null;
  tabsRead: number;
  rowsRead: number;
  containersUpserted: number;
  /** New containers this sync had never seen before. */
  containersInserted: number;
  /** Containers already held, refreshed with the latest source values. */
  containersUpdated: number;
  /**
   * Every container ever ingested, after this run.
   *
   * Deliberately distinct from `containersUpserted`: the store is cumulative,
   * so the total is normally LARGER than what the source currently holds, and
   * conflating the two would make the fleet look like it had shrunk whenever
   * a monthly tab rolled over.
   */
  containersTotal: number;
  invoicesUpserted: number;
  linesUpserted: number;
  creditNotes: number;
  fbuCharges: number;
  issues: number;
  durationMs: number;
}

const reader = new CsvSourceReader();

/* ---------------- Containers ---------------- */

/**
 * Columns the ingest owns. Anything not listed here is user-owned and is
 * never written by a sync — that separation is the whole contract.
 */
const INGESTED_COLUMNS = [
  "bl_number",
  "pod",
  "terminal",
  "ssl",
  "fc",
  "isa",
  "trucker",
  "trucker_key",
  "eta",
  "last_free_day",
  "appointment_date",
  "gate_out_date",
  "empty_return_date",
  "src_status",
  "appointment_status",
  "marked_status",
  "delivered_through",
  "vessel_name",
  "warehouse_delivery_date",
  "rejection_reason",
  "redirection_type",
  "responsible_stakeholder",
  "source_tab",
  "source_sheet",
] as const;

/**
 * Containers are inserted or updated, and NEVER removed.
 *
 * The database is a cumulative historical store, not a mirror of the source
 * sheets. A container that disappears from a monthly tab has not stopped
 * existing — the tab has simply moved on — and its shipment history stays
 * valid. So there is deliberately no delete, no archive flag and no
 * reconciliation pass here. Anything ever ingested is kept.
 *
 * Counting inserts separately from updates uses Postgres' `xmax`: on a row
 * returned by INSERT ... ON CONFLICT, `xmax = 0` means the row was newly
 * inserted, and a non-zero value means an existing row was updated. It is the
 * only way to tell the two apart without a second round trip per row.
 */
export interface UpsertCounts {
  inserted: number;
  updated: number;
}

async function upsertContainers(containers: Container[]): Promise<UpsertCounts> {
  if (containers.length === 0) return { inserted: 0, updated: 0 };

  const updateClause = INGESTED_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(",\n      ");

  // Batched to keep each statement well inside Postgres' parameter limit.
  const BATCH = 250;
  let inserted = 0;
  let updated = 0;

  for (let start = 0; start < containers.length; start += BATCH) {
    const batch = containers.slice(start, start + BATCH);
    const values: unknown[] = [];
    const tuples: string[] = [];

    batch.forEach((c, index) => {
      const base = index * 26;
      tuples.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},` +
          `$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},` +
          `$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18},` +
          `$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23},$${base + 24},` +
          `$${base + 25},$${base + 26})`,
      );
      values.push(
        c.containerNumber,
        c.blNumber,
        c.pod,
        c.terminal,
        c.ssl,
        c.fc,
        c.isa,
        c.trucker,
        vendorKey(c.trucker),
        c.eta,
        c.lastFreeDay,
        c.appointmentDate,
        c.gateOutDate,
        c.emptyReturnDate,
        c.status,
        c.appointmentStatus,
        c.markedStatus,
        c.deliveredThrough,
        c.vesselName,
        c.warehouseDeliveryDate,
        c.rejectionReason,
        c.redirectionType,
        c.responsibleStakeholder,
        c.sourceTab,
        c.sourceSheet,
        new Date().toISOString(),
      );
    });

    const result = await query<{ was_inserted: boolean }>(
      `INSERT INTO containers (
        container_number, bl_number, pod, terminal, ssl, fc, isa,
        trucker, trucker_key, eta, last_free_day, appointment_date,
        gate_out_date, empty_return_date, src_status, appointment_status,
        marked_status, delivered_through, vessel_name, warehouse_delivery_date,
        rejection_reason, redirection_type, responsible_stakeholder,
        source_tab, source_sheet, last_synced_at
      ) VALUES ${tuples.join(",")}
      -- returns was_inserted per row; see the note on upsertContainers
      ON CONFLICT (container_number) DO UPDATE SET
      ${updateClause},
      last_synced_at = EXCLUDED.last_synced_at
      RETURNING (xmax = 0) AS was_inserted`,
      values,
    );

    for (const row of result.rows) {
      if (row.was_inserted) inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}

/* ---------------- Sheet 2: invoices, credit notes, FBU ---------------- */

const INVOICE_ALIASES: Record<string, string[]> = {
  containerNumber: ["container", "container no", "container number"],
  invoiceNumber: ["invoice no", "invoice", "invoice number"],
  amount: ["invoice amount", "amount"],
  days: ["detention days", "days"],
  pickUpDate: ["pick-up date", "pick up date", "pickup date"],
  returnDate: ["return date"],
  lastFreeDay: ["lfd", "last free day"],
  responsibleParty: ["responsibilty", "responsibility", "responsible"],
  status: ["status", "payment status"],
  trucker: ["trucker", "vendor"],
  chargeType: ["invoice type", "type"],
  remarks: ["remarks", "remark"],
  forwarder: ["forwarder"],
  prId: ["pr id", "pr"],
};

const CREDIT_ALIASES: Record<string, string[]> = {
  containerNumber: ["container"],
  amount: ["amount"],
  company: ["company"],
  reason: ["reason"],
  remarks: ["remarks"],
  status: ["status"],
  creditNoteNumber: ["credit note no", "credit note"],
  prId: ["pr", "pr id"],
};

const FBU_ALIASES: Record<string, string[]> = {
  containerNumber: ["container"],
  invoiceNumber: ["invoice"],
  amount: ["amount"],
  trucker: ["trucker"],
  chargeType: ["type"],
  forwarder: ["forwarder"],
  prId: ["pr id", "pr"],
};

/** Which of Sheet 2's three tabs a set of headers belongs to. */
function classifyTab(headers: string[]): "invoices" | "credits" | "fbu" | "unknown" {
  const lower = headers.map((h) => h.trim().toLowerCase());
  if (lower.includes("detention days")) return "invoices";
  if (lower.includes("credit note no")) return "credits";
  if (lower.includes("type") && lower.includes("invoice")) return "fbu";
  return "unknown";
}

async function ingestSheet2(): Promise<{
  invoices: number;
  lines: number;
  credits: number;
  fbu: number;
  rows: number;
}> {
  const sheetId = requireSourceSheetId(2);
  const tabs = await reader.listTabs(sheetId);

  const stats = { invoices: 0, lines: 0, credits: 0, fbu: 0, rows: 0 };
  const invoiceTotals = new Map<string, { total: number; meta: Record<string, unknown> }>();

  // Rows are accumulated in memory and written in batches after parsing.
  // Sheet 2 is ~580 rows total, so holding them costs nothing and saves
  // hundreds of round trips.
  const lineRows: unknown[][] = [];
  const creditRows: unknown[][] = [];
  const fbuRows: unknown[][] = [];

  for (const tab of tabs) {
    const rows = await reader.readTab(sheetId, tab.gid);
    if (rows.length < 2) continue;

    const kind = classifyTab(rows[0]);
    if (kind === "unknown") {
      syncLogger.warn({ tab: tab.title }, "unrecognised Sheet 2 tab, skipping");
      continue;
    }

    const aliases =
      kind === "invoices"
        ? INVOICE_ALIASES
        : kind === "credits"
          ? CREDIT_ALIASES
          : FBU_ALIASES;
    const index = buildHeaderIndex(rows[0], aliases);

    for (const row of rows.slice(1)) {
      const containerNumber = normalizeContainerNumber(cell(row, index, "containerNumber"));
      if (!containerNumber) continue;
      stats.rows++;

      if (kind === "invoices") {
        const invoiceNumber = normalizeName(cell(row, index, "invoiceNumber"));
        const amount = normalizeAmount(cell(row, index, "amount")) ?? 0;
        if (!invoiceNumber) continue;

        const trucker = canonicalVendorName(cell(row, index, "trucker"));
        const existing = invoiceTotals.get(invoiceNumber);
        invoiceTotals.set(invoiceNumber, {
          // One invoice spans many containers, so the header total is the sum
          // of its lines rather than any single row's amount.
          total: (existing?.total ?? 0) + amount,
          meta: {
            trucker,
            truckerKey: vendorKey(trucker),
            responsibleParty: canonicalVendorName(cell(row, index, "responsibleParty")),
            forwarder: normalizeName(cell(row, index, "forwarder")),
            status: normalizeName(cell(row, index, "status")),
            prId: normalizeName(cell(row, index, "prId")),
            remarks: normalizeName(cell(row, index, "remarks")),
          },
        });

        lineRows.push([
          invoiceNumber,
          containerNumber,
          normalizeName(cell(row, index, "chargeType")) ?? "Detention",
          amount,
          normalizeInteger(cell(row, index, "days")),
          normalizeDate(cell(row, index, "pickUpDate")),
          normalizeDate(cell(row, index, "returnDate")),
          normalizeDate(cell(row, index, "lastFreeDay")),
          normalizeName(cell(row, index, "remarks")),
        ]);
      } else if (kind === "credits") {
        creditRows.push([
          containerNumber,
          normalizeAmount(cell(row, index, "amount")) ?? 0,
          normalizeName(cell(row, index, "company")),
          normalizeName(cell(row, index, "reason")),
          normalizeName(cell(row, index, "remarks")),
          normalizeName(cell(row, index, "status")),
          normalizeName(cell(row, index, "creditNoteNumber")),
          normalizeName(cell(row, index, "prId")),
        ]);
      } else {
        fbuRows.push([
          containerNumber,
          normalizeName(cell(row, index, "invoiceNumber")),
          normalizeAmount(cell(row, index, "amount")) ?? 0,
          canonicalVendorName(cell(row, index, "trucker")),
          normalizeName(cell(row, index, "chargeType")),
          normalizeName(cell(row, index, "forwarder")),
          normalizeName(cell(row, index, "prId")),
        ]);
      }
    }
  }

  stats.credits = await batchInsert(
    "credit_notes",
    ["container_number", "amount", "company", "reason", "remarks", "status",
     "credit_note_number", "pr_id"],
    creditRows,
    "ON CONFLICT (container_number, credit_note_number, amount) DO NOTHING",
  );

  stats.fbu = await batchInsert(
    "fbu_charges",
    ["container_number", "invoice_number", "amount", "trucker", "charge_type",
     "forwarder", "pr_id"],
    fbuRows,
    "ON CONFLICT (container_number, invoice_number, amount) DO NOTHING",
  );

  const invoiceRows = [...invoiceTotals].map(([invoiceNumber, { total, meta }]) => [
    invoiceNumber,
    meta.trucker,
    meta.truckerKey,
    meta.responsibleParty,
    meta.forwarder,
    total,
    meta.status,
    meta.prId,
    meta.remarks,
  ]);

  stats.invoices = await batchInsert(
    "invoices",
    ["invoice_number", "trucker", "trucker_key", "responsible_party", "forwarder",
     "total_amount", "source_payment_status", "pr_id", "remarks"],
    invoiceRows,
    `ON CONFLICT (invoice_number) DO UPDATE SET
       trucker = EXCLUDED.trucker,
       trucker_key = EXCLUDED.trucker_key,
       responsible_party = EXCLUDED.responsible_party,
       forwarder = EXCLUDED.forwarder,
       total_amount = EXCLUDED.total_amount,
       source_payment_status = EXCLUDED.source_payment_status,
       last_synced_at = NOW()`,
    [0], // invoice_number
  );

  // Lines LAST: invoice_lines.invoice_number is a foreign key to invoices, so
  // every line fails if its header does not exist yet. Header totals are
  // accumulated in memory above, so this ordering costs nothing.
  stats.lines = await batchInsert(
    "invoice_lines",
    ["invoice_number", "container_number", "charge_type", "amount", "days",
     "pick_up_date", "return_date", "last_free_day", "remarks"],
    lineRows,
    `ON CONFLICT (invoice_number, container_number, charge_type)
     DO UPDATE SET amount = EXCLUDED.amount, days = EXCLUDED.days`,
    [0, 1, 2], // invoice_number, container_number, charge_type
  );

  return stats;
}

/**
 * Multi-row INSERT in batches.
 *
 * The first version of this ingest issued one statement per row. Against a
 * database in another region that is ~580 sequential round trips — minutes of
 * pure latency, and any interruption leaves the import half-done. Batching
 * turns it into a handful of statements.
 *
 * Batch size is derived from the column count so a statement never approaches
 * Postgres' 65,535 parameter ceiling.
 */
async function batchInsert(
  table: string,
  columns: string[],
  rows: unknown[][],
  onConflict: string,
  /**
   * Column indexes forming the conflict key.
   *
   * Postgres rejects a statement whose VALUES contain the same conflict key
   * twice — "ON CONFLICT DO UPDATE command cannot affect row a second time" —
   * and the Detention sheet genuinely repeats rows (the same invoice, container
   * and charge type appear twice, differing only by a trailing carriage
   * return). Supplying the key lets the batch collapse those first, keeping the
   * last occurrence.
   */
  conflictKey?: number[],
): Promise<number> {
  if (rows.length === 0) return 0;

  if (conflictKey?.length) {
    const seen = new Map<string, unknown[]>();
    for (const row of rows) {
      seen.set(conflictKey.map((i) => String(row[i] ?? "")).join(" "), row);
    }
    if (seen.size !== rows.length) {
      syncLogger.info(
        { table, from: rows.length, to: seen.size },
        "collapsed duplicate rows present in the source sheet",
      );
    }
    rows = [...seen.values()];
  }

  const perBatch = Math.max(1, Math.floor(60_000 / columns.length));
  let written = 0;

  for (let start = 0; start < rows.length; start += perBatch) {
    const batch = rows.slice(start, start + perBatch);
    const values: unknown[] = [];
    const tuples = batch.map((row, rowIndex) => {
      const base = rowIndex * columns.length;
      values.push(...row);
      return `(${columns.map((_, i) => `$${base + i + 1}`).join(",")})`;
    });

    try {
      const result = await query(
        `INSERT INTO ${table} (${columns.join(", ")})
         VALUES ${tuples.join(",")}
         ${onConflict}`,
        values,
      );
      written += result.rowCount ?? 0;
    } catch (error) {
      // A malformed batch must not abort the whole ingest — record it and
      // carry on, so one bad row cannot cost the entire import.
      syncLogger.error(
        { table, batchStart: start, size: batch.length, err: error },
        "batch insert failed",
      );
    }
  }

  return written;
}

/* ---------------- Orchestration ---------------- */

export async function runIngest(trigger = "Manual"): Promise<IngestResult> {
  const started = Date.now();

  const run = await query<{ id: number }>(
    `INSERT INTO sync_runs (trigger, status) VALUES ($1, 'Running') RETURNING id`,
    [trigger],
  );
  const runId = run.rows[0]?.id ?? null;

  try {
    const containers = await loadContainers(true);
    const counts = await upsertContainers(containers);
    const sheet2 = await ingestSheet2();

    // Read after the upsert: this is the cumulative total, the figure the
    // dashboard reports as the historical store.
    const totals = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM containers`,
    );
    const containersTotal = Number(totals.rows[0]?.count ?? 0);
    const containersUpserted = counts.inserted + counts.updated;

    const result: IngestResult = {
      runId,
      tabsRead: 14,
      rowsRead: containers.length + sheet2.rows,
      containersUpserted,
      containersInserted: counts.inserted,
      containersUpdated: counts.updated,
      containersTotal,
      invoicesUpserted: sheet2.invoices,
      linesUpserted: sheet2.lines,
      creditNotes: sheet2.credits,
      fbuCharges: sheet2.fbu,
      issues: 0,
      durationMs: Date.now() - started,
    };

    await query(
      `UPDATE sync_runs SET finished_at = NOW(), status = 'Success',
         rows_read = $2, containers_upserted = $3, invoices_upserted = $4,
         containers_inserted = $5, containers_updated = $6, containers_total = $7
       WHERE id = $1`,
      [
        runId,
        result.rowsRead,
        containersUpserted,
        sheet2.invoices,
        counts.inserted,
        counts.updated,
        containersTotal,
      ],
    );

    syncLogger.info(result, "ingest complete");
    return result;
  } catch (error) {
    await query(
      `UPDATE sync_runs SET finished_at = NOW(), status = 'Failed', error = $2 WHERE id = $1`,
      [runId, (error as Error).message],
    ).catch(() => undefined);
    throw error;
  }
}

/** Record a change for the audit trail. Append-only. */
export async function recordAudit(entry: {
  actor: string;
  action: string;
  entityType: string;
  entityKey: string | null;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  status?: string;
}): Promise<void> {
  await query(
    `INSERT INTO audit_log
       (actor, action, entity_type, entity_key, field, old_value, new_value,
        reason, ip_address, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      entry.actor,
      entry.action,
      entry.entityType,
      entry.entityKey,
      entry.field ?? null,
      entry.oldValue ?? null,
      entry.newValue ?? null,
      entry.reason ?? null,
      entry.ipAddress ?? null,
      entry.status ?? "Success",
    ],
  );
}

export { transaction };
