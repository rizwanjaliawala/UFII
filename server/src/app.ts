import express from "express";
import cors from "cors";
import { config } from "./config/index.js";
import { apiLogger } from "./utils/logger.js";
import { getHealth } from "./services/healthService.js";
import { containersRouter } from "./routes/containers.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { syncRouter } from "./routes/sync.js";
import { vendorsRouter } from "./routes/vendors.js";
import { alertsRouter } from "./routes/alerts.js";
import { searchRouter } from "./routes/search.js";
import { detentionRouter } from "./routes/detention.js";
import { editGateStatus } from "./middleware/editGate.js";

/**
 * The Express application, with no side effects on import.
 *
 * Separated from `index.ts` so the same routes serve two very different
 * hosts. Locally `index.ts` binds a port and warms caches at boot; on Vercel
 * `api/index.ts` exports this app as a request handler and there is no boot
 * at all — a serverless invocation may be a brand-new process, so anything
 * expensive done at module scope is paid again on every cold start.
 *
 * Nothing here opens a connection, runs a migration or reads a sheet. That
 * belongs to whoever is hosting the app.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", async (_req, res, next) => {
    try {
      const health = await getHealth();
      // Lets the client show or hide edit controls without ever seeing the key.
      res.json({ ...health, edit: editGateStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/containers", containersRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/vendors", vendorsRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/detention", detentionRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  /**
   * Terminal error handler. Stack traces and internal paths are logged, never
   * returned — the client receives a message it can safely display
   * (doc 11 §Error Handling).
   */
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      apiLogger.error({ err: error }, "unhandled request error");
      res.status(500).json({ error: "An unexpected error occurred. Please retry." });
    },
  );

  return app;
}
