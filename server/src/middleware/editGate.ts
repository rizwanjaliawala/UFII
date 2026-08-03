import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index.js";
import { apiLogger } from "../utils/logger.js";

/**
 * Edit gate.
 *
 * Every mutating request must carry the shared edit key. Validation happens
 * HERE, on the server — the client only collects the key and passes it along.
 * If the check lived in the browser it could be bypassed by anyone who opened
 * devtools, which would make the gate decorative.
 *
 * Deliberate limits of this design, to be clear about what it does not do:
 *   - It authenticates nobody. Every edit is attributed to "Operator".
 *   - One shared secret means no revocation for an individual.
 * It prevents accidental edits. RBAC in Phase 5 (doc 09) replaces it.
 */

interface AttemptRecord {
  failures: number;
  lockedUntil: number | null;
}

/** Per-IP failure tracking. In-process is enough for a single desktop deployment. */
const attempts = new Map<string, AttemptRecord>();

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** Constant-time comparison — a plain === leaks the key through timing. */
function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (a.length !== b.length) {
    // Compare against itself to burn equivalent time, then fail.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function requireEditKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.edit.configured) {
    res.status(503).json({
      error: "Editing is not configured on this server.",
      code: "EDIT_NOT_CONFIGURED",
    });
    return;
  }

  const ip = clientKey(req);
  const record = attempts.get(ip) ?? { failures: 0, lockedUntil: null };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const seconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    res.status(429).json({
      error: `Too many incorrect keys. Try again in ${seconds}s.`,
      code: "EDIT_LOCKED",
      retryAfterSeconds: seconds,
    });
    return;
  }

  const provided =
    (req.get("x-edit-key") ?? "").trim() ||
    (typeof req.body?.editKey === "string" ? req.body.editKey.trim() : "");

  if (!provided) {
    res.status(401).json({ error: "An edit key is required.", code: "EDIT_KEY_REQUIRED" });
    return;
  }

  if (!keysMatch(provided, config.edit.key!)) {
    record.failures += 1;
    if (record.failures >= config.edit.maxAttempts) {
      record.lockedUntil = Date.now() + config.edit.lockoutMinutes * 60_000;
      record.failures = 0;
      apiLogger.warn({ ip }, "edit key locked out after repeated failures");
    }
    attempts.set(ip, record);

    // The key itself is never logged, and the response never hints at how
    // close the attempt was.
    res.status(403).json({ error: "Incorrect edit key.", code: "EDIT_KEY_INVALID" });
    return;
  }

  attempts.set(ip, { failures: 0, lockedUntil: null });
  next();
}

/** Lets the client show or hide edit affordances without exposing the key. */
export function editGateStatus(): { enabled: boolean } {
  return { enabled: config.edit.configured };
}
