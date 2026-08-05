import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import {
  authenticateDevice,
  createPairing,
  enrollDevice,
  EnrollmentError,
  listDevices,
  revokeDevice,
  touchDevice,
  type AgentDevice,
} from "../services/agentService.js";
import { ingestEmails, MAX_BATCH, type IncomingEmail } from "../services/emailIngestService.js";
import { requireEditKey } from "../middleware/editGate.js";
import { config } from "../config/index.js";
import { apiLogger } from "../utils/logger.js";

export const agentRouter = Router();

/**
 * The Windows sync agent's API surface (CLAUDE.md §10).
 *
 * Two audiences on one router, with different authentication:
 *   - the agent itself, holding a device token
 *   - operators in the TMS UI, managing devices behind the edit key
 */

interface AgentRequest extends Request {
  device?: AgentDevice;
}

/** Device-token gate. The token travels in a header, never a query string. */
async function requireDevice(
  req: AgentRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const device = await authenticateDevice(token);

    if (!device) {
      // Deliberately identical for a missing, malformed, unknown and revoked
      // token: distinguishing them tells an attacker which half is right.
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.device = device;
    next();
  } catch (error) {
    next(error);
  }
}

function requireDatabase(res: Response): boolean {
  if (config.database.configured) return true;
  res.status(503).json({ error: "Email sync requires the database." });
  return false;
}

/* ---------------- Agent-facing ---------------- */

const enrollSchema = z.object({
  code: z.string().trim().length(8),
  mailbox: z.string().trim().max(200).optional(),
  agentVersion: z.string().trim().max(40).optional(),
});

/**
 * Exchange a pairing code for a device token.
 *
 * Unauthenticated by necessity — the pairing code IS the credential here.
 * It is single-use and expires in minutes.
 */
agentRouter.post("/enroll", async (req, res, next) => {
  try {
    if (!requireDatabase(res)) return;

    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid enrolment request" });

    const { token, deviceId } = await enrollDevice(parsed.data);
    apiLogger.info({ deviceId }, "sync agent enrolled");

    // The token is returned exactly once; only its hash is stored.
    res.json({ token, deviceId });
  } catch (error) {
    if (error instanceof EnrollmentError) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/** Liveness. The UI asks the server whether an agent is up, never the browser. */
agentRouter.post("/heartbeat", requireDevice, async (req: AgentRequest, res, next) => {
  try {
    const version = typeof req.body?.agentVersion === "string" ? req.body.agentVersion : null;
    await touchDevice(req.device!.id, version);
    res.json({ ok: true, serverTime: new Date().toISOString(), pollSeconds: 30 });
  } catch (error) {
    next(error);
  }
});

const attachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(300),
  contentType: z.string().trim().max(150).nullish(),
  sizeBytes: z.number().int().nonnegative().nullish(),
  kind: z.string().trim().max(40).nullish(),
  driveFileId: z.string().trim().max(120).nullish(),
});

const emailSchema = z.object({
  // NOT NULL and required: this is the dedupe key, and a nullable one is what
  // made credit notes re-insert on every ingest.
  internetMessageId: z.string().trim().min(3).max(998),
  conversationId: z.string().trim().max(300).nullish(),
  entryId: z.string().trim().max(600).nullish(),
  folder: z.string().trim().max(200).nullish(),
  subject: z.string().max(1000).nullish(),
  senderName: z.string().max(300).nullish(),
  senderAddress: z.string().max(320).nullish(),
  receivedAt: z.string().datetime({ offset: true }),
  body: z.string().max(200_000).nullish(),
  attachments: z.array(attachmentSchema).max(50).optional(),
  attachmentText: z.string().max(200_000).nullish(),
});

const batchSchema = z.object({
  emails: z.array(emailSchema).min(1).max(MAX_BATCH),
});

/** Accept a batch of messages the agent has read from Outlook. */
agentRouter.post("/emails", requireDevice, async (req: AgentRequest, res, next) => {
  try {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: `Invalid batch. Send at most ${MAX_BATCH} emails, each with an internetMessageId and receivedAt.`,
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const device = req.device!;
    const result = await ingestEmails(device.id, parsed.data.emails as IncomingEmail[]);
    await touchDevice(device.id);

    apiLogger.info({ deviceId: device.id, ...result }, "agent email batch");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/* ---------------- Operator-facing ---------------- */

/**
 * Agent presence for the UI.
 *
 * Open like the rest of the read API today. When authentication lands this
 * must be scoped to the requesting operator — an agent list is an inventory
 * of who runs what on which machine.
 */
agentRouter.get("/devices", async (_req, res, next) => {
  try {
    if (!config.database.configured) {
      return res.json({ available: false, devices: [], anyOnline: false });
    }
    const devices = await listDevices();
    res.json({
      available: true,
      devices,
      anyOnline: devices.some((d) => d.online && !d.revoked),
    });
  } catch (error) {
    next(error);
  }
});

const pairingSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  operator: z.string().trim().min(1).max(120),
});

/** Issue a pairing code. Guarded by the edit key — it grants ingest rights. */
agentRouter.post("/pairing", requireEditKey, async (req, res, next) => {
  try {
    if (!requireDatabase(res)) return;

    const parsed = pairingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Device name and operator required" });

    res.json(await createPairing(parsed.data.deviceName, parsed.data.operator));
  } catch (error) {
    next(error);
  }
});

/** Revoke one device. Its token stops working immediately. */
agentRouter.post("/devices/:id/revoke", requireEditKey, async (req, res, next) => {
  try {
    if (!requireDatabase(res)) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid device id" });

    const revoked = await revokeDevice(id);
    if (!revoked) return res.status(404).json({ error: "Device not found or already revoked" });

    apiLogger.warn({ deviceId: id }, "sync agent revoked");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
