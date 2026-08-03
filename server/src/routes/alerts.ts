import { Router } from "express";
import { getAlerts } from "../services/alertService.js";

export const alertsRouter = Router();

/** Every active alert rule, with a capped sample of matching containers. */
alertsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getAlerts());
  } catch (error) {
    next(error);
  }
});
