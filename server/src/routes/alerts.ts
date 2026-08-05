import { Router } from "express";
import { z } from "zod";
import { getAlerts, listRuleSettings, setRuleEnabled } from "../services/alertService.js";
import { requireEditKey } from "../middleware/editGate.js";
import { recordAudit } from "../services/ingestService.js";
import { config } from "../config/index.js";

export const alertsRouter = Router();

/** Every active alert rule, with a capped sample of matching containers. */
alertsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getAlerts());
  } catch (error) {
    next(error);
  }
});

/** Rule configuration — which rules are on, and which cannot be measured. */
alertsRouter.get("/rules", async (_req, res, next) => {
  try {
    res.json({ rules: await listRuleSettings() });
  } catch (error) {
    next(error);
  }
});

/**
 * Enable or disable a rule.
 *
 * Behind the edit key and audited: switching a rule off makes containers stop
 * appearing on the alert board, which is indistinguishable from the problem
 * having gone away unless there is a record of who did it.
 */
const toggleSchema = z.object({ enabled: z.boolean() });

alertsRouter.post("/rules/:ruleId", requireEditKey, async (req, res, next) => {
  try {
    if (!config.database.configured) {
      return res.status(503).json({ error: "Rule settings require the database." });
    }

    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "enabled must be true or false" });

    // Express 5 types a route param as string | string[]; take the first.
    const ruleId = String(
      Array.isArray(req.params.ruleId) ? req.params.ruleId[0] : req.params.ruleId,
    );

    const applied = await setRuleEnabled(ruleId, parsed.data.enabled, "Operator");
    if (!applied) return res.status(404).json({ error: "Unknown rule" });

    await recordAudit({
      actor: "Operator",
      action: "alert.rule.toggle",
      entityType: "alert_rule",
      entityKey: ruleId,
      field: "enabled",
      oldValue: String(!parsed.data.enabled),
      newValue: String(parsed.data.enabled),
      reason: null,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
