import { Router } from "express";
import { getDashboardSummary } from "../services/dashboardService.js";

export const dashboardRouter = Router();

/**
 * Dashboard aggregates.
 *
 * One request returns everything the command centre needs, so the page makes a
 * single round trip rather than one per widget — that is what keeps it inside
 * the <2s target in doc 10.
 */
dashboardRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getDashboardSummary());
  } catch (error) {
    next(error);
  }
});
