import { categorizeEmail, summarizeEmail } from "@tms/shared";
import { query, transaction } from "../db/pool.js";
import { matchEmail, type EmailMatch } from "./emailMatchService.js";
import { apiLogger } from "../utils/logger.js";

/**
 * Ingesting email pushed by the Windows sync agent (doc 05).
 *
 * Every message is deduped, categorised, summarised and matched to containers
 * in one pass, and the outcome — including "already seen" — is written to the
 * processing log. The skips matter: without them there is no way to tell "the
 * agent is running and nothing is new" from "the agent has stopped".
 *
 * Nothing here reads a mailbox. The agent does that; this only accepts what
 * it sends.
 */

/** Bodies are truncated on arrival — see the note on the emails table. */
const BODY_PREVIEW_LIMIT = 4000;

/** One POST from the agent. Large enough to be efficient, small enough to bound. */
export const MAX_BATCH = 100;

export interface IncomingEmail {
  internetMessageId: string;
  conversationId?: string | null;
  entryId?: string | null;
  folder?: string | null;
  subject?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  receivedAt: string;
  body?: string | null;
  attachments?: {
    fileName: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    kind?: string | null;
    driveFileId?: string | null;
  }[];
  /** Text already recovered from attachments by the agent (OCR, PDF text). */
  attachmentText?: string | null;
}

export interface IngestResult {
  received: number;
  stored: number;
  duplicates: number;
  failed: number;
  linked: number;
  needsReview: number;
}

export async function ingestEmails(
  deviceId: number,
  batch: IncomingEmail[],
): Promise<IngestResult> {
  const result: IngestResult = {
    received: batch.length,
    stored: 0,
    duplicates: 0,
    failed: 0,
    linked: 0,
    needsReview: 0,
  };

  for (const email of batch) {
    try {
      const outcome = await ingestOne(deviceId, email);
      if (outcome === "duplicate") {
        result.duplicates++;
      } else {
        result.stored++;
        result.linked += outcome.links.length;
        result.needsReview += outcome.links.filter((l) => l.needsReview).length;
      }
    } catch (error) {
      result.failed++;
      apiLogger.error(
        { err: error, messageId: email.internetMessageId },
        "email ingest failed",
      );
      await logProcessing(deviceId, email.internetMessageId, "error", (error as Error).message, 0);
    }
  }

  if (result.stored > 0) {
    await query(
      `UPDATE agent_devices SET emails_ingested = emails_ingested + $2 WHERE id = $1`,
      [deviceId, result.stored],
    );
  }

  return result;
}

async function ingestOne(
  deviceId: number,
  email: IncomingEmail,
): Promise<"duplicate" | { emailId: number; links: EmailMatch[] }> {
  // Dedupe first and cheaply. The agent re-offers messages after a restart
  // because its own watermark is not authoritative — the server's record is.
  const existing = await query<{ id: number }>(
    `SELECT id FROM emails WHERE internet_message_id = $1`,
    [email.internetMessageId],
  );
  if (existing.rows[0]) {
    await logProcessing(deviceId, email.internetMessageId, "duplicate", null, 0);
    return "duplicate";
  }

  const category = categorizeEmail(email.subject, email.body);
  const summary = summarizeEmail(email.body);

  // Matching runs before the insert so a message that cannot be matched is
  // still stored — an unmatched email is a review-queue item, not a discard.
  const links = await matchEmail({
    subject: email.subject,
    body: email.body,
    conversationId: email.conversationId,
    attachmentText: email.attachmentText,
  });

  const emailId = await transaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO emails (
         internet_message_id, conversation_id, entry_id, folder, subject,
         sender_name, sender_address, received_at, body_preview,
         category, summary, has_attachments, device_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (internet_message_id) DO NOTHING
       RETURNING id`,
      [
        email.internetMessageId,
        email.conversationId ?? null,
        email.entryId ?? null,
        email.folder ?? null,
        email.subject ?? null,
        email.senderName ?? null,
        email.senderAddress ?? null,
        email.receivedAt,
        email.body?.slice(0, BODY_PREVIEW_LIMIT) ?? null,
        category,
        summary,
        (email.attachments?.length ?? 0) > 0,
        deviceId,
      ],
    );

    // ON CONFLICT DO NOTHING means a concurrent insert won the race. Treat it
    // as the duplicate it is rather than failing the whole batch.
    const id = inserted.rows[0]?.id;
    if (!id) return null;

    for (const link of links) {
      await client.query(
        `INSERT INTO email_container_links
           (email_id, container_number, method, confidence, needs_review)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (email_id, container_number) DO NOTHING`,
        [id, link.containerNumber, link.method, link.confidence, link.needsReview],
      );
    }

    for (const attachment of email.attachments ?? []) {
      await client.query(
        `INSERT INTO email_attachments
           (email_id, file_name, content_type, size_bytes, kind, drive_file_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (email_id, file_name) DO NOTHING`,
        [
          id,
          attachment.fileName,
          attachment.contentType ?? null,
          attachment.sizeBytes ?? null,
          attachment.kind ?? classifyAttachment(attachment.fileName),
          attachment.driveFileId ?? null,
        ],
      );
    }

    return id;
  });

  if (emailId === null) {
    await logProcessing(deviceId, email.internetMessageId, "duplicate", "insert raced", 0);
    return "duplicate";
  }

  await logProcessing(
    deviceId,
    email.internetMessageId,
    links.length > 0 ? "linked" : "unmatched",
    links.length > 0 ? links.map((l) => `${l.containerNumber}:${l.method}`).join(", ") : null,
    links.length,
  );

  return { emailId, links };
}

/** Filename-based attachment kind. The agent may override it. */
function classifyAttachment(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (/\.(png|jpe?g|gif|bmp|tiff?|webp)$/.test(lower)) return "Screenshot";
  if (/\.pdf$/.test(lower)) return /invoice|statement|charge/.test(lower) ? "Invoice" : "Document";
  if (/\.(xlsx?|csv)$/.test(lower)) return "Spreadsheet";
  return "Unknown";
}

async function logProcessing(
  deviceId: number,
  messageId: string | null,
  outcome: string,
  detail: string | null,
  containersLinked: number,
): Promise<void> {
  await query(
    `INSERT INTO email_processing_log
       (internet_message_id, device_id, outcome, detail, containers_linked)
     VALUES ($1,$2,$3,$4,$5)`,
    [messageId, deviceId, outcome, detail?.slice(0, 500) ?? null, containersLinked],
  );
}
