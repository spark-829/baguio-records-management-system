-- Report totals computed in the database (one small result instead of thousands of rows).
-- Run after 20261123000400. Safe to run again. No drops or deletes.
-- All functions are SECURITY INVOKER: row level security applies to the caller.

create or replace function public.rms_report_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_overdue_limit int default 200
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as materialized (
    select r.id, r.status, r.direction, r.created_at, r.due_date, r.tracking_no, r.subject,
           r.document_type_id, r.current_office_id
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

create or replace function public.rms_report_offices()
returns table (id uuid, code text, name text, waiting int, working int, late int,
               oldest_days double precision, avg_done_days double precision, done_count int)
language sql stable security invoker set search_path = '' as $$
  with rec as materialized (
    select r.id, r.status, r.due_date, r.created_at, r.current_office_id
      from public.rms_records r where r.deleted_at is null
  ),
  rt as (
    select x.record_id,
           min(x.created_at) filter (where x.to_office_id = rec.current_office_id) as first_in,
           max(x.created_at) filter (where x.to_office_id = rec.current_office_id
                                       and x.status in ('forwarded', 'registered')) as last_in,
           min(x.created_at) filter (where x.status in ('completed', 'released', 'archived')) as fin
      from public.rms_routes x join rec on rec.id = x.record_id
     group by x.record_id
  ),
  per as (
    select rec.current_office_id as office_id, rec.status, rec.due_date,
           coalesce(rt.last_in, rt.first_in, rec.created_at) as held_since,
           coalesce(rt.first_in, rec.created_at) as arrived,
           rt.fin,
           (rec.status not in ('registered', 'forwarded', 'received', 'under_action')
              and rt.fin is not null and rt.fin >= now() - interval '90 days') as done_recent
      from rec left join rt on rt.record_id = rec.id
  )
  select o.id, o.code, o.name,
    (count(p.office_id) filter (where p.status in ('forwarded', 'registered')))::int,
    (count(p.office_id) filter (where p.status in ('received', 'under_action')))::int,
    (count(p.office_id) filter (where p.status in ('registered', 'forwarded', 'received', 'under_action')
                          and p.due_date < public.rms_today()))::int,
    (extract(epoch from (now() - min(p.held_since) filter (where p.status in ('registered', 'forwarded', 'received', 'under_action')))) / 86400)::float8,
    (avg(extract(epoch from (p.fin - p.arrived)) / 86400) filter (where p.done_recent))::float8,
    (count(p.office_id) filter (where p.done_recent))::int
  from public.rms_offices o left join per p on p.office_id = o.id
  where o.is_active
  group by o.id, o.code, o.name
  order by o.name
$$;
revoke execute on function public.rms_report_offices() from public, anon;
grant execute on function public.rms_report_offices() to authenticated;

create or replace function public.rms_report_retention(p_show text default null, p_limit int default 500)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with fin as materialized (
    select r.id, r.tracking_no, r.subject, r.status, r.created_at, r.document_type_id, r.current_office_id
      from public.rms_records r
     where r.deleted_at is null and r.status in ('completed', 'released', 'archived')
  ),
  rt as (
    select x.record_id,
           min(x.created_at) filter (where x.status in ('completed', 'released', 'archived')) as first_fin,
           max(x.created_at) as last_any
      from public.rms_routes x join fin on fin.id = x.record_id group by x.record_id
  ),
  k as (
    select fin.*, coalesce(dt.retention_years, 5) as years, dt.name as type_name, o.name as office_name,
           coalesce(rt.first_fin, rt.last_any, fin.created_at) as finished_at
      from fin left join rt on rt.record_id = fin.id
      left join public.rms_document_types dt on dt.id = fin.document_type_id
      left join public.rms_offices o on o.id = fin.current_office_id
  ),
  s as materialized (
    select k.*,
      case when k.years >= 50 then null else
        ((date_trunc('month', k.finished_at at time zone 'UTC') + make_interval(years => k.years)
          + ((k.finished_at at time zone 'UTC') - date_trunc('month', k.finished_at at time zone 'UTC')))
          at time zone 'UTC') end as keep_until
    from k
  ),
  st as materialized (
    select s.*, case
      when s.keep_until is null then 'keep'
      when floor(extract(epoch from (s.keep_until - now())) / 86400) < 0 then 'review_now'
      when floor(extract(epoch from (s.keep_until - now())) / 86400) <= 90 then 'review_soon'
      else 'keep' end as state
    from s
  )
  select jsonb_build_object(
    'review_now',  (select count(*) from st where state = 'review_now'),
    'review_soon', (select count(*) from st where state = 'review_soon'),
    'keep',        (select count(*) from st where state = 'keep'),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.keep_until nulls last, x.created_at)
             from (select st.id, st.tracking_no, st.subject, st.status, st.type_name, st.years, st.office_name,
                          st.finished_at, st.keep_until, st.state, st.created_at
                     from st
                    where p_show is null or p_show not in ('review_now', 'review_soon', 'keep') or st.state = p_show
                    order by st.keep_until nulls last, st.created_at
                    limit greatest(least(coalesce(p_limit, 500), 2000), 0)) x), '[]'::jsonb)
  )
$$;
revoke execute on function public.rms_report_retention(text, int) from public, anon;
grant execute on function public.rms_report_retention(text, int) to authenticated;

create or replace function public.rms_dashboard_totals()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as materialized (
    select r.status, r.due_date, r.created_at, r.current_office_id
      from public.rms_records r where r.deleted_at is null
  )
  select jsonb_build_object(
    'open',    (select count(*) from base where status not in ('completed', 'released', 'archived')),
    'overdue', (select count(*) from base
                 where status not in ('completed', 'released', 'archived') and due_date < public.rms_today()),
    'in_my_office', (select count(*) from base
                      where current_office_id = (select public.rms_my_office())
                        and status in ('registered', 'forwarded', 'received', 'under_action')),
    'this_month', (select count(*) from base
                    where created_at >= (date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')),
    'by_status', coalesce((select jsonb_object_agg(s.k, s.n)
                  from (select b.status::text as k, count(*) as n from base b group by b.status) s), '{}'::jsonb)
  )
$$;
revoke execute on function public.rms_dashboard_totals() from public, anon;
grant execute on function public.rms_dashboard_totals() to authenticated;
