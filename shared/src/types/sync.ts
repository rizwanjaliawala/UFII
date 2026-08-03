/**
 * Synchronization domain.
 *
 * The pipeline is a fixed nine-stage sequence (doc 06 §Synchronization Order).
 * It is resumable: each stage checkpoints, so a failure in Outlook or Drive
 * does not discard completed Sheet 1/2 work, and the application keeps running
 * on existing TMS Master data (doc 10 §Disaster Recovery).
 */

export const SYNC_STAGES = [
  "Source Sheet 1",
  "Source Sheet 2",
  "Google Drive",
  "Outlook",
  "OCR",
  "Invoice Parsing",
  "Merge",
  "Validation",
  "Write TMS Master",
] as const;

export type SyncStage = (typeof SYNC_STAGES)[number];
export type SyncTrigger = "Manual" | "Automatic" | "Startup";

export interface SyncRun {
  id: string;
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: "Running" | "Success" | "Partial" | "Failed";
  stages: SyncStageResult[];
  recordsImported: number;
  recordsUpdated: number;
  recordsSkipped: number;
  conflictsDetected: number;
  errors: number;
  warnings: number;
  startedBy: string;
}

export interface SyncStageResult {
  stage: SyncStage;
  status: "Pending" | "Running" | "Success" | "Skipped" | "Failed";
  startedAt: string | null;
  finishedAt: string | null;
  rowsRead: number;
  message: string | null;
  error: string | null;
}

/** Per-source-sheet status shown in the Synchronization Center. */
export interface SyncSource {
  id: string;
  name: string;
  spreadsheetId: string;
  tabName: string;
  range: string;
  /** Sheet 1 is operational data; Sheet 2 carries D&D across three tabs. */
  kind: "operational" | "detention" | "credit-notes" | "fbu";
  readOnly: true;
  lastSyncAt: string | null;
  lastResult: "Success" | "Failed" | "Never";
  rowsRead: number;
  errorMessage: string | null;
}

/**
 * A field-level disagreement between an imported value and the master.
 *
 * Doc 06 is explicit: "Never overwrite silently." Conflicts are queued and a
 * human chooses. Nothing here is applied automatically.
 */
export interface ConflictEntry {
  id: string;
  containerNumber: string;
  field: string;
  currentValue: string | null;
  incomingValue: string | null;
  sourceSheet: string;
  detectedAt: string;
  status: "Pending" | "Resolved";
  resolution: "Keep Current" | "Accept Incoming" | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

/**
 * A row that could not be trusted into the master.
 *
 * Quarantine rather than reject — real invoices carrying a data-entry fault
 * must stay visible, not vanish (see the trailing-carriage-return and
 * year-typo issues found in the live Detention sheet).
 */
export interface DataQualityIssue {
  id: string;
  detectedAt: string;
  sourceSheet: string;
  sourceRow: number;
  entity: "container" | "invoice" | "credit-note" | "fbu";
  entityKey: string | null;
  field: string | null;
  severity: "Info" | "Warning" | "Error";
  issue: string;
  rawValue: string | null;
  normalizedValue: string | null;
  status: "Open" | "Resolved" | "Ignored";
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface SyncSettings {
  automaticEnabled: boolean;
  intervalMinutes: number; // 5 | 10 | 15 | 30 | 60
  syncOnStartup: boolean;
  retryAttempts: number;
  maxBatchSize: number;
  /** Doc 06 mandates human resolution; kept configurable for administrators. */
  conflictResolution: "Manual Review" | "Prefer Incoming" | "Prefer Current";
  loggingEnabled: boolean;
  notifyOnFailure: boolean;
}
