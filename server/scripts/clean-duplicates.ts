/**
 * One-off cleanup for duplicate credit notes and FBU charges.
 *
 * Those tables originally used a plain UNIQUE constraint that included
 * nullable columns. Postgres treats NULL as distinct from NULL, so rows with
 * no credit-note or invoice number bypassed dedupe and re-inserted on every
 * ingest. The schema now uses COALESCE-based unique indexes; this removes the
 * duplicates that accumulated before that fix.
 *
 * Keeps the lowest id of each group — the first row imported.
 *
 * Defaults to a DRY RUN: it reports exactly what would be removed and changes
 * nothing. Deletion requires an explicit flag, because this is the one
 * destructive operation in the ingest path.
 *
 *   npx tsx scripts/clean-duplicates.ts              # inspect only
 *   npx tsx scripts/clean-duplicates.ts --delete     # actually remove
 */
import "dotenv/config";
import { query, closePool } from "../src/db/pool.js";

const APPLY = process.argv.includes("--delete");

/** Rows that would be removed: every group member except the lowest id. */
const CREDIT_DUPES = `
  SELECT a.id, a.container_number, a.credit_note_number, a.reason, a.amount
    FROM credit_notes a
    JOIN credit_notes b
      ON a.id > b.id
     AND COALESCE(a.container_number,'')   = COALESCE(b.container_number,'')
     AND COALESCE(a.credit_note_number,'') = COALESCE(b.credit_note_number,'')
     AND COALESCE(a.reason,'')             = COALESCE(b.reason,'')
     AND a.amount = b.amount`;

const FBU_DUPES = `
  SELECT a.id, a.container_number, a.invoice_number, a.amount
    FROM fbu_charges a
    JOIN fbu_charges b
      ON a.id > b.id
     AND COALESCE(a.container_number,'') = COALESCE(b.container_number,'')
     AND COALESCE(a.invoice_number,'')   = COALESCE(b.invoice_number,'')
     AND a.amount = b.amount`;

const main = async () => {
  const before = await query<{ credits: string; fbu: string }>(
    `SELECT (SELECT COUNT(*)::text FROM credit_notes) AS credits,
            (SELECT COUNT(*)::text FROM fbu_charges)  AS fbu`,
  );
  console.log("before:", before.rows[0]);

  const creditDupes = await query<{
    id: string;
    container_number: string | null;
    credit_note_number: string | null;
    reason: string | null;
    amount: string;
  }>(CREDIT_DUPES);
  const fbuDupes = await query(FBU_DUPES);

  console.log(`\ncredit_notes duplicates found: ${creditDupes.rowCount}`);
  for (const row of creditDupes.rows.slice(0, 25)) {
    console.log(
      `  id=${row.id}  ${row.container_number ?? "(no container)"}  ` +
        `note=${row.credit_note_number ?? "(none)"}  $${row.amount}  ` +
        `reason=${(row.reason ?? "").slice(0, 32)}`,
    );
  }
  console.log(`fbu_charges duplicates found: ${fbuDupes.rowCount}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --delete to apply.");
    await closePool();
    return;
  }

  const credits = await query(
    `DELETE FROM credit_notes a USING credit_notes b
      WHERE a.id > b.id
        AND COALESCE(a.container_number,'')   = COALESCE(b.container_number,'')
        AND COALESCE(a.credit_note_number,'') = COALESCE(b.credit_note_number,'')
        AND COALESCE(a.reason,'')             = COALESCE(b.reason,'')
        AND a.amount = b.amount`,
  );
  console.log("credit_notes removed:", credits.rowCount);

  const fbu = await query(
    `DELETE FROM fbu_charges a USING fbu_charges b
      WHERE a.id > b.id
        AND COALESCE(a.container_number,'') = COALESCE(b.container_number,'')
        AND COALESCE(a.invoice_number,'')   = COALESCE(b.invoice_number,'')
        AND a.amount = b.amount`,
  );
  console.log("fbu_charges removed:", fbu.rowCount);

  const after = await query<{ credits: string; fbu: string }>(
    `SELECT (SELECT COUNT(*)::text FROM credit_notes) AS credits,
            (SELECT COUNT(*)::text FROM fbu_charges)  AS fbu`,
  );
  console.log("after:", after.rows[0]);

  await closePool();
};

main().catch(async (error) => {
  console.error("cleanup failed:", (error as Error).message);
  await closePool();
  process.exit(1);
});
