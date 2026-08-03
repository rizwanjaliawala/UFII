import { Router } from "express";
import { config } from "../config/index.js";
import { query } from "../db/pool.js";
import { runIngest } from "../services/ingestService.js";
import { invalidateCache } from "../services/containerService.js";
import { resetRepositorySelection } from "../repositories/containerRepository.js";
import { requireEditKey } from "../middleware/editGate.js";
import { syncLogger } from "../utils/logger.js";

export const syncRouter = Router();

/**
 * Run the ingest: source sheets → Neon.
 *
 * Gated by the edit key. It is a write operation over the whole dataset, so it
 * belongs behind the same confirmation as an individual edit rather than being
 * triggerable by anyone who can reach the API.
 *
 * Long-running by nature (14 CSV tabs plus Sheet 2), so the caller should
 * expect tens of seconds rather than a fast response.
 */
syncRouter.post("/ingest", requireEditKey, async (req, res, next) => {
  try {
    if (!config.database.configured) {
      return res.status(503).json({
        error: "Ingest requires the database. DATABASE_URL is not configured.",
      });
    }

    const trigger = typeof req.body?.trigger === "string" ? req.body.trigger : "Manual";
    syncLogger.info({ trigger }, "ingest requested");

    const result = await runIngest(trigger);

    // The container cache holds sheet-derived rows; drop it, and let the
    // repository re-evaluate now that a successful run exists.
    invalidateCache();
    resetRepositorySelection();

    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

/** Ingest history — most recent first. */
syncRouter.get("/runs", async (_req, res, next) => {
  try {
    if (!config.database.configured) return res.json({ runs: [] });

    const { rows } = await query(
      `SELECT id, started_at, finished_at, trigger, status, tabs_read, rows_read,
              containers_upserted, invoices_upserted, issues_found, error
         FROM sync_runs
        ORDER BY started_at DESC
        LIMIT 25`,
    );
    res.json({ runs: rows });
  } catch (error) {
    next(error);
  }
});

/** Row counts per table — used to validate an ingest. */
syncRouter.get("/stats", async (_req, res, next) => {
  try {
    if (!config.database.configured) return res.json({ tables: {} });

    const { rows } = await query<{
      containers: string;
      invoices: string;
      invoice_lines: string;
      credit_notes: string;
      fbu_charges: string;
      audit_log: string;
      data_quality_issues: string;
      sync_runs: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM containers)           AS containers,
         (SELECT COUNT(*)::text FROM invoices)             AS invoices,
         (SELECT COUNT(*)::text FROM invoice_lines)        AS invoice_lines,
         (SELECT COUNT(*)::text FROM credit_notes)         AS credit_notes,
         (SELECT COUNT(*)::text FROM fbu_charges)          AS fbu_charges,
         (SELECT COUNT(*)::text FROM audit_log)            AS audit_log,
         (SELECT COUNT(*)::text FROM data_quality_issues)  AS data_quality_issues,
         (SELECT COUNT(*)::text FROM sync_runs)            AS sync_runs`,
    );
    res.json({ tables: rows[0] ?? {} });
  } catch (error) {
    next(error);
  }
});
