/**
 * Application-wide constants.
 *
 * Anything that appears in more than one place lives here so it can never
 * drift between client and server (doc 01 — DRY, centralized configuration).
 */

export const APP_NAME = "Utopia TMS";
export const APP_FULL_NAME = "Utopia Transportation Management System";
export const APP_VERSION = "1.0.0";

/**
 * Attribution line rendered once in the application shell and included in
 * PDF/print exports. Defined here so the text is never duplicated in source.
 */
export const APP_ATTRIBUTION =
  "Created by Rizwan Hanif for Utopia Brands Inc Trucking Team";

/* ------------------------------------------------------------------ */
/* Container lifecycle (doc 12 — Status Values)                        */
/* ------------------------------------------------------------------ */

export const CONTAINER_STATUSES = [
  "Pending",
  "Pickup Scheduled",
  "Picked Up",
  "Delivered",
  "Empty Returned",
  "Closed",
] as const;

/** Ordered lifecycle stages, used by the Container 360 timeline and funnels. */
export const CONTAINER_LIFECYCLE = CONTAINER_STATUSES;

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

/** Application-side invoice lifecycle (doc 07 / doc 12). */
export const INVOICE_STATUSES = [
  "No Invoice",
  "Expected",
  "Received",
  "Under Review",
  "Approved",
  "Paid",
  "Disputed",
  "Cancelled",
] as const;

/**
 * Payment status values that actually occur in Source Sheet 2.
 * Verified against the live "Detention" sheet — the documented
 * Expected/Received/Approved set does not appear there.
 */
export const SOURCE_PAYMENT_STATUSES = ["Paid", "Not paid", "Revoked"] as const;

/**
 * Charge types observed in Source Sheet 2's `Invoice type` column.
 * The sheet carries a single `Invoice Amount` plus this discriminator
 * rather than separate per-charge columns.
 */
export const CHARGE_TYPES = [
  "Detention",
  "Demurrage",
  "Chassis Detention",
  "Chassis Usage",
  "Rail Detention",
  "FBU",
  "Storage",
  "Other",
] as const;

/** Credit note lifecycle, from Source Sheet 2 tab 2. */
export const CREDIT_NOTE_STATUSES = ["Not Received", "Received", "Used"] as const;

/* ------------------------------------------------------------------ */
/* Cost categories (doc 07)                                            */
/* ------------------------------------------------------------------ */

export const COST_CATEGORIES = [
  "Drayage",
  "Demurrage",
  "Detention",
  "Chassis Usage",
  "Storage",
  "Lift Charges",
  "Port Charges",
  "Yard Charges",
  "Appointment Fees",
  "Toll Charges",
  "Fuel Surcharge",
  "Accessorial",
  "Other",
] as const;

export const DEFAULT_CURRENCY = "USD";

/* ------------------------------------------------------------------ */
/* Reminders / sync (doc 12 — Status Values)                           */
/* ------------------------------------------------------------------ */

export const REMINDER_STATUSES = ["Pending", "Sent", "Responded", "Escalated"] as const;
export const SYNC_RESULTS = ["Success", "Failed", "Pending"] as const;

/* ------------------------------------------------------------------ */
/* Roles (doc 09 — RBAC)                                               */
/* ------------------------------------------------------------------ */

export const ROLES = [
  "Administrator",
  "Operations Manager",
  "Dispatcher",
  "Finance",
  "Read Only",
] as const;

/* ------------------------------------------------------------------ */
/* Email categories (doc 05)                                           */
/* ------------------------------------------------------------------ */

export const EMAIL_CATEGORIES = [
  "PU Available",
  "Appointment",
  "Invoice",
  "Vendor Update",
  "Gate In",
  "Gate Out",
  "Delivery",
  "Empty Return",
  "Reminder Reply",
  "General",
  "Unknown",
] as const;

/* ------------------------------------------------------------------ */
/* Document categories (doc 06 — Attachment Categories)                */
/* ------------------------------------------------------------------ */

export const DOCUMENT_CATEGORIES = [
  "PU Screenshot",
  "Invoice",
  "POD",
  "Gate Receipt",
  "Appointment",
  "Other",
] as const;

/* ------------------------------------------------------------------ */
/* LFD risk thresholds                                                 */
/* ------------------------------------------------------------------ */

/**
 * Days remaining until LFD that define each risk band.
 * Central definition — every urgency signal in the application resolves
 * through `lfdRisk()` so "what counts as critical" has one meaning.
 */
export const LFD_THRESHOLDS = {
  /** <= 0 days remaining is critical (LFD is today). */
  critical: 0,
  /** <= 2 days remaining is a warning. */
  warning: 2,
} as const;

/* ------------------------------------------------------------------ */
/* Fields the synchronization engine must never overwrite (doc 12)     */
/* ------------------------------------------------------------------ */

export const PROTECTED_USER_FIELDS = [
  "internalNotes",
  "dispatchNotes",
  "vendorNotes",
  "aiNotes",
  "reminderStatus",
  "assignedDispatcher",
  "priority",
  "tags",
  "flags",
  "costOverride",
  "manualCharges",
] as const;

/** Fields the sync engine is permitted to write from source sheets. */
export const SYNCABLE_CONTAINER_FIELDS = [
  "bookingNumber",
  "blNumber",
  "ssl",
  "terminal",
  "trucker",
  "pickupNumber",
  "appointmentDate",
  "lastFreeDay",
  "gateInDate",
  "gateOutDate",
  "emptyReturnDate",
  "status",
  "size",
  "type",
  "chassisNumber",
  "driver",
] as const;

/** Frequently searched fields — cached as lookup indexes (doc 12 §Indexing). */
export const INDEXED_FIELDS = [
  "containerNumber",
  "bookingNumber",
  "trucker",
  "invoiceNumber",
  "pickupNumber",
  "terminal",
  "ssl",
] as const;
