import { migrate } from "../src/db/migrate.js";
import { closePool, pingDatabase } from "../src/db/pool.js";

/**
 * Apply the schema, deliberately.
 *
 * The server used to do this on boot. That is fine for a long-lived process
 * and wrong for serverless, where every cold start would re-run it against
 * the production database — so migration is now an explicit step:
 *
 *   npm run migrate
 *
 * `schema.sql` is idempotent, so running it twice is safe.
 */
async function main(): Promise<void> {
  const ping = await pingDatabase();
  if (!ping.ok) {
    console.error(`Cannot reach the database: ${ping.detail}`);
    process.exit(1);
  }
  console.log(ping.detail);

  await migrate();
  console.log("Schema applied.");

  await closePool();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
