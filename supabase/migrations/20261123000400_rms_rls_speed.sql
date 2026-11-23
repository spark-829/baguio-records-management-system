-- Baguio RMS: faster record access rules at volume. Run after 20261123000300. Safe to run again.
-- Nothing here drops or deletes data. Who can see what does not change.
--
-- Why: the records rule ended in "or rms_can_view(id)", a function call per record row, and the routes
-- rule called rms_can_view per route row. With ~5,000 records a staff member's record list took ~10 s
-- (over the 8 s API limit). The same rules are now written so Postgres works out the set once per query.
--
-- Equivalence: rms_can_view (20261120000400) is true when the user has a role, the record is not in the
-- bin (or the user is admin), and the user is central, or the record is public, or the record started at,
-- sits at, or was routed to the user's office and is internal (a dept head also sees confidential records
-- that started at or sit at the office). The first three ways are already spelled out in the records rule,
-- so the only case rms_can_view adds is: internal, and routed to the user's office.

-- Live (not in the bin), internal records ever routed to the signed-in user's office; empty when the user
-- has no role or no office. It returns only ids the caller can already see, so calling it over the API
-- reveals nothing new (never confidential records, never records in the bin).
create or replace function public.rms_my_routed_records()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select r.id
    from public.rms_records r
   where r.confidentiality = 'internal'
     and r.deleted_at is null
     and exists (select 1 from public.rms_routes rt
                  where rt.record_id = r.id
                    and rt.to_office_id = (select public.rms_my_office()))
$$;
revoke execute on function public.rms_my_routed_records() from public, anon;
grant execute on function public.rms_my_routed_records() to authenticated;

alter policy rms_records_select on public.rms_records using (
  ((select public.rms_my_role()) is not null)
  and (deleted_at is null or (select public.rms_my_role()) = 'admin')
  and (
    (select public.rms_my_role()) in ('admin', 'records_officer')
    or confidentiality = 'public'
    or ((origin_office_id = (select public.rms_my_office()) or current_office_id = (select public.rms_my_office()))
        and (confidentiality <> 'confidential' or (select public.rms_my_role()) = 'dept_head'))
    or (confidentiality = 'internal' and id in (select public.rms_my_routed_records()))
  )
);

-- A route is visible exactly when its record is visible: rms_can_view applies the same rule as the
-- records policy, so the subquery (which runs under the records policy) gives the same answer.
alter policy rms_routes_select on public.rms_routes using (
  record_id in (select r.id from public.rms_records r)
);
