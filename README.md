# Baguio RMS: Records Management System (demo)

A working demo of a city government Records Management System: register incoming and outgoing documents, classify and index them, attach scans, route them between offices, see each document's status and history, record actions and remarks, manage user access, and produce reports. A Claude Haiku assistant reads scanned documents to pre-fill the registration form, turns plain-language searches into filters, and answers questions about records.

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
| Extra: audit log | Database triggers log every change and every AI suggestion; append-only |

## Demo accounts

All use the password `Demo@2026`.

| Email | Role | Office |
| --- | --- | --- |
| records@rms-demo.test | Records Officer | City Mayor's Office |
| admin@rms-demo.test | Administrator | City Mayor's Office |
| engineering.head@rms-demo.test | Department Head | City Engineering Office |
| engineering.staff@rms-demo.test | Department Staff | City Engineering Office |
| treasury.staff@rms-demo.test | Department Staff | City Treasurer's Office |

Sign in as Treasury staff and as the Records Officer to see the access rules at work: the same search, and the same assistant question, return different records.

## How it is built

- **Next.js 15 (TypeScript, App Router)** on **Cloudflare Workers** via OpenNext.
- **Supabase**: PostgreSQL, Auth and Storage. All tables are prefixed `rms_`.
- **Access control in the database.** Row-level security on every table, keyed on the user's role and office. The app talks to the database as the signed-in user, never with a service key, so a bug in a screen cannot leak another office's records.
- **Audit trail in the database.** Triggers write every insert, update and delete to `rms_audit_log` with old and new values; no role can edit or delete it.
- **Claude Haiku 5.5** (`claude-haiku-5-5`) for AI features, called from the server only. The assistant's search tools run as the signed-in user, so it obeys the same access rules. A person always confirms AI-filled fields before saving. For fully on-premise use, the same calls can point to a locally hosted open-weight model.

```
src/app/(app)/        screens: dashboard, records, register, record detail, slip, assistant, reports, admin
src/app/api/          AI endpoints, CSV export, attachment download
src/lib/              Supabase clients, workflow rules, search, AI helpers
supabase/migrations/  schema, access rules, triggers, search function
supabase/seed.sql     offices, document types, demo accounts, sample records
supabase/tests/       access-rule checks (SQL)
tests/                unit tests for the workflow rules (Vitest)
docs/                 system analysis and design
```

## Run it locally

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL, publishable key, and Anthropic key
npm run dev
```

Set up a new Supabase project by running the files in `supabase/migrations/` in order, then `supabase/seed.sql`.

## Test

```bash
npm test                         # workflow rules
# access rules: run supabase/tests/access_rules.sql in the Supabase SQL editor
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

The Supabase URL and publishable key are public values set in `wrangler.jsonc`.
