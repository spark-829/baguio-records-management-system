-- Baguio RMS: requests for copies, with Data Privacy Officer (City Legal Officer) approval and a release log.
-- Run after 20261124000600. Safe to run again. Safe with the previous app version. No drops or deletes.
-- No FK from rms_routes / rms_attachments / rms_access_log to rms_profiles is added here (PostgREST embeds).

insert into public.rms_document_types (name, retention_years) values ('Request for copy', 5) on conflict (name) do nothing;

-- a. Table -----------------------------------------------------------------------------------------
create table if not exists public.rms_copy_requests (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.rms_records (id) on delete cascade,
  source_tracking_no text not null check (length(source_tracking_no) between 6 and 40),
  source_record_id uuid references public.rms_records (id),
  pages int check (pages between 1 and 5000),
  fee_php numeric(10, 2) check (fee_php between 0 and 100000),
  requester_kind text not null check (requester_kind in ('owner', 'representative')),
  id_checked boolean not null default false,
  authorization_checked boolean not null default false,
  dpo_required boolean not null default false,
  dpo_status text not null default 'not_needed' check (dpo_status in ('not_needed', 'pending', 'approved', 'refused')),
  dpo_by uuid references public.rms_profiles (id),
  dpo_at timestamptz,
  dpo_reason text check (dpo_reason is null or length(dpo_reason) <= 1000),
  released_to text check (released_to is null or length(released_to) between 2 and 200),
  released_id_checked boolean,
  released_by uuid references public.rms_profiles (id),
  released_at timestamptz,
  created_by uuid not null default auth.uid() references public.rms_profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists rms_copy_requests_source_idx on public.rms_copy_requests (source_record_id);
create index if not exists rms_copy_requests_pending_idx on public.rms_copy_requests (dpo_status) where dpo_status = 'pending';

-- b. RLS and audit -----------------------------------------------------------------------------------
alter table public.rms_copy_requests enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_copy_requests' and policyname = 'rms_copy_requests_select') then
    create policy rms_copy_requests_select on public.rms_copy_requests for select to authenticated
      using ((select public.rms_can_view(record_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_copy_requests' and policyname = 'rms_copy_requests_insert') then
    create policy rms_copy_requests_insert on public.rms_copy_requests for insert to authenticated
      with check (created_by = (select auth.uid()) and (select public.rms_my_role()) = 'records_officer');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'rms_audit_copy_requests' and tgrelid = 'public.rms_copy_requests'::regclass) then
    create trigger rms_audit_copy_requests after insert or update or delete on public.rms_copy_requests
      for each row execute function public.rms_audit();
  end if;
end $$;
-- No update or delete policies: dpo_status changes only through rms_copy_decide, release only through rms_copy_release.
revoke all on public.rms_copy_requests from anon;
revoke update, delete on public.rms_copy_requests from authenticated;

-- c. Insert guard --------------------------------------------------------------------------------------
create or replace function public.rms_copy_requests_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  src record;
  req record;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  new.dpo_by := null;
  new.dpo_at := null;
  new.dpo_reason := null;
  new.released_to := null;
  new.released_id_checked := null;
  new.released_by := null;
  new.released_at := null;
  new.created_at := now();
  new.source_tracking_no := upper(trim(new.source_tracking_no));

  select r.id, r.confidentiality into src from public.rms_records r
   where r.tracking_no = new.source_tracking_no and r.deleted_at is null and r.id <> new.record_id;
  if not found then raise exception 'no record with that tracking number'; end if;
  new.source_record_id := src.id;
  new.dpo_required := (src.confidentiality = 'confidential');
  new.dpo_status := case when new.dpo_required then 'pending' else 'not_needed' end;

  if new.requester_kind = 'representative' and not new.authorization_checked then
    raise exception 'check the authorization letter or SPA for a representative';
  end if;

  select r.id into req from public.rms_records r
    join public.rms_document_types dt on dt.id = r.document_type_id
   where r.id = new.record_id and r.deleted_at is null and dt.name = 'Request for copy';
  if not found then raise exception 'the record must be a request for copy'; end if;
  return new;
end $$;
revoke execute on function public.rms_copy_requests_guard_insert() from public, anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'rms_copy_requests_guard_insert' and tgrelid = 'public.rms_copy_requests'::regclass) then
    create trigger rms_copy_requests_guard_insert before insert on public.rms_copy_requests
      for each row execute function public.rms_copy_requests_guard_insert();
  end if;
end $$;

-- d. Decide (City Legal Officer head only) --------------------------------------------------------------
create or replace function public.rms_copy_decide(p_record_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_clo uuid;
  r record;
  c record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select id into v_clo from public.rms_offices where code = 'CLO';
  if public.rms_my_role() is distinct from 'dept_head' or v_clo is null or public.rms_my_office() is distinct from v_clo then
    raise exception 'only the City Legal Officer (Data Privacy Officer) can decide';
  end if;
  perform public.rms_lock_record(p_record_id);
  select status, current_office_id, deleted_at into r from public.rms_records where id = p_record_id;
  if not found or r.deleted_at is not null or r.current_office_id is distinct from v_clo or r.status not in ('received', 'under_action') then
    raise exception 'send the request to the City Legal Office and mark it received first';
  end if;
  select id, dpo_status into c from public.rms_copy_requests where record_id = p_record_id;
  if not found or c.dpo_status <> 'pending' then
    raise exception 'this request is not waiting for approval';
  end if;
  if not coalesce(p_approve, false) and (v_reason is null or length(v_reason) not between 5 and 1000) then
    raise exception 'give a reason of at least 5 characters for refusing';
  end if;
  update public.rms_copy_requests
     set dpo_status = case when p_approve then 'approved' else 'refused' end,
         dpo_by = auth.uid(), dpo_at = now(), dpo_reason = v_reason
   where id = c.id;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by)
  values (p_record_id, r.current_office_id, r.current_office_id, r.status,
          case when p_approve then 'Release approved (Data Privacy Officer)' else 'Release refused (Data Privacy Officer)' end,
          v_reason, auth.uid());
end $$;
revoke execute on function public.rms_copy_decide(uuid, boolean, text) from public, anon;
grant execute on function public.rms_copy_decide(uuid, boolean, text) to authenticated;

-- e. Release ---------------------------------------------------------------------------------------------
create or replace function public.rms_copy_release(p_record_id uuid, p_received_by text, p_id_checked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  r record;
  c record;
  v_name text := trim(coalesce(p_received_by, ''));
begin
  perform public.rms_lock_record(p_record_id);
  select status, current_office_id, deleted_at into r from public.rms_records where id = p_record_id;
  if not found or r.deleted_at is not null then raise exception 'record not found'; end if;
  if not (v_role = 'records_officer'
          or (v_role in ('dept_head', 'staff') and public.rms_my_office() = r.current_office_id)) then
    raise exception 'only the records desk or the office holding the request can release the copy';
  end if;
  if r.status not in ('registered', 'received', 'under_action', 'completed') then
    raise exception 'the request is not at a step where a copy can be released';
  end if;
  select id, dpo_status, dpo_required, released_at into c from public.rms_copy_requests where record_id = p_record_id;
  if not found or c.released_at is not null then raise exception 'there is no copy waiting to be released'; end if;
  if c.dpo_status not in ('not_needed', 'approved') then
    raise exception 'you can release the copy after the Data Privacy Officer approves';
  end if;
  if length(v_name) not between 2 and 200 then raise exception 'type the name of the person who received the copy'; end if;
  if c.dpo_required and not coalesce(p_id_checked, false) then
    raise exception 'check the ID of the person receiving a confidential copy';
  end if;
  update public.rms_copy_requests
     set released_to = v_name, released_id_checked = coalesce(p_id_checked, false),
         released_by = auth.uid(), released_at = now()
   where id = c.id;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by)
  values (p_record_id, r.current_office_id, r.current_office_id, 'completed', 'Copy released', 'Received by ' || v_name, auth.uid());
end $$;
revoke execute on function public.rms_copy_release(uuid, text, boolean) from public, anon;
grant execute on function public.rms_copy_release(uuid, text, boolean) to authenticated;
