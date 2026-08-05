import { Router } from "express";
import { z } from "zod";
import { config } from "../config/index.js";
import { query } from "../db/pool.js";

export const activityRouter = Router();

/**
 * Recent Activity (doc 03 §Dashboard).
 *
 * Reads the append-only audit log. Every operator edit, email-match decision
 * and ingest already writes here, so this is a view over existing truth
 * rather than a second record that could disagree with it.
 */

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  entityKey: z.string().trim().max(40).optional(),
});

const ACTION_LABELS: Record<string, string> = {
  "container.edit": "edited container",
  "email.link.approve": "confirmed an email match",
  "email.link.reject": "rejected an email match",
  "email.link.manual": "linked an email by hand",
};

activityRouter.get("/", async (req, res, next) => {
  try {
    if (!config.database.configured) {
      return res.json({ available: false, entries: [] });
    }

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

    const values: unknown[] = [];
    let where = "";
    if (parsed.data.entityKey) {
      values.push(parsed.data.entityKey);
      where = `WHERE entity_key = $1`;
    }

    const { rows } = await query<{
      at: Date;
      actor: string;
      action: string;
      entity_type: string;
      entity_key: string;
      field: string | null;
      old_value: string | null;
      new_value: string | null;
      reason: string | null;
    }>(
      `SELECT at, actor, action, entity_type, entity_key, field,
              old_value, new_value, reason
         FROM audit_log
         ${where}
        ORDER BY at DESC
        LIMIT ${parsed.data.limit}`,
      values,
    );

    res.json({
      available: true,
      entries: rows.map((row) => ({
        at: row.at.toISOString(),
        actor: row.actor,
        action: row.action,
        // A readable phrase for the UI, with the raw action kept alongside so
        // an unrecognised one still renders rather than showing blank.
        label: ACTION_LABELS[row.action] ?? row.action.replace(/[.]/g, " "),
        entityType: row.entity_type,
        entityKey: row.entity_key,
        field: row.field,
        oldValue: row.old_value,
        newValue: row.new_value,
        reason: row.reason,
      })),
    });
  } catch (error) {
    next(error);
  }
});
