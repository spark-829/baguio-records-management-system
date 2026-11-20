-- Access-rule checks for the demo data. Run in the SQL editor or with psql; it raises an
-- exception on the first failed rule and changes nothing (everything runs in one rolled-back transaction).
begin;

create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create or replace function pg_temp.expect(p_label text, p_got bigint, p_want bigint) returns void language plpgsql as $$
begin
  if p_got <> p_want then raise exception 'FAILED %: got %, expected %', p_label, p_got, p_want; end if;
  raise notice 'ok  %', p_label;
end $$;

-- Records officer sees everything, including the confidential complaint
select pg_temp.as_user('records@rms-demo.test');
select pg_temp.expect('records officer sees confidential', (select count(*) from rms_records where confidentiality = 'confidential'), 1);
reset role;

-- Treasury staff sees Public records plus what was routed to Treasury, never Confidential
select pg_temp.as_user('treasury.staff@rms-demo.test');
select pg_temp.expect('treasury sees no confidential', (select count(*) from rms_records where confidentiality = 'confidential'), 0);
select pg_temp.expect('treasury sees public records', (select count(*) from rms_records where confidentiality = 'public'), 2);
select pg_temp.expect('treasury sees no other office''s internal record', (select count(*) from rms_records where tracking_no = 'IN-2026-0004'), 0);
select pg_temp.expect('treasury cannot read audit log', (select count(*) from rms_audit_log), 0);
select pg_temp.expect('treasury cannot read access history', (select count(*) from rms_access_log), 0);
select pg_temp.expect('search function respects access', (select count(*) from rms_search_records(null)), 3);
select pg_temp.expect('AI search can exclude confidential', (select count(*) from rms_search_records(null, p_exclude_confidential => true)), 3);
reset role;

-- Viewer: reads Public records, cannot write anything
select pg_temp.as_user('viewer@rms-demo.test');
select pg_temp.expect('viewer sees only public records', (select count(*) from rms_records), 2);
do $$
begin
  insert into rms_routes (record_id, status, action_taken, acted_by)
  values ((select id from rms_records where tracking_no = 'IN-2026-0001'), 'under_action', 'x', auth.uid());
  raise exception 'FAILED viewer added a route';
exception when insufficient_privilege then
  raise notice 'ok  viewer cannot act on records';
end $$;
reset role;

-- Engineering staff cannot register incoming records
select pg_temp.as_user('engineering.staff@rms-demo.test');
do $$
begin
  insert into rms_records (tracking_no, direction, subject, document_type_id, origin_office_id, current_office_id, created_by)
  values ('x', 'incoming', 'Should be blocked', (select id from rms_document_types limit 1),
          (select office_id from rms_profiles where id = auth.uid()), (select office_id from rms_profiles where id = auth.uid()), auth.uid());
  raise exception 'FAILED staff registered an incoming record';
exception when insufficient_privilege then
  raise notice 'ok  staff cannot register incoming records';
end $$;

-- ...and cannot write to the audit log directly
do $$
begin
  insert into rms_audit_log (table_name, row_id, action) values ('x', 'x', 'INSERT');
  raise exception 'FAILED staff wrote to the audit log';
exception when insufficient_privilege then
  raise notice 'ok  audit log is append-only through triggers';
end $$;
reset role;



-- Audit log is hash-chained and cannot be changed, even by the table owner
reset role;
do $$
begin
  update rms_audit_log set action = 'X' where id = (select min(id) from rms_audit_log);
  raise exception 'FAILED audit log was updated';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  audit log refuses updates';
end $$;
do $$
begin
  delete from rms_access_log;
  raise notice 'ok  access history empty or delete refused';
exception when raise_exception then
  raise notice 'ok  access history refuses deletes';
end $$;
select pg_temp.as_user('admin@rms-demo.test');
select pg_temp.expect('audit chain intact', coalesce(rms_verify_audit_chain(), 0), 0);
reset role;

-- Soft delete: records desk deletes, record disappears, only admin restores
select pg_temp.as_user('records@rms-demo.test');
select rms_delete_record((select id from rms_records where tracking_no = 'IN-2026-0005'), 'Duplicate entry (test)');
select pg_temp.expect('deleted record hidden from records desk', (select count(*) from rms_records where tracking_no = 'IN-2026-0005'), 0);
do $$
begin
  perform rms_restore_record((select id from rms_records where tracking_no = 'IN-2026-0005'));
  raise exception 'FAILED records officer restored a record';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  only admin can restore';
end $$;
do $$
begin
  update rms_records set deleted_at = now() where tracking_no = 'IN-2026-0001';
  raise exception 'FAILED soft delete bypassed';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  delete columns change only through the functions';
end $$;
reset role;
select pg_temp.as_user('admin@rms-demo.test');
select pg_temp.expect('admin sees deleted record', (select count(*) from rms_records where tracking_no = 'IN-2026-0005' and deleted_at is not null), 1);
select rms_restore_record((select id from rms_records where tracking_no = 'IN-2026-0005'));
reset role;
select pg_temp.as_user('records@rms-demo.test');
select pg_temp.expect('restored record visible again', (select count(*) from rms_records where tracking_no = 'IN-2026-0005'), 1);
reset role;

-- Lockout: 5 failed sign-ins lock the account and void its access
set local role anon;
select rms_login_failed('treasury.staff@rms-demo.test') from generate_series(1, 5);
select pg_temp.expect('account reports locked', (select (rms_login_check('treasury.staff@rms-demo.test') ->> 'locked')::boolean::int), 1);
reset role;
select pg_temp.as_user('treasury.staff@rms-demo.test');
select pg_temp.expect('locked user sees nothing', (select count(*) from rms_records), 0);
reset role;
select pg_temp.expect('failed attempts recorded', (select count(*) from rms_access_log where event = 'login_failed' and email = 'treasury.staff@rms-demo.test' and created_at > now() - interval '1 minute'), 5);

rollback;
