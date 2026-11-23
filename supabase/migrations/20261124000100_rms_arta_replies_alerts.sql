-- Baguio RMS: ARTA kind of transaction, "in reply to" links, the alert bell and the on-time report.
-- Run after 20261123000600. Safe to run again. No drops or deletes.

-- a. Columns and indexes ---------------------------------------------------------------------
alter table public.rms_records add column if not exists arta_class text
  check (arta_class in ('simple', 'complex', 'highly_technical', 'none'));
alter table public.rms_records add column if not exists in_reply_to uuid
  references public.rms_records (id); -- records are only soft-deleted, so a reply never loses its link
create index if not exists rms_records_in_reply_to_idx on public.rms_records (in_reply_to) where in_reply_to is not null;
-- open records per office (bell, dashboard)
create index if not exists rms_records_open_office_idx on public.rms_records (current_office_id, status)
  where deleted_at is null and status in ('registered', 'forwarded', 'received', 'under_action');

-- b. Guards (latest versions; the triggers already exist) --------------------------------------
create or replace function public.rms_records_guard_update()
returns trigger language plpgsql set search_path = '' as $$
declare v_role public.rms_role := public.rms_my_role();
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.tracking_no is distinct from old.tracking_no
     or new.direction is distinct from old.direction
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.origin_office_id is distinct from old.origin_office_id then
    raise exception 'tracking number, direction, origin and registration details cannot be changed';
  end if;
  if new.status is distinct from old.status or new.current_office_id is distinct from old.current_office_id then
    raise exception 'status and location change only by adding an action to the record history';
  end if;
  if new.confidentiality is distinct from old.confidentiality
     and v_role is distinct from 'admin' and v_role is distinct from 'records_officer' then
    raise exception 'only the records desk or an admin can change the confidentiality level';
  end if;
  if new.in_reply_to is distinct from old.in_reply_to then
    raise exception 'the "in reply to" link is set when the record is registered';
  end if;
  return new;
end $$;

create or replace function public.rms_records_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
declare v_role public.rms_role := public.rms_my_role();
begin
  if current_user <> 'authenticated' then
    return new;
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

-- c. Bell: records sent to my office and not yet received, plus open late records there ---------
create or replace function public.rms_my_alerts(p_limit int default 8)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with mine as materialized (
    select r.id, r.tracking_no, r.subject, r.status, r.due_date, r.updated_at,
           (r.status = 'forwarded') as to_receive,
           coalesce(r.due_date < public.rms_today(), false) as late
      from public.rms_records r
     where r.deleted_at is null
       and r.current_office_id = (select public.rms_my_office())
       and r.status in ('registered', 'forwarded', 'received', 'under_action')
       and (r.status = 'forwarded' or r.due_date < public.rms_today())
  )
  select jsonb_build_object(
    'count', (select count(*) from mine),
    'to_receive', (select count(*) from mine where to_receive),
    'late', (select count(*) from mine where late),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
             from (select id, tracking_no, subject, status, due_date, to_receive, late, updated_at
                     from mine order by updated_at desc
                    limit greatest(least(coalesce(p_limit, 8), 20), 0)) x), '[]'::jsonb))
$$;
revoke execute on function public.rms_my_alerts(int) from public, anon;
grant execute on function public.rms_my_alerts(int) to authenticated;

-- d. On-time rate per office -------------------------------------------------------------------
create or replace function public.rms_report_on_time(p_from timestamptz default null, p_to timestamptz default null)
returns table (id uuid, name text, finished int, on_time int)
language sql stable security invoker set search_path = '' as $$
  with rec as materialized (
    select r.id, r.due_date, r.current_office_id, r.created_at
      from public.rms_records r
     where r.deleted_at is null and r.due_date is not null
       and (p_to is null or r.created_at < p_to)
       and r.status in ('completed', 'released', 'archived')
  ),
  fin as (
    select rec.id, rec.due_date, rec.current_office_id,
           coalesce(min(x.created_at), rec.created_at) as fin_at
      from rec left join public.rms_routes x
        on x.record_id = rec.id and x.status in ('completed', 'released', 'archived')
     group by rec.id, rec.due_date, rec.current_office_id, rec.created_at
  )
  select o.id, o.name, count(*)::int,
         (count(*) filter (where (fin.fin_at at time zone 'Asia/Manila')::date <= fin.due_date))::int
    from fin join public.rms_offices o on o.id = fin.current_office_id
   where (p_from is null or fin.fin_at >= p_from) and (p_to is null or fin.fin_at < p_to)
   group by o.id, o.name
   order by o.name
$$;
revoke execute on function public.rms_report_on_time(timestamptz, timestamptz) from public, anon;
grant execute on function public.rms_report_on_time(timestamptz, timestamptz) to authenticated;
