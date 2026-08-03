import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { loadContainers } from "./services/containerService.js";
import { migrate } from "./db/migrate.js";
import { pingDatabase, closePool } from "./db/pool.js";

/**
 * Local development server.
 *
 * This file is NOT used on Vercel — see `api/index.ts`, which exports the same
 * app as a serverless handler. Everything below is the boot work that only
 * makes sense for a long-lived process: binding a port, applying the schema
 * once, and warming an in-memory cache that a serverless instance would never
 * live long enough to benefit from.
 *
 * The server always starts, whatever the state of the integrations. A missing
 * credential degrades a service in the health report; it never prevents boot,
 * because the client must be able to open in offline mode against the last
 * synchronized data (doc 10 §Disaster Recovery).
 */

const server = createApp().listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      google: config.google.configured,
      tmsMaster: config.google.masterConfigured,
      ai: config.ai.configured,
    },
    `Utopia TMS API listening on http://localhost:${config.port}`,
  );

  if (!config.google.configured) {
    logger.warn(
      "Google credentials not configured — reading source sheets via the " +
        "credential-free CSV adapter. TMS Master writes require a service account.",
    );
  }

  // Apply the schema, then warm the cache.
  //
  // Both are deliberately fire-and-forget: a database that is slow or briefly
  // unreachable must not stop the API serving health and sheet-derived data.
  if (config.database.configured) {
    void migrate()
      .then(() => pingDatabase())
      .then((ping) => logger.info({ ping }, "database ready"))
      .catch((error) => logger.error({ err: error }, "database setup failed"));
  } else {
    logger.warn("DATABASE_URL not set — editing and persistence are unavailable");
  }

  // Warm the container cache immediately.
  //
  // A cold load fetches 14 monthly tabs and takes ~40s. Left lazy, the first
  // user request would block for that whole time. Warming here moves the cost
  // to boot, where nobody is waiting.
  //
  // Only worth doing while the sheets are still the source. Once Neon is
  // populated the repository reads from the database and this warm is dead
  // weight — which is exactly why it does not run on the serverless path.
  void loadContainers()
    .then((containers) =>
      logger.info({ containers: containers.length }, "container cache warmed"),
    )
    .catch((error) =>
      logger.warn(
        { err: error },
        "could not warm container cache — the API will retry on first request",
      ),
    );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
