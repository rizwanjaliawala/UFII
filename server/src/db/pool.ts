import pg from "pg";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

/**
 * Neon Postgres connection pool.
 *
 * Neon pools server-side already, so the client pool stays small — a large
 * local pool just holds idle connections open against a serverless database.
 *
 * The pool is created lazily: the API must still boot and serve health when
 * DATABASE_URL is absent, so a missing database degrades a service rather
 * than preventing startup (doc 10 §Disaster Recovery).
 */

const dbLogger = logger.child({ module: "db" });

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Add the Neon connection string to server/.env.");
    this.name = "DatabaseNotConfiguredError";
  }
}

let pool: pg.Pool | null = null;

/**
 * Neon's console always includes `channel_binding=require` in the connection
 * string it gives you. That is a libpq option; node-postgres does not
 * implement SCRAM channel binding, and leaving it in makes the handshake hang
 * until the connection times out — a silent 30s stall with no useful error.
 *
 * Stripping it here means a freshly-pasted Neon URL works as-is. TLS is
 * unaffected: `sslmode` and `ssl.rejectUnauthorized` below still apply.
 */
function sanitizeConnectionString(url: string): string {
  return url.replace(/([?&])channel_binding=[^&]*&?/, (_match, sep: string) =>
    sep === "?" ? "?" : "&",
  ).replace(/[?&]$/, "");
}

/**
 * True when running as a serverless function rather than a long-lived server.
 *
 * Vercel sets `VERCEL=1` in every runtime environment.
 */
const isServerless = process.env.VERCEL === "1";

/**
 * Serverless changes what a "pool" should be.
 *
 * Each concurrent invocation is its own Node process with its own pool, so a
 * max of 8 per instance multiplies by however many instances Vercel runs and
 * exhausts Neon's connection limit under any real traffic. One connection per
 * instance is the correct shape: the instance handles one request at a time,
 * and Neon's own pooler multiplexes across them.
 *
 * This also assumes DATABASE_URL points at Neon's **pooled** endpoint (the
 * host containing `-pooler`). Against the direct endpoint the connection
 * limit is far lower and cold starts will exhaust it.
 */
function poolSize(): number {
  return isServerless ? 1 : config.database.maxConnections;
}

export function getPool(): pg.Pool {
  if (!config.database.configured) throw new DatabaseNotConfiguredError();

  if (!pool) {
    pool = new pg.Pool({
      connectionString: sanitizeConnectionString(config.database.url!),
      max: poolSize(),
      // A serverless instance is frozen between invocations. Holding an idle
      // connection open across that gap wastes a Neon slot for a client that
      // may never be resumed, so idle connections are released promptly.
      idleTimeoutMillis: isServerless ? 10_000 : config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      // Neon requires TLS and presents a publicly-trusted certificate, so the
      // chain is verified in full. Never set rejectUnauthorized:false here —
      // this connection carries every container, vendor and invoice record,
      // and disabling verification would leave it open to interception.
      ssl: { rejectUnauthorized: true },
    });

    // An idle-client error must never take the process down.
    pool.on("error", (error) => {
      dbLogger.error({ err: error }, "idle client error");
    });

    dbLogger.info({ max: poolSize(), serverless: isServerless }, "connection pool created");
  }

  return pool;
}

/** Parameterised query. Never interpolate values into SQL. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const started = Date.now();
  const result = await getPool().query<T>(text, params);

  const elapsed = Date.now() - started;
  if (elapsed > 500) {
    dbLogger.warn({ ms: elapsed, sql: text.slice(0, 80) }, "slow query");
  }
  return result;
}

/** Run a set of statements in one transaction, rolling back on any failure. */
export async function transaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<{ ok: boolean; detail: string }> {
  try {
    const result = await query<{ now: Date }>("SELECT NOW() as now");
    return { ok: true, detail: `connected at ${result.rows[0]?.now.toISOString()}` };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
