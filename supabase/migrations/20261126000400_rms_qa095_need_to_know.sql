-- QA-095 (High, 2026-11-26): need-to-know access to records. NOT APPLIED until Vic says so.
-- Idempotent. No DROP or DELETE statements.
--
-- Before: any signed-in staff member could read every "public" record of every office through the REST API,
-- with the full sender name, description, scanned text (OCR) and the history notes (rms_routes remarks).
-- Name masking was only done by the web pages.
--
-- After: office staff, office heads and viewers see a record only when their office is involved: it came
-- from or sits in their office, it was sent to their office, or they took it in at their window. This now
-- holds for "public" records too. The records desk and the administrator keep city-wide access, and the
-- CMO/CAO city view keeps working (it uses its own read-only, masked functions). History notes follow the
-- record, because rms_routes is readable only for records the user can see. Public tracking (/track) is
-- unaffected. Confidential rules do not change.

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
        me.role in ('admin', 'records_officer')
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

alter policy rms_records_select on public.rms_records
  using (
    ((select public.rms_my_role()) is not null)
    and ((deleted_at is null) or ((select public.rms_my_role()) = 'admin'))
    and (
      ((select public.rms_my_role()) = any (array['admin'::public.rms_role, 'records_officer'::public.rms_role]))
      or (((origin_office_id = (select public.rms_my_office())) or (current_office_id = (select public.rms_my_office())))
          and ((confidentiality <> 'confidential') or ((select public.rms_my_role()) = 'dept_head')))
      or ((confidentiality in ('public', 'internal')) and (id in (select public.rms_my_routed_records())))
    )
  );
