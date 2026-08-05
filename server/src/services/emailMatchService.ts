import {
  extractReferences,
  isValidContainerNumber,
  normalizeContainerNumber,
} from "@tms/shared";
import { query } from "../db/pool.js";

/**
 * Matching an email to containers (doc 05 §Email Matching).
 *
 * The documented priority, strongest first:
 *
 *   1. Exact container number
 *   2. Booking number
 *   3. PU number
 *   4. Conversation thread
 *   5. Manual review
 *
 * The rule that governs all of it is **"Never guess."** So this returns
 * `needsReview` alongside every link rather than silently attaching an email
 * to a container: a wrong link is worse than no link, because an operator
 * reading a container's history has no way to tell a guess from a fact.
 *
 * Each rule is tried in order and the first that yields matches wins. They
 * are not combined — a booking-number hit does not "confirm" a weaker
 * conversation-thread hit, it replaces it.
 */

export type MatchMethod =
  | "container-number"
  | "booking-number"
  | "pickup-number"
  | "conversation-thread"
  | "unmatched";

export interface EmailMatch {
  containerNumber: string;
  method: MatchMethod;
  confidence: number;
  needsReview: boolean;
}

export interface MatchInput {
  subject?: string | null;
  body?: string | null;
  conversationId?: string | null;
  /** Text recovered from attachments — OCR output, extracted PDF text. */
  attachmentText?: string | null;
}

/**
 * Confidence per rule.
 *
 * A checksum-valid container number in the text is as close to certain as
 * this system gets. A conversation-thread match is an inference — the thread
 * was about that container before, so this reply probably is too — and is
 * deliberately below the review threshold.
 */
const CONFIDENCE: Record<Exclude<MatchMethod, "unmatched">, number> = {
  "container-number": 0.99,
  "booking-number": 0.9,
  "pickup-number": 0.85,
  "conversation-thread": 0.6,
};

/** At or below this, a human confirms before the link is trusted. */
export const REVIEW_THRESHOLD = 0.8;

/** Cap per email. A message listing 200 containers is a report, not an update. */
const MAX_LINKS = 25;

export async function matchEmail(input: MatchInput): Promise<EmailMatch[]> {
  const haystack = [input.subject, input.body, input.attachmentText]
    .filter(Boolean)
    .join("\n");

  const refs = extractReferences(haystack);

  // ---- 1. Exact container number -------------------------------------
  if (refs.containers.length > 0) {
    const known = await existingContainers(refs.containers);
    if (known.length > 0) return links(known, "container-number");

    // The number is checksum-valid but not in the fleet. That is a real
    // finding, not a non-match — it is how a container missing from the
    // sheets would first surface — so it goes to review rather than being
    // discarded.
    return refs.containers.slice(0, MAX_LINKS).map((containerNumber) => ({
      containerNumber,
      method: "container-number" as const,
      confidence: 0.5,
      needsReview: true,
    }));
  }

  // ---- 2. Booking number ---------------------------------------------
  if (refs.bookings.length > 0) {
    const byBooking = await containersByColumn("bl_number", refs.bookings);
    if (byBooking.length > 0) return links(byBooking, "booking-number");
  }

  // ---- 3. PU number ---------------------------------------------------
  if (refs.pickups.length > 0) {
    const byPickup = await containersByColumn("pickup_number", refs.pickups);
    if (byPickup.length > 0) return links(byPickup, "pickup-number");
  }

  // ---- 4. Conversation thread -----------------------------------------
  //
  // Only reuses links a human has not rejected, and never inherits a link
  // that was itself unreviewed — otherwise one bad guess propagates down a
  // whole thread and looks more credible with every reply.
  if (input.conversationId) {
    const { rows } = await query<{ container_number: string }>(
      `SELECT DISTINCT l.container_number
         FROM email_container_links l
         JOIN emails e ON e.id = l.email_id
        WHERE e.conversation_id = $1
          AND l.rejected = FALSE
          AND (l.needs_review = FALSE OR l.reviewed_at IS NOT NULL)
        LIMIT ${MAX_LINKS}`,
      [input.conversationId],
    );
    if (rows.length > 0) {
      return links(rows.map((r) => r.container_number), "conversation-thread");
    }
  }

  // ---- 5. Manual review -----------------------------------------------
  return [];
}

function links(containerNumbers: string[], method: Exclude<MatchMethod, "unmatched">): EmailMatch[] {
  const confidence = CONFIDENCE[method];
  return containerNumbers.slice(0, MAX_LINKS).map((containerNumber) => ({
    containerNumber,
    method,
    confidence,
    needsReview: confidence <= REVIEW_THRESHOLD,
  }));
}

/** Which of these container numbers actually exist in the fleet. */
async function existingContainers(candidates: string[]): Promise<string[]> {
  const normalized = candidates
    .map((c) => normalizeContainerNumber(c))
    .filter((c): c is string => !!c && isValidContainerNumber(c));

  if (normalized.length === 0) return [];

  const { rows } = await query<{ container_number: string }>(
    `SELECT container_number FROM containers WHERE container_number = ANY($1)`,
    [normalized],
  );

  // Preserve the order the identifiers appeared in the email: the first
  // mention is usually the subject of the message.
  const found = new Set(rows.map((r) => r.container_number));
  return normalized.filter((c) => found.has(c));
}

/**
 * Containers whose `column` matches one of these values.
 *
 * The column name is NOT a parameter — it is chosen from a fixed allowlist,
 * because an identifier cannot be bound and interpolating a caller-supplied
 * string into SQL is how injection happens.
 */
const MATCHABLE_COLUMNS = { bl_number: true, pickup_number: true } as const;

async function containersByColumn(
  column: keyof typeof MATCHABLE_COLUMNS,
  values: string[],
): Promise<string[]> {
  if (!MATCHABLE_COLUMNS[column] || values.length === 0) return [];

  const { rows } = await query<{ container_number: string }>(
    `SELECT container_number FROM containers
      WHERE ${column} = ANY($1) AND ${column} IS NOT NULL AND ${column} <> ''
      LIMIT ${MAX_LINKS}`,
    [values],
  );
  return rows.map((r) => r.container_number);
}
