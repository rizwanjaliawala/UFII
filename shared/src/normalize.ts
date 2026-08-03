/**
 * Canonical normalization.
 *
 * Applied ONCE at ingest, before anything reaches the merge engine. Every
 * rule here exists because of a fault observed in the live source sheets:
 *
 *   - Container numbers carry trailing carriage returns ("CMAU6904400&#13;").
 *     Left alone these create phantom duplicate containers, which directly
 *     violates doc 06's "never create duplicate containers".
 *   - Amounts arrive as formatted strings ("$1,420.00").
 *   - Dates arrive as "4-Sep-2025", and some rows carry year typos
 *     (24-Dec-2026 interleaved with 2025 records in the same batch).
 *   - "-" and "" are both used to mean null, inconsistently.
 *
 * Pure functions only — no I/O — so every rule is directly unit-testable.
 */

/* ------------------------------------------------------------------ */
/* Null handling                                                       */
/* ------------------------------------------------------------------ */

/** Values the source sheets use to mean "empty". */
const NULL_TOKENS = new Set(["", "-", "--", "n/a", "na", "null", "none", "#n/a"]);

export function normalizeNullable(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw)
    // Strip HTML-encoded and literal carriage returns/newlines/tabs.
    .replace(/&#13;|&#10;|[\r\n\t]/g, "")
    .trim();
  if (NULL_TOKENS.has(s.toLowerCase())) return null;
  return s.length > 0 ? s : null;
}

/* ------------------------------------------------------------------ */
/* Container numbers (ISO 6346)                                        */
/* ------------------------------------------------------------------ */

/** 4 letters (owner + category) followed by 7 digits. */
const ISO6346 = /^[A-Z]{4}\d{7}$/;

/**
 * Canonical container key: uppercase, no separators, no stray whitespace.
 * This is the value used as the primary key everywhere.
 */
export function normalizeContainerNumber(raw: unknown): string | null {
  const cleaned = normalizeNullable(raw);
  if (!cleaned) return null;
  const key = cleaned.replace(/[\s\-_.]/g, "").toUpperCase();
  return key.length > 0 ? key : null;
}

export function isValidContainerNumber(value: string | null): boolean {
  return value !== null && ISO6346.test(value);
}

/**
 * Display form: MSCU 745 2210.
 * Grouping makes transcription errors visible — an operator comparing against
 * an email spots a wrong group instantly.
 */
export function formatContainerNumber(value: string | null): string {
  if (!value) return "—";
  const m = value.match(/^([A-Z]{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : value;
}

/** Every container number mentioned in a blob of text (email body, PDF). */
export function extractContainerNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z]{4})[\s\-]?(\d{3})[\s\-]?(\d{4})\b/gi)) {
    found.add(`${m[1]}${m[2]}${m[3]}`.toUpperCase());
  }
  return [...found];
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/**
 * "$1,420.00" → 1420. Returns null rather than 0 for absent values, because
 * a missing amount and a genuine zero mean different things financially.
 */
export function normalizeAmount(raw: unknown): number | null {
  const cleaned = normalizeNullable(raw);
  if (cleaned === null) return null;

  const negative = /^\(.*\)$/.test(cleaned); // accounting-style negatives
  const digits = cleaned.replace(/[^0-9.\-]/g, "");
  if (digits === "" || digits === "-" || digits === ".") return null;

  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

export function normalizeInteger(raw: unknown): number | null {
  const value = normalizeAmount(raw);
  return value === null ? null : Math.round(value);
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parse the date formats present in the source sheets to an ISO date string.
 *
 * Formats out of `Date` deliberately: `new Date(y, m, d).toISOString()` builds
 * LOCAL midnight and serialises as UTC, shifting the date back a day in any
 * timezone ahead of UTC. For a calendar-day value like LFD that is a real bug,
 * so the components are formatted directly.
 *
 * Accepts: "4-Sep-2025", "4 Sep 2025", "09/04/2025" (US M/D/Y), "2025-09-04".
 */
export function normalizeDate(raw: unknown): string | null {
  const cleaned = normalizeNullable(raw);
  if (cleaned === null) return null;

  // Already ISO
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // D-Mon-YYYY / D Mon YY
  const named = cleaned.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,4})[\s\-/](\d{2,4})$/);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2].toLowerCase()];
    const year = expandYear(Number(named[3]));
    if (month && isRealDate(year, month, day)) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
    return null;
  }

  // M/D/YYYY — US convention; these are US terminals.
  const slash = cleaned.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = expandYear(Number(slash[3]));
    if (isRealDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
    return null;
  }

  return null;
}

function expandYear(year: number): number {
  if (year >= 1000) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** Timestamps keep full precision; only calendar dates are day-anchored. */
export function normalizeTimestamp(raw: unknown): string | null {
  const cleaned = normalizeNullable(raw);
  if (cleaned === null) return null;
  const d = new Date(cleaned);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const dateOnly = normalizeDate(cleaned);
  return dateOnly ? `${dateOnly}T00:00:00.000Z` : null;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/** Party and place names: collapse whitespace, preserve the operator's casing. */
export function normalizeName(raw: unknown): string | null {
  const cleaned = normalizeNullable(raw);
  return cleaned === null ? null : cleaned.replace(/\s+/g, " ");
}

/** Case-insensitive key for grouping names that differ only in spacing/case. */
export function nameKey(raw: unknown): string | null {
  const name = normalizeName(raw);
  return name === null ? null : name.toLowerCase();
}

export function normalizeEmail(raw: unknown): string | null {
  const cleaned = normalizeNullable(raw);
  return cleaned === null ? null : cleaned.toLowerCase();
}

export function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at === -1 ? null : email.slice(at + 1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Plausibility checks                                                 */
/* ------------------------------------------------------------------ */

export interface PlausibilityIssue {
  field: string;
  severity: "Info" | "Warning" | "Error";
  issue: string;
  rawValue: string | null;
}

/**
 * Flag values that parse cleanly but cannot be true.
 *
 * These are quarantined for review, never dropped — the live Detention sheet
 * contains rows dated 24-Dec-2026 sitting between 2025 records with Jan-2026
 * return dates, which are almost certainly mistyped years. Discarding them
 * would lose real invoices; silently trusting them would mis-rank LFD by a
 * full year.
 */
export function checkDatePlausibility(
  field: string,
  isoDate: string | null,
  now: Date = new Date(),
): PlausibilityIssue | null {
  if (!isoDate) return null;
  const value = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) {
    return { field, severity: "Error", issue: "Unparseable date", rawValue: isoDate };
  }

  const oneYearAhead = new Date(now);
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
  if (value > oneYearAhead) {
    return {
      field,
      severity: "Warning",
      issue: "Date is more than a year in the future — probable year typo",
      rawValue: isoDate,
    };
  }

  const tenYearsAgo = new Date(now);
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  if (value < tenYearsAgo) {
    return {
      field,
      severity: "Warning",
      issue: "Date is more than ten years old",
      rawValue: isoDate,
    };
  }

  return null;
}

/** Doc 12: "LFD cannot be before Gate In". Plus return-before-pickup. */
export function checkDateOrdering(dates: {
  gateInDate?: string | null;
  gateOutDate?: string | null;
  lastFreeDay?: string | null;
  emptyReturnDate?: string | null;
  pickUpDate?: string | null;
  returnDate?: string | null;
}): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  const before = (a?: string | null, b?: string | null) => !!a && !!b && a < b;

  if (before(dates.lastFreeDay, dates.gateInDate)) {
    issues.push({
      field: "lastFreeDay",
      severity: "Error",
      issue: "Last Free Day is before Gate In",
      rawValue: dates.lastFreeDay ?? null,
    });
  }
  if (before(dates.gateOutDate, dates.gateInDate)) {
    issues.push({
      field: "gateOutDate",
      severity: "Error",
      issue: "Gate Out is before Gate In",
      rawValue: dates.gateOutDate ?? null,
    });
  }
  if (before(dates.emptyReturnDate, dates.gateOutDate)) {
    issues.push({
      field: "emptyReturnDate",
      severity: "Warning",
      issue: "Empty Return is before Gate Out",
      rawValue: dates.emptyReturnDate ?? null,
    });
  }
  if (before(dates.returnDate, dates.pickUpDate)) {
    issues.push({
      field: "returnDate",
      severity: "Error",
      issue: "Return date is before Pick-up date",
      rawValue: dates.returnDate ?? null,
    });
  }
  return issues;
}

export function checkAmountPlausibility(
  field: string,
  amount: number | null,
): PlausibilityIssue | null {
  if (amount === null) return null;
  if (amount < 0) {
    // Doc 12: "Cost — cannot be negative". Credits are modelled separately.
    return {
      field,
      severity: "Error",
      issue: "Negative amount — credits belong in the credit-note table",
      rawValue: String(amount),
    };
  }
  if (amount > 100_000) {
    return {
      field,
      severity: "Warning",
      issue: "Amount is unusually large — verify before approving",
      rawValue: String(amount),
    };
  }
  return null;
}
