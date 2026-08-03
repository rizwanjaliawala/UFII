import "dotenv/config";

/**
 * Centralised configuration (doc 01 §Configuration, doc 11 §Security Rules).
 *
 * Nothing is hardcoded elsewhere in the application, and no secret is ever
 * committed — every credential arrives through the environment.
 *
 * Every integration is optional at boot. Without credentials the server still
 * runs and reports its services as unavailable, so the client can start in
 * offline mode against the last synchronized data (doc 10 §Disaster Recovery).
 */

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === "true" || value === "1";

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: num(process.env.PORT, 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  logLevel: process.env.LOG_LEVEL ?? "info",

  /**
   * Neon Postgres — the application database.
   *
   * Supersedes TMS Master as the write target. The source sheets remain
   * read-only inputs; every application write lands here.
   */
  database: {
    url: process.env.DATABASE_URL,
    /** Neon pools connections already; keep the client pool small. */
    maxConnections: num(process.env.DB_MAX_CONNECTIONS, 8),
    idleTimeoutMs: num(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMs: num(process.env.DB_CONNECT_TIMEOUT_MS, 10_000),
    get configured(): boolean {
      return Boolean(this.url);
    },
  },

  /**
   * Shared edit gate.
   *
   * Validated server-side on every mutating request — the client never
   * decides whether a key is valid. This guards against accidental edits;
   * it is not authentication and cannot attribute a change to a person.
   * Replaced by RBAC in Phase 5 (doc 09).
   */
  edit: {
    key: process.env.EDIT_KEY,
    maxAttempts: num(process.env.EDIT_KEY_MAX_ATTEMPTS, 5),
    lockoutMinutes: num(process.env.EDIT_KEY_LOCKOUT_MINUTES, 10),
    get configured(): boolean {
      return Boolean(this.key);
    },
  },

  google: {
    /** Service-account key file, or inline credentials. */
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),

    /**
     * Source Sheet 1 — "Floor-Loaded (USA)". READ ONLY, never written.
     *
     * No default. The spreadsheets are shared "anyone with the link", so an
     * ID committed to source is effectively the data itself — anyone with the
     * repository could read every container, vendor and invoice. Supply it
     * through the environment.
     */
    sourceSheet1Id: process.env.SOURCE_SHEET_1_ID,
    /** Source Sheet 2 — "Detention". READ ONLY, never written. */
    sourceSheet2Id: process.env.SOURCE_SHEET_2_ID,

    /** TMS Master — the application database. Read/write. */
    masterSheetId: process.env.TMS_MASTER_SHEET_ID,
    /** Drive folder holding PU screenshots, invoices, PODs, receipts. */
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,

    get configured(): boolean {
      return Boolean(this.keyFile ?? (this.clientEmail && this.privateKey));
    },
    get masterConfigured(): boolean {
      return this.configured && Boolean(this.masterSheetId);
    },
    /** Source reading needs no credentials — only the sheet IDs. */
    get sourcesConfigured(): boolean {
      return Boolean(this.sourceSheet1Id && this.sourceSheet2Id);
    },
  },

  outlook: {
    /** Outlook Desktop COM automation — no Graph, no OAuth (doc 05). */
    enabled: bool(process.env.OUTLOOK_ENABLED, true),
    inboxFolder: process.env.OUTLOOK_INBOX_FOLDER ?? "Inbox",
    archiveFolder: process.env.OUTLOOK_ARCHIVE_FOLDER ?? "Archive",
    maxAttachmentMb: num(process.env.OUTLOOK_MAX_ATTACHMENT_MB, 25),
    refreshMinutes: num(process.env.OUTLOOK_REFRESH_MINUTES, 15),
  },

  sync: {
    automaticEnabled: bool(process.env.SYNC_AUTOMATIC, true),
    intervalMinutes: num(process.env.SYNC_INTERVAL_MINUTES, 15),
    syncOnStartup: bool(process.env.SYNC_ON_STARTUP, true),
    retryAttempts: num(process.env.SYNC_RETRY_ATTEMPTS, 3),
    maxBatchSize: num(process.env.SYNC_MAX_BATCH_SIZE, 500),
  },

  ocr: {
    /** OCR never auto-approves; this only flags low-confidence reads. */
    lowConfidenceThreshold: num(process.env.OCR_LOW_CONFIDENCE, 0.75),
  },

  ai: {
    /** Claude API — the four generative agents. Never committed. */
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    maxTokens: num(process.env.ANTHROPIC_MAX_TOKENS, 1024),
    get configured(): boolean {
      return Boolean(this.apiKey);
    },
  },

  auth: {
    /** User records live OUTSIDE TMS Master — that sheet is shared. */
    dataDir: process.env.AUTH_DATA_DIR ?? "./.data",
    sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 12),
    rememberMeDays: num(process.env.REMEMBER_ME_DAYS, 30),
    maxFailedAttempts: num(process.env.MAX_FAILED_ATTEMPTS, 5),
  },

  cache: {
    /** In-process cache hydrated per sync (doc 06 §Caching). */
    ttlMinutes: num(process.env.CACHE_TTL_MINUTES, 30),
  },
} as const;

export type Config = typeof config;

export class SourceSheetNotConfiguredError extends Error {
  constructor(which: 1 | 2) {
    super(
      `SOURCE_SHEET_${which}_ID is not set. Add it to server/.env — ` +
        `it is the long segment of the sheet URL and is deliberately not ` +
        `committed to source.`,
    );
    this.name = "SourceSheetNotConfiguredError";
  }
}

/**
 * Source sheet IDs, with a clear failure when absent.
 *
 * A non-null assertion here would turn a missing configuration value into an
 * obscure runtime error deep inside a fetch. This fails at the point of use
 * and says exactly what to do.
 */
export function requireSourceSheetId(which: 1 | 2): string {
  const id = which === 1 ? config.google.sourceSheet1Id : config.google.sourceSheet2Id;
  if (!id) throw new SourceSheetNotConfiguredError(which);
  return id;
}
