-- QA Nov 26: QA-077 (sign-in activity readable by every user) and QA-078 (uncapped search text). Idempotent.
-- Nothing here removes rows or rewrites data.

-- ============================================================================================
-- QA-077: last_login_at and failed_attempts are sign-in activity, for administrators only.
-- Row rules (RLS) cannot hide single columns, so the column list a signed-in user may read is set with
-- column privileges, and administrators read the activity through an admin-only function.
-- locked_until stays readable: the assignment check (rms_routes_guard_insert, security invoker) and each
-- user's own session check use it to skip locked accounts.
-- ============================================================================================
create or replace function public.rms_admin_user_signins()
returns table (id uuid, last_login_at timestamptz, failed_attempts int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  return query select p.id, p.last_login_at, p.failed_attempts from public.rms_profiles p;
end $$;
revoke execute on function public.rms_admin_user_signins() from public, anon;
grant execute on function public.rms_admin_user_signins() to authenticated;

revoke select on public.rms_profiles from anon, authenticated;
grant select (id, full_name, role, office_id, is_active, created_at, updated_at, locked_until, window_intake)
  on public.rms_profiles to authenticated;

-- ============================================================================================
-- QA-078: the app caps search text at 100 characters, but the function did not, so a 20,000-character
-- request ran until the statement timeout. Same function as 20261125000900, with the text inputs capped.
-- ============================================================================================
create or replace function public.rms_search_records_v5(
  p_q text default null,
  p_person text default null,
  p_direction public.rms_direction default null,
  p_status public.rms_status default null,
  p_office_code text default null,
  p_doc_type text default null,
  p_from date default null,
  p_to date default null,
  p_overdue boolean default false,
  p_limit int default 50,
  p_exclude_confidential boolean default false,
  p_tx text default null,
  p_box_code text default null,
  p_intake text default null,
  p_open boolean default false,
  p_here boolean default false,
  p_priority public.rms_priority default null
)
returns table (
  id uuid, tracking_no text, direction public.rms_direction, subject text, status public.rms_status,
  priority public.rms_priority, confidentiality public.rms_confidentiality, document_type text,
  current_office text, origin_office text, sender text, recipient text, created_by_name text,
  created_at timestamptz, due_date date, ai_summary text, rank real,
  sender_name text, sender_org text, recipient_name text, recipient_org text,
  transaction_type text, reference_no text, intake_window boolean
)
language sql stable security invoker set search_path = '' as $$
  with a as (
    select left(p_q, 200) as q, left(p_person, 100) as person, left(p_doc_type, 100) as doc_type,
           left(p_office_code, 20) as office_code, left(p_tx, 40) as tx, left(p_box_code, 40) as box_code
  ), q as (
    select case when nullif(trim(a.q), '') is null then null
           else websearch_to_tsquery('english', a.q) || websearch_to_tsquery('simple', a.q) end as tsq
      from a
  )
  select r.id, r.tracking_no, r.direction, r.subject, r.status, r.priority, r.confidentiality,
         dt.name, co.code, oo.code,
         concat_ws(', ', r.sender_name, r.sender_org), concat_ws(', ', r.recipient_name, r.recipient_org),
         p.full_name, r.created_at, r.due_date, r.ai_summary,
         case when q.tsq is null then 0 else ts_rank(r.search, q.tsq) end::real,
         r.sender_name, r.sender_org, r.recipient_name, r.recipient_org,
         r.transaction_type, r.reference_no, r.intake_window
  from public.rms_records r
  cross join a
  cross join q
  join public.rms_document_types dt on dt.id = r.document_type_id
  join public.rms_offices co on co.id = r.current_office_id
  join public.rms_offices oo on oo.id = r.origin_office_id
  left join public.rms_profiles p on p.id = r.created_by
  where r.deleted_at is null
    and (not p_exclude_confidential or r.confidentiality <> 'confidential')
    and (q.tsq is null or r.search @@ q.tsq or r.subject ilike '%' || a.q || '%' or r.tracking_no ilike a.q || '%'
         or lower(r.reference_no) like lower(btrim(a.q)) || '%')
    and (a.person is null or concat_ws(' ', r.sender_name, r.sender_org, r.recipient_name, r.recipient_org, p.full_name) ilike '%' || a.person || '%'
         or exists (select 1 from public.rms_routes rt join public.rms_profiles ap on ap.id = rt.acted_by
                    where rt.record_id = r.id and ap.full_name ilike '%' || a.person || '%'))
    and (p_direction is null or r.direction = p_direction)
    and (p_status is null or r.status = p_status)
    and (a.office_code is null or co.code = upper(a.office_code) or (not p_here and oo.code = upper(a.office_code)))
    and (a.doc_type is null or dt.name ilike '%' || a.doc_type || '%')
    and (p_from is null or r.created_at >= (p_from::timestamp at time zone 'Asia/Manila'))
    and (p_to is null or r.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila'))
    and (not p_overdue or (r.due_date < public.rms_today() and r.status not in ('completed', 'released', 'archived')))
    and (a.tx is null or r.transaction_type = a.tx)
    and (a.box_code is null or r.box_id = (select b.id from public.rms_boxes b where b.code = upper(trim(a.box_code))))
    and (p_intake is null
         or (p_intake = 'window' and r.intake_window)
         or (p_intake = 'desk' and r.direction = 'incoming' and not coalesce(r.intake_window, false)))
    and (not p_open or r.status not in ('completed', 'released', 'archived'))
    and (p_priority is null or r.priority = p_priority)
  order by 17 desc, r.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke execute on function public.rms_search_records_v5 from public, anon;
grant execute on function public.rms_search_records_v5 to authenticated;

-- Read-only checks you can run in the SQL Editor:
--   select column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'rms_profiles' and grantee = 'authenticated' and privilege_type = 'SELECT';
