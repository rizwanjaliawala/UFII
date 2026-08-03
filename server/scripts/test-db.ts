/**
 * Neon connectivity diagnostic.
 *
 * Isolates the database connection from the rest of the server so a failure
 * gives a precise cause rather than a generic pool timeout.
 *
 *   npm run test:db
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set in server/.env");
  process.exit(1);
}

// Report the shape of the URL without ever printing the password.
const redacted = url.replace(/:([^:@]+)@/, ":****@");
console.log("URL     :", redacted);
console.log("host    :", new URL(url).hostname);
console.log("database:", new URL(url).pathname.slice(1));
console.log("params  :", new URL(url).search || "(none)");

async function attempt(label: string, cfg: pg.ClientConfig): Promise<boolean> {
  const client = new pg.Client({ ...cfg, connectionTimeoutMillis: 30_000 });
  const started = Date.now();
  try {
    await client.connect();
    const result = await client.query("SELECT version(), NOW() as now");
    console.log(`\n[${label}] OK in ${Date.now() - started}ms`);
    console.log("  server:", String(result.rows[0].version).split(",")[0]);
    await client.end();
    return true;
  } catch (error) {
    console.log(`\n[${label}] FAILED after ${Date.now() - started}ms`);
    console.log("  ", (error as Error).message);
    await client.end().catch(() => undefined);
    return false;
  }
}

const main = async () => {
  // Neon suspends idle compute; the first connect can take many seconds while
  // it wakes, so every attempt allows 30s before concluding anything.
  if (await attempt("verified TLS", { connectionString: url, ssl: { rejectUnauthorized: true } })) {
    process.exit(0);
  }

  // Strip libpq-only parameters that node-postgres does not understand.
  const stripped = url.replace(/[?&]channel_binding=[^&]*/, "");
  if (
    stripped !== url &&
    (await attempt("without channel_binding", {
      connectionString: stripped,
      ssl: { rejectUnauthorized: true },
    }))
  ) {
    console.log("\n=> channel_binding was the problem; strip it from DATABASE_URL.");
    process.exit(0);
  }

  console.log("\nAll attempts failed. Likely causes:");
  console.log("  - Neon project paused or deleted");
  console.log("  - Password rotated");
  console.log("  - Outbound TCP 5432 blocked by a firewall");
  process.exit(1);
};

main().catch((error) => {
  console.error("Diagnostic crashed:", (error as Error).message);
  process.exit(1);
});
