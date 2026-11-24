-- Baguio RMS: the office window (documents clients hand in at an office), reference number, charter steps on a record.
-- Run after 20261125000400. Safe to run again. Safe with the previous app version. No drops or deletes.
-- New columns are nullable. rms_search_records_v2 and v3 stay for the previous app. rms_routes_guard_insert is left as it is
-- (window records are normal records held by the office; step ticks go through rms_mark_charter_step).

-- a. Columns on records --------------------------------------------------------------------------------------
alter table public.rms_records add column if not exists intake_window boolean default false;
alter table public.rms_records add column if not exists reference_no text check (reference_no is null or length(reference_no) <= 40);
alter table public.rms_records add column if not exists reference_label text check (reference_label is null or length(reference_label) <= 80);
alter table public.rms_records add column if not exists service_id uuid references public.rms_services (id);
alter table public.rms_records add column if not exists service_steps jsonb check (service_steps is null or jsonb_typeof(service_steps) = 'array');
create index if not exists rms_records_reference_idx on public.rms_records (lower(reference_no) text_pattern_ops) where reference_no is not null;
create index if not exists rms_records_service_idx on public.rms_records (origin_office_id, service_id) where service_id is not null and deleted_at is null;
create index if not exists rms_records_window_idx on public.rms_records (origin_office_id) where intake_window;

-- b. Snapshot of a service's steps; step 1 is done at registration -----------------------------------------------
create or replace function public.rms_service_snapshot(p_service uuid, p_by uuid, p_at timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when jsonb_array_length(s.steps) = 0 then null else
    (select jsonb_agg(case when e.ord = 1
                           then e.v || jsonb_build_object('done_at', p_at, 'done_by', p_by)
                           else e.v end
                     order by e.ord)
       from jsonb_array_elements(s.steps) with ordinality as e(v, ord))
  end
  from public.rms_services s
  where s.id = p_service
$$;
revoke execute on function public.rms_service_snapshot(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.rms_service_snapshot(uuid, uuid, timestamptz) to authenticated;

-- c. Window insert policy (additive) ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_records' and policyname = 'rms_records_insert_window') then
    create policy rms_records_insert_window on public.rms_records for insert to authenticated
      with check (created_by = (select auth.uid()) and deleted_at is null and direction = 'incoming'
                  and origin_office_id = (select public.rms_my_office()) and (select public.rms_can_window_intake()));
  end if;
end $$;

-- c2. A window clerk can read the records they logged at the window (a confidential charter service would otherwise
-- fail on INSERT ... RETURNING). Additive select policy; rms_can_view gets the same clause, so attachments and the access log follow.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_records' and policyname = 'rms_records_select_own_window') then
    create policy rms_records_select_own_window on public.rms_records for select to authenticated
      using ((select public.rms_my_role()) is not null
             and deleted_at is null
             and created_by = (select auth.uid())
             and coalesce(intake_window, false)
             and origin_office_id = (select public.rms_my_office()));
  end if;
end $$;

create or replace function public.rms_can_view(p_record_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.rms_records r
    cross join lateral (select public.rms_my_role() as role, public.rms_my_office() as office) me
    where r.id = p_record_id
      and me.role is not null
      and (r.deleted_at is null or me.role = 'admin')
      and (
        me.role in ('admin', 'records_officer')
        or r.confidentiality = 'public'
        or (r.created_by = auth.uid() and coalesce(r.intake_window, false) and r.origin_office_id = me.office)
        or (
          (r.origin_office_id = me.office
            or r.current_office_id = me.office
            or exists (select 1 from public.rms_routes rt where rt.record_id = r.id and rt.to_office_id = me.office))
          and (r.confidentiality = 'internal'
               or (me.role = 'dept_head' and (r.origin_office_id = me.office or r.current_office_id = me.office)))
        )
      )
  )
$$;

-- d. Records guard (insert): window rule, service snapshot, reference number --------------------------------------
create or replace function public.rms_records_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  s record;
begin
  -- Seeds run as the owner: they still get the steps copied.
  if new.service_id is not null and new.service_steps is null then
    new.service_steps := public.rms_service_snapshot(new.service_id, new.created_by, coalesce(new.created_at, now()));
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if v_role = 'admin' then
    raise exception 'administrators look after accounts and security; the records desk registers records (separation of duties)';
  end if;
  new.assigned_to := null;
  new.assigned_at := null;
  new.created_at := now();
  new.intake_window := false;
  if new.direction = 'incoming' and v_role is distinct from 'records_officer' then
    if not public.rms_can_window_intake() then
      raise exception 'Only the office window staff and the Records Section log documents received from outside. Ask your department head.';
    end if;
    new.intake_window := true;
  end if;
  if v_role is distinct from 'admin' and v_role is distinct from 'records_officer' then
    new.current_office_id := new.origin_office_id;
  end if;
  -- Charter service: the steps are always copied by the database, never taken from the client.
  if new.service_id is not null then
    select sv.office_id, sv.is_active into s from public.rms_services sv where sv.id = new.service_id;
    if not found or not s.is_active then
      raise exception 'choose a service from the Citizen''s Charter list';
    end if;
    if new.direction <> 'incoming' then
      raise exception 'a charter service is picked only for documents received from clients';
    end if;
    if v_role is distinct from 'records_officer' and s.office_id is distinct from new.origin_office_id then
      raise exception 'choose a service of your own office';
    end if;
    new.service_steps := public.rms_service_snapshot(new.service_id, auth.uid(), now());
  else
    new.service_steps := null;
  end if;
  new.reference_no := nullif(btrim(new.reference_no), '');
  if length(new.reference_no) > 40 then
    raise exception 'Keep the reference number under 40 characters.';
  end if;
  new.reference_label := nullif(btrim(new.reference_label), '');
  if new.reference_no is null then
    new.reference_label := null;
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

-- e. Records guard (update): charter steps change only through rms_mark_charter_step -----------------------------
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
  if new.box_id is distinct from old.box_id then
    raise exception 'put a record in a box with the Put in a box button, so it is saved in the history';
  end if;
  if new.service_id is distinct from old.service_id
     or new.service_steps is distinct from old.service_steps
     or new.intake_window is distinct from old.intake_window then
    raise exception 'charter steps change only with the Mark step done button, so it is saved in the history';
  end if;
  -- QA-049: admins keep confidentiality changes; soft delete/restore run in security-definer functions (early return above).
  if v_role = 'admin'
     and (to_jsonb(new) - array['confidentiality', 'updated_at', 'search']) is distinct from (to_jsonb(old) - array['confidentiality', 'updated_at', 'search']) then
    raise exception 'administrators can change only the confidentiality level; the records desk edits record details (separation of duties)';
  end if;
  return new;
end $$;
revoke execute on function public.rms_records_guard_update() from public, anon, authenticated;

-- g. Mark a charter step done (or undo the last one within 10 minutes) ---------------------------------------------
create or replace function public.rms_mark_charter_step(p_record_id uuid, p_step int, p_undo boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  v_flag boolean;
  r record;
  e jsonb;
  v_low int;
  v_high int;
  v_route uuid;
  v_new jsonb;
begin
  if v_role is null or v_role in ('admin', 'viewer') then
    raise exception 'only office staff mark charter steps';
  end if;
  perform public.rms_lock_record(p_record_id);
  select status, current_office_id, assigned_to, service_steps, deleted_at into r
    from public.rms_records where id = p_record_id;
  if not found or r.deleted_at is not null then
    raise exception 'record not found';
  end if;
  if r.service_steps is null then
    raise exception 'this record has no charter steps';
  end if;
  if r.status not in ('registered', 'received', 'under_action') then
    raise exception 'charter steps can be marked only while the office is working on the record';
  end if;
  select coalesce(window_intake, false) into v_flag from public.rms_profiles where id = auth.uid();
  if not (public.rms_my_office() is not distinct from r.current_office_id
          and (auth.uid() = r.assigned_to or v_role in ('dept_head', 'records_officer') or (v_role = 'staff' and coalesce(v_flag, false)))) then
    raise exception 'only the office holding this record can mark its charter steps';
  end if;

  select min((x.v ->> 'n')::int) filter (where x.v ->> 'done_at' is null),
         max((x.v ->> 'n')::int) filter (where x.v ->> 'done_at' is not null)
    into v_low, v_high
    from jsonb_array_elements(r.service_steps) as x(v);

  if not coalesce(p_undo, false) then
    if p_step is distinct from v_low then
      raise exception 'mark the steps in order';
    end if;
    select x.v into e from jsonb_array_elements(r.service_steps) as x(v) where (x.v ->> 'n')::int = p_step;
    insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by)
    values (p_record_id, r.current_office_id, r.current_office_id, r.status,
            'Step ' || p_step || ' done: ' || coalesce(e ->> 'action', ''), auth.uid())
    returning id into v_route;
    select jsonb_agg(case when (x.v ->> 'n')::int = p_step
                          then x.v || jsonb_build_object('done_at', now(), 'done_by', auth.uid(), 'route_id', v_route)
                          else x.v end
                    order by x.ord)
      into v_new from jsonb_array_elements(r.service_steps) with ordinality as x(v, ord);
  else
    select x.v into e from jsonb_array_elements(r.service_steps) as x(v) where (x.v ->> 'n')::int = p_step;
    if e is null or p_step is distinct from v_high or p_step <= 1
       or (e ->> 'done_by') is distinct from auth.uid()::text
       or (e ->> 'done_at')::timestamptz <= now() - interval '10 minutes' then
      raise exception 'this step can no longer be undone';
    end if;
    insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by)
    values (p_record_id, r.current_office_id, r.current_office_id, r.status,
            'Step ' || p_step || ' undone: ' || coalesce(e ->> 'action', ''), auth.uid());
    select jsonb_agg(case when (x.v ->> 'n')::int = p_step
                          then x.v - 'done_at' - 'done_by' - 'route_id'
                          else x.v end
                    order by x.ord)
      into v_new from jsonb_array_elements(r.service_steps) with ordinality as x(v, ord);
  end if;
  update public.rms_records set service_steps = v_new where id = p_record_id;
  return v_new;
end $$;
revoke execute on function public.rms_mark_charter_step(uuid, int, boolean) from public, anon;
grant execute on function public.rms_mark_charter_step(uuid, int, boolean) to authenticated;

-- h. Search v4: v3 plus the reference number and "received at" (v2 and v3 stay for the previous app) -----------------
create or replace function public.rms_search_records_v4(
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
  p_intake text default null
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
         r.transaction_type, r.reference_no, r.intake_window
  from public.rms_records r
  cross join q
  join public.rms_document_types dt on dt.id = r.document_type_id
  join public.rms_offices co on co.id = r.current_office_id
  join public.rms_offices oo on oo.id = r.origin_office_id
  left join public.rms_profiles p on p.id = r.created_by
  where r.deleted_at is null
    and (not p_exclude_confidential or r.confidentiality <> 'confidential')
    and (q.tsq is null or r.search @@ q.tsq or r.subject ilike '%' || p_q || '%' or r.tracking_no ilike p_q || '%'
         or lower(r.reference_no) like lower(btrim(p_q)) || '%')
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
    and (p_box_code is null or r.box_id = (select b.id from public.rms_boxes b where b.code = upper(trim(p_box_code))))
    and (p_intake is null
         or (p_intake = 'window' and r.intake_window)
         or (p_intake = 'desk' and r.direction = 'incoming' and not coalesce(r.intake_window, false)))
  order by 17 desc, r.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke execute on function public.rms_search_records_v4 from public, anon;
grant execute on function public.rms_search_records_v4 to authenticated;

-- i. How often each service of an office was used (the most used show first in Register) ---------------------------
create or replace function public.rms_service_counts(p_office uuid)
returns table (service_id uuid, n bigint)
language sql stable security invoker set search_path = '' as $$
  select r.service_id, count(*)
    from public.rms_records r
   where r.origin_office_id = p_office and r.service_id is not null and r.deleted_at is null
   group by r.service_id
$$;
revoke execute on function public.rms_service_counts(uuid) from public, anon;
grant execute on function public.rms_service_counts(uuid) to authenticated;

-- j. Documents received at each office's own window ----------------------------------------------------------------
create or replace function public.rms_report_window_counts()
returns table (office_id uuid, n bigint)
language sql stable security invoker set search_path = '' as $$
  select r.origin_office_id, count(*)
    from public.rms_records r
   where r.direction = 'incoming' and r.intake_window and r.deleted_at is null
   group by r.origin_office_id
$$;
revoke execute on function public.rms_report_window_counts() from public, anon;
grant execute on function public.rms_report_window_counts() to authenticated;

-- k. Reload the API schema --------------------------------------------------------------------------------------
notify pgrst, 'reload schema';
