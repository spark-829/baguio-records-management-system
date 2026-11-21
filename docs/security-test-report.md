# Security test report

**System:** Baguio Records Management System (demo)
**Tested:** 21 November 2026 (Asia/Manila), live site and source code
**Scope:** sign-in and lockout, row-level security, insecure direct object references (IDOR), role escalation,
file access, injection, prompt injection against the AI features, HTTP security headers, secrets in the repository.
**Rules followed:** no denial of service, no deletion of data, demo accounts left unlocked.

## How the system was tested

The app uses Supabase's public (publishable) key in the browser, which is normal for Supabase. It also means
anyone who signs in can skip the app's screens and call the database REST API directly with their own session.
So most tests signed in as each demo role (admin, records officer, department head, staff, viewer) and called the
API directly, to check that the database itself enforces every rule.

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | A department head could rewrite a record's tracking number, registration date and confidentiality through the API | High | Fixed in migration `20261121000100_rms_pentest_fixes.sql` |
| 2 | An attachment saved with type `text/html` would be served as a web page (stored cross-site scripting) | High | Fixed in the app (download route) and in the migration |
| 3 | No security headers (no CSP, clickjacking protection, HSTS); `X-Powered-By` exposed | Medium | Fixed in `next.config.ts` |
| 4 | Workflow order (receive, act, complete, release, archive) only checked in the app; staff could archive or back-date history entries through the API | Medium | Fixed in the migration |
| 5 | Any user could attach files to any Public record, including other offices' records | Medium | Fixed in the migration |
| 6 | Any user could write audit entries that look like changes to `rms_records` or `rms_profiles` | Low | Fixed in the migration |
| 7 | New records could be back-dated, and staff could drop a new record into another office's queue | Low | Fixed in the migration |
| 8 | "Add a note" on a newly registered record was rejected by the database (bug, not a security issue) | Bug | Fixed in the migration |
| 9 | Lockout counts only sign-ins made through the app; calling Supabase Auth directly skips the counter | Medium | Known limit, see below |
| 10 | Anyone who knows an email can lock that account by calling the failed-sign-in function 5 times | Low | Known limit, see below |
| 11 | IP address in the audit log comes from a request header, so a direct API caller can supply a fake one | Low | Known limit, see below |
| 12 | All users can see every user's last sign-in time and failed-attempt count | Low | Accepted for the demo |
| 13 | AI endpoints have no per-user rate limit | Low | Matters only once a real API key is set |

## What held up

- **Anonymous access:** every `rms_` table returns nothing without a session; storage lists nothing.
- **Row-level security on reads:** each role sees exactly what it should. Staff and viewers never see
  Confidential records; only the admin reads the audit log and access history.
- **Soft delete:** records can only be deleted or restored through the guarded functions.
- **Audit log:** cannot be edited or deleted; the hash chain detects tampering.
- **Locked accounts:** even with a valid password, a locked account gets no data, because every rule checks the lock.
- **Secrets:** no API keys or service keys in the code or git history. The Supabase key in `.env.production`
  and `wrangler.jsonc` is the publishable key, which is meant to be public.
- **Injection:** all database access goes through parameterised Supabase calls; search uses
  `websearch_to_tsquery`. The CSV export already blocked spreadsheet formulas (now also tabs and carriage returns).
- **Prompt injection:** the assistant's tools are read-only and run with the user's own session, so a hostile
  document cannot make the AI read or change records the user cannot already see. Links in answers are only made
  clickable when they point to `/records/<id>`.

## Details

### 1. Protected record fields (High)
The update rule let a department head change any column of a record their office holds. A live test (reverted
straight away, and visible in the audit log at 02:08 on 21 November) changed `IN-2026-0001` to tracking number
`HACKED-1`, Confidential, registered in 2020. **Fix:** a trigger blocks direct changes to the tracking number,
direction, creator, registration date and origin office; status and location change only through a history
entry; only the records desk or an admin can change confidentiality.

### 2. Stored cross-site scripting through attachments (High)
`rms_attachments.mime_type` accepted any value, and the download route sent the file back with that type. A file
uploaded as a "PNG" containing HTML, recorded as `text/html`, would run as a page on the RMS site when an admin
opened it. **Fix:** the route only serves PDF, PNG, JPG and WEBP as themselves; anything else downloads as raw
bytes with a sandbox CSP. The database now rejects other types and file paths outside the record's own folder.

### 3. Security headers (Medium)
Added Content-Security-Policy, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS, `nosniff`,
Referrer-Policy, Permissions-Policy and Cross-Origin-Opener-Policy, and removed `X-Powered-By`.
The CSP still allows inline scripts, which Next.js needs at start-up; moving to nonces is a later improvement.

### 9 to 11. Known limits
- **Lockout bypass:** Supabase Auth checks passwords itself, so attempts sent straight to it are not counted.
  Supabase's own rate limits still apply, and a locked account gets no data even with the right password.
  A full fix needs Supabase's password-verification hook (paid plans) or a server-only secret.
- **Lockout on demand:** the failed-sign-in function must be callable before sign-in, so anyone can lock a
  known account for 15 minutes. That is the usual trade-off of lockout. Admins can unlock from Users.
- **Spoofable IP:** fixing this needs a shared secret between the app server and the database (a Cloudflare secret).

## Recommended next steps
1. Run the migration in the Supabase SQL Editor, then run `supabase/tests/pentest_rules.sql` to confirm.
2. Turn on leaked-password protection in Supabase Auth settings.
3. Turn off public sign-ups in Supabase Auth if the other sites sharing this project do not need them
   (RMS accounts are created by admins).
4. Reset the demo data on a schedule, since the demo admin password is public.
