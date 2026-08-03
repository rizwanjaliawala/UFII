import type {
  CONTAINER_STATUSES,
  DOCUMENT_CATEGORIES,
  REMINDER_STATUSES,
} from "../constants.js";

/**
 * Container — the central entity. Primary key is `containerNumber`
 * (doc 12: "Container Number is the master lookup key").
 *
 * Field groups mirror doc 12's data dictionary. Every group is annotated
 * with its ownership, because ownership drives the merge rules:
 *
 *   SOURCE   written by the sync engine from Source Sheet 1
 *   USER     written by people; the sync engine must NEVER overwrite these
 *   DERIVED  computed by the application (cost, AI, KPIs)
 *   SYSTEM   audit and synchronization bookkeeping
 */

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Urgency band derived from Last Free Day. */
export type LfdRisk = "safe" | "warning" | "critical" | "overdue" | "cleared";

export interface Container {
  /* ---- SOURCE: operational data from Source Sheet 1 ---- */
  containerNumber: string; // primary key, normalized (no whitespace, uppercase)
  bookingNumber: string | null;
  blNumber: string | null;
  ssl: string | null; // steamship line
  terminal: string | null;
  pickupNumber: string | null; // "PU"
  appointmentDate: string | null; // ISO date (YYYY-MM-DD)
  lastFreeDay: string | null; // ISO date
  gateInDate: string | null; // ISO date
  gateOutDate: string | null; // ISO date
  emptyReturnDate: string | null; // ISO date
  status: ContainerStatus;
  /** In-store availability reference (Sheet 1 "ISA No"). */
  isa: string | null;
  /** Fulfilment centre code, e.g. TEB9 / HGR6 (Sheet 1 "FC"). */
  fc: string | null;
  size: string | null;
  type: string | null;
  chassisNumber: string | null;
  driver: string | null;

  /* ---- SOURCE: fields present in the real sheet but absent from doc 12 ----
     Confirmed by `npm run profile:sheets` against all 14 monthly tabs. */
  /** Port of discharge, e.g. "Newark, NJ". */
  pod: string | null;
  /** Vessel ETA. */
  eta: string | null;
  /** Appointment lifecycle: Scheduled / Rescheduled / Delivered / … */
  appointmentStatus: string | null;
  /** "Received" | "In Transit" */
  markedStatus: string | null;
  /** "Direct Delivery", "Delivered at NJ then Amazon", … */
  deliveredThrough: string | null;
  /** Source column holds two unrelated meanings; split on ingest. */
  vesselName: string | null;
  warehouseDeliveryDate: string | null;
  rejectionReason: string | null;
  /** "Redirection" | "Rejection" */
  redirectionType: string | null;
  /** Utopia Trucking / Amazon / 3PL — distinct from the D&D responsible party. */
  responsibleStakeholder: string | null;
  /** Which monthly tab this row came from, for provenance. */
  sourceTab: string | null;

  /* ---- SOURCE: the three party roles ----
     Doc 12 models a single "Vendor". The live Detention sheet distinguishes
     three parties that frequently differ, and conflating them corrupts both
     vendor KPIs and cost attribution:
       trucker          — who physically moved it   → on-time / operational KPIs
       responsibleParty — who bears the cost        → D&D cost attribution
       forwarder        — freight forwarder         → reporting only            */
  trucker: string | null;
  responsibleParty: string | null;
  forwarder: string | null;

  /* ---- USER: never overwritten by synchronization (doc 12) ---- */
  internalNotes: string | null;
  dispatchNotes: string | null;
  vendorNotes: string | null;
  aiNotes: string | null;
  reminderStatus: ReminderStatus | null;
  assignedDispatcher: string | null;
  priority: "Low" | "Normal" | "High" | "Critical" | null;
  tags: string[];
  flags: string[];

  /* ---- DERIVED: email rollup (doc 12 §Email Fields) ---- */
  lastEmailDate: string | null;
  lastEmailSubject: string | null;
  lastEmailSender: string | null;
  conversationId: string | null;
  emailSummary: string | null;
  emailCount: number;
  vendorReplied: boolean;
  reminderSent: boolean;
  reminderDate: string | null;

  /* ---- DERIVED: Google Drive — File IDs only, never file copies ---- */
  puScreenshotId: string | null;
  invoicePdfId: string | null;
  podFileId: string | null;
  gateReceiptId: string | null;
  additionalDocuments: DriveDocumentRef[];

  /* ---- DERIVED: OCR (doc 12 §OCR Fields) ---- */
  ocrStatus: "None" | "Pending" | "Approved" | "Rejected" | "Failed";
  ocrConfidence: number | null; // 0–1
  ocrResult: string | null;
  ocrApproved: boolean;
  ocrReviewedBy: string | null;
  ocrReviewDate: string | null;

  /* ---- DERIVED: cost (authoritative values live in CostRecord) ---- */
  estimatedCost: number | null;
  estimatedConfidence: number | null; // 0–1
  actualCost: number | null;
  costVariance: number | null;
  chassisDays: number | null;
  demurrageDays: number | null;
  detentionDays: number | null;
  storageDays: number | null;
  lastCostUpdate: string | null;

  /* ---- DERIVED: AI (doc 12 §AI Fields) ---- */
  healthScore: number | null; // 0–100
  riskScore: number | null; // 0–100
  aiRecommendation: string | null;
  aiConfidence: number | null; // 0–1
  aiLastUpdated: string | null;

  /* ---- SYSTEM: synchronization (doc 12 §Synchronization Fields) ---- */
  sourceSheet: string | null;
  importDate: string | null;
  lastSync: string | null;
  syncStatus: "Success" | "Failed" | "Pending";
  conflictStatus: "None" | "Pending" | "Resolved";

  /* ---- SYSTEM: audit (doc 12 §Audit Fields) ---- */
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  version: number;
}

/** A file in Google Drive linked to a container. We store IDs, never copies. */
export interface DriveDocumentRef {
  fileId: string;
  fileName: string;
  mimeType: string;
  category: DocumentCategory;
  linkedAt: string;
  linkedBy: string;
  /** How the association was made — matters when a link is later disputed. */
  matchedBy: "container" | "invoice" | "booking" | "manual";
}

/** Timeline event shown in Container 360 (doc 04 §Timeline). */
export interface TimelineEvent {
  id: string;
  containerNumber: string;
  at: string;
  event: string;
  user: string;
  source: "Sync" | "Outlook" | "OCR" | "Invoice" | "User" | "AI" | "System";
  notes: string | null;
}

/** Free-text note attached to a container. Never overwrites imported data. */
export interface ContainerNote {
  id: string;
  containerNumber: string;
  kind: "Operational" | "Vendor" | "Internal";
  body: string;
  pinned: boolean;
  createdBy: string;
  createdDate: string;
}
