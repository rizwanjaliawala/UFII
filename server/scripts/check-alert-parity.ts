import { query, closePool } from "../src/db/pool.js";
import { fromContainers } from "../src/services/alertService.js";
import { getContainerRepository } from "../src/repositories/containerRepository.js";
import { getAlerts } from "../src/services/alertService.js";

/**
 * Alert-rule parity check.
 *
 * Every rule exists twice — once as SQL, once as a Node predicate — so the
 * application can serve alerts from either store. Two expressions of one rule
 * are exactly the kind of thing that drifts silently, so this compares both
 * over the live dataset and reports any rule where they disagree.
 *
 * Also reports the freshness distribution of `updated_at`, because the "no
 * update in 3+ days" rule is only meaningful if that column tracks operator
 * activity rather than the last ingest.
 *
 *   npx tsx scripts/check-alert-parity.ts
 */

async function main(): Promise<void> {
  const now = new Date();

  const freshness = await query<Record<string, unknown>>(
    `SELECT COUNT(*)::int                                                   AS total,
            MIN(updated_at)                                                 AS oldest,
            MAX(updated_at)                                                 AS newest,
            COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '3 days')::int AS older_than_3d,
            COUNT(*) FILTER (WHERE trucker IS NULL OR trucker = '')::int    AS no_trucker
       FROM containers`,
  );

  console.log("\nFreshness of containers.updated_at");
  console.log("-".repeat(60));
  for (const [key, value] of Object.entries(freshness.rows[0] ?? {})) {
    console.log(`  ${key.padEnd(16)} ${String(value)}`);
  }

  const sql = await getAlerts(now);
  const repository = await getContainerRepository();
  const node = fromContainers(await repository.getAll(), now);

  const nodeById = new Map(node.map((g) => [g.id, g]));

  console.log(`\nRule parity — SQL (${sql.source}) vs Node, ${now.toISOString()}`);
  console.log("-".repeat(60));

  let drift = 0;
  // Iterate the Node groups: getAlerts() drops empty ones, so a rule that
  // matches nothing in SQL but something in Node would otherwise vanish
  // from the comparison — which is precisely the drift worth catching.
  for (const nodeGroup of node) {
    const sqlGroup = sql.groups.find((g) => g.id === nodeGroup.id);
    const sqlCount = sqlGroup?.count ?? 0;
    const agree = sqlCount === nodeGroup.count;
    if (!agree) drift++;
    console.log(
      `  ${agree ? "ok  " : "DRIFT"} ${nodeGroup.id.padEnd(18)} sql=${String(sqlCount).padStart(5)}  node=${String(nodeGroup.count).padStart(5)}`,
    );
  }

  for (const sqlGroup of sql.groups) {
    if (!nodeById.has(sqlGroup.id)) {
      drift++;
      console.log(`  DRIFT ${sqlGroup.id.padEnd(18)} present in SQL only`);
    }
  }

  console.log("-".repeat(60));
  console.log(drift === 0 ? "  All rules agree.\n" : `  ${drift} rule(s) disagree.\n`);

  await closePool();
  process.exit(drift === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
