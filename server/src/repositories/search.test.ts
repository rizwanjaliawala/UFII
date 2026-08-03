import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Container } from "@tms/shared";
import { searchInMemory, type ContainerQuery } from "./containerRepository.js";

/**
 * Sort and filter semantics for the in-memory container search.
 *
 * These pin the two rules that a live-data parity run proved were wrong:
 * nulls must sort last in BOTH directions, and ties must break
 * deterministically. Both are invisible until the dataset has ties or missing
 * dates — which the real data has in quantity — so they are pinned here
 * rather than left to the parity script, which needs a database to run.
 */

const container = (overrides: Partial<Container>): Container =>
  ({
    containerNumber: "TEST0000000",
    status: "Pending",
    gateOutDate: null,
    lastFreeDay: null,
    eta: null,
    updatedDate: "2026-08-01T00:00:00.000Z",
    trucker: null,
    ssl: null,
    terminal: null,
    pod: null,
    blNumber: null,
    pickupNumber: null,
    isa: null,
    fc: null,
    ...overrides,
  }) as unknown as Container;

const query = (overrides: Partial<ContainerQuery> = {}): ContainerQuery => ({
  sort: "lfd",
  direction: "asc",
  page: 1,
  pageSize: 50,
  ...overrides,
});

const NOW = new Date("2026-08-02T12:00:00.000Z");
const ids = (rows: Container[]) => rows.map((r) => r.containerNumber);

describe("searchInMemory sorting", () => {
  const withDates = [
    container({ containerNumber: "AAAU0000001", lastFreeDay: "2026-08-10" }),
    container({ containerNumber: "BBBU0000002", lastFreeDay: null }),
    container({ containerNumber: "CCCU0000003", lastFreeDay: "2026-08-05" }),
  ];

  it("sorts nulls last ascending", () => {
    const { rows } = searchInMemory(withDates, query(), NOW);
    assert.deepEqual(ids(rows), ["CCCU0000003", "AAAU0000001", "BBBU0000002"]);
  });

  it("sorts nulls last descending too", () => {
    // The bug this pins: applying the direction flip to the null verdict as
    // well as the value comparison promoted every missing LFD to the top.
    const { rows } = searchInMemory(withDates, query({ direction: "desc" }), NOW);
    assert.deepEqual(ids(rows), ["AAAU0000001", "CCCU0000003", "BBBU0000002"]);
  });

  it("breaks ties on container number, ascending, in both directions", () => {
    const tied = [
      container({ containerNumber: "ZZZU0000009", lastFreeDay: "2026-08-05" }),
      container({ containerNumber: "AAAU0000001", lastFreeDay: "2026-08-05" }),
      container({ containerNumber: "MMMU0000005", lastFreeDay: "2026-08-05" }),
    ];

    assert.deepEqual(ids(searchInMemory(tied, query(), NOW).rows), [
      "AAAU0000001",
      "MMMU0000005",
      "ZZZU0000009",
    ]);
    // Descending flips the LFD comparison, not the tiebreak — otherwise the
    // same query could page the same container twice.
    assert.deepEqual(ids(searchInMemory(tied, query({ direction: "desc" }), NOW).rows), [
      "AAAU0000001",
      "MMMU0000005",
      "ZZZU0000009",
    ]);
  });

  it("orders by urgency band before days remaining", () => {
    const mixed = [
      container({ containerNumber: "SAFE00000001", lastFreeDay: "2026-09-30" }),
      container({ containerNumber: "OVER00000002", lastFreeDay: "2026-07-30" }),
      container({ containerNumber: "TODAY0000003", lastFreeDay: "2026-08-02" }),
      // Gated out: cleared regardless of how far past its LFD it is.
      container({
        containerNumber: "GONE00000004",
        lastFreeDay: "2026-07-01",
        gateOutDate: "2026-07-02",
      }),
    ];

    const { rows } = searchInMemory(mixed, query({ sort: "urgency" }), NOW);
    assert.deepEqual(ids(rows), [
      "OVER00000002",
      "TODAY0000003",
      "SAFE00000001",
      "GONE00000004",
    ]);
  });
});

describe("searchInMemory filtering", () => {
  const fleet = [
    container({ containerNumber: "CMAU9822570", trucker: "Marlin Shipping" }),
    container({ containerNumber: "TCNU1184850", trucker: "ALPI", blNumber: "BL-77421" }),
    container({ containerNumber: "CMAU5814339", trucker: "Marlin Shipping" }),
  ];

  it("matches a container-number fragment with whitespace stripped", () => {
    const { rows, total } = searchInMemory(fleet, query({ q: "cmau 98" }), NOW);
    assert.equal(total, 1);
    assert.deepEqual(ids(rows), ["CMAU9822570"]);
  });

  it("searches secondary identifiers, not only the container number", () => {
    const { rows } = searchInMemory(fleet, query({ q: "77421" }), NOW);
    assert.deepEqual(ids(rows), ["TCNU1184850"]);
  });

  it("reports the pre-pagination total", () => {
    const { rows, total } = searchInMemory(
      fleet,
      query({ trucker: "Marlin Shipping", pageSize: 1, sort: "container" }),
      NOW,
    );
    assert.equal(total, 2);
    assert.equal(rows.length, 1);
    assert.deepEqual(ids(rows), ["CMAU5814339"]);
  });

  it("returns an empty page past the end without error", () => {
    const { rows, total } = searchInMemory(fleet, query({ page: 9 }), NOW);
    assert.equal(total, 3);
    assert.deepEqual(rows, []);
  });
});
