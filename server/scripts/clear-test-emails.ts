import { closePool, query } from "../src/db/pool.js";

/**
 * Remove the synthetic emails used to verify the Phase 3 pipeline.
 *
 * They were inserted against the live database to prove matching, dedupe and
 * review behaviour end to end, and they are fabricated vendor correspondence.
 * Anything from `@vendor.example`, `@barakat.example`, `@naic.example` or
 * `@unknown.example` is test data — none of those are real domains.
 *
 * Dry run by default; pass --delete to apply.
 *
 *   npx tsx scripts/clear-test-emails.ts
 *   npx tsx scripts/clear-test-emails.ts --delete
 */

const TEST_DOMAINS = [
  "%@vendor.example",
  "%@barakat.example",
  "%@naic.example",
  "%@unknown.example",
  "%@fixture.example",
];

async function main(): Promise<void> {
  const apply = process.argv.includes("--delete");

  const { rows } = await query<{ id: string; subject: string; sender_address: string }>(
    `SELECT id::text, subject, sender_address
       FROM emails
      WHERE (internet_message_id LIKE '%@vendor.example>' OR internet_message_id LIKE '%@fixture.example>')
         OR sender_address LIKE ANY($1)
      ORDER BY id`,
    [TEST_DOMAINS],
  );

  console.log(`\n${rows.length} synthetic email(s) found`);
  for (const row of rows) {
    console.log(`  #${row.id}  ${row.sender_address ?? "—"}  ${row.subject ?? "(no subject)"}`);
  }

  if (rows.length === 0) {
    await closePool();
    process.exit(0);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --delete to remove them.");
    console.log("Links, attachments and processing-log rows are removed with them.\n");
    await closePool();
    process.exit(0);
  }

  const ids = rows.map((r) => Number(r.id));
  // Links and attachments cascade; the processing log does not reference
  // emails by id, so it is cleared by message id separately.
  await query(
    `DELETE FROM email_processing_log
      WHERE internet_message_id IN (
        SELECT internet_message_id FROM emails WHERE id = ANY($1))`,
    [ids],
  );
  const { rowCount } = await query(`DELETE FROM emails WHERE id = ANY($1)`, [ids]);

  console.log(`\nDeleted ${rowCount} email(s) and their links.\n`);
  await closePool();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
