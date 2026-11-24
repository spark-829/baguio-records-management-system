-- Baguio charter offices, transaction type (G2C/G2G/G2B), search v2 and report by_tx.
-- Run after 20261124000300. Safe to run again. Safe with the previous app version.
-- No drops or deletes. rms_search_records is left as is: the previous app still calls it.

-- Offices: upsert by code with the charter names. is_active is not touched.
insert into public.rms_offices (code, name) values
  ('CMO', 'City Mayor''s Office'),
  ('CAO', 'City Administrator''s Office'),
  ('CEO', 'City Engineering Office'),
  ('CTO', 'City Treasury Office'),
  ('CBO', 'City Budget Office'),
  ('HRMO', 'City Human Resource Management Office'),
  ('CLO', 'City Legal Office'),
  ('CPDO', 'City Planning, Development and Sustainability Office'),
  ('SP', 'Sangguniang Panlungsod'),
  ('CACCO', 'City Accounting Office'),
  ('CASSO', 'City Assessor''s Office'),
  ('CBAO', 'City Buildings and Architecture Office'),
  ('CCRO', 'City Civil Registry Office'),
  ('CEPMO', 'City Environment and Parks Management Office'),
  ('CGSO', 'City General Services Office'),
  ('HSO', 'City Health Services Office'),
  ('CSWDO', 'City Social Welfare and Development Office'),
  ('CTCAO', 'City Tourism, Culture and Arts Office'),
  ('CVAO', 'City Veterinary and Agriculture Office'),
  ('CMO-PLD', 'Permits and Licensing Division (City Mayor''s Office)'),
  ('PESO', 'Public Employment Service Office'),
  ('CDRRMO', 'City Disaster Risk Reduction and Management Office')
on conflict (code) do update set name = excluded.name
  where public.rms_offices.name is distinct from excluded.name;

-- The demo Records Officer works in the City General Services Office.
update public.rms_profiles p set office_id = o.id
  from public.rms_offices o, auth.users u
 where o.code = 'CGSO' and u.email = 'records@rms-demo.test'
   and p.id = u.id and p.office_id is distinct from o.id;

-- Transaction type. Nullable so inserts from the previous app still pass.
alter table public.rms_records add column if not exists transaction_type text
  check (transaction_type in ('G2C', 'G2G', 'G2B'));

create or replace function public.rms_search_records_v2(
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
  p_tx text default null
)
returns table (
  id uuid, tracking_no text, direction public.rms_direction, subject text, status public.rms_status,
  priority public.rms_priority, confidentiality public.rms_confidentiality, document_type text,
  current_office text, origin_office text, sender text, recipient text, created_by_name text,
  created_at timestamptz, due_date date, ai_summary text, rank real,
  sender_name text, sender_org text, recipient_name text, recipient_org text,
  transaction_type text
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(trim(p_q), '') is null then null
           else websearch_to_tsquery('english', p_q) || websearch_to_tsquery('simple', p_q) end as tsq
  )
  select r.id, r.tracking_no, r.direction, r.subject, r.status, r.priority, r.confidentiality,
         dt.name, co.code, oo.code,
         concat_ws(', ', r.sender_name, r.sender_org), concat_ws(', ', r.recipient_name, r.recipient_org),
         p.full_name, r.created_at, r.due_date, r.ai_summary,
         case when q.tsq is null then 0 else ts_rank(r.search, q.tsq) end::real,
         r.sender_name, r.sender_org, r.recipient_name, r.recipient_org,
         r.transaction_type
  from public.rms_records r
  cross join q
  join public.rms_document_types dt on dt.id = r.document_type_id
  join public.rms_offices co on co.id = r.current_office_id
  join public.rms_offices oo on oo.id = r.origin_office_id
  left join public.rms_profiles p on p.id = r.created_by
  where r.deleted_at is null
    and (not p_exclude_confidential or r.confidentiality <> 'confidential')
    and (q.tsq is null or r.search @@ q.tsq or r.subject ilike '%' || p_q || '%' or r.tracking_no ilike p_q || '%')
    and (p_person is null or concat_ws(' ', r.sender_name, r.sender_org, r.recipient_name, r.recipient_org, p.full_name) ilike '%' || p_person || '%'
         or exists (select 1 from public.rms_routes rt join public.rms_profiles ap on ap.id = rt.acted_by
                    where rt.record_id = r.id and ap.full_name ilike '%' || p_person || '%'))
    and (p_direction is null or r.direction = p_direction)
    and (p_status is null or r.status = p_status)
    and (p_office_code is null or co.code = upper(p_office_code) or oo.code = upper(p_office_code))
    and (p_doc_type is null or dt.name ilike '%' || p_doc_type || '%')
    and (p_from is null or r.created_at >= (p_from::timestamp at time zone 'Asia/Manila'))
    and (p_to is null or r.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila'))
    and (not p_overdue or (r.due_date < public.rms_today() and r.status not in ('completed', 'released', 'archived')))
    and (p_tx is null or r.transaction_type = p_tx)
  order by 17 desc, r.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke execute on function public.rms_search_records_v2 from public, anon;
grant execute on function public.rms_search_records_v2 to authenticated;

-- Report summary with by_tx (same signature; the previous app ignores the extra key).
create or replace function public.rms_report_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_overdue_limit int default 200
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as materialized (
    select r.id, r.status, r.direction, r.created_at, r.due_date, r.tracking_no, r.subject,
           r.document_type_id, r.current_office_id, r.transaction_type
      from public.rms_records r
     where r.deleted_at is null
       and (p_from is null or r.created_at >= p_from)
       and (p_to is null or r.created_at < p_to)
  ),
  od as materialized (
    select * from base
     where due_date < public.rms_today() and status not in ('completed', 'released', 'archived')
  )
  select jsonb_build_object(
    'total',    (select count(*) from base),
    'incoming', (select count(*) from base where direction = 'incoming'),
    'outgoing', (select count(*) from base where direction = 'outgoing'),
    'open',     (select count(*) from base where status not in ('completed', 'released', 'archived')),
    'overdue',  (select count(*) from od),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', s.k, 'n', s.n) order by s.n desc, s.last desc)
                  from (select b.status::text as k, count(*) as n, max(b.created_at) as last
                          from base b group by b.status) s), '[]'::jsonb),
    'by_office', coalesce((select jsonb_agg(jsonb_build_object('key', s.k, 'n', s.n) order by s.n desc, s.last desc)
                  from (select coalesce(o.name, '—') as k, count(*) as n, max(b.created_at) as last
                          from base b left join public.rms_offices o on o.id = b.current_office_id
                         group by coalesce(o.name, '—')) s), '[]'::jsonb),
    'by_type',  coalesce((select jsonb_agg(jsonb_build_object('key', s.k, 'n', s.n) order by s.n desc, s.last desc)
                  from (select coalesce(dt.name, '—') as k, count(*) as n, max(b.created_at) as last
                          from base b left join public.rms_document_types dt on dt.id = b.document_type_id
                         group by coalesce(dt.name, '—')) s), '[]'::jsonb),
    'by_tx',    coalesce((select jsonb_agg(jsonb_build_object('key', s.k, 'n', s.n) order by s.n desc, s.last desc)
                  from (select coalesce(b.transaction_type, 'none') as k, count(*) as n, max(b.created_at) as last
                          from base b group by coalesce(b.transaction_type, 'none')) s), '[]'::jsonb),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('key', s.k, 'n', s.n) order by s.k)
                  from (select to_char(b.created_at at time zone 'UTC', 'YYYY-MM') as k, count(*) as n
                          from base b group by 1) s), '[]'::jsonb),
    'overdue_rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.due_date, x.created_at desc)
                  from (select od.id, od.tracking_no, od.subject, od.due_date, od.created_at, o.name as office
                          from od left join public.rms_offices o on o.id = od.current_office_id
                         order by od.due_date, od.created_at desc
                         limit greatest(least(coalesce(p_overdue_limit, 200), 1000), 0)) x), '[]'::jsonb)
  )
$$;
revoke execute on function public.rms_report_summary(timestamptz, timestamptz, int) from public, anon;
grant execute on function public.rms_report_summary(timestamptz, timestamptz, int) to authenticated;
