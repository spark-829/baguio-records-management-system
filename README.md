# Baguio RMS: Records Management System (demo)

A working demo of a city government Records Management System: register incoming and outgoing documents, classify and index them, attach scans, route them between offices, see each document's status and history, record actions and remarks, manage user access, and produce reports. A DeepSeek assistant reads scanned documents to pre-fill the registration form, turns plain-language searches into filters, and answers questions about records.

> Portfolio project by Vic. It is not an official City Government of Baguio system, and all data in it is fictional.

## Modules

| Module | Where |
| --- | --- |
| Registration of incoming and outgoing records | **Register**: auto tracking numbers `IN-2026-0001` / `OUT-2026-0001` |
| Classification and indexing | Document type, category, keywords, priority, confidentiality on every record |
| Digital document storage and attachments | Private storage bucket, versioned files, 60-second signed download links |
| Search and retrieval | **Records**: full-text search across subject, keywords, names and document text, plus filters |
| Status and history monitoring | Seven-status workflow, timeline on each record, overdue flags on the dashboard |
| Recording of actions and remarks | **Take action** panel on each record; every entry signed and timestamped |
| User account and access management | **Users** (admin): create accounts, set role and office, deactivate |
| Basic reports | **Reports**: counts by status, office, type and month; overdue list; CSV export; print to PDF |
| Extra: routing slip | Printable slip with a QR code that opens the record |
| Extra: AI assistant | Scan-to-prefill, plain-language search, record summaries, records chat |
| Extra: audit log | Database triggers log every change, download and AI suggestion with IP; hash-chained so tampering is detected |
| Extra: security | Access history, account lockout, idle sign-out, optional two-step sign-in, Public/Internal/Confidential levels, Viewer role, deleted-records bin, "Viewed by" stamped downloads |
| Extra: Data Privacy Act | Privacy notice at sign-in, masked names in lists, "who accessed this person's records" report, Confidential kept out of AI |

## Resilience

Nightly encrypted backups to Cloudflare R2, a monthly restore drill, a daily audit-log check, and an uptime check every 15 minutes. See [backups](docs/backups.md), [restore drill](docs/restore-drill.md), [recovery runbook](docs/recovery-runbook.md) and [paper fallback](docs/paper-fallback.md).

## Demo accounts

All use the password `Demo@2026`.

| Email | Role | Office |
| --- | --- | --- |
| records@rms-demo.test | Records Officer | City Mayor's Office |
| admin@rms-demo.test | Administrator | City Mayor's Office |
| engineering.head@rms-demo.test | Department Head | City Engineering Office |
| engineering.staff@rms-demo.test | Department Staff | City Engineering Office |
| treasury.staff@rms-demo.test | Department Staff | City Treasurer's Office |
| viewer@rms-demo.test | Viewer (read-only) | City Planning and Development Office |
| treasury.head@rms-demo.test | Department Head | City Treasurer's Office |
| budget.head@rms-demo.test | Department Head | City Budget Office |
| hrmo.staff@rms-demo.test | Department Staff | Human Resource Management Office |
| legal.head@rms-demo.test | Department Head | City Legal Office |
| admin.office@rms-demo.test | Department Staff | City Administrator's Office |
| planning.head@rms-demo.test | Department Head | City Planning and Development Office |

Sign in as Treasury staff and as the Records Officer to see the access rules at work: the same search, and the same assistant question, return different records.

## How it is built

- **Next.js 15 (TypeScript, App Router)** on **Cloudflare Workers** via OpenNext.
- **Supabase**: PostgreSQL, Auth and Storage. All tables are prefixed `rms_`.
- **Access control in the database.** Row-level security on every table, keyed on the user's role and office. The app talks to the database as the signed-in user, never with a service key, so a bug in a screen cannot leak another office's records.
- **Audit trail in the database.** Triggers write every insert, update, delete and download to `rms_audit_log` with old and new values, actor and IP. Each entry carries a SHA-256 fingerprint of the one before, so any edit outside the app breaks the chain and the Audit log page flags it.
- **Sign-in protection in the database.** Lockout after 5 failed attempts, locked or deactivated users lose access even with an open session, and admins with two-step sign-in get no admin rights until they enter the code.
- **DeepSeek** (`deepseek-flash`, plain `fetch`) for AI features, called from the server only. Every call reserves budget in the database first (hard cap 0.33 USD, per-user rate limits, cached results); when the cap is reached or a call fails, the app falls back to the labeled demo output. The assistant's searches run as the signed-in user, so it obeys the same access rules. A person always confirms AI-filled fields before saving. For fully on-premise use, the same calls can point to a locally hosted open-weight model.

```
src/app/(app)/        screens: dashboard, records, register, record detail, slip, assistant, reports, admin
src/app/api/          AI endpoints, CSV export, attachment download
src/lib/              Supabase clients, workflow rules, search, AI helpers
supabase/migrations/  schema, access rules, triggers, search function
supabase/seed.sql     offices, document types, demo accounts, sample records
supabase/seed_more.sql  six more staff and 35 more records with full histories (generated by supabase/tools/gen_more_seed.py)
supabase/seed_batch3.sql  19 current records: vouchers at the Budget Office, December due dates, replies, confidential HR and legal items (supabase/tools/gen_seed_batch3.py)
supabase/tests/       access-rule checks (SQL)
tests/                unit tests for the workflow rules (Vitest)
docs/                 system analysis and design
```

## Run it locally

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL, publishable key, and DeepSeek key (`SPARK_DEEPSEEK_API`)
npm run dev
```

Set up a new Supabase project by running the files in `supabase/migrations/` in order, then `supabase/seed.sql`, `supabase/seed_more.sql` and `supabase/seed_batch3.sql`.

## Test

```bash
npm test                         # workflow rules
# access rules: run supabase/tests/access_rules.sql in the Supabase SQL editor
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put SPARK_DEEPSEEK_API
npm run deploy
```

The Supabase URL and publishable key are public values set in `wrangler.jsonc`.

### AI demo mode

Without `SPARK_DEEPSEEK_API` the app runs its AI features in **demo mode**, labeled "Demo mode: sample AI output" on screen:

- **Scan-to-prefill** fills the form from one of three prepared sample letters (the uploaded file is not read).
- **Plain-language search** and the **records assistant** use a rule-based parser (names after "by/from", offices, document types, overdue, dates) and then run the normal search under the signed-in user's access rights, so the answers are live records.
- **Summaries** are built from the record's fields and latest action.

Audit logging and access control are the same in both modes (`model: "demo"` in the audit log). Add the secret to switch to DeepSeek with no code change (spend is capped at 0.33 USD; past the cap the demo output is used); set `AI_DEMO_MODE=1` to force demo mode even with a key.
