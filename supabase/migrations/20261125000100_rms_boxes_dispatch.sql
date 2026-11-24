-- Baguio RMS: storage boxes (box locator), the release log (how a record was sent, who received it), QA-049 and QA-050.
-- Run after 20261124000800. Safe to run again. Safe with the previous app version. No drops or deletes.
-- rms_search_records_v2 is left as it is (a same-name overload would make PostgREST calls ambiguous for the previous app).

-- a. Boxes ---------------------------------------------------------------------------------------------
create table if not exists public.rms_boxes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$'),
  office_id uuid not null references public.rms_offices (id),
  room text not null check (length(room) between 1 and 100),
  shelf text check (shelf is null or length(shelf) <= 100),
  contents text check (contents is null or length(contents) <= 1000),
  year_from int check (year_from between 1900 and 2100),
  year_to int check (year_to between 1900 and 2100),
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid not null default auth.uid() references public.rms_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rms_boxes_years check (year_from is null or year_to is null or year_to >= year_from)
);
create index if not exists rms_boxes_office_idx on public.rms_boxes (office_id);
alter table public.rms_boxes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_boxes' and policyname = 'rms_boxes_select') then
    create policy rms_boxes_select on public.rms_boxes for select to authenticated
      using ((select public.rms_my_role()) in ('records_officer', 'dept_head', 'staff', 'viewer'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_boxes' and policyname = 'rms_boxes_insert') then
    create policy rms_boxes_insert on public.rms_boxes for insert to authenticated
      with check ((select public.rms_my_role()) = 'records_officer' and created_by = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_boxes' and policyname = 'rms_boxes_update') then
    create policy rms_boxes_update on public.rms_boxes for update to authenticated
      using ((select public.rms_my_role()) = 'records_officer')
      with check ((select public.rms_my_role()) = 'records_officer');
  end if;
end $$;
revoke all on public.rms_boxes from anon;
revoke delete, truncate on public.rms_boxes from authenticated;

create or replace function public.rms_boxes_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.rms_my_role() is distinct from 'records_officer' then
    raise exception 'only the records desk adds or changes boxes';
  end if;
  new.code := upper(regexp_replace(trim(new.code), '\s+', '-', 'g'));
  new.room := trim(new.room);
  new.shelf := nullif(trim(new.shelf), '');
  new.contents := nullif(trim(new.contents), '');
  new.notes := nullif(trim(new.notes), '');
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.rms_boxes_guard() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'rms_boxes_guard' and tgrelid = 'public.rms_boxes'::regclass) then
    create trigger rms_boxes_guard before insert or update on public.rms_boxes
      for each row execute function public.rms_boxes_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'rms_audit_boxes' and tgrelid = 'public.rms_boxes'::regclass) then
    create trigger rms_audit_boxes after insert or update or delete on public.rms_boxes
      for each row execute function public.rms_audit();
  end if;
end $$;

-- b. Column on records -----------------------------------------------------------------------------------
alter table public.rms_records add column if not exists box_id uuid references public.rms_boxes (id);
create index if not exists rms_records_box_idx on public.rms_records (box_id) where box_id is not null and deleted_at is null;

-- c. Records guard: box_id changes only through rms_set_record_box; QA-049 (admin edits only confidentiality) ----
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
  -- QA-049: admins keep confidentiality changes; soft delete/restore run in security-definer functions (early return above).
  if v_role = 'admin'
     and (to_jsonb(new) - array['confidentiality', 'updated_at', 'search']) is distinct from (to_jsonb(old) - array['confidentiality', 'updated_at', 'search']) then
    raise exception 'administrators can change only the confidentiality level; the records desk edits record details (separation of duties)';
  end if;
  return new;
end $$;
revoke execute on function public.rms_records_guard_update() from public, anon, authenticated;

-- d. Put a record in a box, take it out, or move it (any status, archived too; every move is in the history) ----
create or replace function public.rms_set_record_box(p_record_id uuid, p_box_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_code text := nullif(upper(regexp_replace(trim(coalesce(p_box_code, '')), '\s+', '-', 'g')), '');
  r record;
  v_new uuid;
  v_new_code text;
  v_old_code text;
  v_text text;
begin
  if public.rms_my_role() is distinct from 'records_officer' then
    raise exception 'only the records desk puts records in boxes';
  end if;
  perform public.rms_lock_record(p_record_id);
  select status, current_office_id, box_id, deleted_at into r from public.rms_records where id = p_record_id;
  if not found or r.deleted_at is not null then
    raise exception 'record not found';
  end if;
  if v_code is not null then
    select id, code into v_new, v_new_code from public.rms_boxes where code = v_code;
    if not found then
      raise exception 'no box with that code';
    end if;
  end if;
  if v_new is not distinct from r.box_id then
    return false;
  end if;
  select code into v_old_code from public.rms_boxes where id = r.box_id;
  if r.box_id is null then
    v_text := 'Put in box ' || v_new_code;
  elsif v_new is null then
    v_text := 'Taken out of box ' || v_old_code;
  else
    v_text := 'Moved from box ' || v_old_code || ' to ' || v_new_code;
  end if;
  update public.rms_records set box_id = v_new where id = p_record_id;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by)
  values (p_record_id, r.current_office_id, r.current_office_id, r.status, v_text, auth.uid());
  return true;
end $$;
revoke execute on function public.rms_set_record_box(uuid, text) from public, anon;
grant execute on function public.rms_set_record_box(uuid, text) to authenticated;

-- e. Box list with record counts ----------------------------------------------------------------------------
create or replace function public.rms_box_list(p_q text default null, p_limit int default 50)
returns table (
  id uuid, code text, office_code text, office_name text, room text, shelf text,
  year_from int, year_to int, contents text, records int, total int
)
language sql stable security invoker set search_path = '' as $$
  select b.id, b.code, o.code, o.name, b.room, b.shelf, b.year_from, b.year_to, b.contents,
         (select count(*) from public.rms_records r where r.box_id = b.id and r.deleted_at is null)::int,
         (count(*) over ())::int
  from public.rms_boxes b
  join public.rms_offices o on o.id = b.office_id
  where nullif(trim(p_q), '') is null
     or concat_ws(' ', b.code, o.code, o.name, b.room, b.shelf, b.contents) ilike '%' || trim(p_q) || '%'
  order by b.code
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
$$;
revoke execute on function public.rms_box_list(text, int) from public, anon;
grant execute on function public.rms_box_list(text, int) to authenticated;

-- f. Search v3: v2 plus the box code (v2 stays for the previous app) -----------------------------------------
create or replace function public.rms_search_records_v3(
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
  p_box_code text default null
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
    and (p_box_code is null or r.box_id = (select b.id from public.rms_boxes b where b.code = upper(trim(p_box_code))))
  order by 17 desc, r.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke execute on function public.rms_search_records_v3 from public, anon;
grant execute on function public.rms_search_records_v3 to authenticated;

-- g. Dispatches (how an outgoing record was sent, and who received it) -------------------------------------
create table if not exists public.rms_dispatches (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.rms_records (id),
  method text not null check (method in ('registered_mail', 'courier', 'hand', 'email', 'other')),
  courier text check (courier is null or length(courier) between 1 and 60),
  tracking_no text check (tracking_no is null or tracking_no ~ '^[A-Z0-9-]{4,40}$'),
  sent_on date not null check (sent_on >= date '2000-01-01'),
  sent_by uuid not null references public.rms_profiles (id),
  sent_at timestamptz not null default now(),
  received_by text check (received_by is null or length(received_by) between 2 and 200),
  received_on date,
  delivery_note text check (delivery_note is null or length(delivery_note) <= 1000),
  delivery_by uuid references public.rms_profiles (id),
  delivery_at timestamptz,
  constraint rms_dispatches_tracking check (method not in ('registered_mail', 'courier') or tracking_no is not null),
  constraint rms_dispatches_delivery check (received_on is null or received_on >= sent_on)
);
create index if not exists rms_dispatches_sent_on_idx on public.rms_dispatches (sent_on);
alter table public.rms_dispatches enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_dispatches' and policyname = 'rms_dispatches_select') then
    create policy rms_dispatches_select on public.rms_dispatches for select to authenticated
      using ((select public.rms_my_role()) in ('records_officer', 'dept_head', 'staff', 'viewer')
             and (select public.rms_can_view(record_id)));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'rms_audit_dispatches' and tgrelid = 'public.rms_dispatches'::regclass) then
    create trigger rms_audit_dispatches after insert or update or delete on public.rms_dispatches
      for each row execute function public.rms_audit();
  end if;
end $$;
-- No insert or update policies: rows are written only by rms_release_record and rms_record_delivery.
revoke all on public.rms_dispatches from anon;
revoke insert, update, delete, truncate on public.rms_dispatches from authenticated;

-- h. Send a record out ---------------------------------------------------------------------------------------
create or replace function public.rms_release_record(
  p_record_id uuid, p_method text, p_courier text, p_tracking_no text, p_sent_on date, p_note text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  r record;
  v_track text;
  v_courier text;
  v_how text;
  v_text text;
begin
  perform public.rms_lock_record(p_record_id);
  select status, direction, current_office_id, deleted_at into r from public.rms_records where id = p_record_id;
  if not found or r.deleted_at is not null then
    raise exception 'record not found';
  end if;
  if not coalesce(v_role = 'records_officer'
                  or (v_role in ('dept_head', 'staff') and public.rms_my_office() = r.current_office_id), false) then
    raise exception 'only the records desk or the office holding the record can send it out';
  end if;
  if r.direction <> 'outgoing' then
    raise exception 'only a record the City sends out can be marked as sent out';
  end if;
  if exists (select 1 from public.rms_dispatches d where d.record_id = p_record_id) then
    raise exception 'this record was already sent out';
  end if;
  if r.status not in ('registered', 'completed') then
    raise exception 'that step is not allowed for a record that is %', r.status;
  end if;
  if p_method is null or p_method not in ('registered_mail', 'courier', 'hand', 'email', 'other') then
    raise exception 'choose how it was sent';
  end if;
  if p_method in ('registered_mail', 'courier') then
    v_track := nullif(upper(regexp_replace(coalesce(p_tracking_no, ''), '\s', '', 'g')), '');
    if v_track is null or v_track !~ '^[A-Z0-9-]{4,40}$' then
      raise exception 'enter the tracking number from the receipt';
    end if;
  else
    v_track := null;
  end if;
  v_courier := case when p_method = 'courier' then nullif(left(trim(coalesce(p_courier, '')), 60), '') end;
  if p_sent_on is null or p_sent_on < date '2000-01-01' then
    raise exception 'enter the date sent';
  end if;
  if p_sent_on > public.rms_today() then
    raise exception 'the date sent cannot be in the future';
  end if;
  v_how := case p_method
    when 'registered_mail' then 'Registered mail (PHLPost)'
    when 'courier' then coalesce(v_courier, 'courier')
    when 'hand' then 'hand delivery'
    when 'email' then 'email'
    else 'other means'
  end;
  v_text := 'Sent out by ' || v_how || coalesce(', tracking ' || v_track, '');
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by)
  values (p_record_id, r.current_office_id, r.current_office_id, 'released', v_text,
          nullif(left(trim(coalesce(p_note, '')), 2000), ''), auth.uid());
  insert into public.rms_dispatches (record_id, method, courier, tracking_no, sent_on, sent_by)
  values (p_record_id, p_method, v_courier, v_track, p_sent_on, auth.uid());
end $$;
revoke execute on function public.rms_release_record(uuid, text, text, text, date, text) from public, anon;
grant execute on function public.rms_release_record(uuid, text, text, text, date, text) to authenticated;

-- i. Record who received it ------------------------------------------------------------------------------------
create or replace function public.rms_record_delivery(
  p_record_id uuid, p_received_by text, p_received_on date, p_note text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  r record;
  d record;
  v_name text;
begin
  perform public.rms_lock_record(p_record_id);
  select status, origin_office_id, current_office_id, deleted_at into r from public.rms_records where id = p_record_id;
  if not found or r.deleted_at is not null then
    raise exception 'record not found';
  end if;
  if not coalesce(v_role = 'records_officer'
                  or (v_role in ('dept_head', 'staff') and public.rms_my_office() in (r.origin_office_id, r.current_office_id)), false) then
    raise exception 'only the records desk or the sending office can record delivery';
  end if;
  if r.status <> 'released' then
    raise exception 'delivery can be recorded only while the record is sent out';
  end if;
  select * into d from public.rms_dispatches where record_id = p_record_id;
  if not found then
    raise exception 'there is no sending record for this record';
  end if;
  if d.received_by is not null then
    raise exception 'delivery is already recorded';
  end if;
  v_name := trim(coalesce(p_received_by, ''));
  if length(v_name) not between 2 and 200 then
    raise exception 'type the name of the person who received it';
  end if;
  if p_received_on is null then
    raise exception 'enter the date received';
  end if;
  if p_received_on < d.sent_on then
    raise exception 'the date received cannot be before the date sent';
  end if;
  if p_received_on > public.rms_today() then
    raise exception 'the date received cannot be in the future';
  end if;
  update public.rms_dispatches
     set received_by = v_name,
         received_on = p_received_on,
         delivery_note = nullif(left(trim(coalesce(p_note, '')), 1000), ''),
         delivery_by = auth.uid(),
         delivery_at = now()
   where id = d.id;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by)
  values (p_record_id, r.current_office_id, r.current_office_id, 'released',
          'Delivery recorded: received by ' || v_name || ' on ' || to_char(p_received_on, 'FMDD Mon YYYY'),
          nullif(left(trim(coalesce(p_note, '')), 1000), ''), auth.uid());
end $$;
revoke execute on function public.rms_record_delivery(uuid, text, date, text) from public, anon;
grant execute on function public.rms_record_delivery(uuid, text, date, text) to authenticated;

-- j. Released documents logbook (one day) ------------------------------------------------------------------------
create or replace function public.rms_report_released(p_day date)
returns table (
  record_id uuid, tracking_no text, subject text, recipient text, office_code text, office_name text,
  method text, courier text, courier_tracking text, sent_on date, sent_at timestamptz, sent_by text,
  received_by text, received_on date
)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_role public.rms_role := public.rms_my_role();
  v_office uuid := public.rms_my_office();
begin
  if v_role is null or v_role not in ('records_officer', 'dept_head') then
    raise exception 'only the records desk or an office head can open the logbook';
  end if;
  return query
  select r.id, r.tracking_no, r.subject, concat_ws(', ', r.recipient_name, r.recipient_org), o.code, o.name,
         d.method, d.courier, d.tracking_no, d.sent_on, d.sent_at, p.full_name, d.received_by, d.received_on
  from public.rms_dispatches d
  join public.rms_records r on r.id = d.record_id and r.deleted_at is null
  join public.rms_offices o on o.id = r.origin_office_id
  left join public.rms_profiles p on p.id = d.sent_by
  where d.sent_on = p_day
    and (v_role = 'records_officer' or r.origin_office_id = v_office or r.current_office_id = v_office)
  order by d.sent_at, r.tracking_no
  limit 1000;
end $$;
revoke execute on function public.rms_report_released(date) from public, anon;
grant execute on function public.rms_report_released(date) to authenticated;

-- k. QA-050: standard minutes. A partial object merges with the stored value; 600.0 is accepted ---------------
create or replace function public.rms_set_step_minutes(p_minutes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  n numeric;
  v_cur jsonb;
  clean jsonb := '{}'::jsonb;
begin
  if public.rms_my_role() is distinct from 'records_officer' then
    raise exception 'only the records desk sets standard times';
  end if;
  if p_minutes is null or jsonb_typeof(p_minutes) <> 'object' then
    raise exception 'type minutes from 1 to 600';
  end if;
  select s.value into v_cur from public.rms_settings s where s.key = 'step_minutes';
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into clean
    from jsonb_each(coalesce(v_cur, '{"register":9,"forward":5,"receive":5,"assign":5,"act":5}'::jsonb)) e
   where e.key in ('register', 'forward', 'receive', 'assign', 'act');
  for k, v in select * from jsonb_each(p_minutes) loop
    if k not in ('register', 'forward', 'receive', 'assign', 'act') or jsonb_typeof(v) <> 'number' then
      raise exception 'type minutes from 1 to 600';
    end if;
    n := (v #>> '{}')::numeric;
    if n <> trunc(n) or n < 1 or n > 600 then
      raise exception 'type minutes from 1 to 600';
    end if;
    clean := clean || jsonb_build_object(k, n::int);
  end loop;
  insert into public.rms_settings (key, value, description)
  values ('step_minutes', clean, 'Standard minutes per step (Citizen''s Charter, GSO Service 15)')
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return clean;
end;
$$;
revoke execute on function public.rms_set_step_minutes(jsonb) from public, anon;
grant execute on function public.rms_set_step_minutes(jsonb) to authenticated;

-- l. Reload the API schema --------------------------------------------------------------------------------------
notify pgrst, 'reload schema';
