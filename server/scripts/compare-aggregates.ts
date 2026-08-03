/**
 * Compares the SQL and Node aggregation paths over the SAME live data.
 *
 * The unit tests pin thresholds; this proves the two implementations actually
 * agree on 4,400 real containers, which is the failure mode that would
 * otherwise only show up as two dashboards disagreeing.
 *
 *   npx tsx scripts/compare-aggregates.ts
 */
import "dotenv/config";
import { closePool } from "../src/db/pool.js";
import { computeAggregates } from "../src/repositories/aggregates.js";
import { loadContainers } from "../src/services/containerService.js";
import { getContainerRepository } from "../src/repositories/containerRepository.js";

const NOW = new Date();

const main = async () => {
  process.env.CONTAINER_SOURCE = "neon";
  const neonRepo = await getContainerRepository();
  const sqlStart = Date.now();
  const sql = await neonRepo.aggregates(NOW);
  const sqlMs = Date.now() - sqlStart;

  const nodeStart = Date.now();
  const node = computeAggregates(await loadContainers(), NOW);
  const nodeMs = Date.now() - nodeStart;

  console.log(`SQL path : ${sqlMs}ms  (${neonRepo.kind})`);
  console.log(`Node path: ${nodeMs}ms  (sheets, already cached)\n`);

  const scalars = [
    "total", "activeContainers", "atPort", "inTransit", "completed",
    "arrivingToday", "appointmentsToday", "lfdDueToday",
    "missingPu", "missingAppointment", "unassigned",
  ] as const;

  let mismatches = 0;
  const report = (label: string, a: unknown, b: unknown) => {
    const same = a === b;
    if (!same) mismatches++;
    console.log(`${same ? "  ok" : "MISMATCH"}  ${label.padEnd(20)} sql=${a}  node=${b}`);
  };

  for (const key of scalars) report(key, sql[key], node[key]);
  for (const band of ["overdue", "critical", "warning", "safe", "cleared"] as const) {
    report(`risk.${band}`, sql.risk[band], node.risk[band]);
  }

  // Group totals: compare the top few by name.
  for (const group of ["byTerminal", "byPod", "byTrucker"] as const) {
    const nodeMap = new Map(node[group].map((g) => [g.name, g.total]));
    for (const row of sql[group].slice(0, 5)) {
      report(`${group}:${row.name.slice(0, 14)}`, row.total, nodeMap.get(row.name));
    }
  }

  console.log(
    mismatches === 0
      ? "\nPARITY CONFIRMED — SQL and Node agree on every compared figure."
      : `\n${mismatches} MISMATCHES — the two paths disagree.`,
  );

  await closePool();
  process.exit(mismatches === 0 ? 0 : 1);
};

main().catch(async (error) => {
  console.error("comparison failed:", (error as Error).message);
  await closePool();
  process.exit(1);
});
