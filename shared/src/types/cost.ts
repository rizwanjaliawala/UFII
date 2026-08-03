import type { COST_CATEGORIES } from "../constants.js";

export type CostCategory = (typeof COST_CATEGORIES)[number];

/**
 * Cost record for a container.
 *
 * Doc 07's core rule: a container is never left with an unknown cost. It
 * carries an estimate until an invoice is approved, then the actual figure
 * supersedes it — but the estimate is retained forever so variance stays
 * analysable and financial history is never destroyed (doc 11 §Cost Rules).
 */
export interface CostRecord {
  containerNumber: string; // primary key
  currency: string;

  /* ---- Estimate ---- */
  estimatedCost: number | null;
  estimatedConfidence: number | null; // 0–1
  estimatedAt: string | null;
  /** Which inputs produced the estimate — required for auditability. */
  estimateBasis: EstimateBasis | null;

  /* ---- Actual ---- */
  actualCost: number | null;
  actualSource: "Invoice" | "Manual" | null;
  actualAt: string | null;

  /* ---- Variance ---- */
  variance: number | null; // actual − estimated
  variancePercent: number | null;

  /* ---- Breakdown ---- */
  breakdown: CostBreakdownLine[];

  /* ---- Chargeable day counts ---- */
  chassisDays: number | null;
  demurrageDays: number | null;
  detentionDays: number | null;
  storageDays: number | null;

  invoiceStatus: string;
  pendingInvoiceAmount: number | null;

  lastUpdated: string;
  updatedBy: string;
}

export interface CostBreakdownLine {
  category: CostCategory;
  amount: number;
  source: "Estimate" | "Invoice" | "Manual";
  invoiceNumber: string | null;
  note: string | null;
}

/** Inputs behind an estimate, so any figure can be explained later. */
export interface EstimateBasis {
  freeDays: number;
  chassisRatePerDay: number;
  storageRatePerDay: number;
  demurrageRatePerDay: number;
  detentionRatePerDay: number;
  baseDrayage: number;
  /** Historical comparables used, and how many were available. */
  historicalSampleSize: number;
  historicalAverage: number | null;
  terminal: string | null;
  ssl: string | null;
  trucker: string | null;
  containerSize: string | null;
  notes: string | null;
}

/**
 * Append-only history. Every estimate and every actual is retained;
 * doc 11 forbids overwriting historical financial records.
 */
export interface CostHistoryEntry {
  id: string;
  containerNumber: string;
  at: string;
  kind: "Estimate" | "Actual" | "Manual Adjustment" | "Credit Note";
  amount: number;
  previousAmount: number | null;
  confidence: number | null;
  reason: string | null;
  invoiceNumber: string | null;
  changedBy: string;
}

/** Administrator-configurable rates (doc 09 §Cost Configuration). */
export interface CostSettings {
  currency: string;
  defaultFreeDays: number;
  chassisRatePerDay: number;
  storageRatePerDay: number;
  demurrageRatePerDay: number;
  detentionRatePerDay: number;
  baseDrayageRate: number;
  /** Per-terminal and per-SSL overrides where negotiated rates differ. */
  terminalOverrides: Record<string, Partial<RateOverride>>;
  sslOverrides: Record<string, Partial<RateOverride>>;
  /** Below this, an estimate is shown as low-confidence in the UI. */
  aiConfidenceThreshold: number;
  /** Variance beyond this percentage raises a cost alert. */
  varianceAlertPercent: number;
}

export interface RateOverride {
  freeDays: number;
  chassisRatePerDay: number;
  storageRatePerDay: number;
  demurrageRatePerDay: number;
  detentionRatePerDay: number;
  baseDrayageRate: number;
}
