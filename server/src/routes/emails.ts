import { Router } from "express";
import { z } from "zod";
import { normalizeContainerNumber } from "@tms/shared";
import {
  getContainerEmails,
  getConversation,
  getProcessingLog,
  getReviewQueue,
  linkManually,
  reviewLink,
} from "../services/emailService.js";
import { requireEditKey } from "../middleware/editGate.js";
import { recordAudit } from "../services/ingestService.js";

export const emailsRouter = Router();

/**
 * Email intelligence, read side.
 *
 * Route order matters — literal paths before parameterised ones, or
 * `/review` is swallowed by `/:conversationId`.
 */

/** The match review queue. */
emailsRouter.get("/review", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 100);
    res.json(await getReviewQueue(Number.isFinite(limit) ? limit : 100));
  } catch (error) {
    next(error);
  }
});

/** Processing log — doc 05 §Duplicate Prevention. */
emailsRouter.get("/log", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 100);
    res.json(await getProcessingLog(Number.isFinite(limit) ? limit : 100));
  } catch (error) {
    next(error);
  }
});

/** Emails for one container — the Container 360 Email Intelligence section. */
emailsRouter.get("/container/:containerNumber", async (req, res, next) => {
  try {
    const key = normalizeContainerNumber(req.params.containerNumber);
    if (!key) return res.status(400).json({ error: "Invalid container number" });
    res.json(await getContainerEmails(key));
  } catch (error) {
    next(error);
  }
});

/** One thread, chronological — the Conversation Drawer. */
emailsRouter.get("/conversation/:conversationId", async (req, res, next) => {
  try {
    const id = decodeURIComponent(req.params.conversationId).slice(0, 300);
    if (!id) return res.status(400).json({ error: "Invalid conversation id" });
    res.json({ conversationId: id, emails: await getConversation(id) });
  } catch (error) {
    next(error);
  }
});

/**
 * Approve or reject a proposed link.
 *
 * Behind the edit key and fully audited: this decides what an operator will
 * later read as a container's correspondence history.
 */
const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

emailsRouter.post("/links/:id/review", requireEditKey, async (req, res, next) => {
  try {
    const linkId = Number(req.params.id);
    if (!Number.isInteger(linkId)) return res.status(400).json({ error: "Invalid link id" });

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "decision must be approve or reject" });

    const applied = await reviewLink(linkId, parsed.data.decision, "Operator");
    if (!applied) {
      return res.status(404).json({ error: "Link not found, or already reviewed" });
    }

    await recordAudit({
      actor: "Operator",
      action: `email.link.${parsed.data.decision}`,
      entityType: "email_link",
      entityKey: String(linkId),
      field: null,
      oldValue: null,
      newValue: parsed.data.decision,
      reason: parsed.data.reason ?? null,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/** Attach an email to a container by hand — doc 05 priority rule 5. */
const manualSchema = z.object({
  emailId: z.number().int().positive(),
  containerNumber: z.string().trim().min(4).max(20),
  reason: z.string().trim().max(500).optional(),
});

emailsRouter.post("/links", requireEditKey, async (req, res, next) => {
  try {
    const parsed = manualSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "emailId and containerNumber required" });

    const linked = await linkManually(
      parsed.data.emailId,
      parsed.data.containerNumber,
      "Operator",
    );
    if (!linked) return res.status(400).json({ error: "Could not link that email" });

    await recordAudit({
      actor: "Operator",
      action: "email.link.manual",
      entityType: "email_link",
      entityKey: `${parsed.data.emailId}`,
      field: "container_number",
      oldValue: null,
      newValue: normalizeContainerNumber(parsed.data.containerNumber),
      reason: parsed.data.reason ?? null,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
