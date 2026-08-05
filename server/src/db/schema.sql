-- ============================================================
-- Utopia TMS — Neon Postgres schema
--
-- Supersedes TMS Master as the application database. The two source
-- spreadsheets remain read-only inputs; everything written by the
-- application lands here.
--
-- Idempotent: safe to run repeatedly.
-- ============================================================

-- ------------------------------------------------------------
-- containers
--
-- Split deliberately into two groups of columns:
--   src_*   ingested from Source Sheet 1, overwritten on every sync
--   user-owned fields, NEVER touched by ingest (doc 12 §User Generated)
-- Keeping them in one table but distinct in intent is what lets a re-ingest
-- refresh operational data without destroying an operator's notes.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS containers (
  container_number        TEXT PRIMARY KEY,

  -- ---- ingested from Source Sheet 1 ----
  bl_number               TEXT,
  pod                     TEXT,
  terminal                TEXT,
  ssl                     TEXT,
  fc                      TEXT,
  isa                     TEXT,
  trucker                 TEXT,
  trucker_key             TEXT,          -- canonicalised, for KPI grouping
  eta                     DATE,
  last_free_day           DATE,
  appointment_date        DATE,
  gate_out_date           DATE,
  empty_return_date       DATE,
  src_status              TEXT,
  appointment_status      TEXT,
  marked_status           TEXT,
  delivered_through       TEXT,
  vessel_name             TEXT,
  warehouse_delivery_date DATE,
  rejection_reason        TEXT,
  redirection_type        TEXT,
  responsible_stakeholder TEXT,
  source_tab              TEXT,

  -- ---- user-owned: ingest must never overwrite these ----
  pickup_number           TEXT,          -- only ever from OCR confirmation
  status_override         TEXT,          -- operator's status, wins over src
  internal_notes          TEXT,
  dispatch_notes          TEXT,
  vendor_notes            TEXT,
  assigned_dispatcher     TEXT,
  priority                TEXT,
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  flags                   TEXT[] NOT NULL DEFAULT '{}',

  -- ---- bookkeeping ----
  source_sheet            TEXT,
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by              TEXT NOT NULL DEFAULT 'System',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version                 INTEGER NOT NULL DEFAULT 1
);

-- Indexes for the fields doc 12 §Indexing names as frequently searched.
CREATE INDEX IF NOT EXISTS idx_containers_lfd        ON containers (last_free_day);
CREATE INDEX IF NOT EXISTS idx_containers_trucker    ON containers (trucker_key);
CREATE INDEX IF NOT EXISTS idx_containers_terminal   ON containers (terminal);
CREATE INDEX IF NOT EXISTS idx_containers_ssl        ON containers (ssl);
CREATE INDEX IF NOT EXISTS idx_containers_pod        ON containers (pod);
CREATE INDEX IF NOT EXISTS idx_containers_status     ON containers (src_status);
CREATE INDEX IF NOT EXISTS idx_containers_bl         ON containers (bl_number);
CREATE INDEX IF NOT EXISTS idx_containers_appt       ON containers (appointment_date);

-- Free-text search across the identifiers an operator actually types.
CREATE INDEX IF NOT EXISTS idx_containers_search ON containers
  USING GIN (to_tsvector('simple',
    coalesce(container_number,'') || ' ' || coalesce(bl_number,'') || ' ' ||
    coalesce(isa,'') || ' ' || coalesce(fc,'') || ' ' ||
    coalesce(trucker,'') || ' ' || coalesce(terminal,'') || ' ' ||
    coalesce(pickup_number,'')));

-- ------------------------------------------------------------
-- invoices / invoice_lines
--
-- One invoice covers many containers in the real data (NAIC1340615 spans
-- five), so the container link lives on the line, not the header.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  invoice_number      TEXT PRIMARY KEY,
  issuer              TEXT,
  trucker             TEXT,
  trucker_key         TEXT,
  responsible_party   TEXT,
  forwarder           TEXT,
  currency            TEXT NOT NULL DEFAULT 'USD',
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_payment_status TEXT,
  status              TEXT NOT NULL DEFAULT 'Received',
  pr_id               TEXT,
  remarks             TEXT,
  approved_by         TEXT,
  approved_at         TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id               BIGSERIAL PRIMARY KEY,
  invoice_number   TEXT NOT NULL REFERENCES invoices(invoice_number) ON DELETE CASCADE,
  container_number TEXT NOT NULL,
  charge_type      TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  days             INTEGER,
  pick_up_date     DATE,
  return_date      DATE,
  last_free_day    DATE,
  remarks          TEXT,
  -- Same container can carry Detention AND Chassis Detention on one invoice,
  -- so charge_type is part of the identity.
  UNIQUE (invoice_number, container_number, charge_type)
);

CREATE INDEX IF NOT EXISTS idx_lines_container ON invoice_lines (container_number);

CREATE TABLE IF NOT EXISTS credit_notes (
  id                 BIGSERIAL PRIMARY KEY,
  container_number   TEXT,
  amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  company            TEXT,
  reason             TEXT,
  remarks            TEXT,
  status             TEXT,
  credit_note_number TEXT,
  pr_id              TEXT,
  last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fbu_charges (
  id               BIGSERIAL PRIMARY KEY,
  container_number TEXT,
  invoice_number   TEXT,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  trucker          TEXT,
  charge_type      TEXT,
  forwarder        TEXT,
  pr_id            TEXT,
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedupe keys use COALESCE rather than a plain UNIQUE constraint.
--
-- In Postgres NULL is never equal to NULL, so a plain
-- UNIQUE (container_number, credit_note_number, amount) does NOT dedupe rows
-- where credit_note_number is absent — and many are. Those rows re-inserted
-- on every ingest, growing the table without limit. Normalising NULL to ''
-- inside the index makes the key behave the way the data needs.
-- Drop via ALTER TABLE only. `DROP INDEX` on a constraint-backed index errors
-- with "cannot drop index ... constraint requires it", and because the whole
-- schema is applied as one batch that error silently aborts every statement
-- after it.
ALTER TABLE credit_notes
  DROP CONSTRAINT IF EXISTS credit_notes_container_number_credit_note_number_amount_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notes_dedupe ON credit_notes (
  COALESCE(container_number, ''),
  COALESCE(credit_note_number, ''),
  COALESCE(reason, ''),
  amount
);

ALTER TABLE fbu_charges
  DROP CONSTRAINT IF EXISTS fbu_charges_container_number_invoice_number_amount_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fbu_dedupe ON fbu_charges (
  COALESCE(container_number, ''),
  COALESCE(invoice_number, ''),
  amount
);

-- ------------------------------------------------------------
-- audit_log
--
-- Doc 09 requires old and new value on every change, and doc 12 forbids
-- deletion. Append-only: no UPDATE or DELETE path exists in the application.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor         TEXT NOT NULL DEFAULT 'Operator',
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_key    TEXT,
  field         TEXT,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  ip_address    TEXT,
  status        TEXT NOT NULL DEFAULT 'Success'
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_key);
CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log (at DESC);

-- ------------------------------------------------------------
-- data_quality_issues
--
-- Rows that parse but cannot be trusted are quarantined here rather than
-- dropped — a real invoice carrying a typo must stay visible.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_quality_issues (
  id            BIGSERIAL PRIMARY KEY,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_sheet  TEXT,
  source_tab    TEXT,
  entity_type   TEXT,
  entity_key    TEXT,
  field         TEXT,
  severity      TEXT NOT NULL DEFAULT 'Warning',
  issue         TEXT NOT NULL,
  raw_value     TEXT,
  status        TEXT NOT NULL DEFAULT 'Open',
  UNIQUE (entity_type, entity_key, field, issue)
);

-- ------------------------------------------------------------
-- sync_runs — history of every ingest
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_runs (
  id                BIGSERIAL PRIMARY KEY,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  trigger           TEXT NOT NULL DEFAULT 'Manual',
  status            TEXT NOT NULL DEFAULT 'Running',
  tabs_read         INTEGER NOT NULL DEFAULT 0,
  rows_read         INTEGER NOT NULL DEFAULT 0,
  containers_upserted INTEGER NOT NULL DEFAULT 0,
  invoices_upserted INTEGER NOT NULL DEFAULT 0,
  issues_found      INTEGER NOT NULL DEFAULT 0,
  error             TEXT
);

-- ============================================================
-- Phase 3 — email intelligence
--
-- Email arrives from a Windows sync agent running in the operator's own
-- session, never from this process: Outlook COM needs a desktop session and
-- a serverless function has none. The agent reads the mailbox and POSTs here.
-- ============================================================

-- ------------------------------------------------------------
-- agent_devices — one row per installed sync agent
--
-- Enrolment is a short-lived pairing code exchanged once for a long-lived
-- device token. Only the SHA-256 of the token is stored, so a database leak
-- does not yield a working credential, and revocation is per device.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_devices (
  id                BIGSERIAL PRIMARY KEY,
  device_name       TEXT NOT NULL,
  operator          TEXT NOT NULL,
  mailbox           TEXT,
  token_hash        TEXT UNIQUE,
  pairing_code      TEXT UNIQUE,
  pairing_expires_at TIMESTAMPTZ,
  enrolled_at       TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  last_seen_at      TIMESTAMPTZ,
  agent_version     TEXT,
  emails_ingested   INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_devices_seen ON agent_devices (last_seen_at DESC);

-- ------------------------------------------------------------
-- emails
--
-- Deduped on internet_message_id, NOT the Outlook Entry ID. Entry IDs change
-- when an item moves between folders or stores, so the "same" email would
-- re-ingest under a new id forever. The Internet Message-Id is assigned by
-- the sending server and is stable and globally unique — and it is NOT NULL
-- here, because a nullable dedupe key is what caused the credit-note
-- duplication (NULL never equals NULL in a UNIQUE constraint).
--
-- Bodies are stored truncated. Doc 09 restricts what is retained: the
-- application needs identifiers and intent, not a second copy of a mailbox.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emails (
  id                  BIGSERIAL PRIMARY KEY,
  internet_message_id TEXT NOT NULL UNIQUE,
  conversation_id     TEXT,
  entry_id            TEXT,
  folder              TEXT,
  subject             TEXT,
  sender_name         TEXT,
  sender_address      TEXT,
  received_at         TIMESTAMPTZ NOT NULL,
  body_preview        TEXT,
  category            TEXT NOT NULL DEFAULT 'Unknown',
  category_source     TEXT NOT NULL DEFAULT 'auto',
  summary             TEXT,
  has_attachments     BOOLEAN NOT NULL DEFAULT FALSE,
  device_id           BIGINT REFERENCES agent_devices (id) ON DELETE SET NULL,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_received     ON emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_conversation ON emails (conversation_id);
CREATE INDEX IF NOT EXISTS idx_emails_category     ON emails (category);

-- ------------------------------------------------------------
-- email_container_links — which container an email is about
--
-- Separate from emails because one email legitimately concerns several
-- containers, the same way one invoice spans several.
--
-- `method` records WHICH of doc 05's five priority rules matched, and
-- `confidence` how strongly. A link below the review threshold is written
-- with needs_review = TRUE rather than dropped: doc 05 says never guess, and
-- an unreviewed guess silently attached to a container is a guess.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_container_links (
  id                BIGSERIAL PRIMARY KEY,
  email_id          BIGINT NOT NULL REFERENCES emails (id) ON DELETE CASCADE,
  container_number  TEXT NOT NULL,
  method            TEXT NOT NULL,
  confidence        NUMERIC(4, 3) NOT NULL,
  needs_review      BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  rejected          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, container_number)
);

CREATE INDEX IF NOT EXISTS idx_email_links_container ON email_container_links (container_number);
CREATE INDEX IF NOT EXISTS idx_email_links_review    ON email_container_links (needs_review)
  WHERE needs_review = TRUE;

-- ------------------------------------------------------------
-- email_attachments — Drive/Outlook references, not the bytes
--
-- Doc 01: "Store only Google Drive File IDs and metadata. Do not duplicate
-- files." Nothing here holds file content.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_attachments (
  id                BIGSERIAL PRIMARY KEY,
  email_id          BIGINT NOT NULL REFERENCES emails (id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  content_type      TEXT,
  size_bytes        BIGINT,
  kind              TEXT NOT NULL DEFAULT 'Unknown',
  drive_file_id     TEXT,
  ocr_status        TEXT NOT NULL DEFAULT 'None',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, file_name)
);

-- ------------------------------------------------------------
-- email_processing_log — doc 05 §Duplicate Prevention
--
-- Records every message the agent offered, including the ones skipped as
-- already seen. Without the skips there is no way to tell "the agent is
-- working and there is nothing new" from "the agent has stopped".
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_processing_log (
  id                  BIGSERIAL PRIMARY KEY,
  internet_message_id TEXT,
  device_id           BIGINT REFERENCES agent_devices (id) ON DELETE SET NULL,
  outcome             TEXT NOT NULL,
  detail              TEXT,
  containers_linked   INTEGER NOT NULL DEFAULT 0,
  at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_at ON email_processing_log (at DESC);

-- ------------------------------------------------------------
-- alert_rule_settings — operator overrides for the built-in rules
--
-- The rules themselves stay in code: each needs a SQL predicate and a Node
-- predicate, and a user-defined predicate would be neither testable nor
-- safe to run against the database. What IS configurable is whether a rule
-- is active and the thresholds it reads, which is what operators actually
-- asked for.
--
-- A rule with no row here uses its code default, so the table starts empty
-- and the application behaves identically until somebody changes something.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_rule_settings (
  rule_id       TEXT PRIMARY KEY,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  threshold     INTEGER,
  updated_by    TEXT NOT NULL DEFAULT 'Operator',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cumulative-store accounting on sync_runs.
--
-- containers_upserted alone cannot answer "did the fleet grow": it counts
-- rows touched by the source, which shrinks whenever a monthly tab rolls
-- over. These record what actually changed, and the size of the historical
-- store afterwards. Added separately so existing rows keep their meaning.
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS containers_inserted INTEGER;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS containers_updated  INTEGER;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS containers_total    INTEGER;
