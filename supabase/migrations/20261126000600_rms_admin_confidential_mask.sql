-- Role review 2026-11-26 (Vic chose "List only, confidential masked"): the Administrator is the security hub
-- and does no records work, so it no longer reads confidential records (DPA least privilege).
-- Idempotent. No DROP or DELETE.
--
-- * rms_records_select and rms_can_view: admin sees every record EXCEPT confidential ones. Everything built on
--   them follows: record page, search, assistant sources, AI summary, attachments (and downloads), routes,
--   copy requests, dispatches, reports. The records desk (custodian) and the holding office head still see them.
-- * rms_admin_bin(): the Bin keeps listing every deleted record, confidential ones with the subject hidden,
--   so the admin can still restore them (rms_restore_record is unchanged and works by id).
-- * rms_person_access_report: confidential subjects are hidden from the admin (auditors still see them).

alter policy rms_records_select on public.rms_records
  using (
    ((select public.rms_my_role()) is not null)
    and ((deleted_at is null) or ((select public.rms_my_role()) = 'admin'))
    and (
      ((select public.rms_my_role()) = 'records_officer'::public.rms_role)
      or (((select public.rms_my_role()) = 'admin'::public.rms_role) and (confidentiality <> 'confidential'))
      or (((origin_office_id = (select public.rms_my_office())) or (current_office_id = (select public.rms_my_office())))
          and ((confidentiality <> 'confidential') or ((select public.rms_my_role()) = 'dept_head')))
      or ((confidentiality in ('public', 'internal')) and (id in (select public.rms_my_routed_records())))
    )
  );

create or replace function public.rms_can_view(p_record_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.rms_records r
    cross join lateral (select public.rms_my_role() as role, public.rms_my_office() as office) me
    where r.id = p_record_id
      and me.role is not null
      and (r.deleted_at is null or me.role = 'admin')
      and (
        me.role = 'records_officer'
        or (me.role = 'admin' and r.confidentiality <> 'confidential')
        or (r.created_by = auth.uid() and coalesce(r.intake_window, false) and r.origin_office_id = me.office)
        or (
          (r.origin_office_id = me.office
            or r.current_office_id = me.office
            or exists (select 1 from public.rms_routes rt where rt.record_id = r.id and rt.to_office_id = me.office))
          and (r.confidentiality in ('public', 'internal')
               or (me.role = 'dept_head' and (r.origin_office_id = me.office or r.current_office_id = me.office)))
        )
      )
  )
$function$;

create or replace function public.rms_admin_bin()
returns table(id uuid, tracking_no text, subject text, confidential boolean, deleted_at timestamptz, delete_reason text, deleted_by_name text)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  return query
    select r.id, r.tracking_no,
           case when r.confidentiality = 'confidential' then null else r.subject end,
           r.confidentiality = 'confidential',
           r.deleted_at, r.delete_reason, p.full_name
    from public.rms_records r
    left join public.rms_profiles p on p.id = r.deleted_by
    where r.deleted_at is not null
    order by r.deleted_at desc
    limit 500;
end $function$;
revoke all on function public.rms_admin_bin() from public, anon;
grant execute on function public.rms_admin_bin() to authenticated;

create or replace function public.rms_person_access_report(p_person text)
returns table(tracking_no text, subject text, record_id uuid, event text, accessed_by text, ip text, accessed_at timestamptz)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_auditor boolean := public.rms_is_auditor();
begin
  if public.rms_my_role() is distinct from 'admin' and not v_auditor then raise exception 'admins and auditors only'; end if;
  if length(coalesce(trim(p_person), '')) < 3 then raise exception 'enter at least 3 letters of the name'; end if;
  return query
    select r.tracking_no,
           case when r.confidentiality = 'confidential' and not v_auditor then '(confidential)' else r.subject end,
           r.id, coalesce(a.detail ->> 'via', a.event), coalesce(pr.full_name, a.email), a.ip, a.created_at
    from public.rms_records r
    join public.rms_access_log a on a.record_id = r.id
    left join public.rms_profiles pr on pr.id = a.user_id
    where concat_ws(' ', r.sender_name, r.sender_org, r.recipient_name, r.recipient_org) ilike '%' || trim(p_person) || '%'
    order by a.created_at desc
    limit 500;
end $function$;

-- Access history "filter by record": admins can no longer select confidential records, so the tracking number is
-- turned into an id here (id only, no content). Admins and auditors only.
create or replace function public.rms_record_id_by_tracking(p_tracking text)
returns uuid
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if public.rms_my_role() is distinct from 'admin' and not public.rms_is_auditor() then raise exception 'admins and auditors only'; end if;
  return (select r.id from public.rms_records r where r.tracking_no = upper(trim(left(p_tracking, 40))) limit 1);
end $function$;
revoke all on function public.rms_record_id_by_tracking(text) from public, anon;
grant execute on function public.rms_record_id_by_tracking(text) to authenticated;

-- is_auditor stays readable (the table-level revoke in 20261126000100 also drops this column grant when re-run).
grant select (is_auditor) on public.rms_profiles to authenticated;
