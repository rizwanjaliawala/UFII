import { Router } from "express";
import { z } from "zod";
import {
  CONTAINER_STATUSES,
  RISK_LABEL,
  freeTimeLabel,
  lfdRisk,
  normalizeContainerNumber,
  type Container,
} from "@tms/shared";
import { exportFilename, toCsv, type CsvColumn } from "../utils/csv.js";
import { invalidateCache } from "../services/containerService.js";
import {
  getContainerRepository,
  resetRepositorySelection,
} from "../repositories/containerRepository.js";
import { recordAudit } from "../services/ingestService.js";
import { requireEditKey } from "../middleware/editGate.js";
import { query } from "../db/pool.js";
import { config } from "../config/index.js";
import { apiLogger } from "../utils/logger.js";

export const containersRouter = Router();

/**
 * Container read API.
 *
 * Filtering, sorting and pagination all happen server-side. With ~4,400
 * containers the whole set fits in memory comfortably, and keeping the work
 * here means the client ships one page of rows instead of the entire fleet.
 */

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  trucker: z.string().trim().optional(),
  ssl: z.string().trim().optional(),
  terminal: z.string().trim().optional(),
  pod: z.string().trim().optional(),
  status: z.string().trim().optional(),
  risk: z.enum(["overdue", "critical", "warning", "safe", "cleared"]).optional(),
  sort: z.enum(["urgency", "lfd", "container", "eta", "updated"]).default("urgency"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

containersRouter.get("/", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    }

    const repository = await getContainerRepository();
    const { rows, total } = await repository.search(parsed.data);

    res.json({
      rows,
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
      source: await repository.stats(),
    });
  } catch (error) {
    next(error);
  }
});

/** Distinct values for the filter controls, with counts. */
containersRouter.get("/filters", async (_req, res, next) => {
  try {
    const repository = await getContainerRepository();
    res.json(await repository.filterOptions());
  } catch (error) {
    next(error);
  }
});

/**
 * Aggregate counts used by the risk board and dashboard tiles.
 *
 * Delegated to `aggregates()`, which counts with GROUP BY on the Neon path —
 * the previous version pulled every row here purely to increment counters.
 */
containersRouter.get("/summary", async (_req, res, next) => {
  try {
    const repository = await getContainerRepository();
    const totals = await repository.aggregates();
    res.json({
      total: totals.total,
      risk: totals.risk,
      status: totals.status,
      source: await repository.stats(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * The current filter selection as CSV.
 *
 * Deliberately a server route rather than a client-side build from the loaded
 * page. The list is paginated now, so exporting what the browser holds would
 * silently export 50 rows out of 4,400 — an export that looks like it worked
 * is worse than one that fails. Applies the same filters as `GET /`, ignores
 * pagination, and caps the result so a mis-click cannot pull an unbounded set.
 */
const EXPORT_LIMIT = 10_000;

const CSV_COLUMNS: CsvColumn<Container>[] = [
  { header: "Container", value: (c) => c.containerNumber },
  { header: "Status", value: (c) => c.status },
  { header: "Risk", value: (c) => RISK_LABEL[lfdRisk(c)] },
  { header: "Last Free Day", value: (c) => c.lastFreeDay },
  { header: "Free Time", value: (c) => freeTimeLabel(c) },
  { header: "Appointment", value: (c) => c.appointmentDate },
  { header: "PU Number", value: (c) => c.pickupNumber },
  { header: "Trucker", value: (c) => c.trucker },
  { header: "SSL", value: (c) => c.ssl },
  { header: "Terminal", value: (c) => c.terminal },
  { header: "POD", value: (c) => c.pod },
  { header: "ETA", value: (c) => c.eta },
  { header: "BL Number", value: (c) => c.blNumber },
  { header: "ISA", value: (c) => c.isa },
  { header: "Gate Out", value: (c) => c.gateOutDate },
  { header: "Empty Return", value: (c) => c.emptyReturnDate },
  { header: "Dispatcher", value: (c) => c.assignedDispatcher },
  { header: "Priority", value: (c) => c.priority },
  { header: "Source Tab", value: (c) => c.sourceTab },
];

containersRouter.get("/export", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    }

    const repository = await getContainerRepository();
    const { rows, total } = await repository.search({
      ...parsed.data,
      page: 1,
      pageSize: EXPORT_LIMIT,
    });

    if (total > rows.length) {
      apiLogger.warn({ total, exported: rows.length }, "export truncated at limit");
    }

    res
      .status(200)
      .type("text/csv; charset=utf-8")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename("containers")}"`,
      )
      .send(toCsv(rows, CSV_COLUMNS));
  } catch (error) {
    next(error);
  }
});

/** Single container — the Container 360 record. */
containersRouter.get("/:containerNumber", async (req, res, next) => {
  try {
    const key = normalizeContainerNumber(req.params.containerNumber);
    if (!key) return res.status(400).json({ error: "Invalid container number" });

    const repository = await getContainerRepository();
    const container = await repository.getByNumber(key);
    if (!container) {
      return res.status(404).json({ error: `Container ${key} not found` });
    }

    res.json({ container, related: await getRelated(repository, container) });
  } catch (error) {
    next(error);
  }
});

/**
 * Edit a container.
 *
 * Only user-owned fields are writable. Operational values (LFD, gate dates,
 * terminal, SSL) come from the read-only source sheets and are deliberately
 * NOT editable here — an edit would be silently reverted by the next ingest,
 * which is worse than not offering it. Status is the exception: it is stored
 * as an override that survives re-ingest.
 *
 * Guarded by the shared edit key and fully audited.
 */
const editSchema = z
  .object({
    status: z.enum(CONTAINER_STATUSES).optional(),
    pickupNumber: z.string().trim().max(40).nullable().optional(),
    internalNotes: z.string().trim().max(4000).nullable().optional(),
    dispatchNotes: z.string().trim().max(4000).nullable().optional(),
    vendorNotes: z.string().trim().max(4000).nullable().optional(),
    assignedDispatcher: z.string().trim().max(120).nullable().optional(),
    priority: z.enum(["Low", "Normal", "High", "Critical"]).nullable().optional(),
    reason: z.string().trim().max(500).optional(),
    editKey: z.string().optional(),
  })
  .strict();

const FIELD_COLUMNS: Record<string, string> = {
  status: "status_override",
  pickupNumber: "pickup_number",
  internalNotes: "internal_notes",
  dispatchNotes: "dispatch_notes",
  vendorNotes: "vendor_notes",
  assignedDispatcher: "assigned_dispatcher",
  priority: "priority",
};

containersRouter.patch("/:containerNumber", requireEditKey, async (req, res, next) => {
  try {
    if (!config.database.configured) {
      return res.status(503).json({
        error: "Editing requires the database. DATABASE_URL is not configured.",
      });
    }

    const key = normalizeContainerNumber(req.params.containerNumber);
    if (!key) return res.status(400).json({ error: "Invalid container number" });

    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid edit", issues: parsed.error.issues });
    }

    const { reason, editKey: _editKey, ...changes } = parsed.data;
    const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return res.status(400).json({ error: "No changes supplied" });
    }

    const existing = await (await getContainerRepository()).getByNumber(key);
    if (!existing) return res.status(404).json({ error: `Container ${key} not found` });

    // Read the prior stored values so the audit trail records a real
    // before-and-after rather than assuming the sheet value was current.
    const prior = await query<Record<string, string | null>>(
      `SELECT ${Object.values(FIELD_COLUMNS).join(", ")}
         FROM containers WHERE container_number = $1`,
      [key],
    );
    const before = prior.rows[0] ?? {};

    const setClauses: string[] = [];
    const values: unknown[] = [key];
    entries.forEach(([field, value], i) => {
      setClauses.push(`${FIELD_COLUMNS[field]} = $${i + 2}`);
      values.push(value);
    });

    await query(
      `INSERT INTO containers (container_number, ${entries
        .map(([f]) => FIELD_COLUMNS[f])
        .join(", ")}, updated_by, updated_at, version)
       VALUES ($1, ${entries.map((_, i) => `$${i + 2}`).join(", ")}, 'Operator', NOW(), 1)
       ON CONFLICT (container_number) DO UPDATE SET
         ${setClauses.join(", ")},
         updated_by = 'Operator',
         updated_at = NOW(),
         version = containers.version + 1`,
      values,
    );

    for (const [field, value] of entries) {
      await recordAudit({
        actor: "Operator",
        action: "container.edit",
        entityType: "container",
        entityKey: key,
        field,
        oldValue: before[FIELD_COLUMNS[field]] ?? null,
        newValue: value === null ? null : String(value),
        reason: reason ?? null,
        ipAddress: req.ip ?? null,
      });
    }

    // The cache holds merged sheet+override data, so it must be dropped for
    // the edit to be visible on the next read.
    invalidateCache();
    resetRepositorySelection();
    const updated = await (await getContainerRepository()).getByNumber(key);

    apiLogger.info({ container: key, fields: entries.map(([f]) => f) }, "container edited");
    res.json({ ok: true, container: updated });
  } catch (error) {
    next(error);
  }
});

/** Audit history for one container. */
containersRouter.get("/:containerNumber/history", async (req, res, next) => {
  try {
    if (!config.database.configured) return res.json({ entries: [] });

    const key = normalizeContainerNumber(req.params.containerNumber);
    if (!key) return res.status(400).json({ error: "Invalid container number" });

    const { rows } = await query(
      `SELECT at, actor, action, field, old_value, new_value, reason
         FROM audit_log
        WHERE entity_type = 'container' AND entity_key = $1
        ORDER BY at DESC LIMIT 100`,
      [key],
    );
    res.json({ entries: rows });
  } catch (error) {
    next(error);
  }
});

/** Force a re-read of the source sheets, bypassing the cache. */
containersRouter.post("/refresh", async (_req, res, next) => {
  try {
    const started = Date.now();
    invalidateCache();
    const containers = await (await getContainerRepository()).getAll(true);
    apiLogger.info({ containers: containers.length }, "manual source refresh");
    res.json({ ok: true, containers: containers.length, ms: Date.now() - started });
  } catch (error) {
    next(error);
  }
});

const RELATED_LIMIT = 12;

/**
 * Containers moving alongside this one — same bill of lading, or the same
 * terminal appointment. Helps an operator see a group rather than a row.
 *
 * Two branches for one reason: the sheet path already has every row in
 * memory, and the Neon path must not load 4,400 to find twelve.
 */
async function getRelated(
  repository: Awaited<ReturnType<typeof getContainerRepository>>,
  container: Container,
): Promise<Container[]> {
  if (!container.blNumber && !container.appointmentDate) return [];

  if (repository.kind === "sheets") {
    const all = await repository.getAll();
    return all
      .filter(
        (c) =>
          c.containerNumber !== container.containerNumber &&
          ((container.blNumber && c.blNumber === container.blNumber) ||
            (container.appointmentDate &&
              c.appointmentDate === container.appointmentDate)),
      )
      .slice(0, RELATED_LIMIT);
  }

  const { rows } = await query<{ container_number: string }>(
    `SELECT container_number
       FROM containers
      WHERE container_number <> $1
        AND ( ($2::text IS NOT NULL AND bl_number = $2)
           OR ($3::date IS NOT NULL AND appointment_date = $3) )
      ORDER BY container_number
      LIMIT ${RELATED_LIMIT}`,
    [container.containerNumber, container.blNumber, container.appointmentDate],
  );

  const related = await Promise.all(
    rows.map((row) => repository.getByNumber(row.container_number)),
  );
  return related.filter((c): c is Container => c !== null);
}
