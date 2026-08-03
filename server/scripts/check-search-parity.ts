import { closePool, query } from "../src/db/pool.js";
import {
  searchInMemory,
  type ContainerQuery,
} from "../src/repositories/containerRepository.js";
import { getContainerRepository } from "../src/repositories/containerRepository.js";

/**
 * Container search parity.
 *
 * `/api/containers` now filters, sorts and pages in SQL. The Node
 * implementation it replaced still exists for the sheet path, so the same
 * query is expressed twice — exactly the arrangement that drifts quietly.
 *
 * This runs both over the identical live dataset and compares the total and
 * the ordered page. Ordering is compared, not just membership: a sort that
 * agrees on the set but not the sequence would put the wrong container at the
 * top of an operator's worklist.
 *
 *   npx tsx scripts/check-search-parity.ts
 */

const base: ContainerQuery = {
  sort: "urgency",
  direction: "asc",
  page: 1,
  pageSize: 20,
};

const CASES: { name: string; params: ContainerQuery }[] = [
  { name: "default (urgency)", params: base },
  { name: "risk=overdue, lfd asc", params: { ...base, risk: "overdue", sort: "lfd" } },
  { name: "risk=safe, lfd desc", params: { ...base, risk: "safe", sort: "lfd", direction: "desc" } },
  { name: "sort=container", params: { ...base, sort: "container" } },
  { name: "sort=eta desc", params: { ...base, sort: "eta", direction: "desc" } },
  { name: "q=CMAU", params: { ...base, q: "CMAU" } },
  { name: "q=cmau 98 (spaced)", params: { ...base, q: "cmau 98" } },
  { name: "trucker=Marlin Shipping", params: { ...base, trucker: "Marlin Shipping" } },
  { name: "status=Pending", params: { ...base, status: "Pending" } },
  { name: "page 3", params: { ...base, sort: "container", page: 3 } },
  { name: "no match", params: { ...base, q: "ZZZZ-NOT-A-CONTAINER" } },
];

async function main(): Promise<void> {
  const now = new Date();
  const repository = await getContainerRepository();
  if (repository.kind !== "neon") {
    console.error(`Repository is '${repository.kind}'. Run with CONTAINER_SOURCE=neon.`);
    process.exit(1);
  }

  // One full read, reused for every case — the point is to compare the two
  // implementations, not to measure the read.
  const all = await repository.getAll();
  console.log(`\nComparing SQL search against Node over ${all.length} containers`);
  console.log("-".repeat(72));

  let drift = 0;
  for (const testCase of CASES) {
    const sql = await repository.search(testCase.params, now);
    const node = searchInMemory(all, testCase.params, now);

    const sqlIds = sql.rows.map((r) => r.containerNumber);
    const nodeIds = node.rows.map((r) => r.containerNumber);
    const sameTotal = sql.total === node.total;
    const sameOrder = sqlIds.join(",") === nodeIds.join(",");
    const ok = sameTotal && sameOrder;
    if (!ok) drift++;

    console.log(
      `  ${ok ? "ok   " : "DRIFT"} ${testCase.name.padEnd(28)} ` +
        `total sql=${String(sql.total).padStart(5)} node=${String(node.total).padStart(5)}` +
        `${sameOrder ? "" : "  ORDER DIFFERS"}`,
    );

    if (!sameOrder) {
      console.log(`         sql : ${sqlIds.slice(0, 6).join(" ")}`);
      console.log(`         node: ${nodeIds.slice(0, 6).join(" ")}`);
    }
  }

  // Facet counts feed the filter dropdowns; a wrong count there sends an
  // operator looking for containers that the filter will not return.
  const facets = await repository.filterOptions();
  const truckerTotal = facets.truckers.reduce((sum, t) => sum + t.count, 0);
  const nodeTruckerTotal = all.filter((c) => c.trucker).length;
  const facetOk = truckerTotal === nodeTruckerTotal;
  if (!facetOk) drift++;

  console.log("-".repeat(72));
  console.log(
    `  ${facetOk ? "ok   " : "DRIFT"} trucker facet counts        sql=${truckerTotal} node=${nodeTruckerTotal}`,
  );
  console.log(`         ${facets.truckers.length} truckers, ${facets.terminals.length} terminals, ${facets.total} containers`);

  console.log("-".repeat(72));
  console.log(drift === 0 ? "  All cases agree.\n" : `  ${drift} case(s) disagree.\n`);

  await query("SELECT 1");
  await closePool();
  process.exit(drift === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
