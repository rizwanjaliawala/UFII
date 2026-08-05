import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "../db/pool.js";

/**
 * Windows sync agent identity (CLAUDE.md §10).
 *
 * The agent runs in the operator's own Windows session, because Outlook COM
 * needs an interactive desktop and a serverless function has none. It
 * therefore lives outside this system's trust boundary and must authenticate
 * like any other client.
 *
 * Enrolment is deliberately two-step:
 *
 *   1. An operator generates a short pairing code in the TMS UI. It is
 *      short-lived and single-use, so it can be read off a screen and typed
 *      into the installer without being a lasting secret.
 *   2. The agent exchanges it once for a long-lived device token.
 *
 * Only the SHA-256 of the device token is stored. A database leak yields
 * hashes, not working credentials, and revocation is per device rather than
 * "rotate the one shared key and reinstall everywhere" — the failure mode the
 * current edit key already has.
 */

/** Ambiguous characters removed: this is read off a screen and retyped. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const PAIRING_TTL_MINUTES = 15;

/** An agent quiet for longer than this is not considered live. */
export const PRESENCE_TIMEOUT_MINUTES = 5;

export interface AgentDevice {
  id: number;
  deviceName: string;
  operator: string;
  mailbox: string | null;
  enrolledAt: string | null;
  lastSeenAt: string | null;
  agentVersion: string | null;
  emailsIngested: number;
  revoked: boolean;
  online: boolean;
}

const hashToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

function pairingCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Issue a pairing code for a new agent installation.
 *
 * Returns the code in plaintext — it is meant to be read and typed, and it
 * expires in minutes.
 */
export async function createPairing(
  deviceName: string,
  operator: string,
): Promise<{ code: string; expiresAt: string }> {
  const code = pairingCode();
  const { rows } = await query<{ pairing_expires_at: Date }>(
    `INSERT INTO agent_devices (device_name, operator, pairing_code, pairing_expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)
     RETURNING pairing_expires_at`,
    [deviceName, operator, code, String(PAIRING_TTL_MINUTES)],
  );

  return { code, expiresAt: rows[0]!.pairing_expires_at.toISOString() };
}

export class EnrollmentError extends Error {}

/**
 * Exchange a pairing code for a device token.
 *
 * The code is cleared in the same statement that stores the token hash, so it
 * cannot be redeemed twice even if two installers race.
 */
export async function enrollDevice(input: {
  code: string;
  mailbox?: string | null;
  agentVersion?: string | null;
}): Promise<{ token: string; deviceId: number }> {
  const token = randomBytes(32).toString("base64url");

  const { rows } = await query<{ id: number }>(
    `UPDATE agent_devices
        SET token_hash = $1,
            mailbox = COALESCE($2, mailbox),
            agent_version = $3,
            enrolled_at = NOW(),
            last_seen_at = NOW(),
            pairing_code = NULL,
            pairing_expires_at = NULL
      WHERE pairing_code = $4
        AND pairing_expires_at > NOW()
        AND revoked_at IS NULL
      RETURNING id`,
    [hashToken(token), input.mailbox ?? null, input.agentVersion ?? null, input.code.toUpperCase()],
  );

  const device = rows[0];
  if (!device) {
    throw new EnrollmentError("That pairing code is invalid, already used, or expired.");
  }

  return { token, deviceId: device.id };
}

/**
 * Resolve a device token.
 *
 * The hash is compared with `timingSafeEqual` rather than SQL equality so the
 * comparison cannot be timed. The lookup itself is by hash, which is a
 * constant-length indexed value.
 */
export async function authenticateDevice(token: string | undefined): Promise<AgentDevice | null> {
  if (!token) return null;

  const candidate = hashToken(token);
  const { rows } = await query<{
    id: number;
    device_name: string;
    operator: string;
    mailbox: string | null;
    token_hash: string;
    enrolled_at: Date | null;
    last_seen_at: Date | null;
    agent_version: string | null;
    emails_ingested: number;
    revoked_at: Date | null;
  }>(
    `SELECT id, device_name, operator, mailbox, token_hash, enrolled_at,
            last_seen_at, agent_version, emails_ingested, revoked_at
       FROM agent_devices
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [candidate],
  );

  const row = rows[0];
  if (!row) return null;

  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(row.token_hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return toDevice(row);
}

/** Record that an agent is alive. Cheap enough to call on every request. */
export async function touchDevice(deviceId: number, agentVersion?: string | null): Promise<void> {
  await query(
    `UPDATE agent_devices
        SET last_seen_at = NOW(), agent_version = COALESCE($2, agent_version)
      WHERE id = $1`,
    [deviceId, agentVersion ?? null],
  );
}

export async function listDevices(): Promise<AgentDevice[]> {
  const { rows } = await query<Record<string, never>>(
    `SELECT id, device_name, operator, mailbox, enrolled_at, last_seen_at,
            agent_version, emails_ingested, revoked_at
       FROM agent_devices
      WHERE enrolled_at IS NOT NULL
      ORDER BY last_seen_at DESC NULLS LAST`,
  );
  return rows.map(toDevice);
}

export async function revokeDevice(deviceId: number): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE agent_devices SET revoked_at = NOW(), token_hash = NULL
      WHERE id = $1 AND revoked_at IS NULL`,
    [deviceId],
  );
  return (rowCount ?? 0) > 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toDevice(row: any): AgentDevice {
  const lastSeen: Date | null = row.last_seen_at ?? null;
  return {
    id: Number(row.id),
    deviceName: row.device_name,
    operator: row.operator,
    mailbox: row.mailbox ?? null,
    enrolledAt: row.enrolled_at?.toISOString() ?? null,
    lastSeenAt: lastSeen?.toISOString() ?? null,
    agentVersion: row.agent_version ?? null,
    emailsIngested: Number(row.emails_ingested ?? 0),
    revoked: !!row.revoked_at,
    // Presence is reported by the server from the agent's own heartbeat.
    // The browser never probes localhost for it — that path drags in Private
    // Network Access preflights and firewall prompts for no real gain.
    online:
      !!lastSeen && Date.now() - lastSeen.getTime() < PRESENCE_TIMEOUT_MINUTES * 60_000,
  };
}
