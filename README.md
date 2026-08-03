# Utopia Fulfillment Inc — Transportation Management System

Container drayage operations platform. Consolidates data spread across Google
Sheets, Google Drive and Outlook into one operational system, with **LFD (Last
Free Day) as the central urgency clock**.

Built to `docs/00`–`docs/12`, which are the source of truth for this project.

---

## Quick start

```bash
npm run install:all
```

```bash
cp server/.env.example server/.env
```

Fill in `DATABASE_URL` and `EDIT_KEY`, then:

```bash
npm run dev
```

- Client → http://localhost:5173
- API → http://localhost:4000

The source sheets are read **credential-free** via Google's CSV export, so the
application shows real data as soon as `DATABASE_URL` is set. No service
account is required to read.

---

## Architecture

```
Source Sheet 1 "Floor-Loaded (USA)"   READ ONLY   14 monthly tabs, ~4,400 containers
Source Sheet 2 "Detention"            READ ONLY   D&D invoices · credit notes · FBU
        │
        ▼  CSV export (no credentials)
   Normalize → Validate
        │
        ▼
   Neon Postgres          ← application database: user edits, audit, invoices
        │
        ▼
   Client (React)
```

**Data ownership is the governing rule.** The two source spreadsheets are never
written to — that is enforced in code, not by convention: `assertWritable()` in
`server/src/integrations/google/sheets.ts` throws if a write targets a source
sheet ID.

Operational fields come from the sheets. Operator-owned fields (status
override, PU, notes, priority, tags) live in Neon and are merged over the sheet
data at read time, so **a re-ingest can never destroy an edit**.

---

## Workspaces

```
shared/    Domain types, LFD clock, normalization, vendor canonicalisation (31 tests)
server/    Express API, Neon layer, source readers, edit gate
client/    React 19 · Vite · Tailwind v4 · Framer Motion
docs/      Specification — the source of truth
```

---

## What is built

| Module | State |
|---|---|
| Startup / System Initialization Dashboard | Done — 13 real stages, live health panel, offline fallback |
| Container Search | Done — search, 6 filters, sort, pagination on ~4,400 live containers |
| Container 360 | Done — timeline, operational record, related containers, deep-linkable |
| Container editing | Done — server-validated edit key, full audit trail |
| Dashboard · PU/LFD · D&D · Cost · Vendors · Reports · AI · Admin | Scheduled — see `docs/_REVIEW-and-IMPLEMENTATION-PLAN.md` |

---

## Editing

Edits require a shared key, validated **server-side**. The client collects it
but never decides whether it is valid.

Every change is written to `audit_log` with old value, new value, reason and
timestamp. The log is append-only.

**Limits, stated plainly:** a shared key authenticates nobody — every edit is
attributed to "Operator", and there is no per-person revocation. It prevents
accidental edits. Role-based access control replaces it in Phase 5 (doc 09).

Only user-owned fields are editable. LFD, gate dates, terminal and SSL are
deliberately not, because an edit there would be silently reverted by the next
ingest.

---

## Verification

```bash
npm test
```

```bash
npm run typecheck
```

Profile the real source-sheet schema at any time:

```bash
npm run profile:sheets --prefix server
```

---

## Known constraints

- **Source sheets are shared "anyone with the link."** That is what makes
  credential-free reading work, but it also means every container, vendor and
  invoice amount is readable by anyone holding the URL. Restricting them to
  named accounts is recommended.
- **PU numbers are not in the source data.** Confirmed by profiling all 14 tabs
  — Source Sheet 1 has no pickup-number column. PU can only arrive from Outlook
  screenshots via OCR (Phase 3) or be entered by hand.
- **Outlook integration requires Windows.** Doc 05 specifies Desktop COM
  automation — no Graph, no OAuth, no stored passwords.
- **TMS Master writes still need a Google service account.** Neon supersedes it
  as the application database; a sheet mirror remains optional.

---

Created by Rizwan Hanif for Utopia Brands Inc Trucking Team
