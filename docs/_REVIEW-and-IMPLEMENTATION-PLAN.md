# Architecture Review & Implementation Plan

**Prepared from:** `docs/00` → `docs/12` (all 13 documents read in full)
**Plus:** live inspection of both source Google Sheets (read-only)
**Status:** Awaiting approval before Phase 1
**Date:** 2026-07-26

---

# 1. Understanding

## 1.1 What is being built

An enterprise Transportation Management System for container drayage at Utopia Fulfillment Inc., replacing a workflow currently spread across two Google Sheets, Google Drive, and Outlook. Target quality bar is commercial TMS software (Oracle TM, SAP TM, project44, FourKites), explicitly *not* a generated-looking dashboard.

## 1.2 Data ownership — the central rule

```
Source Sheet 1 "Floor-Loaded (USA)"   READ ONLY   never modify/delete/append
Source Sheet 2 "Detention"            READ ONLY   never modify/delete/append
Google Drive                          READ        store File IDs only, never duplicate
Outlook Desktop (COM)                 READ/SEND   no Graph, no OAuth, no stored passwords
TMS Master (new sheet)                READ/WRITE  the application database
```

Only the Synchronization Engine touches the source systems. **Every application module reads and writes exclusively to TMS Master.** No module may query a source sheet during normal use.

## 1.3 Data flow

```
Source Sheet 1 ─┐
Source Sheet 2 ─┤
Google Drive   ─┼─→ Sync Engine → Merge Engine → Validation Engine → TMS Master → Application
Outlook (COM)  ─┤                     ↑
OCR / PDF      ─┘            preserves user-generated fields
```

Synchronization order is fixed: Sheet 1 → Sheet 2 → Drive → Outlook → OCR → Invoice parsing → Merge → Validation → TMS Master.

Three trigger modes: manual **Refresh Data**, configurable automatic interval, and startup. Incremental only — never a full re-import unless explicitly requested.

## 1.4 Merge and conflict rules

- **Primary key: Container Number.** Never create duplicates.
- Container exists → update only imported fields, preserve user fields.
- Container absent → create.
- **Protected user fields, never overwritten:** Internal Notes, Dispatch Notes, Vendor Notes, AI Notes, Reminder Status, Assigned Dispatcher, Priority, Tags, Flags, Cost Overrides, Manual Corrections.
- **Conflicts are never resolved silently.** A differing Vendor / LFD / Appointment / Terminal / PU goes to a Conflict Queue where the user picks imported vs. current.

> This is a material change from the previous build in this repo, which used "source overwrites master." Doc 06 mandates human resolution. The documentation wins.

## 1.5 Modules

Dashboard · Container Search · Container 360 · PU/LFD · D&D · Cost Analysis · Vendor Management · Reports · Alerts & Reminders · AI Assistant · Synchronization · Administration · Settings

**Container 360** is the flagship: one container, one screen — summary, timeline, operational detail, vendor, email intelligence with conversation drawer, attachments, OCR results, invoices, cost, AI insights, related containers, activity log, notes.

## 1.6 Human-in-the-loop (hard rules)

OCR results, invoice matching, cost overrides, vendor changes, appointment changes, and AI recommendations **always require human approval.** Nothing auto-approves. AI recommends; humans decide.

## 1.7 Cost model

Every container always carries either an **Estimated Cost** (computed from gate dates, LFD, chassis/storage days, vendor and terminal history, with a confidence score) or an **Actual Cost** (from an approved invoice). On invoice approval the estimate is superseded but **retained** for variance analysis. Financial history is append-only.

## 1.8 AI

15 single-responsibility agents (Operations Monitoring, Email Intelligence, OCR, Invoice, Cost, Vendor Performance, Reminder, Document, Sync, Container Health, Predictive Risk, Executive Insights, Search, Recommendation, Data Quality). Agents never talk to each other — they communicate through TMS Master. Every agent action is logged with input, output, confidence, and duration.

## 1.9 Design system

Light enterprise theme. Primary **Emerald `#059669`**, Surface `#F8FAFC`, Border `#E2E8F0`, Text `#0F172A` / `#64748B`, Accent Blue `#2563EB`, Warning `#F59E0B`, Danger `#DC2626`, Success `#16A34A`. Inter + IBM Plex Mono for identifiers. Sidebar 280px / 80px collapsed. Radius 12px (max 16). Animations ≤300ms. Explicitly forbidden: glassmorphism, neon, heavy gradients, excessive rounding.

---

# 2. Architecture Review

## 2.1 CRITICAL — Google Sheets cannot be the database at the stated scale

Doc 10 targets **50,000+ containers, millions of emails, hundreds of vendors, multi-company, multi-warehouse.** Doc 12 defines TMS Master with roughly 80–90 columns across container, email, Drive, OCR, invoice, cost, vendor, AI, sync, and audit field groups.

Hard limits of Google Sheets:

| Constraint | Limit | Projected need |
|---|---|---|
| Cells per spreadsheet | 10,000,000 | 50,000 × 85 ≈ **4.25M for containers alone** |
| Plus emails, audit trail, cost history, AI logs, reminders | — | **far exceeds 10M** |
| Read requests | 300/min/project, 60/min/user | Dashboard + search + 15 agents |
| Practical latency on 50k rows | seconds per full read | Dashboard target is **<2s** |

Doc 12 also mandates *never delete — archive instead* for audit, cost, email, reminder, and AI history. Those are unbounded append-only logs. In Sheets they will hit the cell ceiling well before the container table does.

This is not a scaling nicety — the Dashboard <2s and Search <300ms targets in doc 10 are unreachable if every query round-trips to the Sheets API.

**Recommendation (detail in §3.1):** keep TMS Master as the *system of record and human-readable interface* exactly as documented, but put an embedded local database (SQLite via better-sqlite3) in front of it as the query/read layer. Application modules read the local DB; all writes go through a repository that writes both. This satisfies every documented rule while making the performance targets achievable.

## 2.2 CRITICAL — Doc 12's Source Sheet 2 schema does not match the live sheet

I read the live "Detention" sheet. **It has three tabs, not one**, and the columns differ substantially from doc 12.

**Tab 1 — D&D invoices (actual):**
`Container | Invoice No | Invoice Amount | Detention days | Pick-up date | Return date | LFD | Responsibilty | Status | Trucker | Invoice type | Remarks | Forwarder | PR ID`

**Tab 2 — Credit Notes (absent from doc 12 entirely):**
`Container | Amount | Company | Reason | Remarks | Status | Credit Note No | PR`

**Tab 3 — FBU charges (absent from doc 12 entirely):**
`Container | Invoice | Amount | Trucker | Type | Forwarder | PR ID`

Specific mismatches against doc 12:

| Doc 12 expects | Reality |
|---|---|
| `Invoice Date` | **Does not exist.** Only Pick-up date, Return date, LFD |
| Separate `Demurrage`, `Detention`, `Chassis Charges`, `Storage Charges`, `Other Charges` amount columns | **One** `Invoice Amount` + an `Invoice type` discriminator (`Detention`, `Demurrage`, `Chassis Detention`, `Chassis Usage`, `rail detention`) |
| `Currency` | Does not exist; amounts are USD-formatted strings (`$1,420.00`) |
| `Vendor` (single) | **Three distinct party columns**: `Trucker` (who moved it), `Responsibilty` [sic] (who bears the cost), `Forwarder` (freight forwarder) |
| `Status` = Expected/Received/Approved/Paid/Disputed | Actual values: `Paid`, `Not paid`, `Revoked` |
| — | `PR ID` (procurement request), `Remarks`, credit-note lifecycle (`Used`/`Received`/`Not Received`) |

**Consequence:** the vendor KPI model in docs 03/04/08 assumes one "Vendor" per container. The real data distinguishes *who trucked it* from *who is financially responsible* — and they frequently differ (e.g. `Trucker: Marlin`, `Responsibilty: Utopia`). Attributing D&D cost to the Trucker when Utopia accepted responsibility would produce false vendor scores and wrong commercial decisions. This must be modelled as three separate fields.

## 2.3 CRITICAL — invoice-to-container is many-to-many, contradicting the validation rule

Doc 12 states: *"Invoice — Must belong to one container."* The live data violates this repeatedly. Invoice `NAIC1340615` appears against five containers (CMAU5918550, CMAU8885151, ECMU7379927, MAGU5321965, TGBU9203452), each with its own amount and day count. `NAIC1516131`, `NAIC1346789`, `NAIC1539085` and others behave the same way.

Enforcing the documented rule would reject or corrupt real invoices. The schema needs an invoice-line join (`invoice_no + container_no` composite) rather than a single container FK.

## 2.4 HIGH — deployment topology conflicts with itself

Doc 05/11 mandate **Outlook Desktop COM automation**, which requires the Node process to run on a Windows desktop, in the interactive user's session, with Outlook running and signed in. Doc 09 simultaneously specifies **RBAC, multiple users, active sessions, login history, password policy**, and doc 10 lists **Docker / Azure / AWS / Linux** as future deployment targets.

These are incompatible as stated. COM cannot run in a container, on Linux, or in a service context serving multiple remote users.

Workable resolution: treat the Outlook bridge as a **separate, replaceable local agent process** behind an interface (`IMailProvider`), so the rest of the system is unaware of the transport. V1 ships the COM agent on the dispatcher's Windows machine; a future Graph provider drops in without touching business logic. This is genuinely what doc 05's "design for future Graph support without rewriting the architecture" requires.

## 2.5 HIGH — no LLM provider is specified for the AI agents

Doc 08 defines 15 agents including AI conversation summaries, executive insights, and natural-language search ("Which vendor has the highest D&D?"). Doc 10 lists OpenAI / Claude API / Gemini only under **future** integrations.

Agents 1, 3, 4, 5, 6, 9, 10, 11, 15 are deterministic and need no model. Agents 2 (summaries), 12 (executive narrative), 13 (NL search), 14 (recommendations) require either an LLM or heavily templated output. Blocking question in §4.

## 2.6 HIGH — source data quality issues that will corrupt the merge

Observed in the live Detention sheet:

- **Trailing carriage returns inside container numbers** — `CMAU6904400&#13;`, `TXGU7784371&#13;`. Without normalization these create phantom duplicate containers, which directly violates the "never create duplicate containers" rule.
- **Year typos** — rows dated `18-Dec-2026`, `24-Dec-2026` interleaved with 2025 records in the same batch, with return dates in Jan 2026. These are almost certainly mistyped 2025 dates. LFD logic will mis-rank them by a full year.
- **`-` and empty string both used as null**, inconsistently.
- **`Responsibilty` is misspelled** in the header and must be matched as-is.
- Rows with **no dates at all** but a real invoice amount.
- **Duplicate container+invoice pairs** with differing types (TCNU2874150 appears as both `Detention` and `Chassis Detention`).

The Validation Engine must normalize and quarantine rather than reject, or real invoices will silently vanish. Doc 06's Duplicate Detection needs to key on `container + invoice + type`, not container alone.

## 2.7 HIGH — password hashes must not live in TMS Master

Doc 09 requires local auth with hashed passwords and RBAC. Doc 06 makes TMS Master the application database. Anyone with view access to that Google Sheet — which is shared to enable the integration — would see every user's password hash and role, and an editor could escalate their own role by typing in a cell.

Auth data must live outside the sheet (local DB, encrypted at rest), never in TMS Master.

## 2.8 MEDIUM — missing dependencies not named in any document

Not specified anywhere but required:

- **Outlook COM bridge**: `winax` or `node-activex` (native, Windows-only, needs a build toolchain) — or a PowerShell shim invoked as a child process, which is far easier to install and debug. Recommend the PowerShell shim for V1.
- **Persistence**: `better-sqlite3` (see §3.1).
- **Auth**: `bcrypt`/`argon2`, session store.
- **Google**: `googleapis` (implied, never named).
- **Table**: TanStack Table is named, but a virtualizer (`@tanstack/react-virtual`) is required to meet the virtualization requirement.
- **Export**: PDF/Excel/CSV export is required across many modules; no library named (`exceljs`, `pdfmake`).
- **Job queue**: `node-cron` schedules, but nothing sequences the 9-step sync pipeline with retries.
- **Logging**: centralized logging required; no library named (`pino`).

## 2.9 MEDIUM — performance targets vs. Sheets API quota

Dashboard <2s and Search <300ms are stated. Sheets allows 60 reads/min/user. With 15 AI agents plus scheduled syncs plus interactive use, quota exhaustion is likely. The local read layer in §3.1 resolves this; without it, these targets cannot be met.

## 2.10 MEDIUM — Container 360 in the sidebar

Doc 03 lists "Container 360" as a top-level nav item, but it is inherently contextual (it needs a container). As a nav entry it would open an empty screen — which doc 02 forbids. Recommend it not be a nav item; it is reached by selecting a container, with route `/containers/:containerNo` for deep-linking.

## 2.11 LOW — currency inconsistency in the docs

Doc 07's variance example is denominated in **PKR**. All live invoice data is **USD**, and the operation is US drayage. Assuming USD unless corrected; the schema will still carry an explicit currency field.

## 2.12 Maintainability observations

- Doc 01 specifies `src/{components,layouts,pages,features,...}` while doc 10 specifies `client/ server/ shared/ docs/ scripts/ logs/ uploads/ backups/ config/`. These need reconciling — proposal in §5.
- Doc 11 caps components at 300 lines. Container 360 aggregates ~12 sections and must be composed from lazy-loaded section components from the start.
- A `shared/` types package is essential; the previous build in this repo duplicated its domain types between web and server, which is exactly the drift risk doc 11 warns about.

---

# 3. Recommended Improvements

## 3.1 Local read layer in front of TMS Master — NOT ADOPTED (see §4 Q1)

> **Decision: declined.** TMS Master is the sole persistent store. This section is retained as the recorded rationale and the accepted trade-off; the mitigations actually being built are listed in §4 Q1. Do not implement what follows.

```
Application modules
        │  read
        ▼
  SQLite (local, embedded)         ← query layer, indexes, full-text search
        ▲                │
        │ hydrate        │ write-through
        │                ▼
     TMS Master (Google Sheet)     ← system of record, human-readable, as documented
        ▲
        │ sync engine only
   Source Sheet 1 / 2
```

- Every documented rule is preserved: TMS Master remains the database of record, modules never touch source sheets, all writes land in TMS Master.
- Dashboard/search/agents query SQLite → <300ms targets become achievable, and Sheets quota stops being a bottleneck.
- Unbounded logs (audit, email, AI, cost history) live in SQLite, which removes the 10M-cell ceiling.
- Doc 06 §Future Enhancements already anticipates BigQuery/Cloud SQL/PostgreSQL; this is the same seam, just used now.
- Repository pattern (already mandated by doc 01) is the only place that knows about the dual write.

**If this is rejected**, the honest consequence is a hard ceiling around 8,000–10,000 containers and Dashboard load times in the 5–15s range. I'd want that decision recorded.

## 3.2 Model the three party roles explicitly

Replace the single `Vendor` field with:

- `trucker` — who physically moved the container (operational KPI attribution)
- `responsibleParty` — who bears the cost (financial attribution)
- `forwarder` — freight forwarder

Vendor KPIs then split correctly: on-time pickup scores the **trucker**; D&D cost attribution follows **responsibleParty**. Keep a computed `vendor` alias = `trucker` for backward compatibility with the documented UI labels.

## 3.3 Invoice-line model

`invoices` (invoice_no, issuer, status, pr_id, remarks) → `invoice_lines` (invoice_no, container_no, amount, days, charge_type, pick_up_date, return_date, lfd). Handles the many-to-many reality, makes charge-type breakdowns in doc 07 fall out naturally, and lets credit notes and FBU charges attach cleanly as additional line sources.

## 3.4 Canonical normalization layer, applied once at ingest

A single `normalize()` module: strip `&#13;`/whitespace/case from container numbers, validate ISO 6346 (4 letters + 7 digits), parse `$1,420.00` → `1420.00`, parse `4-Sep-2025` → ISO date, map `-`/`""` → null, flag impossible dates (LFD before Gate In per doc 12; return date before pick-up; year >1 year in future) into a **Data Quality queue** rather than dropping them. Agent 15 (Data Quality) surfaces these.

## 3.5 Sync as a resumable pipeline

Nine ordered stages with per-stage checkpointing, so a Drive or Outlook failure doesn't discard completed Sheet 1/2 work. Directly supports doc 10's "if synchronization fails, do not stop the application."

## 3.6 Idempotent, append-only audit log

Doc 09 requires old/new value on every change and doc 12 forbids deletion. Write audit rows to SQLite with a periodic export to a TMS Master audit tab, so the sheet stays usable while history stays complete.

## 3.7 Design system as tokens, single source

Emerald palette defined once as CSS variables consumed by Tailwind, with semantic aliases (`--color-status-critical`) rather than raw brand colors in components. Makes the doc-02 palette enforceable and a retune a one-file change.

## 3.8 Deterministic-first AI

Implement agents 1, 3, 4, 5, 6, 9, 10, 11, 15 as pure rule engines with unit tests — they need no model and are auditable, which matters for cost and vendor decisions. Put agents 2, 12, 13, 14 behind an `ILlmProvider` interface with a templated fallback, so the system is fully functional with no API key and upgrades cleanly.

## 3.8a Global attribution footer (client requirement, 2026-07-26)

Every page carries the line:

```
Created by Rizwan Hanif for Utopia Brands Inc Trucking Team
```

Implementation notes:
- Rendered **once** in the app shell/layout, not repeated per page — a per-page copy would drift and violates DRY (doc 01).
- Lives below the main content region, inside the scroll container, so it never overlaps data or floats over tables.
- Styled as caption-tier: 12px, `text-secondary #64748B`, adequate top spacing, non-interactive. It must read as a quiet credit line, not compete with operational data (doc 02 §Design Principles).
- Included in PDF/print exports and report headers/footers where a page footer is meaningful.
- Text stored as a single constant in `shared/constants` so it is never duplicated in source.

## 3.9 UX improvements

- Global search (`Ctrl+K`) returning containers, invoices, vendors, PU, booking, chassis — doc 03 requires it on every page.
- Conflict Queue as a first-class review surface with side-by-side imported vs. current and a one-click resolve, matching the OCR/invoice review pattern.
- Optimistic UI on approvals with rollback, so the review queues feel instant despite Sheets write latency.
- Saved filter views on Container Search (dispatchers repeat the same 4–5 queries daily).
- Confidence-driven review ordering: lowest-confidence OCR/invoice items surface first and are styled to resist rubber-stamping.

---

# 4. Critical Questions — ANSWERED 2026-07-26

**Q1 — Local database in front of TMS Master? → DECIDED: NO. TMS Master only.**

The application will use TMS Master as its sole persistent store. No SQLite, no Postgres.

*Accepted consequences, recorded:* practical ceiling in the region of 8,000–10,000 containers rather than 50,000; dashboard and search latency governed by Sheets API round-trips; the 10M-cell cap is shared across every tab including audit, email, cost and AI history.

*Mitigations that stay inside this decision* (all explicitly required by docs 06 and 10, so none of them constitute a second database):
- **In-process cache**, hydrated once per sync and invalidated on sync completion — doc 06 §Caching and doc 10 §Caching Strategy both mandate this. All reads serve from memory; Sheets is touched by the Sync Engine only.
- **One batched read per sync** via `spreadsheets.values.batchGet` rather than per-query reads, which keeps API quota usage flat regardless of user activity.
- **Log rotation into archive spreadsheets.** Audit, email, AI and cost history are append-only and unbounded; they will live in dedicated tabs that roll into dated archive sheets on a threshold. Satisfies doc 12's "never delete — archive instead" without consuming the master's cell budget.
- **Indexed lookup maps** built at hydration for the doc-12 §Indexing fields (Container, Booking, Vendor, Invoice, PU, Terminal, SSL) so search stays in-memory.

With these, the <300ms search target is reachable and the <2s dashboard target is reachable on cached data. The container ceiling remains as stated.

**Q2 — Deployment topology → DECIDED: Single Windows desktop, multi-user login.**

Node backend + React frontend + Outlook COM all run on one operations machine with Outlook signed in. RBAC per doc 09 is enforced for the users who log into that machine. The Outlook bridge is still built behind an `IMailProvider` interface so a future Microsoft Graph provider drops in without touching business logic (doc 05 §Future Enhancements).

**Q3 — LLM for generative agents → DECIDED: Wire Claude API now.**

Agents 2 (Email Intelligence), 12 (Executive Insights), 13 (AI Search) and 14 (Recommendation) call the Claude API. Requirements:
- API key in `.env`, never in source (doc 09, doc 11).
- All calls behind `ILlmProvider` so the model or vendor can change without touching agents.
- Every call logged with input, output, confidence, duration (doc 08 §AI Logs).
- Graceful degradation to templated output when the key is absent or the API is unreachable — the application must remain fully usable offline (doc 10 §Disaster Recovery).
- AI output is **recommendation only** and never writes to operational data without approval (doc 08, doc 11).
- Agents 1, 3, 4, 5, 6, 9, 10, 11, 15 remain deterministic rule engines — auditable, testable, no model calls.

**Q4 — Party-role model → CONFIRMED (not contradicted).**

`Trucker` / `Responsibilty` / `Forwarder` modelled as three distinct fields. On-time pickup KPIs score the **Trucker**; D&D cost is attributed to the **Responsibilty** party; `Forwarder` is tracked for reporting. A computed `vendor` alias = `trucker` preserves the documented UI labels.

**Q5 — Existing prototype → DECIDED: Delete entirely, start clean.**

`web/` and `server/` from the previous brief are to be removed with nothing carried over. `docs/` is retained.

*Note:* this directory is **not** a git repository, so the deletion is unrecoverable. First action in Phase 1 will be `git init` plus an initial commit, so that all subsequent work is recoverable.

---

# 5. Phased Implementation Plan

Reconciled folder structure (satisfies doc 01 and doc 10):

```
client/          React app — components, layouts, pages, features, hooks, services, store, styles
server/          routes, controllers, services, repositories, middleware, jobs, config, utils
  agents/        the 15 AI agents
  integrations/  google/, outlook/, ocr/, pdf/
shared/          types, constants, validation schemas (single source, no duplication)
scripts/         schema profiling, TMS Master provisioning, migrations
docs/ logs/ uploads/ backups/ config/
```

---

## Phase 1 — Foundation, Data Layer & Synchronization

*The riskiest work first: nothing above it is trustworthy until the data layer is right.*

**Deliverables**
- Monorepo restructured to the layout above; `shared/` types package; TypeScript strict; ESLint; centralized config from `.env`; `pino` logging.
- **Design system** implemented from doc 02 — emerald tokens, Inter/IBM Plex Mono, spacing/radius/shadow scale, and the full primitive set (Button ×7 states, Badge, Card, Table, Form controls, Modal, Drawer, Toast, Empty, Skeleton, Error).
- App shell: 280/80px collapsible sidebar, sticky header, breadcrumbs, global search shell, notification bell, user menu.
- **Auth & RBAC**: local login, hashed passwords stored **outside** TMS Master, 5 roles, route guards, and server-side permission checks on every endpoint.
- **Schema profiling script** — reads Source Sheet 1 (480KB, not yet profiled) and Sheet 2, emits actual columns/types/null-rates/anomalies to `docs/`. Run before finalizing the schema.
- **TMS Master provisioning script** — creates the sheet with all tabs and headers per doc 12 plus the corrections in §2.2/§2.3.
- **Normalization + Validation engines** with the §3.4 rules, fully unit-tested.
- **Sync Engine**: resumable 9-stage pipeline, incremental, merge with user-field preservation, **Conflict Queue** (never silent), duplicate detection on `container + invoice + type`, full sync log.
- **Synchronization Center UI**: status, last/next sync, duration, imported/updated/skipped, errors, progress, manual **Refresh Data**, conflict resolution screen.
- **Cache + repository layer** per §4 Q1: single batched read per sync, in-process hydration, indexed lookup maps for the doc-12 index fields, invalidation on sync completion, and archive-tab rotation for append-only logs. Repository pattern is the only code that knows about Sheets.
- `git init` + initial commit before any deletion or scaffolding.

**Exit criteria:** both source sheets import cleanly into TMS Master with zero writes to the sources; conflicts and data-quality issues are visible and resolvable; sync is re-runnable and incremental.

---

## Phase 2 — Core Operational Modules

**Deliverables**
- **Dashboard**: KPI cards (Active Containers, Today's Operations, LFD Status, Vendor Summary, Cost Summary, Sync Status, Email Summary), **Needs Attention** widget (9 categories, each deep-linking), LFD Risk Board (green/amber/red, most urgent first), Recent Activity, Notifications. <2s cached.
- **Container Search**: all documented search fields and filters, TanStack Table + virtualization, sticky header, sort/filter/resize/zebra/keyboard nav, export, saved views. <300ms.
- **Container 360** (flagship): header + status banner, summary, timeline, operational details, vendor section + KPIs, cost summary, related containers, activity log, notes, quick actions, keyboard shortcuts. Composed of lazy-loaded sections, each with loading/empty/error states. Email/attachment/AI sections stubbed with proper empty states until Phase 3.
- **PU / LFD module**: list with countdown, search/filter/sort/export.
- **Vendor Management**: list, KPI scorecards, detail view, performance and cost trends.
- **Alerts & Reminders**: alert list, rule configuration, reminder log (sending arrives in Phase 3).
- Global search (Ctrl+K) live across containers, vendors, invoices, PU, booking, chassis.

**Exit criteria:** a dispatcher can run the full operational day from TMS Master data without opening a spreadsheet.

---

## Phase 3 — Documents, Outlook & Review Queues

**Deliverables**
- **Google Drive integration**: locate and associate PU screenshots, invoice PDFs, POD, gate receipts; store **File IDs only**; attachment categories; preview/download in Container 360.
- **Outlook COM bridge** as an isolated local agent behind `IMailProvider`: read inbox/sent/custom folders, conversation threads, attachment download, duplicate prevention via Entry ID + Conversation ID + Internet Message ID, Email Processing Log.
- **Email intelligence**: container matching by the documented 5-step priority (container → booking → PU → thread → manual review, never guess), categorization, one-line summaries, Email Intelligence section and **Conversation Drawer** in Container 360.
- **OCR pipeline + Review Queue**: Tesseract, confidence scoring, original screenshot side-by-side, inline edit, approve/reject. **Never auto-approves.**
- **Invoice parsing + Container-Match Review**: `pdf-parse` extraction, validation, approve/reject/edit before anything is logged.
- **D&D module**: invoice log across all three source tabs (invoices, credit notes, FBU), filters, preview, review workflow.
- **Reminder engine**: checks for an existing vendor reply first, sends via Outlook (never SMTP), configurable templates and timing, full history.

**Exit criteria:** no dispatcher needs to open Outlook or Drive to understand a container.

---

## Phase 4 — Cost Analysis & AI Agents

**Deliverables**
- **Expected Cost engine**: computes from gate dates, LFD, chassis/storage days, size, vendor/terminal history, with confidence % and calculation date.
- **Actual Cost engine**: supersedes estimates on invoice approval, **retains estimate history**, variance and % variance.
- **Cost Analysis module**: all 13 charge categories, container cost cards, breakdowns with percentages, vendor/terminal/monthly analysis, D&D and chassis analysis, historical windows (30/90/180/365d), cost alerts, filters, charts.
- Manual adjustments with mandatory reason + full audit trail.
- **15 AI agents** as independent services with structured recommendations, confidence scores, and complete logging — deterministic agents first, generative agents behind `ILlmProvider`.
- **AI Operations Center** page: agent status, last run, queue size, health, processing time, recommendations.
- **Reports**: operational, vendor, cost, D&D, container, sync, email — exporting PDF/Excel/CSV.

**Exit criteria:** every container carries a cost with provenance; management can answer all seven questions in doc 07 §Success Criteria without a spreadsheet.

---

## Phase 5 — Administration, Hardening & Production Readiness

**Deliverables**
- **Administration module**: user management, permission matrix, active sessions, system health, feature flags, all configuration surfaces (sync, Outlook, OCR threshold, reminder rules, cost rules, AI schedule).
- **Audit trail UI**: searchable/filterable/exportable, old→new values on every change.
- **Health dashboard**: system/database/Google/Outlook/AI status, storage, error rate, last backup.
- Backup & restore; cleanup jobs; log archival.
- **Performance pass**: route/component splitting, memoization, virtualization audit, bundle optimization, caching, lazy loading against every doc-10 target.
- **Accessibility pass**: keyboard nav, ARIA, focus states, contrast, screen readers.
- **Testing**: unit (engines, agents, normalization), integration (sync, Outlook, Drive), E2E (critical dispatcher paths), responsive, regression.
- Production build, deployment runbook, and doc-10 production checklist signed off.

**Exit criteria:** every item on doc 10's Production Checklist passes.

---

# 6. Status

**Awaiting explicit approval before Phase 1.** Answers to Q1–Q5 in §4 are needed for a correct start; Q1, Q2 and Q5 are the load-bearing ones.

Once approved, all 13 documents are treated as the source of truth for the remainder of development.
