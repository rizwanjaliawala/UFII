import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { categorizeEmail, extractReferences, summarizeEmail } from "./emailParse.js";
// Container identity lives in normalize.ts — one definition, used by the
// ingest, the matcher and this parser alike.
import {
  containerCheckDigit,
  extractContainerNumbers,
  isValidContainerNumber,
  normalizeContainerNumber,
} from "./normalize.js";

/**
 * Fixtures use real container numbers from the source sheets, so the checksum
 * rule is pinned against numbers that actually exist rather than invented ones
 * that might happen to validate.
 */

describe("ISO 6346 check digit", () => {
  it("accepts real container numbers from the fleet", () => {
    for (const value of [
      "CMAU9822570",
      "TCNU1184850",
      "ECMU7520022",
      "SEGU5172362",
      "WHSU2782374",
    ]) {
      assert.equal(isValidContainerNumber(value), true, `${value} should validate`);
    }
  });

  it("rejects a number whose check digit is wrong", () => {
    // CMAU9822570 is valid; every other final digit must not be.
    for (let d = 1; d <= 9; d++) {
      assert.equal(isValidContainerNumber(`CMAU982257${d}`), false);
    }
  });

  it("rejects malformed shapes outright", () => {
    for (const value of ["CMAU98225", "1234567890A", "", "CMAUX822570"]) {
      assert.equal(isValidContainerNumber(value), false, `${value} should not validate`);
    }
  });


  it("returns null for input that is not ten characters", () => {
    assert.equal(containerCheckDigit("CMAU98225"), null);
    assert.equal(containerCheckDigit("CMAU98225701"), null);
  });

  it("validates the canonical key, so callers normalise first", () => {
    // isValidContainerNumber checks an already-canonical value — that is the
    // contract the ingest relies on. The sheets' trailing carriage returns
    // and stray spaces are normalizeContainerNumber's job.
    assert.equal(isValidContainerNumber("CMAU9822570\r"), false);
    assert.equal(isValidContainerNumber(normalizeContainerNumber("CMAU9822570\r")), true);
    assert.equal(isValidContainerNumber(normalizeContainerNumber("CM AU9822570")), true);
    assert.equal(isValidContainerNumber(normalizeContainerNumber("cmau-9822570")), true);
  });
});

describe("extractContainerNumbers", () => {
  it("finds a container in a subject line", () => {
    assert.deepEqual(
      extractContainerNumbers("RE: CMAU9822570 pickup scheduled"),
      ["CMAU9822570"],
    );
  });

  it("accepts spaced and hyphenated formatting", () => {
    assert.deepEqual(extractContainerNumbers("container CMAU 982257 0"), ["CMAU9822570"]);
    assert.deepEqual(extractContainerNumbers("ref TCNU-1184850"), ["TCNU1184850"]);
  });

  it("deduplicates while preserving first-mention order", () => {
    const text = "TCNU1184850 and CMAU9822570, again TCNU1184850";
    assert.deepEqual(extractContainerNumbers(text), ["TCNU1184850", "CMAU9822570"]);
  });

  it("does not harvest reference numbers that merely look like containers", () => {
    // Correct shape, wrong checksum — exactly the false positive the check
    // digit exists to prevent.
    assert.deepEqual(extractContainerNumbers("Invoice NAIC1340615 attached"), []);
    assert.deepEqual(extractContainerNumbers("order ABCD1234567 confirmed"), []);
  });

  it("returns nothing for empty input", () => {
    assert.deepEqual(extractContainerNumbers(null), []);
    assert.deepEqual(extractContainerNumbers(""), []);
  });
});

describe("extractReferences", () => {
  it("reads labelled booking and pickup numbers", () => {
    const result = extractReferences(
      "Booking No: ABC123456\nPU #: 7788991\nContainer CMAU9822570",
    );
    assert.deepEqual(result.containers, ["CMAU9822570"]);
    assert.deepEqual(result.bookings, ["ABC123456"]);
    assert.deepEqual(result.pickups, ["7788991"]);
  });

  it("ignores unlabelled tokens", () => {
    const result = extractReferences("Please see 9988776655 in the attached file");
    assert.deepEqual(result.bookings, []);
    assert.deepEqual(result.pickups, []);
  });

  it("does not report a container number as a pickup number", () => {
    // "Release: <container>" is about the container, not a PU.
    const result = extractReferences("Release: CMAU9822570");
    assert.deepEqual(result.containers, ["CMAU9822570"]);
    assert.deepEqual(result.pickups, []);
  });
});

describe("categorizeEmail", () => {
  it("classifies the common operational messages", () => {
    const cases: [string, string][] = [
      ["Pickup number for CMAU9822570", "PU Available"],
      ["Appointment confirmed for Tuesday", "Appointment"],
      ["Invoice NAIC1340615 — detention charges", "Invoice"],
      ["Container was gated out yesterday", "Gate Out"],
      ["Empty return completed", "Empty Return"],
      ["POD attached, delivered 10:15", "Delivery"],
    ];
    for (const [subject, expected] of cases) {
      assert.equal(categorizeEmail(subject), expected, `subject: ${subject}`);
    }
  });

  it("prefers the more specific rule when two could match", () => {
    // "empty return" must win over the gate rules.
    assert.equal(categorizeEmail("Empty return gated in at APM"), "Empty Return");
  });

  it("weights the subject over the body", () => {
    assert.equal(
      categorizeEmail("Appointment confirmed", "Invoice attached for your records"),
      "Appointment",
    );
  });

  it("falls back to Unknown rather than guessing", () => {
    assert.equal(categorizeEmail("Hello", "Thanks very much"), "Unknown");
    assert.equal(categorizeEmail(null, null), "Unknown");
  });
});

describe("summarizeEmail", () => {
  it("takes the first meaningful line", () => {
    const body = "Hi,\n\nVendor confirmed pickup appointment for tomorrow morning.\n\nThanks";
    assert.equal(summarizeEmail(body), "Vendor confirmed pickup appointment for tomorrow morning.");
  });

  it("skips quoted replies and mail headers", () => {
    const body = [
      "> previous message text that is long enough to pass",
      "From: someone@example.com",
      "On Tue, 2 Aug 2026 at 09:00, Someone wrote:",
      "----------------",
      "The container has been released and is ready.",
    ].join("\n");
    assert.equal(summarizeEmail(body), "The container has been released and is ready.");
  });

  it("truncates on a boundary rather than mid-stream", () => {
    const summary = summarizeEmail("x".repeat(300), 40);
    assert.equal(summary?.length, 40);
    assert.ok(summary?.endsWith("…"));
  });

  it("returns null when there is nothing worth summarising", () => {
    assert.equal(summarizeEmail(null), null);
    assert.equal(summarizeEmail("ok"), null);
  });
});
