-- Baguio RMS: the office head assigns the person who works on a record.
-- Run after 20261124000400. Safe to run again. Safe with the previous app version. No drops or deletes.

-- a. Columns ---------------------------------------------------------------------------------
-- rms_records -> rms_profiles is safe: every existing embed from rms_records uses an !fkey hint.
alter table public.rms_records add column if not exists assigned_to uuid references public.rms_profiles (id);
alter table public.rms_records add column if not exists assigned_at timestamptz;
create index if not exists rms_records_assigned_to_idx on public.rms_records (assigned_to)
  where assigned_to is not null and deleted_at is null;
-- NO FOREIGN KEY ON PURPOSE: a second FK from rms_routes to rms_profiles would make the unhinted
-- actor:rms_profiles(...) embeds in the live app fail with "more than one relationship".
alter table public.rms_routes add column if not exists assigned_to uuid;
comment on column public.rms_routes.assigned_to is 'Person assigned by this step. No FK on purpose (PostgREST embeds of rms_profiles).';

-- b. Route steps: assigning a person is a step that keeps the status ---------------------------
create or replace function public.rms_routes_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  v_central boolean := v_role in ('admin', 'records_officer');
  r record;
  v_allowed public.rms_status[];
  v_arole public.rms_role;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if v_role = 'admin' then
    raise exception 'administrators cannot add steps to a record; the records desk and the offices handling it do (separation of duties)';
  end if;
  perform public.rms_lock_record(new.record_id);
  select status, direction, current_office_id, confidentiality into r from public.rms_records where id = new.record_id;
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

  if new.assigned_to is not null then
    if new.status is distinct from r.status then raise exception 'assigning a person does not change the status'; end if;
    if r.status not in ('registered', 'received', 'under_action') then
      raise exception 'a person can be assigned only while the office is working on the record'; end if;
    if not (v_role = 'records_officer' or (v_role = 'dept_head' and public.rms_my_office() = r.current_office_id)) then
      raise exception 'only the head of the office holding this record, or the records desk, can assign it'; end if;
    select p.role into v_arole from public.rms_profiles p
     where p.id = new.assigned_to and p.is_active and p.office_id = r.current_office_id
       and p.role in ('staff', 'dept_head') and (p.locked_until is null or p.locked_until < now());
    if not found then raise exception 'choose an active staff member of the office holding this record'; end if;
    if r.confidentiality = 'confidential' and v_arole <> 'dept_head' then
      raise exception 'a confidential record can be assigned only to the office head'; end if;
    new.action_taken := 'Assigned';
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

-- c. A route row moves the record and sets or clears the assignee ------------------------------
create or replace function public.rms_routes_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The first "registered" row is the record's own creation. Assigning while registered is also a "registered" row.
  if (new.status = 'registered' and new.assigned_to is null) or public.rms_legacy_import() then
    return new;
  end if;
  update public.rms_records
     set status = new.status,
         current_office_id = coalesce(new.to_office_id, current_office_id),
         assigned_to = case when new.assigned_to is not null then new.assigned_to
                            when coalesce(new.to_office_id, current_office_id) is distinct from current_office_id then null
                            else assigned_to end,
         assigned_at = case when new.assigned_to is not null then now()
                            when coalesce(new.to_office_id, current_office_id) is distinct from current_office_id then null
                            else assigned_at end
   where id = new.record_id;
  return new;
end $$;
revoke execute on function public.rms_routes_apply() from public, anon, authenticated;

-- c2. Records: a new record never starts with an assignee --------------------------------------
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
  new.assigned_to := null;
  new.assigned_at := null;
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
revoke execute on function public.rms_records_guard_insert() from public, anon, authenticated;

-- d. Records: the assignee changes only through a route step ----------------------------------
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
  if new.assigned_to is distinct from old.assigned_to or new.assigned_at is distinct from old.assigned_at then
    raise exception 'assign a person with the Assign button, so it is saved in the history';
  end if;
  return new;
end $$;
revoke execute on function public.rms_records_guard_update() from public, anon, authenticated;
