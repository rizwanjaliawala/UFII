import { normalizeContainerNumber } from "@tms/shared";
import { config } from "../config/index.js";
import { query } from "../db/pool.js";

/**
 * Reading email intelligence back out (doc 05 §Conversation Detection,
 * doc 04 §Email Intelligence).
 *
 * Every response carries `available`. Where the sync agent has never run
 * there is no email data, and the honest answer is "not connected" — a zero
 * would read as "this container has no correspondence", which is a different
 * and much more misleading claim.
 */

export interface EmailRow {
  id: number;
  subject: string | null;
  senderName: string | null;
  senderAddress: string | null;
  receivedAt: string;
  category: string;
  summary: string | null;
  hasAttachments: boolean;
  conversationId: string | null;
  method: string | null;
  confidence: number | null;
  needsReview: boolean;
}

export interface ContainerEmails {
  containerNumber: string;
  available: boolean;
  reason?: string;
  emails: EmailRow[];
  lastEmailAt: string | null;
  categories: { category: string; count: number }[];
}

const NOT_CONNECTED =
  "No sync agent has delivered email yet. Outlook is read by an agent on the " +
  "operator's Windows PC; until one is enrolled there is no correspondence to show.";

/** Emails linked to one container, newest first. */
export async function getContainerEmails(
  containerNumber: string,
  limit = 50,
): Promise<ContainerEmails> {
  const key = normalizeContainerNumber(containerNumber) ?? containerNumber;
  const empty: ContainerEmails = {
    containerNumber: key,
    available: false,
    reason: NOT_CONNECTED,
    emails: [],
    lastEmailAt: null,
    categories: [],
  };

  if (!config.database.configured) return empty;

  // "Has any agent ever delivered anything" — distinct from "does this
  // container have email", which is what the rows below answer.
  const { rows: probe } = await query<{ any: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM emails) AS any`,
  );
  if (!probe[0]?.any) return empty;

  const { rows } = await query<Record<string, never>>(
    `SELECT e.id, e.subject, e.sender_name, e.sender_address, e.received_at,
            e.category, e.summary, e.has_attachments, e.conversation_id,
            l.method, l.confidence, l.needs_review
       FROM email_container_links l
       JOIN emails e ON e.id = l.email_id
      WHERE l.container_number = $1 AND l.rejected = FALSE
      ORDER BY e.received_at DESC
      LIMIT ${Math.min(limit, 200)}`,
    [key],
  );

  const emails = rows.map(toEmailRow);
  const categories = new Map<string, number>();
  for (const email of emails) {
    categories.set(email.category, (categories.get(email.category) ?? 0) + 1);
  }

  return {
    containerNumber: key,
    available: true,
    emails,
    lastEmailAt: emails[0]?.receivedAt ?? null,
    categories: [...categories.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** One conversation thread, oldest first — doc 05 says display chronologically. */
export async function getConversation(conversationId: string): Promise<EmailRow[]> {
  if (!config.database.configured) return [];

  const { rows } = await query<Record<string, never>>(
    `SELECT e.id, e.subject, e.sender_name, e.sender_address, e.received_at,
            e.category, e.summary, e.has_attachments, e.conversation_id,
            NULL::text AS method, NULL::numeric AS confidence,
            FALSE AS needs_review
       FROM emails e
      WHERE e.conversation_id = $1
      ORDER BY e.received_at ASC
      LIMIT 200`,
    [conversationId],
  );
  return rows.map(toEmailRow);
}

export interface ReviewItem extends EmailRow {
  linkId: number;
  containerNumber: string;
  containerExists: boolean;
}

/**
 * The match review queue (doc 05: "Never guess... send to Review Queue").
 *
 * Two kinds of item land here: a link the matcher is not confident enough to
 * assert, and an email it could not match at all. Both need a human.
 */
export async function getReviewQueue(limit = 100): Promise<{
  available: boolean;
  reason?: string;
  lowConfidence: ReviewItem[];
  unmatched: EmailRow[];
  totals: { lowConfidence: number; unmatched: number };
}> {
  if (!config.database.configured) {
    return {
      available: false,
      reason: NOT_CONNECTED,
      lowConfidence: [],
      unmatched: [],
      totals: { lowConfidence: 0, unmatched: 0 },
    };
  }

  const capped = Math.min(limit, 200);

  const [low, unmatched, totals] = await Promise.all([
    query<Record<string, never>>(
      `SELECT l.id AS link_id, l.container_number, l.method, l.confidence,
              l.needs_review, e.id, e.subject, e.sender_name, e.sender_address,
              e.received_at, e.category, e.summary, e.has_attachments,
              e.conversation_id,
              EXISTS (SELECT 1 FROM containers c
                       WHERE c.container_number = l.container_number) AS container_exists
         FROM email_container_links l
         JOIN emails e ON e.id = l.email_id
        WHERE l.needs_review = TRUE AND l.reviewed_at IS NULL AND l.rejected = FALSE
        ORDER BY e.received_at DESC
        LIMIT ${capped}`,
    ),
    query<Record<string, never>>(
      `SELECT e.id, e.subject, e.sender_name, e.sender_address, e.received_at,
              e.category, e.summary, e.has_attachments, e.conversation_id,
              NULL::text AS method, NULL::numeric AS confidence,
              FALSE AS needs_review
         FROM emails e
        WHERE NOT EXISTS (
                SELECT 1 FROM email_container_links l
                 WHERE l.email_id = e.id AND l.rejected = FALSE)
        ORDER BY e.received_at DESC
        LIMIT ${capped}`,
    ),
    query<{ low: string; unmatched: string }>(
      `SELECT
         (SELECT COUNT(*) FROM email_container_links
           WHERE needs_review = TRUE AND reviewed_at IS NULL AND rejected = FALSE)::text AS low,
         (SELECT COUNT(*) FROM emails e
           WHERE NOT EXISTS (SELECT 1 FROM email_container_links l
                              WHERE l.email_id = e.id AND l.rejected = FALSE))::text AS unmatched`,
    ),
  ]);

  return {
    available: true,
    lowConfidence: low.rows.map((row) => ({
      ...toEmailRow(row),
      linkId: Number((row as Record<string, unknown>).link_id),
      containerNumber: String((row as Record<string, unknown>).container_number),
      containerExists: Boolean((row as Record<string, unknown>).container_exists),
    })),
    unmatched: unmatched.rows.map(toEmailRow),
    totals: {
      lowConfidence: Number(totals.rows[0]?.low ?? 0),
      unmatched: Number(totals.rows[0]?.unmatched ?? 0),
    },
  };
}

/**
 * Approve or reject a proposed link.
 *
 * Nothing auto-approves — doc 09 §Human in the Loop. Both outcomes are
 * recorded rather than the rejected row being deleted, so the matcher's
 * behaviour stays auditable and a rejected link is never re-proposed by the
 * conversation-thread rule.
 */
export async function reviewLink(
  linkId: number,
  decision: "approve" | "reject",
  actor: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE email_container_links
        SET reviewed_at = NOW(),
            reviewed_by = $2,
            rejected = $3,
            needs_review = FALSE,
            confidence = CASE WHEN $3 THEN confidence ELSE 1.0 END
      WHERE id = $1 AND reviewed_at IS NULL`,
    [linkId, actor, decision === "reject"],
  );
  return (rowCount ?? 0) > 0;
}

/** Attach an email to a container by hand — priority rule 5. */
export async function linkManually(
  emailId: number,
  containerNumber: string,
  actor: string,
): Promise<boolean> {
  const key = normalizeContainerNumber(containerNumber);
  if (!key) return false;

  const { rowCount } = await query(
    `INSERT INTO email_container_links
       (email_id, container_number, method, confidence, needs_review,
        reviewed_by, reviewed_at)
     VALUES ($1, $2, 'manual', 1.0, FALSE, $3, NOW())
     ON CONFLICT (email_id, container_number) DO UPDATE
        SET rejected = FALSE, needs_review = FALSE,
            reviewed_by = $3, reviewed_at = NOW(), confidence = 1.0`,
    [emailId, key, actor],
  );
  return (rowCount ?? 0) > 0;
}

/** Processing log — proves the agent is alive even when nothing is new. */
export async function getProcessingLog(limit = 100): Promise<{
  available: boolean;
  entries: {
    at: string;
    outcome: string;
    detail: string | null;
    containersLinked: number;
    device: string | null;
  }[];
}> {
  if (!config.database.configured) return { available: false, entries: [] };

  const { rows } = await query<{
    at: Date;
    outcome: string;
    detail: string | null;
    containers_linked: number;
    device_name: string | null;
  }>(
    `SELECT l.at, l.outcome, l.detail, l.containers_linked, d.device_name
       FROM email_processing_log l
       LEFT JOIN agent_devices d ON d.id = l.device_id
      ORDER BY l.at DESC
      LIMIT ${Math.min(limit, 500)}`,
  );

  return {
    available: true,
    entries: rows.map((row) => ({
      at: row.at.toISOString(),
      outcome: row.outcome,
      detail: row.detail,
      containersLinked: row.containers_linked,
      device: row.device_name,
    })),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEmailRow(row: any): EmailRow {
  return {
    id: Number(row.id),
    subject: row.subject ?? null,
    senderName: row.sender_name ?? null,
    senderAddress: row.sender_address ?? null,
    receivedAt: row.received_at.toISOString(),
    category: row.category ?? "Unknown",
    summary: row.summary ?? null,
    hasAttachments: !!row.has_attachments,
    conversationId: row.conversation_id ?? null,
    method: row.method ?? null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    needsReview: !!row.needs_review,
  };
}
