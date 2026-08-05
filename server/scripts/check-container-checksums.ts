import { closePool, query } from "../src/db/pool.js";

/**
 * How many real container numbers satisfy the ISO 6346 check digit?
 *
 * Decides whether checksum validation is safe to apply to ingested data. If a
 * meaningful share of the fleet fails, the checksum can only be used to
 * *reject* candidates found in free text, never to reject a row from the
 * source sheets.
 *
 *   npx tsx scripts/check-container-checksums.ts
 */

const LETTER_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19,
  J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29,
  S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

function valid(value: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = value[i]!;
    const v = i < 4 ? LETTER_VALUES[ch] : Number(ch);
    if (v === undefined) return false;
    sum += v * 2 ** i;
  }
  return (sum % 11) % 10 === Number(value[10]);
}

async function main(): Promise<void> {
  const { rows } = await query<{ container_number: string }>(
    `SELECT container_number FROM containers`,
  );

  const bad: string[] = [];
  let malformed = 0;

  for (const { container_number: n } of rows) {
    if (!/^[A-Z]{4}\d{7}$/.test(n)) {
      malformed++;
      continue;
    }
    if (!valid(n)) bad.push(n);
  }

  const total = rows.length;
  const ok = total - malformed - bad.length;
  console.log(`\ncontainers            ${total}`);
  console.log(`checksum valid        ${ok}  (${((ok / total) * 100).toFixed(1)}%)`);
  console.log(`checksum INVALID      ${bad.length}`);
  console.log(`wrong shape entirely  ${malformed}`);
  if (bad.length > 0) console.log(`\nsample failures: ${bad.slice(0, 12).join(", ")}`);

  await closePool();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
