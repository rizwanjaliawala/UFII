import { Router } from "express";
import { normalizeContainerNumber, vendorKey } from "@tms/shared";
import { getVendorDetail, getVendorSummary } from "../services/vendorService.js";
import { getContainerRepository } from "../repositories/containerRepository.js";
import { exportFilename, toCsv } from "../utils/csv.js";

export const vendorsRouter = Router();

/** Vendor KPI scorecards. */
vendorsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getVendorSummary());
  } catch (error) {
    next(error);
  }
});

/** Vendor scorecards as CSV. */
vendorsRouter.get("/export", async (_req, res, next) => {
  try {
    const summary = await getVendorSummary();
    res
      .type("text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${exportFilename("vendors")}"`)
      .send(
        toCsv(summary.vendors, [
          { header: "Vendor", value: (v) => v.name },
          { header: "Containers", value: (v) => v.totalContainers },
          { header: "Active", value: (v) => v.activeContainers },
          { header: "Completed", value: (v) => v.completed },
          // A vendor below the sample threshold exports blank, not 0 — a 0
          // score in a spreadsheet is indistinguishable from "scored badly".
          { header: "Score", value: (v) => v.score },
          {
            header: "On-Time Pickup %",
            value: (v) =>
              v.onTimePickupRate === null ? null : Math.round(v.onTimePickupRate * 100),
          },
          { header: "On-Time Sample", value: (v) => v.onTimeSample },
          { header: "At Risk", value: (v) => v.atRisk },
          { header: "Past LFD", value: (v) => v.overdue },
          { header: "D&D as Responsible", value: (v) => v.ddCostResponsible.toFixed(2) },
          { header: "D&D as Trucker", value: (v) => v.ddCostAsTrucker.toFixed(2) },
          { header: "Invoices", value: (v) => v.invoiceCount },
          { header: "Credit Notes", value: (v) => v.creditNoteTotal.toFixed(2) },
        ]),
      );
  } catch (error) {
    next(error);
  }
});

/** One vendor in depth — KPIs, monthly trend, terminals, recent invoices. */
vendorsRouter.get("/:key", async (req, res, next) => {
  try {
    const key = vendorKey(decodeURIComponent(req.params.key));
    if (!key) return res.status(400).json({ error: "Invalid vendor" });

    const detail = await getVendorDetail(key);
    if (!detail.kpi) return res.status(404).json({ error: "Vendor not found" });
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

/**
 * Containers hauled by one vendor.
 *
 * Matched on the canonical key, so a vendor spelled two ways in the source
 * sheets returns one combined list rather than splitting.
 */
vendorsRouter.get("/:key/containers", async (req, res, next) => {
  try {
    const key = vendorKey(decodeURIComponent(req.params.key));
    if (!key) return res.status(400).json({ error: "Invalid vendor" });

    const repository = await getContainerRepository();
    const all = await repository.getAll();
    const rows = all
      .filter((c) => vendorKey(c.trucker) === key)
      .sort((a, b) => (a.lastFreeDay ?? "9999").localeCompare(b.lastFreeDay ?? "9999"));

    res.json({ key, total: rows.length, rows: rows.slice(0, 200) });
  } catch (error) {
    next(error);
  }
});

/** Invoices and credit notes attached to one container. */
vendorsRouter.get("/container/:containerNumber/charges", async (req, res, next) => {
  try {
    const key = normalizeContainerNumber(req.params.containerNumber);
    if (!key) return res.status(400).json({ error: "Invalid container number" });
    const { getContainerCharges } = await import("../services/chargeService.js");
    res.json(await getContainerCharges(key));
  } catch (error) {
    next(error);
  }
});
