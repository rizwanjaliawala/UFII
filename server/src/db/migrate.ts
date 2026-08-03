import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";
import { logger } from "../utils/logger.js";

/**
 * Schema migration.
 *
 * The schema is idempotent (`CREATE TABLE IF NOT EXISTS`), so this runs safely
 * on every boot and there is no separate migration step to forget. When the
 * schema starts changing shape rather than only growing, this becomes a
 * versioned migration table.
 */
export async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "schema.sql"), "utf8");

  await getPool().query(sql);
  logger.child({ module: "db" }).info("schema applied");
}
