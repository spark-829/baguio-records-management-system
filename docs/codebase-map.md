# Codebase map

Read this instead of exploring. Update it in the same PR when you add a
screen, lib module, table or migration.

## Request flow

`src/middleware.ts` refreshes the Supabase session and sends signed-out users
to `/login` (public: `/track`, `/survey`, `/developer`). Pages in `src/app/(app)/` call
`getProfile()` (`src/lib/session.ts`), which redirects locked, inactive or
MFA-pending users. All queries use `createClient()` from
`src/lib/supabase/server.ts` (user's token, RLS applies).

## Screens: `src/app/(app)/`

| Route | Files |
| --- | --- |
| `/` dashboard | `page.tsx` (+ `components/due-calendar.tsx`); admins get the Security overview, `security-hub.tsx` |
| `/records` list, search | `records/page.tsx`, `records/ai-search-box.tsx` |
| `/records/new` register | `records/new/{page,register-form,actions}.tsx` (scan to prefill; `?reply_to=IN-...` starts a reply) |
| `/records/[id]` detail | `records/[id]/page.tsx`, `forms.tsx` (take action, attach), `actions.ts`, `summary-box.tsx` |
| `/records/[id]/slip`, `/receipt` | routing slip with QR, QR receipt |
| `/r/[tracking]` | QR scan landing, `receive-form.tsx` (receive by QR) |
| `/assistant` | `assistant/chat.tsx` (records chat) |
| `/reports`, `/reports/offices`, `/reports/retention`, `/reports/satisfaction`, `/reports/step-times` (records desk) | reports, CSV via `api/reports/csv` |
| `/boxes`, `/boxes/new`, `/boxes/[id]`, `/boxes/[id]/edit`, `/boxes/[id]/label` (records desk; box page readable by staff) | storage boxes: `boxes/{page,box-form,actions}`, A6 label with QR; `records/[id]/paper-forms.tsx` (put in a box, record delivery), `sending-card.tsx` |
| `/reports/released` | released documents logbook (records desk, office heads), CSV via `api/reports/csv?report=released` |
| `/map` | barangay map (`components/barangay-map.tsx`, `lib/baguio-map.ts`) |
| `/admin/users`, `access`, `audit`, `bin`, `settings` | admin screens; `actions.ts` beside each (`users?locked=1` filters locked accounts) |
| `/admin/analytics` | admin flow analytics: `admin/analytics/page.tsx`, `charts.tsx` (server-only marks); one RPC `rms_admin_flow_analytics` |
| `/security` | MFA setup; `/help` user help |

Outside `(app)`: `src/app/login`, `mfa`, `track` (public tracking), `survey` (public Client Satisfaction Survey, server form, no client JS),
`developer` (public CV page).

## API: `src/app/api/`

`ai/{intake,search,summary,chat}/route.ts` (all via `runAi`),
`alerts` (bell), `attachments/[id]` (signed, watermarked download; `?thumb=1` thumbnail), `reports/csv`, `reports/satisfaction` (CSV),
`auth/signout`.

## Lib: `src/lib/`

| File | What |
| --- | --- |
| `session.ts` | `getProfile`, `isCentral`, `getSettings` |
| `types.ts`, `labels.ts` | Role/Status/Profile types; labels, `maskName`, dates |
| `workflow.ts` | actions, `allowedActions`, `nextStatus`, `isOverdue`, `isAlreadyReceived`, `canAttach` (mirror of `rms_can_attach`; admins get no record actions) |
| `security-hub.ts`, `flow-analytics.ts` | pure: admin Security overview parser, attention items, finding text; System analytics parser, ranking, quintiles, ticks, text helpers |
| `history.ts`, `audit-text.ts` | `newestFirst`, `collapseSteps` (history order, citizen progress); `routeText` (audit routing rows) |
| `search.ts` | record search filters → `rms_search_records_v3` (adds the box code) |
| `boxes.ts`, `dispatch.ts` | pure: box codes, box form checks, history text; send methods, release and delivery form checks, `canRecordDelivery` (mirror of `rms_record_delivery`), logbook parser and CSV rows |
| `transaction-type.ts` | G2C/G2G/G2B codes, labels, `isTxType`, `txLabel` (test `tests/transaction-type.test.ts`) |
| `ai-gate.ts` | `runAi` (reserve budget, cache, demo fallback) |
| `ai.ts`, `deepseek.ts`, `ai-schemas.ts`, `ai-demo.ts` (430 lines), `ai-budget.ts` | AI prompts, client, zod schemas, demo output, cost math |
| `assistant.ts` | records assistant chat (search + answer) |
| `chat-memory.ts` | pure chat history caps, older-turn summary, request trimming |
| `chat-store.ts` | assistant chat kept in sessionStorage per user, wiped at /login |
| `api.ts` | `apiContext`, `aiError` for routes |
| `i18n/` | `core.ts` (`makeT`), `server.ts` (`getT`), `client.tsx` (`useT`), `fil.ts` (dictionary, grep only) |
| `qr.ts`, `watermark.ts`, `shrink-image.ts`, `image-size.ts` | QR, PDF stamp, image helpers |
| `upload-policy.ts` | pure upload rules: limits, `encodePlan`, duplicate check, thumbnail checks |
| `compress-upload.ts`, `pdf-first-page.ts` | client only: hash, compress before upload, thumbnail (PDF page 1) |
| `save-attachment.ts` | server: validate, hash, dedupe, upload, insert, clean up (used by register and attach) |
| `arta.ts` | ARTA classes, PH working-day calendar, `addWorkingDays`, `artaProgress`; authoritative for due dates |
| `reply-to.ts`, `alerts.ts` | `parseReplyTo`; bell payload `parseAlerts`, `badgeText` |
| `assign.ts` | `canAssign` (head of the holding office or records desk; mirror of `rms_routes_guard_insert`), `assignableStaff`, `assignmentEvents` (history: assigned / cleared) |
| `needs-action.ts` | `sortNeedsAction` (dashboard "Waiting in my office" order: late, due soon, forwarded, urgent, newest) |
| `copy-request.ts` | `parseCopyForm`, `dpoTag`, `canDecide` (CLO head), `canRelease` (mirrors `rms_copy_decide` / `rms_copy_release`) |
| `satisfaction.ts`, `complaint.ts`, `csv.ts` | survey parsing and report maths, 72-hour complaint clock and channels, CSV cells |
| `eml.ts` | `.eml` intake: `looksLikeEml`, `emlToFields`, `pickAttachments`; `parseEml` loads `postal-mime` lazily, browser only (never on the server) |
| `step-times.ts` | standard minutes per step, `stepKind`, `officeMinutesBetween` (office hours, holidays skipped), `slowSteps` ("Slow" flags in the history) |
| `due.ts`, `retention.ts`, `safe-next.ts` | due dates, retention rules, safe redirects |
| `reports.ts`, `fetch-pages.ts` | report date bounds, bar merging, RPC result parsers, `onTimeSummary`; `fetchPages` (pages past the 1000-row PostgREST cap) |
| `list-size.ts`, `map-tally.ts` | `listSize` (the `?n=` list size, steps of the default, capped); `tallyBarangays` (per-barangay counts for the map) |
| `back-link.ts` | `listQuery`, `recordsBackHref` (record page "Back to search results" keeps the list filters; always a /records path) |
| `settings-diff.ts` | `changedSettings` (which admin settings actually changed) |

`src/components/`: alert-bell, badges, brand, nav-links, lang-toggle, idle-logout,
scan-qr-button, rich, due-calendar, barangay-map, use-upload-prep (compress + thumbnail hook).

## Database: `supabase/`

Tables: rms_profiles, rms_offices, rms_document_types, rms_records,
rms_routes, rms_attachments, rms_audit_log, rms_access_log, rms_settings,
rms_satisfaction, rms_copy_requests, rms_boxes, rms_dispatches, rms_counters, rms_barangays, rms_track_attempts, rms_ai_usage, rms_ai_cache,
rms_private_config, rms_audit_known_forks, rms_seed_records (seed tag,
server-only).

Functions are redefined in later migrations. **Latest definition** lives in:

| Migration | Functions |
| --- | --- |
| `20261120000100_rms_schema` | tables, RLS base, `rms_records_after_insert`, `rms_touch_updated_at` |
| `20261120000200_rms_search_ai_admin` | `rms_search_records` (first version) |
| `20261120000400_rms_security` | `rms_my_role`, `rms_my_office`, `rms_can_view`, soft delete/restore, login lockout, access log, `rms_person_access_report`, `rms_setting` |
| `20261121000100_rms_pentest_fixes` | guard triggers (records guards moved on to 20261124000100; the attachments and routes guards moved on too), `rms_can_attach` (moved on to 20261124000300), `rms_log_event` |
| `20261121000200_rms_public_tracking` | `rms_new_track_code` |
| `20261122000200_rms_qa_wave2` | `rms_search_records`, `rms_public_track`, audit hash function, `rms_today`, `rms_record_bin_history` |
| `20261122000300_rms_ai_budget_scan` | `rms_audit` (audit trigger), `rms_ai_cap`, `rms_ai_spend_summary`, `rms_ai_cache_get` |
| `20261123000100_rms_qa_nov23` | `rms_verify_audit_chain`, `rms_from_app`, `rms_ai_spent`, `rms_ai_reserve`, `rms_ai_finalize`, `rms_ai_cache_put`, `rms_client_ip`, `rms_admin_create_user`, `rms_lock_record`, `rms_routes_guard_insert` (moved on to 20261124000500) |
| `20261123000200_rms_volume_indexes` | `rms_audit_chain` (fast tip lookup), audit/access log indexes, audit hash functions marked parallel safe |
| `20261123000300_rms_legacy_import` | `rms_legacy_import`, `rms_records_before_insert`, `rms_records_set_search`, `rms_routes_apply` (moved on to 20261124000500), owner-only `rms_seed_demo`, `rms_seed_demo_access` |
| `20261123000400_rms_rls_speed` | `rms_my_routed_records`; latest `rms_records_select` and `rms_routes_select` policies (set-based, same visibility as `rms_can_view`) |
| `20261123000500_rms_report_totals` | `rms_report_summary` (moved on to 20261124000400), `rms_report_offices`, `rms_report_retention`, `rms_dashboard_totals` (security invoker, totals only; used by Reports and the dashboard cards) |
| `20261123000600_rms_attachment_compression` | attachment `sha256`, `original_sha256`, `original_size_bytes`, `thumb_path`; `rms_attachments_guard_insert` (moved on to 20261124000300), `rms_storage_is_orphan`, `rms_storage_delete_orphan` policy |
| `20261124000100_rms_arta_replies_alerts` | `rms_records.arta_class`, `rms_records.in_reply_to`; `rms_records_guard_insert` (moved on to 20261124000300, then 20261124000500), `rms_records_guard_update` (moved on to 20261125000100); `rms_my_alerts` (bell); `rms_report_on_time` |
| `20261124000200_rms_audit_check_fast` | `rms_audit_checkpoint` table, `rms_audit_row_ok`, `rms_verify_audit_chain` (latest; incremental checkpoint + rotating scrub), `rms_audit_check_info` |
| `20261124000300_rms_admin_hub` | `rms_records_guard_insert` (moved on to 20261124000500), `rms_routes_guard_insert` (moved on to 20261124000500), `rms_attachments_guard_insert`, `rms_can_attach` (latest; admin cannot register, route or attach), `rms_after_hours`, `rms_admin_security_summary`, `rms_admin_flow_analytics` |
| `20261124000400_rms_charter_offices` | `rms_search_records_v2` (kept for the previous app; v3 in 20261125000100; `rms_search_records` kept too), `rms_report_summary` (latest, adds `by_tx`), `rms_records.transaction_type`, the 22 charter offices upserted by code, demo Records Officer moved to CGSO |
| `20261124000500_rms_assignee` | `rms_records.assigned_to`/`assigned_at` (FK to profiles), `rms_routes.assigned_to` (no FK on purpose); latest `rms_records_guard_insert` (clears the assignee on insert), latest `rms_routes_guard_insert` (assign step: head of holding office or records desk only), `rms_routes_apply` (sets or clears the assignee), `rms_records_guard_update` (moved on to 20261125000100) |
| `20261124000600_rms_satisfaction` | `rms_satisfaction` (no anon access), `rms_track_attempts.kind`, `rms_survey_check`, `rms_survey_submit` (anon RPCs, rate limited), `rms_report_satisfaction`, document type Complaint |
| `20261124000700_rms_copy_requests` | `rms_copy_requests` (insert: records desk only; no update policy), `rms_copy_requests_guard_insert` (DPO need from the source record), `rms_copy_decide` (CLO head only), `rms_copy_release`, document type Request for copy |
| `20261124000800_rms_step_times` | settings key `step_minutes`, `rms_set_step_minutes` (moved on to 20261125000100; records officer only), `rms_settings_guard_step_minutes` (trigger: nobody else writes the key) |
| `20261125000100_rms_boxes_dispatch` | `rms_boxes` (records desk writes, staff read, admin none), `rms_boxes_guard`, `rms_records.box_id`, `rms_set_record_box` (any status, logged in history), `rms_box_list`, `rms_search_records_v3`, `rms_dispatches` (written only by RPCs), `rms_release_record`, `rms_record_delivery`, `rms_report_released`; latest `rms_records_guard_update` (box_id, QA-049 admin edits only confidentiality) and `rms_set_step_minutes` (QA-050) |

Seeds: `seed.sql` (offices, types, demo users), `seed_more.sql`,
`seed_batch3.sql` (generated by `tools/gen_*.py`; large, grep only).
`supabase/seed_volume.sql`: runner for the volume seed (owner-only, one call
per month, with size/verify/EXPLAIN checks).
SQL tests: `supabase/tests/{access_rules,pentest_rules}.sql`.

## Tests: `tests/`

One Vitest file per lib module (`workflow`, `qr`, `deepseek`, `ai-budget`,
`retention`, `safe-next`, `watermark`, ...). No UI tests.

## Resilience

| Path | What |
| --- | --- |
| `src/lib/health.ts`, `src/app/api/health/route.ts` | `/api/health` (public, no cookies; calls `rms_today`); test `tests/health.test.ts` |
| `scripts/backup/` | `lib.sh` (helpers), `backup.sh`, `restore-drill.sh`, `audit-check.sh`, `pull-to-d-drive.ps1` |
| `.github/workflows/` | `backup`, `restore-drill`, `audit-check`, `uptime`, `ci`, `codeql`; `.github/dependabot.yml` |
| `docs/` | `backups.md`, `restore-drill.md`, `recovery-runbook.md`, `paper-fallback.md` |

Design: `docs/design/` (principles, checklist), `scripts/design-check/check.mjs`
(`npm run design-check`, axe-core + house checks), `.claude/agents/designer.md`.

Secret-dependent jobs skip (exit 0) when their GitHub secrets are missing.

## Docs: `docs/`

`system-analysis.md` (use cases, ERD), `user-manual.md`, `email-intake.md` (future Cloudflare Email Routing intake), `turnover-guide.md`,
`security-test-report.md`, `demo-video-script.md`. Read only when the task is
about them.
