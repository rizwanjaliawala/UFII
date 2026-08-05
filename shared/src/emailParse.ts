import { extractContainerNumbers, isValidContainerNumber } from "./normalize.js";
import type { EmailCategory } from "./types/email.js";

/**
 * Reading identifiers and intent out of an email (doc 05 §Container Detection,
 * §Email Categories).
 *
 * Pure functions over text, deliberately: the same rules must apply to a
 * subject line, a body, OCR output from a screenshot and text extracted from
 * a PDF. Nothing here touches a mailbox or a database, so every rule is
 * testable against fixtures rather than against a live Outlook profile.
 *
 * The governing instruction from doc 05 is **"Never guess."** These functions
 * therefore prefer returning nothing over returning something plausible.
 */

/* ---------------- Other identifiers ---------------- */

/**
 * Booking and pickup numbers, taken only from an explicit label.
 *
 * Unlike a container number these have no checksum and no fixed format, so
 * there is nothing to verify a bare token against. Requiring a label
 * ("PU: 1234567", "Booking # ABC123") is the only way to avoid harvesting
 * every reference number in a signature block.
 */
const LABELLED = (labels: string[]): RegExp =>
  new RegExp(
    `(?:${labels.join("|")})\\s*(?:number|no\\.?|#)?\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9-]{4,19})`,
    "gi",
  );

const BOOKING_LABELS = ["booking", "bkg", "bl", "b/l", "bill of lading"];
const PICKUP_LABELS = ["pickup", "pick[- ]?up", "pu", "release", "pin"];

function extractLabelled(text: string, labels: string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(LABELLED(labels))) {
    const value = match[1]?.toUpperCase().replace(/-+$/, "");
    // A container number caught by a "release:" label is a container number,
    // not a pickup number. Let the container rule claim it.
    if (!value || seen.has(value) || isValidContainerNumber(value)) continue;
    seen.add(value);
    found.push(value);
  }

  return found;
}

export interface ExtractedReferences {
  containers: string[];
  bookings: string[];
  pickups: string[];
}

export function extractReferences(text: string | null | undefined): ExtractedReferences {
  if (!text) return { containers: [], bookings: [], pickups: [] };

  return {
    containers: extractContainerNumbers(text),
    bookings: extractLabelled(text, BOOKING_LABELS),
    pickups: extractLabelled(text, PICKUP_LABELS),
  };
}

/* ---------------- Categorisation ---------------- */

/**
 * Rules are ordered most-specific first and the first hit wins.
 *
 * "Empty return" must be tested before "return", and "gate out" before the
 * bare word "gate", or the broader rule swallows the narrower one.
 */
const CATEGORY_RULES: { category: EmailCategory; pattern: RegExp }[] = [
  { category: "PU Available", pattern: /\b(pickup number|pu number|pu available|release number|is available for pick|ready for pick)/i },
  { category: "Empty Return", pattern: /\b(empty return|empty returned|returned empty|empty in)\b/i },
  // `gated out` needs both the `d` and the separator; `[d\s-]?` allowed only
  // one of them and silently missed the most common phrasing in the data.
  { category: "Gate Out", pattern: /\b(gated?[\s-]?out|out[\s-]?gated|picked up from (the )?terminal)\b/i },
  { category: "Gate In", pattern: /\b(gated?[\s-]?in|in[\s-]?gated)\b/i },
  { category: "Appointment", pattern: /\b(appointment|appt|scheduled for|booking slot|time slot)\b/i },
  { category: "Invoice", pattern: /\b(invoice|detention|demurrage|per diem|credit note|charges? (due|owed)|statement)\b/i },
  { category: "Delivery", pattern: /\b(delivered|delivery (confirm|complete|receipt)|pod\b|proof of delivery)/i },
  { category: "Reminder Reply", pattern: /^(re|rz|fwd|fw)\s*:.*\b(remind|follow[- ]?up|status update)\b/i },
  { category: "Vendor Update", pattern: /\b(update on|status (update|of)|eta (is|update)|will be|delayed)\b/i },
];

/**
 * Best-effort category from the subject and body.
 *
 * The subject is weighted over the body by being tested first: a signature or
 * quoted reply chain frequently mentions invoices and appointments that have
 * nothing to do with the message someone actually sent.
 *
 * Returns "Unknown" rather than "General" when nothing matches — the two mean
 * different things, and doc 05 allows manual recategorisation from either.
 */
export function categorizeEmail(
  subject: string | null | undefined,
  body?: string | null,
): EmailCategory {
  for (const source of [subject, body]) {
    if (!source) continue;
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(source)) return rule.category;
    }
  }
  return subject || body ? "Unknown" : "Unknown";
}

/* ---------------- Summary ---------------- */

/**
 * A one-line summary built from the email itself.
 *
 * Deliberately extractive, not generative. Doc 05 says "Do not rewrite email
 * content", and an operator acting on a summary needs it to be the sender's
 * words. The AI summariser in Phase 4 replaces this; until then a trimmed
 * first meaningful line is honest and costs nothing.
 */
export function summarizeEmail(body: string | null | undefined, limit = 120): string | null {
  if (!body) return null;

  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    // Skip quoted replies, separators and the "On <date> X wrote:" header.
    .find(
      (l) =>
        l.length > 12 &&
        !l.startsWith(">") &&
        !/^(from|to|sent|subject|cc|bcc|date)\s*:/i.test(l) &&
        !/^on .+wrote:$/i.test(l) &&
        !/^[-_=*]{3,}$/.test(l),
    );

  if (!line) return null;
  return line.length <= limit ? line : `${line.slice(0, limit - 1).trimEnd()}…`;
}
