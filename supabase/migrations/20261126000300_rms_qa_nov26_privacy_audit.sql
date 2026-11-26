-- QA privacy and audit batch, 2026-11-26: QA-097, QA-098, QA-100.
-- Idempotent. No DROP or DELETE statements. Waiting for Vic's okay before it is applied (2026-11-26).
-- Until then the app keeps working: auditor flag reads as false and access-log calls for export and AI fail quietly.
--
-- QA-097  Independent read-only auditor. A Viewer (read-only) account flagged is_auditor (for example a
--         COA resident auditor) may read the audit trail and access history, check the audit chain and run
--         the person-access report, without any admin power. The demo viewer account is flagged.
-- QA-098  Document type for data privacy requests (correction or objection); the app gives it and
--         requests for copy a due date.
-- QA-100  rms_log_access_many writes one access-log line per record for a CSV export, an AI summary or the
--         records the assistant read (event view_record, detail.via = export / ai_summary / ai_chat), and the
--         person-access report shows that "via" as the event.

-- QA-097 ----------------------------------------------------------------------------------------------
alter table public.rms_profiles add column if not exists is_auditor boolean not null default false;
grant select (is_auditor) on public.rms_profiles to authenticated;

create or replace function public.rms_is_auditor()
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(public.rms_my_role() = 'viewer', false)
     and exists (select 1 from public.rms_profiles p where p.id = (select auth.uid()) and p.is_auditor)
$function$;
revoke all on function public.rms_is_auditor() from public, anon;
grant execute on function public.rms_is_auditor() to authenticated;

-- Only an administrator may set or clear the flag, and only on Viewer accounts.
create or replace function public.rms_profiles_guard_auditor()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.is_auditor is distinct from coalesce(old.is_auditor, false) then
    if coalesce(public.rms_my_role() = 'admin', false) is false and auth.uid() is not null then
      raise exception 'Only an administrator can mark an account as auditor';
    end if;
    if new.is_auditor and new.role <> 'viewer' then
      raise exception 'Only Viewer (read-only) accounts can be auditors';
    end if;
  end if;
  return new;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'rms_profiles_guard_auditor' and tgrelid = 'public.rms_profiles'::regclass) then
    create trigger rms_profiles_guard_auditor before insert or update on public.rms_profiles
      for each row execute function public.rms_profiles_guard_auditor();
  end if;

  alter policy rms_audit_select on public.rms_audit_log
    using ((select public.rms_my_role()) = 'admin' or (select public.rms_is_auditor()));
  alter policy rms_access_log_select on public.rms_access_log
    using ((select public.rms_my_role()) = 'admin' or (select public.rms_is_auditor()));
end $$;

-- The two read-only audit check functions open to auditors: only their "admins only" guard line changes.
do $$
declare
  f text;
  d text;
begin
  foreach f in array array['public.rms_verify_audit_chain()', 'public.rms_audit_check_info()'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('rms_is_auditor' in d) = 0 then
      d := replace(d,
        $g$if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;$g$,
        $g$if public.rms_my_role() is distinct from 'admin' and not public.rms_is_auditor() then raise exception 'admins and auditors only'; end if;$g$);
      execute d;
    end if;
  end loop;
end $$;

update public.rms_profiles p set is_auditor = true
from auth.users u
where u.id = p.id and u.email = 'viewer@rms-demo.test' and p.role = 'viewer' and not p.is_auditor;

-- QA-098 ----------------------------------------------------------------------------------------------
insert into public.rms_document_types (name, retention_years, series_code, series_title)
values ('Data privacy request (correction or objection)', 5, 'CS-DPR', 'Data subject requests (Data Privacy Act)')
on conflict (name) do nothing;

-- QA-100 ----------------------------------------------------------------------------------------------
create or replace function public.rms_log_access_many(p_via text, p_record_ids uuid[], p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_email text;
begin
  if p_via not in ('export', 'ai_summary', 'ai_chat') then raise exception 'event not allowed'; end if;
  if auth.uid() is null or public.rms_my_role() is null then raise exception 'not an RMS user'; end if;
  if coalesce(array_length(p_record_ids, 1), 0) = 0 then return; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.rms_access_log (event, user_id, email, record_id, ip, user_agent, detail)
  select 'view_record', auth.uid(), v_email, r.id, public.rms_client_ip(), public.rms_request_header('x-rms-user-agent'),
         jsonb_build_object('via', p_via) || coalesce(p_detail, '{}')
  from (select distinct unnest(p_record_ids[1:500]) as id) r
  where public.rms_can_view(r.id);
end $function$;
revoke all on function public.rms_log_access_many(text, uuid[], jsonb) from public, anon;
grant execute on function public.rms_log_access_many(text, uuid[], jsonb) to authenticated;

create or replace function public.rms_person_access_report(p_person text)
returns table(tracking_no text, subject text, record_id uuid, event text, accessed_by text, ip text, accessed_at timestamptz)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if public.rms_my_role() is distinct from 'admin' and not public.rms_is_auditor() then raise exception 'admins and auditors only'; end if;
  if length(coalesce(trim(p_person), '')) < 3 then raise exception 'enter at least 3 letters of the name'; end if;
  return query
    select r.tracking_no, r.subject, r.id, coalesce(a.detail ->> 'via', a.event), coalesce(pr.full_name, a.email), a.ip, a.created_at
    from public.rms_records r
    join public.rms_access_log a on a.record_id = r.id
    left join public.rms_profiles pr on pr.id = a.user_id
    where concat_ws(' ', r.sender_name, r.sender_org, r.recipient_name, r.recipient_org) ilike '%' || trim(p_person) || '%'
    order by a.created_at desc
    limit 500;
end $function$;
