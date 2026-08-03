import type {
  CHARGE_TYPES,
  CREDIT_NOTE_STATUSES,
  INVOICE_STATUSES,
  SOURCE_PAYMENT_STATUSES,
} from "../constants.js";

export type ChargeType = (typeof CHARGE_TYPES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type SourcePaymentStatus = (typeof SOURCE_PAYMENT_STATUSES)[number];
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number];

/**
 * Invoice header.
 *
 * Doc 12 states "Invoice — must belong to one container". The live Detention
 * sheet contradicts this: invoice NAIC1340615 covers five containers, each
 * with its own amount and day count, and several others behave the same way.
 * Enforcing one-container-per-invoice would reject real invoices, so an
 * invoice is a header with one line per container.
 */
export interface Invoice {
  invoiceNumber: string; // primary key
  /** Party that issued the invoice (SSL, terminal, or trucker). */
  issuer: string | null;
  /** Who bears the charge — from Source Sheet 2 `Responsibilty` (sic). */
  responsibleParty: string | null;
  trucker: string | null;
  forwarder: string | null;
  currency: string;
  /** Sum of line amounts. Stored so totals never require a join at read time. */
  totalAmount: number;
  /** Application-side lifecycle. */
  status: InvoiceStatus;
  /** Verbatim payment status from the source sheet. */
  sourcePaymentStatus: SourcePaymentStatus | null;
  /** Procurement request reference from the source sheet. */
  prId: string | null;
  remarks: string | null;

  invoiceDate: string | null;
  dueDate: string | null;

  /** Human approval — invoices are never auto-approved (doc 11). */
  verified: boolean;
  approvedBy: string | null;
  approvedDate: string | null;

  sourcePdfFileId: string | null;
  sourceSheet: string | null;
  importDate: string | null;
  createdDate: string;
  updatedDate: string;
}

/**
 * One charge line: a specific container on a specific invoice.
 * Composite key is (invoiceNumber, containerNumber, chargeType).
 */
export interface InvoiceLine {
  id: string;
  invoiceNumber: string;
  containerNumber: string;
  chargeType: ChargeType;
  amount: number;
  /** Chargeable days — `Detention days` in the source sheet. */
  days: number | null;
  pickUpDate: string | null;
  returnDate: string | null;
  lastFreeDay: string | null;
  remarks: string | null;
}

/**
 * Credit note — Source Sheet 2, tab 2. Absent from doc 12 entirely.
 * Offsets a charge that was billed in error or successfully disputed.
 */
export interface CreditNote {
  id: string;
  containerNumber: string;
  amount: number;
  /** Counterparty issuing the credit, e.g. "ALPI USA", "Marlin Shipping". */
  company: string | null;
  reason: string | null;
  remarks: string | null;
  status: CreditNoteStatus;
  creditNoteNumber: string | null;
  prId: string | null;
  createdDate: string;
  updatedDate: string;
}

/**
 * FBU charge — Source Sheet 2, tab 3. Absent from doc 12 entirely.
 * Small per-container charges billed separately from D&D.
 */
export interface FbuCharge {
  id: string;
  containerNumber: string;
  invoiceNumber: string | null;
  amount: number;
  trucker: string | null;
  chargeType: string | null;
  forwarder: string | null;
  prId: string | null;
  createdDate: string;
}

/**
 * An invoice parsed from a PDF or read from the source sheet whose container
 * link is not yet confirmed. Nothing reaches the invoice log from here without
 * explicit human approval (doc 11 §Invoice Rules).
 */
export interface InvoiceMatchReview {
  id: string;
  invoiceNumber: string | null;
  suggestedContainerNumber: string | null;
  /** Every container number found in the document, for operator choice. */
  candidateContainers: string[];
  confidence: number; // 0–1
  amount: number | null;
  chargeType: ChargeType | null;
  issuer: string | null;
  sourceFileId: string | null;
  sourceFileName: string | null;
  receivedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Why this needs a human (doc 05 §Review Queue). */
  reason:
    | "Low confidence"
    | "Unknown container"
    | "Duplicate invoice"
    | "Missing vendor"
    | "Missing invoice number"
    | "Multiple containers";
}
