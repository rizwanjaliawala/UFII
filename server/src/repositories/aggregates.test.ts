import test from "node:test";
import assert from "node:assert/strict";
import { LFD_THRESHOLDS, type Container } from "@tms/shared";
import { RISK_SQL, computeAggregates, isoDay } from "./aggregates.js";

/**
 * The Node and SQL aggregation paths must agree.
 *
 * `RISK_SQL` restates `lfdRisk()` in SQL, and a silent divergence between them
 * would show as two different dashboards depending on whether the ingest had
 * run. These tests pin the Node behaviour and assert that the SQL fragment
 * still encodes the same thresholds.
 */

const NOW = new Date("2026-08-02T12:00:00Z");

function container(over: Partial<Container> = {}): Container {
  return {
    containerNumber: "MSCU1234567",
    status: "Pending",
    gateOutDate: null,
    lastFreeDay: null,
    emptyReturnDate: null,
    appointmentDate: null,
    eta: null,
    pickupNumber: null,
    trucker: "Marlin Shipping",
    terminal: "APM",
    pod: "Newark, NJ",
    updatedDate: NOW.toISOString(),
    ...over,
  } as Container;
}

/* ---------------- Node aggregation ---------------- */

test("risk bands match lfdRisk across the boundaries", () => {
  const result = computeAggregates(
    [
      container({ lastFreeDay: "2026-07-30" }), // overdue
      container({ containerNumber: "A", lastFreeDay: "2026-08-02" }), // today
      container({ containerNumber: "B", lastFreeDay: "2026-08-04" }), // warning
      container({ containerNumber: "C", lastFreeDay: "2026-08-20" }), // safe
      container({ containerNumber: "D", lastFreeDay: null }), // safe, no LFD
    ],
    NOW,
  );

  assert.equal(result.risk.overdue, 1);
  assert.equal(result.risk.critical, 1);
  assert.equal(result.risk.warning, 1);
  assert.equal(result.risk.safe, 2);
});

test("a gated-out container is cleared regardless of LFD", () => {
  const result = computeAggregates(
    [container({ lastFreeDay: "2026-07-01", gateOutDate: "2026-07-05" })],
    NOW,
  );
  assert.equal(result.risk.cleared, 1);
  assert.equal(result.risk.overdue, 0);
});

test("completed statuses are cleared and not counted active", () => {
  const result = computeAggregates(
    [
      container({ status: "Empty Returned", lastFreeDay: "2026-07-01" }),
      container({ containerNumber: "A", status: "Delivered" }),
      container({ containerNumber: "B", status: "Closed" }),
    ],
    NOW,
  );
  assert.equal(result.activeContainers, 0);
  assert.equal(result.completed, 3);
  assert.equal(result.risk.cleared, 3);
});

test("at port versus in transit splits on Pending", () => {
  const result = computeAggregates(
    [
      container({ status: "Pending" }),
      container({ containerNumber: "A", status: "Pickup Scheduled" }),
      container({ containerNumber: "B", status: "Picked Up" }),
    ],
    NOW,
  );
  assert.equal(result.activeContainers, 3);
  assert.equal(result.atPort, 1);
  assert.equal(result.inTransit, 2);
});

test("attention counters only consider active containers", () => {
  // A delivered container with no PU is not an action item.
  const result = computeAggregates(
    [
      container({ status: "Empty Returned", pickupNumber: null, trucker: null }),
      container({ containerNumber: "A", status: "Pending", pickupNumber: null }),
    ],
    NOW,
  );
  assert.equal(result.missingPu, 1);
  assert.equal(result.unassigned, 0);
});

test("today counters key off the local calendar day", () => {
  const today = isoDay(NOW);
  const result = computeAggregates(
    [
      container({ eta: today }),
      container({ containerNumber: "A", appointmentDate: today }),
      container({ containerNumber: "B", lastFreeDay: today }),
    ],
    NOW,
  );
  assert.equal(result.arrivingToday, 1);
  assert.equal(result.appointmentsToday, 1);
  assert.equal(result.lfdDueToday, 1);
});

test("the upcoming week always has seven entries, zeros included", () => {
  const result = computeAggregates([container()], NOW);
  assert.equal(result.upcoming.length, 7);
  assert.equal(result.upcoming[0].date, isoDay(NOW));
  assert.ok(result.upcoming.every((d) => typeof d.count === "number"));
});

test("groups count total, at-risk and active separately", () => {
  const result = computeAggregates(
    [
      container({ terminal: "APM", lastFreeDay: "2026-07-30" }), // overdue, active
      container({ containerNumber: "A", terminal: "APM", status: "Empty Returned" }),
      container({ containerNumber: "B", terminal: "TraPac" }),
    ],
    NOW,
  );
  const apm = result.byTerminal.find((t) => t.name === "APM");
  assert.equal(apm?.total, 2);
  assert.equal(apm?.atRisk, 1);
  assert.equal(apm?.active, 1);
});

/* ---------------- SQL / Node parity ---------------- */

test("RISK_SQL encodes the same thresholds as LFD_THRESHOLDS", () => {
  // Guards the duplication: if a threshold moves in shared/, the SQL must move
  // with it, and this fails loudly rather than the dashboards quietly disagreeing.
  assert.match(
    RISK_SQL,
    new RegExp(`< ${LFD_THRESHOLDS.critical}\\b`),
    "overdue boundary must use LFD_THRESHOLDS.critical",
  );
  assert.match(
    RISK_SQL,
    new RegExp(`<= ${LFD_THRESHOLDS.critical}\\b`),
    "critical boundary must use LFD_THRESHOLDS.critical",
  );
  assert.match(
    RISK_SQL,
    new RegExp(`<= ${LFD_THRESHOLDS.warning}\\b`),
    "warning boundary must use LFD_THRESHOLDS.warning",
  );
});

test("RISK_SQL clears the same statuses the Node path clears", () => {
  for (const status of ["Picked Up", "Delivered", "Empty Returned", "Closed"]) {
    assert.ok(
      RISK_SQL.includes(`'${status}'`),
      `${status} must be treated as cleared in SQL`,
    );
  }
  assert.ok(
    RISK_SQL.includes("gate_out_date IS NOT NULL"),
    "gate-out must clear risk in SQL, matching hasLeftTerminal()",
  );
});

test("RISK_SQL takes the reference date as a parameter", () => {
  // Using NOW() inside the query would make the boundary depend on the
  // server's timezone; LFD is a calendar day.
  assert.ok(RISK_SQL.includes("$1::date"), "reference date must be parameterised");
  assert.ok(!/\bNOW\(\)/i.test(RISK_SQL), "must not use NOW() for a calendar-day boundary");
});
