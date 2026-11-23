-- Baguio RMS: volume seed runner (paper-logbook style history, about 150 MB).
-- NOT a migration. Run these steps by hand as the database owner (SQL editor / MCP), in order.
-- Nothing here runs by itself. Needs 20261123000200 and 20261123000300 applied first.
--
-- All data goes through the normal triggers (audit chain, search vector, tracking numbers) in import mode
-- (see rms_legacy_import). Seeded records are tagged in rms_seed_records (batch 'volume-2026-11');
-- seeded access rows carry detail = {"seed": "volume-2026-11"}. Names are fictional.
-- Run each numbered block as its own call, and look at the result before the next block.

-- ============================================================================================
-- 0. Preflight
-- ============================================================================================
select session_user, current_user, current_setting('role', true) as role_setting;   -- postgres / postgres / none
select public.rms_legacy_import() as flag_off_is_false;                           -- false (flag not set yet)

select (select count(*) from public.rms_records) as records,
       (select count(*) from public.rms_routes) as routes,
       (select count(*) from public.rms_audit_log) as audit_rows,
       (select count(*) from public.rms_access_log) as access_rows,
       (select count(*) from public.rms_profiles) as profiles;

select direction, year, last_value from public.rms_counters order by year, direction;   -- 2026: incoming 64, outgoing 10

select relname, pg_size_pretty(pg_total_relation_size(c.oid)) as total
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and relname like 'rms\_%'
 order by pg_total_relation_size(c.oid) desc;
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- The fast chain tip lookup of rms_audit_chain (20261123000200) must show an Index Scan on
-- rms_audit_log_created_id_idx and a Nested Loop Anti Join on rms_audit_log_prev_hash_idx.
explain
select a.row_hash
  from (select n.row_hash, n.created_at, n.id
          from public.rms_audit_log n
         order by n.created_at desc, n.id desc
         limit 64) a
 where not exists (select 1 from public.rms_audit_log c where c.prev_hash = a.row_hash)
 order by a.created_at desc, a.id desc
 limit 1;

-- ============================================================================================
-- 1. Security checks (each block ends in rollback; run them one at a time)
-- ============================================================================================
-- 1a. As staff: setting the flag changes nothing, and the generators cannot be called.
begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id from auth.users where email = 'engineering.staff@rms-demo.test'),
                                    'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('rms.import', 'on', true);
select public.rms_legacy_import() as must_be_false;
rollback;

begin;
set local role authenticated;
select public.rms_seed_demo('2025-03-01', '2025-03-31', 'trial', 11);   -- expect: permission denied for function rms_seed_demo
rollback;

-- 1b. As the records officer: a normal insert still gets the next number, status registered and updated_at = now(),
--     and a forward route still moves the record.
begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id from auth.users where email = 'records@rms-demo.test'),
                                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_id uuid;
  v_no text;
  v_status public.rms_status;
  v_upd timestamptz;
  v_ceo uuid := (select id from public.rms_offices where code = 'CEO');
  v_cur uuid;
begin
  insert into public.rms_records (direction, subject, document_type_id, origin_office_id)
  values ('incoming', 'Import safety check', (select id from public.rms_document_types where name = 'Letter'),
          (select id from public.rms_offices where code = 'CMO'))
  returning id, tracking_no into v_id, v_no;
  select status, updated_at into v_status, v_upd from public.rms_records where id = v_id;
  raise notice 'new number % (expect IN-2026-%)', v_no, lpad(((select last_value from public.rms_counters where direction = 'incoming' and year = 2026))::text, 4, '0');
  assert v_status = 'registered', 'status must be registered';
  assert v_upd = now(), 'updated_at must be now()';
  insert into public.rms_routes (record_id, status, to_office_id, action_taken)
  values (v_id, 'forwarded', v_ceo, 'Sent to City Engineering Office');
  select current_office_id into v_cur from public.rms_records where id = v_id;
  assert v_cur = v_ceo, 'the forward route must still move the record';
  raise notice 'security checks passed';
end $$;
rollback;

-- ============================================================================================
-- 2. Trial month inside a transaction that is rolled back
-- ============================================================================================
-- Look at: records/routes/audit rows added, size added, elapsed time, and the verify time as admin.
-- The actor id below is the admin profile (audit rows show who imported the data).
begin;
create temp table trial_before on commit drop as
select (select count(*) from public.rms_records) as records, (select count(*) from public.rms_routes) as routes,
       (select count(*) from public.rms_audit_log) as audit_rows, (select count(*) from public.rms_access_log) as access_rows,
       pg_total_relation_size('public.rms_records') + pg_total_relation_size('public.rms_routes')
         + pg_total_relation_size('public.rms_audit_log') + pg_total_relation_size('public.rms_seed_records') as bytes_records,
       pg_total_relation_size('public.rms_access_log') as bytes_access;
do $$
declare t0 timestamptz := clock_timestamp(); n int; m int;
begin
  n := public.rms_seed_demo('2025-03-01', '2025-03-31', 'trial', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
  raise notice 'records: % in % s', n, extract(epoch from clock_timestamp() - t0);
  t0 := clock_timestamp();
  m := public.rms_seed_demo_access('2025-03-01', '2025-03-31', 'trial', 4);
  raise notice 'access rows: % in % s', m, extract(epoch from clock_timestamp() - t0);
end $$;
select a.records - b.records as new_records,
       a.routes - b.routes as new_routes,
       a.audit_rows - b.audit_rows as new_audit_rows,
       a.access_rows - b.access_rows as new_access_rows,
       pg_size_pretty(a.bytes_records - b.bytes_records) as size_records_phase,
       round((a.bytes_records - b.bytes_records)::numeric / nullif(a.records - b.records, 0)) as bytes_per_record,
       round((a.bytes_access - b.bytes_access)::numeric / nullif(a.access_rows - b.access_rows, 0)) as bytes_per_access_row
  from trial_before b,
       (select (select count(*) from public.rms_records) as records, (select count(*) from public.rms_routes) as routes,
               (select count(*) from public.rms_audit_log) as audit_rows, (select count(*) from public.rms_access_log) as access_rows,
               pg_total_relation_size('public.rms_records') + pg_total_relation_size('public.rms_routes')
                 + pg_total_relation_size('public.rms_audit_log') + pg_total_relation_size('public.rms_seed_records') as bytes_records,
               pg_total_relation_size('public.rms_access_log') as bytes_access) a;
-- verify as admin (must be null = intact), with the time it takes
select set_config('request.jwt.claims',
                  json_build_object('sub', '3d63de38-a3dc-4d97-ac39-d22fd405a4d9', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare t0 timestamptz := clock_timestamp(); v_bad bigint;
begin
  v_bad := public.rms_verify_audit_chain();
  raise notice 'verify: first bad id % in % s', v_bad, extract(epoch from clock_timestamp() - t0);
end $$;
rollback;
-- Also check the trial text: average content_text length should be about 2,000 (run before the rollback if wanted):
--   select round(avg(length(content_text))), min(length(content_text)), max(length(content_text))
--     from public.rms_records r join public.rms_seed_records s on s.record_id = r.id and s.batch = 'trial';

-- ============================================================================================
-- 3. Budget formulas (use the trial numbers)
-- ============================================================================================
--   us_per_audit_row     = verify seconds * 1e6 / audit rows at verify time
--   R_max                = (2.5 s / us_per_audit_row - current_audit_rows) / (1 + avg_routes_per_record)
--   p_per_workday        = R_max / about 490 workdays   (2024-12 to 2026-11)
--   access_rows          = (150 MB - size_after_records_phase) / bytes_per_access_row
--   p_views_per_route    = (access_rows - session_rows) / seeded_routes
-- Use the resulting p_per_workday in place of the 11 below (11 is the default and gives about 5,400 records).

-- ============================================================================================
-- 4. Records phase: one call per month, in order. Check the result of each before the next.
--    If a call takes more than about 20 s, split that month into two half-month windows.
--    Check the size every 6 months (block 4z). Dates after today are refused.
-- ============================================================================================
select public.rms_seed_demo('2024-12-01', '2024-12-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-01-01', '2025-01-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-02-01', '2025-02-28', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-03-01', '2025-03-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-04-01', '2025-04-30', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-05-01', '2025-05-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
-- 4z. size check
select (select count(*) from public.rms_records) as records, (select count(*) from public.rms_audit_log) as audit_rows,
       pg_size_pretty(pg_database_size(current_database())) as database_size;
select public.rms_seed_demo('2025-06-01', '2025-06-30', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-07-01', '2025-07-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-08-01', '2025-08-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-09-01', '2025-09-30', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-10-01', '2025-10-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2025-11-01', '2025-11-30', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
-- 4z. size check (repeat the select above)
select public.rms_seed_demo('2025-12-01', '2025-12-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-01-01', '2026-01-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-02-01', '2026-02-28', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-03-01', '2026-03-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-04-01', '2026-04-30', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-05-01', '2026-05-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
-- 4z. size check (repeat the select above)
select public.rms_seed_demo('2026-06-01', '2026-06-30', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-07-01', '2026-07-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-08-01', '2026-08-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-09-01', '2026-09-30', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-10-01', '2026-10-31', 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');
select public.rms_seed_demo('2026-11-01', public.rms_today(), 'volume-2026-11', 11, '3d63de38-a3dc-4d97-ac39-d22fd405a4d9');

-- ============================================================================================
-- 5. Analyze, then time the chain verification as admin. Stop adding records if it is over 2.5 s.
-- ============================================================================================
analyze public.rms_records;
analyze public.rms_routes;
analyze public.rms_audit_log;
analyze public.rms_access_log;
analyze public.rms_seed_records;

begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', '3d63de38-a3dc-4d97-ac39-d22fd405a4d9', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare t0 timestamptz := clock_timestamp(); v_bad bigint;
begin
  v_bad := public.rms_verify_audit_chain();
  raise notice 'verify: first bad id % (null = intact) in % s', v_bad, extract(epoch from clock_timestamp() - t0);
end $$;
rollback;

-- ============================================================================================
-- 6. Access phase: monthly calls, check the size after each, stop at about 150 MB, then analyze.
--    Use p_views_per_route from the budget formula (4 is the default).
-- ============================================================================================
select public.rms_seed_demo_access('2024-12-01', '2024-12-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-01-01', '2025-01-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-02-01', '2025-02-28', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-03-01', '2025-03-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-04-01', '2025-04-30', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-05-01', '2025-05-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-06-01', '2025-06-30', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-07-01', '2025-07-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-08-01', '2025-08-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-09-01', '2025-09-30', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-10-01', '2025-10-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-11-01', '2025-11-30', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2025-12-01', '2025-12-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-01-01', '2026-01-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-02-01', '2026-02-28', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-03-01', '2026-03-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-04-01', '2026-04-30', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-05-01', '2026-05-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-06-01', '2026-06-30', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-07-01', '2026-07-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-08-01', '2026-08-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-09-01', '2026-09-30', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-10-01', '2026-10-31', 'volume-2026-11', 4);
select public.rms_seed_demo_access('2026-11-01', public.rms_today(), 'volume-2026-11', 4);
-- size check after each call (or every few):
select pg_size_pretty(pg_database_size(current_database())) as database_size,
       (select count(*) from public.rms_access_log) as access_rows;
analyze public.rms_access_log;

-- ============================================================================================
-- 7. Sanity checks
-- ============================================================================================
-- 7a. Open and overdue (expect about 60-150, mostly in the last 45 days)
select count(*) as overdue_open
  from public.rms_records
 where deleted_at is null and status not in ('completed', 'released', 'archived') and due_date < public.rms_today();
select (created_at at time zone 'Asia/Manila')::date >= public.rms_today() - 45 as last_45_days, count(*)
  from public.rms_records
 where deleted_at is null and status not in ('completed', 'released', 'archived') and due_date < public.rms_today()
 group by 1;
-- 7b. Status mix by age (older records should be mostly archived or completed)
select case when created_at > now() - interval '30 days' then '0-30 d'
            when created_at > now() - interval '90 days' then '30-90 d'
            when created_at > now() - interval '365 days' then '90-365 d' else 'older' end as age,
       status, count(*)
  from public.rms_records
 group by 1, 2 order by 1, 2;
-- 7c. Each seeded record's status and office equal its newest route (expect 0 rows)
select r.tracking_no
  from public.rms_records r
  join public.rms_seed_records s on s.record_id = r.id
  join lateral (select x.status, x.to_office_id from public.rms_routes x
                 where x.record_id = r.id order by x.created_at desc, x.id desc limit 1) last on true
 where r.status is distinct from last.status or r.current_office_id is distinct from last.to_office_id
 limit 20;
-- 7d. Tracking numbers are unique (expect 0 rows) and the 2026 counters are ahead of the highest number
select tracking_no, count(*) from public.rms_records group by 1 having count(*) > 1;
select c.direction, c.last_value,
       (select max(substring(r.tracking_no from '[0-9]+$')::int) from public.rms_records r
         where r.direction = c.direction and r.tracking_no like '%-2026-%') as max_number
  from public.rms_counters c where c.year = 2026;
-- 7e. Audit chain still intact: run block 5 (verify as admin) again, expect null.

-- ============================================================================================
-- 8. EXPLAIN harness per role. Pass: each query under 300 ms, verify under 2.5 s.
-- ============================================================================================
-- First get one seeded record to use below (as the owner):
--   select r.id as record_id, r.tracking_no, r.track_code
--     from public.rms_records r join public.rms_seed_records s on s.record_id = r.id
--    where (select count(*) from public.rms_routes x where x.record_id = r.id) >= 5 limit 1;
-- Template (repeat per role and per query; change the email and <Q>):
--   begin;
--   select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = '<EMAIL>'),
--                                                             'role', 'authenticated')::text, true);
--   set local role authenticated;
--   set local statement_timeout = '8s';
--   explain (analyze, buffers) <Q>;
--   rollback;
-- Roles (emails): admin@rms-demo.test, records@rms-demo.test, engineering.head@rms-demo.test,
--                 engineering.staff@rms-demo.test, viewer@rms-demo.test
--
-- Q1  dashboard: newest 500 records with their current office
--   select r.id, r.tracking_no, r.subject, r.status, r.priority, r.due_date, r.created_at, o.code, o.name
--     from public.rms_records r join public.rms_offices o on o.id = r.current_office_id
--    where r.deleted_at is null order by r.created_at desc limit 500
-- Q2  search (run three times)
--   select * from public.rms_search_records(null, p_limit => 100)
--   select * from public.rms_search_records('drainage', p_overdue => true, p_limit => 100)
--   select * from public.rms_search_records(null, p_person => 'Dulnuan', p_limit => 100)
-- Q3  /reports: newest 1000 with type and office
--   select r.id, r.status, r.direction, r.created_at, r.due_date, r.tracking_no, r.subject, t.name as doc_type, o.code, o.name
--     from public.rms_records r
--     left join public.rms_document_types t on t.id = r.document_type_id
--     left join public.rms_offices o on o.id = r.current_office_id
--    where r.deleted_at is null order by r.created_at desc limit 1000
-- Q4  /reports/offices: newest 1000 with their routes
--   select r.id, r.status, r.due_date, r.created_at, r.current_office_id, rt.routes
--     from public.rms_records r
--     left join lateral (select json_agg(json_build_object('status', x.status, 'created_at', x.created_at,
--                                                          'to_office_id', x.to_office_id)) as routes
--                          from public.rms_routes x where x.record_id = r.id) rt on true
--    where r.deleted_at is null order by r.created_at desc limit 1000
-- Q5  /reports/retention: oldest 1000 finished records with type and routes
--   select r.id, r.tracking_no, r.subject, r.status, t.name, t.retention_years, rt.routes
--     from public.rms_records r
--     left join public.rms_document_types t on t.id = r.document_type_id
--     left join lateral (select json_agg(json_build_object('status', x.status, 'created_at', x.created_at)) as routes
--                          from public.rms_routes x where x.record_id = r.id) rt on true
--    where r.deleted_at is null and r.status in ('completed', 'released', 'archived')
--    order by r.created_at limit 1000
-- Q6  /map: barangay not null, newest 1000
--   select r.id, r.barangay, r.status from public.rms_records r
--    where r.barangay is not null and r.deleted_at is null order by r.created_at desc limit 1000
-- Q7  record detail (use the record_id from above)
--   select x.* from public.rms_routes x where x.record_id = '<RECORD_ID>' order by x.created_at
--   select * from public.rms_record_bin_history('<RECORD_ID>')
-- Q8  /admin/audit (admin only): newest 50, one table, and verify
--   select * from public.rms_audit_log order by created_at desc, id desc limit 50
--   select * from public.rms_audit_log where table_name = 'rms_records' order by created_at desc limit 50
--   select public.rms_verify_audit_chain()
-- Q9  /admin/access (admin only): newest 50, one event, one user, and the person report
--   select * from public.rms_access_log order by created_at desc limit 50
--   select * from public.rms_access_log where event = 'login_failed' order by created_at desc limit 50
--   select * from public.rms_access_log where user_id = (select id from auth.users where email = 'records@rms-demo.test')
--    order by created_at desc limit 50
--   select * from public.rms_person_access_report('Dulnuan')
-- Q10 /admin/bin
--   select id, tracking_no, subject, deleted_at, delete_reason from public.rms_records
--    where deleted_at is not null order by deleted_at desc limit 100
-- Q11 /track as anon (no claims; use set local role anon instead of authenticated)
--   select public.rms_public_track('<TRACKING_NO>', '<TRACK_CODE>')
-- Q12 CSV export (same as Q2 with a bigger limit)
--   select * from public.rms_search_records(null, p_limit => 200)
-- Q13 counts as staff and as viewer (engineering.staff, viewer)
--   select count(*) from public.rms_records

-- ============================================================================================
-- 9. Final note
-- ============================================================================================
-- If Q2 or Q13 for staff or dept_head is over 1 s, the row-level security rule on rms_records needs a follow-up
-- rewrite (for example, a per-office lookup instead of a per-row function). That is not part of this change.
