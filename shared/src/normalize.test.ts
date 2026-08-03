import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAmountPlausibility,
  checkDateOrdering,
  checkDatePlausibility,
  emailDomain,
  extractContainerNumbers,
  formatContainerNumber,
  isValidContainerNumber,
  normalizeAmount,
  normalizeContainerNumber,
  normalizeDate,
  normalizeNullable,
} from "./normalize.js";
import { byUrgency, daysUntil, demurrageDays, freeTimeLabel, lfdRisk } from "./lfd.js";
import type { Container } from "./types/container.js";

/* Every case below reflects a fault actually present in the live source
   sheets, or a bug class that would corrupt LFD ranking. */

/* ---------------- Container numbers ---------------- */

test("strips the trailing carriage returns present in the live Detention sheet", () => {
  // "CMAU6904400&#13;" appears verbatim in Source Sheet 2.
  assert.equal(normalizeContainerNumber("CMAU6904400&#13;"), "CMAU6904400");
  assert.equal(normalizeContainerNumber("TXGU7784371&#13;"), "TXGU7784371");
  assert.equal(normalizeContainerNumber("CMAU6904400\r\n"), "CMAU6904400");
});

test("a dirty and a clean container number normalise to the same key", () => {
  // Without this they become two containers, violating the no-duplicates rule.
  assert.equal(
    normalizeContainerNumber("CMAU6904400&#13;"),
    normalizeContainerNumber("cmau 690 4400"),
  );
});

test("validates ISO 6346 shape", () => {
  assert.equal(isValidContainerNumber("MSCU7452210"), true);
  assert.equal(isValidContainerNumber("MSCU745221"), false); // 6 digits
  assert.equal(isValidContainerNumber("MSC17452210"), false); // digit in prefix
  assert.equal(isValidContainerNumber(null), false);
});

test("formats container numbers in verification-friendly groups", () => {
  assert.equal(formatContainerNumber("MSCU7452210"), "MSCU 745 2210");
  assert.equal(formatContainerNumber(null), "—");
});

test("extracts container numbers from free text regardless of spacing", () => {
  const found = extractContainerNumbers(
    "Please release MSCU 745 2210 and cmau-690-4400 today.",
  );
  assert.deepEqual(found.sort(), ["CMAU6904400", "MSCU7452210"]);
});

/* ---------------- Null tokens ---------------- */

test("treats the sheet's several null spellings as null", () => {
  for (const token of ["", "  ", "-", "--", "N/A", "null", "none"]) {
    assert.equal(normalizeNullable(token), null, `expected null for "${token}"`);
  }
  assert.equal(normalizeNullable("Detention"), "Detention");
});

/* ---------------- Money ---------------- */

test("parses the sheet's formatted currency strings", () => {
  assert.equal(normalizeAmount("$1,420.00"), 1420);
  assert.equal(normalizeAmount("$130.09"), 130.09);
  assert.equal(normalizeAmount("$25.00"), 25);
});

test("distinguishes a missing amount from a genuine zero", () => {
  assert.equal(normalizeAmount("-"), null);
  assert.equal(normalizeAmount(""), null);
  assert.equal(normalizeAmount("$0.00"), 0);
});

/* ---------------- Dates ---------------- */

test("parses the sheet's D-Mon-YYYY dates", () => {
  assert.equal(normalizeDate("4-Sep-2025"), "2025-09-04");
  assert.equal(normalizeDate("19-Sep-2025"), "2025-09-19");
  assert.equal(normalizeDate("2-Oct-2025"), "2025-10-02");
});

test("date parsing is timezone-independent", () => {
  // new Date(y,m,d).toISOString() builds LOCAL midnight and serialises as UTC,
  // shifting the day backwards east of Greenwich. That would misdate every LFD.
  assert.equal(normalizeDate("4-Sep-2025"), "2025-09-04");
  assert.equal(normalizeDate("1-Jan-2026"), "2026-01-01");
  assert.equal(normalizeDate("31-Dec-2025"), "2025-12-31");
});

test("accepts US slash dates and ISO, rejects nonsense", () => {
  assert.equal(normalizeDate("09/04/2025"), "2025-09-04");
  assert.equal(normalizeDate("2025-09-04"), "2025-09-04");
  assert.equal(normalizeDate("31-Feb-2025"), null);
  assert.equal(normalizeDate("garbage"), null);
});

test("flags the year typos found in the Detention sheet", () => {
  // Rows dated 24-Dec-2026 sit between 2025 records with Jan-2026 returns.
  const now = new Date("2026-01-15T00:00:00Z");
  const issue = checkDatePlausibility("lastFreeDay", "2028-12-24", now);
  assert.ok(issue, "a date two years out should be flagged");
  assert.equal(issue?.severity, "Warning");
  assert.equal(checkDatePlausibility("lastFreeDay", "2026-01-20", now), null);
});

test("enforces doc 12's date ordering rules", () => {
  const issues = checkDateOrdering({
    gateInDate: "2025-09-10",
    lastFreeDay: "2025-09-04", // before gate in
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, "lastFreeDay");
  assert.equal(issues[0].severity, "Error");
});

test("flags return-before-pickup", () => {
  const issues = checkDateOrdering({
    pickUpDate: "2025-09-19",
    returnDate: "2025-09-04",
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, "returnDate");
});

test("rejects negative amounts — credits belong in the credit-note table", () => {
  assert.equal(checkAmountPlausibility("amount", -100)?.severity, "Error");
  assert.equal(checkAmountPlausibility("amount", 1420), null);
});

test("extracts email domains for vendor matching", () => {
  assert.equal(emailDomain("dispatch@marlinshipping.com"), "marlinshipping.com");
  assert.equal(emailDomain(null), null);
});

/* ---------------- LFD clock ---------------- */

const container = (over: Partial<Container> = {}): Container =>
  ({
    containerNumber: "MSCU7452210",
    status: "Pending",
    gateOutDate: null,
    lastFreeDay: null,
    emptyReturnDate: null,
    updatedDate: new Date().toISOString(),
    ...over,
  }) as Container;

test("daysUntil is midnight-anchored, not wall-clock", () => {
  // 17:00 "today" must read as 0 days, not 0.7 rounded away.
  const now = new Date("2026-02-10T17:00:00Z");
  assert.equal(daysUntil("2026-02-10", now), 0);
  assert.equal(daysUntil("2026-02-11", now), 1);
  assert.equal(daysUntil("2026-02-09", now), -1);
});

test("classifies LFD risk bands", () => {
  const now = new Date("2026-02-10T12:00:00Z");
  assert.equal(lfdRisk(container({ lastFreeDay: "2026-02-08" }), now), "overdue");
  assert.equal(lfdRisk(container({ lastFreeDay: "2026-02-10" }), now), "critical");
  assert.equal(lfdRisk(container({ lastFreeDay: "2026-02-12" }), now), "warning");
  assert.equal(lfdRisk(container({ lastFreeDay: "2026-02-20" }), now), "safe");
});

test("a gated-out container is cleared regardless of LFD", () => {
  const now = new Date("2026-02-10T12:00:00Z");
  const gone = container({ lastFreeDay: "2026-02-01", gateOutDate: "2026-01-30" });
  assert.equal(lfdRisk(gone, now), "cleared", "demurrage stops accruing at gate-out");
  assert.equal(freeTimeLabel(gone, now), "Cleared");
});

test("sorts most urgent first", () => {
  const now = new Date("2026-02-10T12:00:00Z");
  const list = [
    container({ lastFreeDay: "2026-02-20" }), // safe
    container({ lastFreeDay: "2026-02-05" }), // overdue
    container({ lastFreeDay: "2026-02-10" }), // critical
    container({ lastFreeDay: "2026-02-12" }), // warning
  ];
  const sorted = [...list].sort((a, b) => byUrgency(a, b, now));
  assert.deepEqual(
    sorted.map((c) => lfdRisk(c, now)),
    ["overdue", "critical", "warning", "safe"],
  );
});

test("countdown labels read naturally", () => {
  const now = new Date("2026-02-10T12:00:00Z");
  assert.equal(freeTimeLabel(container({ lastFreeDay: "2026-02-10" }), now), "TODAY");
  assert.equal(freeTimeLabel(container({ lastFreeDay: "2026-02-12" }), now), "2d left");
  assert.equal(freeTimeLabel(container({ lastFreeDay: "2026-02-07" }), now), "3d over");
});

test("demurrage accrues past LFD and stops at gate-out", () => {
  const now = new Date("2026-02-10T12:00:00Z");
  assert.equal(demurrageDays(container({ lastFreeDay: "2026-02-05" }), now), 5);
  assert.equal(
    demurrageDays(
      container({ lastFreeDay: "2026-02-05", gateOutDate: "2026-02-07" }),
      now,
    ),
    2,
    "stops at gate-out, not today",
  );
  assert.equal(demurrageDays(container({ lastFreeDay: "2026-02-20" }), now), 0);
});
