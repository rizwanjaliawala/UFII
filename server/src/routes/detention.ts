import { Router } from "express";
import { z } from "zod";
import { getDetentionLog } from "../services/detentionService.js";
import { exportFilename, toCsv } from "../utils/csv.js";

export const detentionRouter = Router();

const schema = z.object({
  q: z.string().trim().max(60).optional(),
  responsibleParty: z.string().trim().max(120).optional(),
  chargeType: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/** The D&D invoice log across all three Source Sheet 2 tabs. */
detentionRouter.get("/", async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    }
    res.json(await getDetentionLog(parsed.data));
  } catch (error) {
    next(error);
  }
});

/** Invoice log as CSV. */
detentionRouter.get("/export", async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    }

    const log = await getDetentionLog({ ...parsed.data, limit: 1000 });
    res
      .type("text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${exportFilename("dd-invoices")}"`)
      .send(
        toCsv(log.invoices, [
          { header: "Invoice", value: (i) => i.invoiceNumber },
          { header: "Amount", value: (i) => i.totalAmount.toFixed(2) },
          { header: "Containers", value: (i) => i.containers },
          { header: "Charge Types", value: (i) => i.chargeTypes.join("; ") },
          { header: "Responsible Party", value: (i) => i.responsibleParty },
          { header: "Trucker", value: (i) => i.trucker },
          { header: "Payment Status", value: (i) => i.paymentStatus },
          { header: "Earliest Pickup", value: (i) => i.earliestPickUp },
          { header: "Latest Return", value: (i) => i.latestReturn },
        ]),
      );
  } catch (error) {
    next(error);
  }
});
