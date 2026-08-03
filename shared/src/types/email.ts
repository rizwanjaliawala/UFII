import type { EMAIL_CATEGORIES } from "../constants.js";

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/**
 * An Outlook message linked to a container.
 *
 * Read via Outlook Desktop COM automation — no Graph, no OAuth, no stored
 * credentials (doc 05). We never store the full body; Container 360 shows a
 * one-line summary and only expands the thread on request (doc 03).
 */
export interface EmailRecord {
  /** Outlook Entry ID — the local-store identity. */
  entryId: string;
  /** Stable across stores; preferred for duplicate detection. */
  internetMessageId: string | null;
  conversationId: string | null;

  containerNumber: string | null; // null while awaiting manual match
  subject: string;
  sender: string;
  senderName: string | null;
  recipients: string[];
  receivedDate: string;
  folder: string;

  category: EmailCategory;
  /** One-line extractive or AI summary. Never a rewrite of the email. */
  summary: string | null;
  hasAttachments: boolean;
  attachmentCount: number;

  /** How the container link was established (doc 05 §Email Matching). */
  matchedBy: "container" | "booking" | "pu" | "thread" | "manual" | null;
  matchConfidence: number | null; // 0–1

  isReminderReply: boolean;
  processedAt: string;
}

/** A grouped conversation, rendered by the Container 360 drawer. */
export interface EmailThread {
  conversationId: string;
  containerNumber: string | null;
  subject: string;
  participants: string[];
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
  /** AI summary of the whole thread: topic, decisions, pending items. */
  aiSummary: string | null;
  aiSummaryGeneratedAt: string | null;
}

/**
 * Duplicate-prevention ledger (doc 05 §Email Processing Log).
 * Every message is processed exactly once.
 */
export interface EmailProcessingLogEntry {
  id: string;
  processedAt: string;
  entryId: string;
  internetMessageId: string | null;
  conversationId: string | null;
  containerNumber: string | null;
  category: EmailCategory;
  status: "Processed" | "Skipped" | "Failed" | "Review";
  result: string | null;
  error: string | null;
}

/** Reminder sent to a vendor, and what came back. */
export interface Reminder {
  id: string;
  containerNumber: string;
  vendorName: string;
  recipientEmail: string;
  sentAt: string;
  /** Human-readable trigger, e.g. "24h before LFD, no vendor update". */
  triggerReason: string;
  templateId: string | null;
  /** Set when the reply is threaded onto the original message. */
  conversationId: string | null;
  responseStatus: "Pending" | "Responded" | "No Response" | "Escalated";
  respondedAt: string | null;
  matchedBy: "thread_reply" | "container_match" | null;
  sentBy: string;
}

/**
 * OCR extraction awaiting approval.
 * OCR output NEVER writes to TMS Master automatically (doc 11 §OCR Rules).
 */
export interface OcrReviewItem {
  id: string;
  containerNumber: string | null;
  /** What the engine read. */
  extractedValue: string;
  /** What the operator corrected it to, if anything. */
  correctedValue: string | null;
  field: "pickupNumber" | "containerNumber" | "bookingNumber" | "chassisNumber";
  confidence: number; // 0–1
  /** Drive File ID of the source screenshot — shown beside the value. */
  sourceFileId: string | null;
  sourceFileName: string | null;
  emailEntryId: string | null;
  emailSubject: string | null;
  receivedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  rawText: string | null;
}
