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

-- Treasury staff sees only what was routed to Treasury, never confidential records
select pg_temp.as_user('treasury.staff@rms-demo.test');
select pg_temp.expect('treasury sees no confidential', (select count(*) from rms_records where confidentiality = 'confidential'), 0);
select pg_temp.expect('treasury sees no engineering-only record', (select count(*) from rms_records where tracking_no = 'OUT-2026-0001'), 0);
select pg_temp.expect('treasury cannot read audit log', (select count(*) from rms_audit_log), 0);
select pg_temp.expect('search function respects access', (select count(*) from rms_search_records(null)), 1);
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

rollback;
