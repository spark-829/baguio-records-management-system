-- Separation of duties plus the admin hub (2026-11-24).
-- Administrators look after accounts and security, not records: the database now refuses admin record
-- registration, route steps and attachments (soft delete, restore and confidentiality stay with admin).
-- Also adds the two read-only RPCs behind the Security overview ("/") and System analytics
-- ("/admin/analytics"). Idempotent: create or replace only, no DROP or DELETE.
-- The guards keep their `current_user <> 'authenticated'` early return, so owner seeds, the legacy
-- import and the security-definer flows are not affected.

-- a. Records: admins do not register ---------------------------------------------------------
create or replace function public.rms_records_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
declare v_role public.rms_role := public.rms_my_role();
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if v_role = 'admin' then
    raise exception 'administrators look after accounts and security; the records desk registers records (separation of duties)';
  end if;
  new.created_at := now();
  if v_role is distinct from 'admin' and v_role is distinct from 'records_officer' then
    new.current_office_id := new.origin_office_id;
  end if;
  -- A reply is an outgoing record answering a received record the user can open (RLS applies to this select).
  if new.in_reply_to is not null then
    if new.direction is distinct from 'outgoing' then
      raise exception 'only a record the City sends out can be a reply';
    end if;
    if not exists (select 1 from public.rms_records p
                    where p.id = new.in_reply_to and p.direction = 'incoming' and p.deleted_at is null) then
      raise exception 'the record it replies to was not found';
    end if;
  end if;
  return new;
end $$;

-- b. Route steps: admins do not act on records -----------------------------------------------
create or replace function public.rms_routes_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  v_central boolean := v_role in ('admin', 'records_officer');
  r record;
  v_allowed public.rms_status[];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if v_role = 'admin' then
    raise exception 'administrators cannot add steps to a record; the records desk and the offices handling it do (separation of duties)';
  end if;
  perform public.rms_lock_record(new.record_id);
  select status, direction, current_office_id into r from public.rms_records where id = new.record_id;
  if not found then raise exception 'record not found'; end if;

  v_allowed := case r.status
    when 'registered'   then array['registered', 'forwarded', 'under_action', 'completed', 'released', 'archived']
    when 'forwarded'    then array['forwarded', 'received']
    when 'received'     then array['received', 'under_action', 'forwarded', 'completed']
    when 'under_action' then array['under_action', 'forwarded', 'completed']
    when 'completed'    then array['completed', 'released', 'archived', 'forwarded']
    when 'released'     then array['released', 'archived']
    else array[]::text[]
  end::public.rms_status[];
  if r.direction = 'incoming' and r.status = 'registered' then
    v_allowed := array_remove(v_allowed, 'released'::public.rms_status);
  end if;
  if not v_central then
    v_allowed := array_remove(v_allowed, 'archived'::public.rms_status);
  end if;
  if not (new.status = any (v_allowed)) then
    raise exception 'that step is not allowed for a record that is %', r.status;
  end if;

  -- QA-017: the same "received" step twice (double tap, or two scans at once). A note on a received record
  -- also keeps the status "received", so only a repeat of a receive step at the same office is refused.
  if new.status = 'received' and r.status = 'received' and exists (
       select 1 from (select rt.status, rt.to_office_id, rt.action_taken, rt.created_at
                        from public.rms_routes rt
                       where rt.record_id = new.record_id
                       order by rt.created_at desc
                       limit 1) last
        where last.status = 'received'
          and last.to_office_id is not distinct from r.current_office_id
          and last.created_at > now() - interval '10 minutes'
          -- These strings must match doneText("receive") in src/lib/workflow.ts and the hidden
          -- action_taken in src/app/(app)/r/[tracking]/receive-form.tsx. Notes are never refused.
          and coalesce(last.action_taken, '') in ('Received', 'Received (QR scan)')
          and coalesce(new.action_taken, '') in ('Received', 'Received (QR scan)')) then
    raise exception 'this record is already received at this office';
  end if;

  new.created_at := now();
  new.from_office_id := r.current_office_id;
  if new.status = 'forwarded' and new.status is distinct from r.status then
    if new.to_office_id is null then raise exception 'choose the office to forward to'; end if;
  else
    new.to_office_id := r.current_office_id; -- notes and status steps keep the record where it is
  end if;
  return new;
end $$;
revoke execute on function public.rms_routes_guard_insert() from public, anon, authenticated;

-- c. Attachments: admins do not attach files --------------------------------------------------
create or replace function public.rms_attachments_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.rms_my_role() = 'admin' then
    raise exception 'administrators cannot attach files to records (separation of duties)';
  end if;
  if new.mime_type not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp') then
    raise exception 'only PDF, PNG, JPG and WEBP files can be attached';
  end if;
  if new.file_path not like new.record_id::text || '/%' then
    raise exception 'the file must be stored under its own record';
  end if;
  if new.thumb_path is not null and new.thumb_path !~ ('^' || new.record_id::text || '/thumbs/[0-9a-f-]{36}\.jpg$') then
    raise exception 'the thumbnail must be stored under its own record';
  end if;
  new.uploaded_at := now();
  return new;
end $$;

revoke execute on function public.rms_attachments_guard_insert() from public, anon, authenticated;

-- d. rms_can_attach: the policies already call it, so storage uploads are refused for admin too -----
create or replace function public.rms_can_attach(p_record_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rms_records r
    cross join lateral (select public.rms_my_role() as role, public.rms_my_office() as office) me
    where r.id = p_record_id and r.deleted_at is null
      and (me.role = 'records_officer'
           or (me.role in ('dept_head', 'staff') and me.office in (r.current_office_id, r.origin_office_id)))
  )
$$;
revoke execute on function public.rms_can_attach(uuid) from public, anon;
grant execute on function public.rms_can_attach(uuid) to authenticated;

-- e. After-hours helper -------------------------------------------------------------------------
-- Office hours for security checks: 07:00-19:00 Asia/Manila, Monday to Friday.
-- Before 07:00, from 19:00, or any Saturday/Sunday counts as after hours. Holidays are not excluded.
create or replace function public.rms_after_hours(p_ts timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select extract(isodow from (p_ts at time zone 'Asia/Manila')) >= 6
      or (p_ts at time zone 'Asia/Manila')::time <  time '07:00'
      or (p_ts at time zone 'Asia/Manila')::time >= time '19:00'
$$;
revoke execute on function public.rms_after_hours(timestamptz) from public, anon, authenticated;

-- f. Security overview: one call for the admin home ---------------------------------------------
create or replace function public.rms_admin_security_summary()
returns jsonb language plpgsql stable security definer set search_path = '' set jit = off as $$
declare
  v_now timestamptz := now();
  v_since timestamptz := now() - interval '24 hours';
  v_threshold int;
  v_bulk constant int := 20;   -- downloads by one person within one hour that count as bulk
  v_audit jsonb; v_out jsonb;
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  v_threshold := coalesce((public.rms_setting('lockout_threshold'))::int, 5);
  begin
    v_audit := public.rms_audit_check_info();   -- last stored check; the audit page runs a fresh one
  exception when others then
    v_audit := null;               -- page shows "Unknown"
  end;
  with ev as materialized (
    select a.id, a.event, a.user_id, a.email, a.record_id, a.ip, a.created_at,
           public.rms_after_hours(a.created_at) as after_hours,
           coalesce(r.confidentiality = 'confidential', false) as confidential
      from public.rms_access_log a left join public.rms_records r on r.id = a.record_id
     where a.created_at >= v_since)
  select jsonb_build_object(
    'as_of', v_now, 'threshold', v_threshold, 'bulk_threshold', v_bulk, 'audit', v_audit,
    'counts', (select jsonb_build_object(
        'login_failed', count(*) filter (where event = 'login_failed'),
        'signed_in', count(distinct user_id) filter (where event = 'login_success'),
        'confidential_opened', count(*) filter (where event = 'view_record' and confidential),
        'downloads', count(*) filter (where event = 'download'),
        'after_hours', count(*) filter (where event = 'view_record' and after_hours),
        'after_hours_confidential', count(distinct record_id) filter (where event in ('view_record','download') and after_hours and confidential))
      from ev),
    'locked_now', (select count(*) from public.rms_profiles where locked_until > v_now),
    'admins', (select jsonb_build_object('total', count(*), 'with_mfa',
                 count(*) filter (where exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')))
                 from public.rms_profiles p where p.role = 'admin' and p.is_active),
    'repeated_failures', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'email', email, 'n', n) order by n desc)
        from (select user_id, max(email) as email, count(*) as n from ev
               where event = 'login_failed' and user_id is not null
               group by user_id having count(*) >= v_threshold order by 3 desc limit 3) x), '[]'::jsonb),
    'bulk_downloads', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', coalesce(p.full_name, x.email), 'n', x.n) order by x.n desc)
        from (select user_id, max(email) as email, max(w) as n from (
                select user_id, email, count(*) over (partition by user_id order by created_at
                         range between current row and interval '1 hour' following) as w
                  from ev where event = 'download' and user_id is not null) d
               group by user_id having max(w) >= v_bulk order by 3 desc limit 3) x
        left join public.rms_profiles p on p.id = x.user_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.created_at, 'event', e.event, 'user_id', e.user_id,
                 'who', coalesce(p.full_name, e.email), 'ip', e.ip) order by e.created_at desc, e.id desc)
        from (select * from ev where event not in ('view_record','logout','idle_logout')
               order by created_at desc, id desc limit 10) e
        left join public.rms_profiles p on p.id = e.user_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end
$$;
revoke execute on function public.rms_admin_security_summary() from public, anon;
grant execute on function public.rms_admin_security_summary() to authenticated;

-- g. System analytics: one call for /admin/analytics ----------------------------------------------
-- A "visit" is one stay of a record in one office: it starts at an arrival (registered, or a real
-- forward) and ends at the next real forward or the first completed/released/archived step.
-- Only visits that start inside the period count. Open visits run to now(). Times are calendar days.
create or replace function public.rms_admin_flow_analytics(p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = '' set jit = off as $$
declare
  v_days int := case when p_days in (30, 90, 365) then p_days else 90 end;
  v_now timestamptz := now();
  v_since timestamptz := now() - make_interval(days => case when p_days in (30, 90, 365) then p_days else 90 end);
  v_prev timestamptz := now() - make_interval(days => 2 * case when p_days in (30, 90, 365) then p_days else 90 end);
  v_grain text := case when p_days = 365 then 'month' else 'week' end;
  v_out jsonb;
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  with
  live as materialized (select id, tracking_no, created_at, status, due_date, current_office_id
                          from public.rms_records where deleted_at is null),
  steps as materialized (
    select rt.id, rt.record_id, rt.created_at, rt.status, rt.from_office_id, rt.to_office_id,
           ((rt.status = 'registered' and rt.from_office_id is null) or (rt.status = 'forwarded' and rt.from_office_id is distinct from rt.to_office_id)) as is_arrival
      from public.rms_routes rt join live l on l.id = rt.record_id
     where rt.created_at >= v_since),
  numbered as (
    select s.*, sum(s.is_arrival::int) over (partition by s.record_id
             order by not (s.status = 'registered' and s.from_office_id is null), s.created_at, s.id) as visit_no   -- registered first (seed.sql back-dated rows)
      from steps s),
  visits as (
    select record_id, visit_no,
           (array_agg(to_office_id)   filter (where is_arrival))[1] as office_id,
           (array_agg(from_office_id) filter (where is_arrival))[1] as from_office_id,
           bool_or(is_arrival and status = 'forwarded') as by_forward,
           min(created_at) filter (where is_arrival) as arrived_at,
           min(created_at) filter (where status = 'received') as received_at,
           min(created_at) filter (where status in ('completed','released','archived')) as done_at
      from numbered where visit_no > 0            -- rows of visits that began before the period are dropped
     group by record_id, visit_no),
  ended as (
    select v.*, coalesce(v.done_at, lead(v.arrived_at) over (partition by v.record_id order by v.visit_no)) as left_at
      from visits v),
  timed as materialized (
    select record_id, office_id, from_office_id, by_forward, arrived_at,
           left_at is null as is_open, received_at is not null as was_received,
           (greatest(extract(epoch from (coalesce(left_at, v_now) - arrived_at)), 0) / 86400.0)::float8 as wait_days,
           (case when by_forward then greatest(extract(epoch from (
              least(coalesce(received_at, left_at, v_now), coalesce(left_at, v_now)) - arrived_at)), 0) / 86400.0 else 0 end)::float8 as transit_days
      from ended),
  office_rows as (
    select o.id, o.code, o.name, count(t.record_id) as visits, count(distinct t.record_id) as records,
           coalesce(sum(t.wait_days), 0) as wait_days, coalesce(sum(t.transit_days), 0) as transit_days,
           case when count(t.record_id) >= 5 then percentile_cont(0.5) within group (order by t.wait_days) end as median_wait,
           case when count(t.record_id) >= 5 then percentile_cont(0.9) within group (order by t.wait_days) end as p90_wait,
           case when count(*) filter (where t.by_forward and t.was_received) >= 5
                then percentile_cont(0.5) within group (order by t.transit_days) filter (where t.by_forward and t.was_received) end as median_handoff
      from public.rms_offices o left join timed t on t.office_id = o.id
     where o.is_active or t.office_id is not null
     group by o.id, o.code, o.name),
  open_rows as materialized (
    select l.id, l.tracking_no, l.current_office_id as office_id, l.due_date,
           (greatest(extract(epoch from (v_now - coalesce(a.at, l.created_at))), 0) / 86400.0)::float8 as age_days
      from live l
      left join lateral (select max(rt.created_at) as at from public.rms_routes rt
                          where rt.record_id = l.id and rt.to_office_id = l.current_office_id
                            and ((rt.status = 'registered' and rt.from_office_id is null) or (rt.status = 'forwarded' and rt.from_office_id is distinct from rt.to_office_id))) a on true
     where l.status in ('registered','forwarded','received','under_action')),
  open_offices as (
    select office_id,
           count(*) filter (where age_days < 7) as under_1w,
           count(*) filter (where age_days >= 7 and age_days < 14) as w1_2,
           count(*) filter (where age_days >= 14 and age_days < 28) as w2_4,
           count(*) filter (where age_days >= 28) as over_4w,
           count(*) filter (where due_date < public.rms_today()) as past_due,
           (array_agg(jsonb_build_object('id', id, 'tracking_no', tracking_no, 'days', floor(age_days)::int) order by age_days desc))[1] as oldest
      from open_rows group by office_id),
  handoffs as (
    select from_office_id, office_id as to_office_id, count(*) as sent,
           case when count(*) filter (where was_received) >= 5
                then percentile_cont(0.5) within group (order by transit_days) filter (where was_received) end as median_days
      from timed where by_forward and from_office_id is not null
     group by from_office_id, office_id),
  fin as materialized (
    select rt.record_id, min(rt.created_at) as fin_at
      from public.rms_routes rt join live l on l.id = rt.record_id
     where rt.status in ('completed','released','archived') group by rt.record_id),
  fin_rec as materialized (
    select f.record_id, f.fin_at, l.due_date,
           (greatest(extract(epoch from (f.fin_at - l.created_at)), 0) / 86400.0)::float8 as days,
           (f.fin_at at time zone 'Asia/Manila')::date <= l.due_date as on_time   -- same rule as rms_report_on_time
      from fin f join live l on l.id = f.record_id where f.fin_at >= v_prev),
  strip as (
    select count(*) filter (where fin_at >= v_since) as finished,
           count(*) filter (where fin_at <  v_since) as prev_finished,
           case when count(*) filter (where fin_at >= v_since) >= 5
                then percentile_cont(0.5) within group (order by days) filter (where fin_at >= v_since) end as median_finish,
           case when count(*) filter (where fin_at < v_since) >= 5
                then percentile_cont(0.5) within group (order by days) filter (where fin_at < v_since) end as prev_median_finish,
           count(*) filter (where fin_at >= v_since and due_date is not null) as with_due,
           count(*) filter (where fin_at >= v_since and on_time) as on_time,
           count(*) filter (where fin_at <  v_since and due_date is not null) as prev_with_due,
           count(*) filter (where fin_at <  v_since and on_time) as prev_on_time
      from fin_rec),
  buckets as (select g as b from generate_series(date_trunc(v_grain, v_since at time zone 'Asia/Manila'),
                                                 date_trunc(v_grain, v_now at time zone 'Asia/Manila'),
                                                 ('1 ' || v_grain)::interval) g),
  logged_b as (select date_trunc(v_grain, created_at at time zone 'Asia/Manila') as b, count(*) as n
                 from live where created_at >= v_since group by 1),
  fin_b as (select date_trunc(v_grain, fin_at at time zone 'Asia/Manila') as b, count(*) as n
              from fin_rec where fin_at >= v_since group by 1),
  arrivals as (
    select t.record_id, t.office_id,
           exists (select 1 from public.rms_routes p
                    where p.record_id = t.record_id and p.created_at < t.arrived_at and p.to_office_id = t.office_id
                      and ((p.status = 'registered' and p.from_office_id is null) or (p.status = 'forwarded' and p.from_office_id is distinct from p.to_office_id))) as is_return
      from timed t where t.by_forward)
  select jsonb_build_object(
    'as_of', v_now, 'days', v_days, 'grain', v_grain, 'since', v_since,
    'logged', (select count(*) from live where created_at >= v_since),
    'open_now', (select count(*) from open_rows),
    'prev_open', (select count(*) from live l left join fin f on f.record_id = l.id
                   where l.created_at < v_since and (f.fin_at is null or f.fin_at >= v_since)),
    'strip', (select jsonb_build_object(
                'finished', finished, 'prev_finished', prev_finished,
                'median_finish', round(median_finish::numeric, 1), 'prev_median_finish', round(prev_median_finish::numeric, 1),
                'with_due', with_due, 'on_time', on_time, 'prev_with_due', prev_with_due, 'prev_on_time', prev_on_time)
                from strip),
    'offices', coalesce((select jsonb_agg(jsonb_build_object(
                'id', id, 'code', code, 'name', name, 'visits', visits, 'records', records,
                'wait_days', round(wait_days::numeric, 2), 'transit_days', round(transit_days::numeric, 2),
                'median_wait', round(median_wait::numeric, 1), 'p90_wait', round(p90_wait::numeric, 1),
                'median_handoff', round(median_handoff::numeric, 1)) order by name)
                from office_rows), '[]'::jsonb),
    'open_offices', coalesce((select jsonb_agg(to_jsonb(x)) from open_offices x), '[]'::jsonb),
    'handoffs', coalesce((select jsonb_agg(jsonb_build_object(
                'from', from_office_id, 'to', to_office_id, 'sent', sent, 'median_days', round(median_days::numeric, 1)))
                from handoffs), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object(
                'start', to_char(bk.b, 'YYYY-MM-DD'), 'logged', coalesce(lb.n, 0), 'finished', coalesce(fb.n, 0)) order by bk.b)
                from buckets bk left join logged_b lb on lb.b = bk.b left join fin_b fb on fb.b = bk.b), '[]'::jsonb),
    'returns', jsonb_build_object(
      'records_moved', (select count(distinct record_id) from arrivals),
      'records_returned', (select count(distinct record_id) from arrivals where is_return),
      'offices', coalesce((select jsonb_agg(jsonb_build_object('office_id', office_id, 'returns', returns, 'arrivals', arrivals) order by returns desc)
                  from (select office_id, count(*) filter (where is_return) as returns, count(*) as arrivals
                          from arrivals group by office_id
                         having count(*) filter (where is_return) > 0
                         order by 2 desc limit 8) r), '[]'::jsonb))
  ) into v_out;
  return v_out;
end
$$;
revoke execute on function public.rms_admin_flow_analytics(int) from public, anon;
grant execute on function public.rms_admin_flow_analytics(int) to authenticated;
