-- Baguio RMS: Client Satisfaction Survey (public, anonymous), satisfaction report, Complaint document type.
-- Run after 20261124000500. Safe to run again. Safe with the previous app version. No drops or deletes.

-- a. Attempts get a kind (old rms_public_track inserts keep working through the default) ------------
alter table public.rms_track_attempts add column if not exists kind text not null default 'track';

-- b. Answers: no IP, no name, no user id. One row per record. ---------------------------------------
create table if not exists public.rms_satisfaction (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.rms_records (id) on delete cascade,
  office_id uuid not null references public.rms_offices (id),
  q_satisfied smallint not null check (q_satisfied between 0 and 5),
  q_time smallint check (q_time between 0 and 5),
  q_steps smallint check (q_steps between 0 and 5),
  q_fair smallint check (q_fair between 0 and 5),
  q_staff smallint check (q_staff between 0 and 5),
  saw_charter boolean,
  comment text check (comment is null or length(comment) <= 1000),
  answered_at timestamptz not null default now()
);
comment on table public.rms_satisfaction is 'Anonymous client satisfaction answers. 5 = Strongly agree ... 1 = Strongly disagree, 0 = Not applicable, null = not answered. No personal data.';
create index if not exists rms_satisfaction_office_at on public.rms_satisfaction (office_id, answered_at);
create index if not exists rms_satisfaction_at on public.rms_satisfaction (answered_at);
alter table public.rms_satisfaction enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_satisfaction' and policyname = 'rms_satisfaction_select') then
    create policy rms_satisfaction_select on public.rms_satisfaction for select to authenticated
      using ((select public.rms_my_role()) in ('admin', 'records_officer')
             or ((select public.rms_my_role()) = 'dept_head' and office_id = (select public.rms_my_office())));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'rms_audit_satisfaction' and tgrelid = 'public.rms_satisfaction'::regclass) then
    create trigger rms_audit_satisfaction after insert or update or delete on public.rms_satisfaction
      for each row execute function public.rms_audit();
  end if;
end $$;
-- No insert, update or delete policies: rows are written only by rms_survey_submit (security definer).
revoke all on public.rms_satisfaction from anon;
revoke insert, update, delete on public.rms_satisfaction from authenticated;

-- c. Complaint document type ------------------------------------------------------------------------
insert into public.rms_document_types (name, retention_years) values ('Complaint', 5) on conflict (name) do nothing;

-- d. Check a receipt (anonymous) --------------------------------------------------------------------
create or replace function public.rms_survey_check(p_tracking text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := public.rms_client_ip();
  v_no text := left(upper(trim(coalesce(p_tracking, ''))), 40);
  r record;
begin
  -- Same lockout as rms_public_track (counts all kinds of failed lookups).
  if (v_ip is not null and (select count(*) from public.rms_track_attempts
       where ip = v_ip and not ok and at > now() - interval '15 minutes') >= 10)
  or (select count(*) from public.rms_track_attempts
       where tracking = v_no and not ok and at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('error', 'too_many');
  end if;

  select rec.id, rec.tracking_no into r
    from public.rms_records rec
   where rec.tracking_no = v_no
     and rec.track_code = upper(trim(coalesce(p_code, '')))
     and rec.deleted_at is null;

  insert into public.rms_track_attempts (ip, ok, tracking, kind) values (v_ip, r.id is not null, v_no, 'survey');
  if r.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object('tracking_no', r.tracking_no,
    'answered', exists (select 1 from public.rms_satisfaction s where s.record_id = r.id));
end $$;

-- e. Send answers (anonymous) -----------------------------------------------------------------------
create or replace function public.rms_survey_submit(
  p_tracking text, p_code text, p_satisfied int, p_time int, p_steps int, p_fair int, p_staff int,
  p_saw_charter boolean, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := public.rms_client_ip();
  v_no text := left(upper(trim(coalesce(p_tracking, ''))), 40);
  r record;
  v_id uuid;
begin
  if (v_ip is not null and (select count(*) from public.rms_track_attempts
       where ip = v_ip and not ok and at > now() - interval '15 minutes') >= 10)
  or (select count(*) from public.rms_track_attempts
       where tracking = v_no and not ok and at > now() - interval '15 minutes') >= 10
  or (v_ip is not null and (select count(*) from public.rms_track_attempts
       where kind = 'survey_sent' and ip = v_ip and at > now() - interval '1 hour') >= 20) then
    return jsonb_build_object('error', 'too_many');
  end if;

  if p_satisfied is null or p_satisfied not between 0 and 5
     or coalesce(p_time, 0) not between 0 and 5 or coalesce(p_steps, 0) not between 0 and 5
     or coalesce(p_fair, 0) not between 0 and 5 or coalesce(p_staff, 0) not between 0 and 5 then
    return jsonb_build_object('error', 'invalid');
  end if;

  select rec.id, rec.current_office_id into r
    from public.rms_records rec
   where rec.tracking_no = v_no
     and rec.track_code = upper(trim(coalesce(p_code, '')))
     and rec.deleted_at is null;

  insert into public.rms_track_attempts (ip, ok, tracking, kind) values (v_ip, r.id is not null, v_no, 'survey');
  if r.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  insert into public.rms_satisfaction (record_id, office_id, q_satisfied, q_time, q_steps, q_fair, q_staff, saw_charter, comment)
  values (r.id, r.current_office_id, p_satisfied, p_time, p_steps, p_fair, p_staff, p_saw_charter,
          nullif(left(regexp_replace(trim(coalesce(p_comment, '')), '[[:cntrl:]]', ' ', 'g'), 1000), ''))
  on conflict (record_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('error', 'already');
  end if;

  insert into public.rms_track_attempts (ip, ok, tracking, kind) values (v_ip, true, v_no, 'survey_sent');
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.rms_survey_check(text, text) from public;
revoke execute on function public.rms_survey_submit(text, text, int, int, int, int, int, boolean, text) from public;
grant execute on function public.rms_survey_check(text, text) to anon, authenticated;
grant execute on function public.rms_survey_submit(text, text, int, int, int, int, int, boolean, text) to anon, authenticated;

-- f. Monthly report (central: all offices, heads: their own through RLS) -----------------------------
create or replace function public.rms_report_satisfaction(p_month date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with win as (
    select (date_trunc('month', p_month)::timestamp at time zone 'Asia/Manila') as a,
           ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Asia/Manila') as b
  ), s as (
    select x.*, o.name as office
      from public.rms_satisfaction x
      join public.rms_offices o on o.id = x.office_id, win
     where x.answered_at >= win.a and x.answered_at < win.b
  )
  select jsonb_build_object(
    'offices', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.office)
        from (
          select office_id, office, count(*) as responses,
            count(*) filter (where q_satisfied in (4, 5)) as sat_yes, count(*) filter (where q_satisfied between 1 and 5) as sat_n,
            count(*) filter (where q_time in (4, 5)) as time_yes, count(*) filter (where q_time between 1 and 5) as time_n,
            count(*) filter (where q_steps in (4, 5)) as steps_yes, count(*) filter (where q_steps between 1 and 5) as steps_n,
            count(*) filter (where q_fair in (4, 5)) as fair_yes, count(*) filter (where q_fair between 1 and 5) as fair_n,
            count(*) filter (where q_staff in (4, 5)) as staff_yes, count(*) filter (where q_staff between 1 and 5) as staff_n,
            count(*) filter (where saw_charter is true) as charter_yes, count(*) filter (where saw_charter is not null) as charter_n
            from s group by office_id, office
        ) g), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('office', office, 'at', answered_at, 'comment', comment) order by answered_at)
      from (select office, answered_at, comment from s where comment is not null order by answered_at limit 300) c), '[]'::jsonb)
  )
$$;
revoke execute on function public.rms_report_satisfaction(date) from public, anon;
grant execute on function public.rms_report_satisfaction(date) to authenticated;
