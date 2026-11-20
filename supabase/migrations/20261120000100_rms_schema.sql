-- Baguio RMS: core schema
-- All objects are prefixed rms_ so they can share a Supabase project with other apps.

create extension if not exists pg_trgm with schema extensions;

-- Enums ---------------------------------------------------------------
create type public.rms_role as enum ('admin', 'records_officer', 'dept_head', 'staff');
create type public.rms_direction as enum ('incoming', 'outgoing');
create type public.rms_status as enum ('registered', 'forwarded', 'received', 'under_action', 'completed', 'released', 'archived');
create type public.rms_confidentiality as enum ('public', 'internal', 'confidential');
create type public.rms_priority as enum ('low', 'normal', 'urgent');

-- Reference tables ----------------------------------------------------
create table public.rms_offices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rms_document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  retention_years int not null default 5 check (retention_years between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rms_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.rms_role not null default 'staff',
  office_id uuid references public.rms_offices (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Records -------------------------------------------------------------
create table public.rms_counters (
  direction public.rms_direction not null,
  year int not null,
  last_value int not null default 0,
  primary key (direction, year)
);

create table public.rms_records (
  id uuid primary key default gen_random_uuid(),
  tracking_no text not null unique,
  direction public.rms_direction not null,
  subject text not null check (length(subject) between 3 and 300),
  description text,
  document_type_id uuid not null references public.rms_document_types (id),
  category text,
  keywords text[] not null default '{}',
  priority public.rms_priority not null default 'normal',
  confidentiality public.rms_confidentiality not null default 'internal',
  sender_name text,
  sender_org text,
  recipient_name text,
  recipient_org text,
  mode text check (mode in ('walk-in', 'courier', 'mail', 'email', 'internal')),
  document_date date,
  origin_office_id uuid not null references public.rms_offices (id),
  current_office_id uuid not null references public.rms_offices (id),
  status public.rms_status not null default 'registered',
  due_date date,
  created_by uuid not null default auth.uid() references public.rms_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector
);

create index rms_records_search_idx on public.rms_records using gin (search);
create index rms_records_subject_trgm_idx on public.rms_records using gin (subject extensions.gin_trgm_ops);
create index rms_records_status_idx on public.rms_records (status);
create index rms_records_current_office_idx on public.rms_records (current_office_id);
create index rms_records_origin_office_idx on public.rms_records (origin_office_id);
create index rms_records_created_at_idx on public.rms_records (created_at desc);
create index rms_records_doc_type_idx on public.rms_records (document_type_id);
create index rms_records_created_by_idx on public.rms_records (created_by);

-- Routing history + actions/remarks (insert-only)
create table public.rms_routes (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.rms_records (id) on delete cascade,
  from_office_id uuid references public.rms_offices (id),
  to_office_id uuid references public.rms_offices (id),
  status public.rms_status not null,
  action_taken text,
  remarks text,
  acted_by uuid not null default auth.uid() references public.rms_profiles (id),
  created_at timestamptz not null default now()
);
create index rms_routes_record_idx on public.rms_routes (record_id, created_at);
create index rms_routes_to_office_idx on public.rms_routes (to_office_id);
create index rms_routes_from_office_idx on public.rms_routes (from_office_id);
create index rms_routes_acted_by_idx on public.rms_routes (acted_by);

create table public.rms_attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.rms_records (id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  version int not null default 1,
  uploaded_by uuid not null default auth.uid() references public.rms_profiles (id),
  uploaded_at timestamptz not null default now()
);
create index rms_attachments_record_idx on public.rms_attachments (record_id);
create index rms_attachments_uploaded_by_idx on public.rms_attachments (uploaded_by);

create table public.rms_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index rms_audit_log_created_idx on public.rms_audit_log (created_at desc);
create index rms_audit_log_row_idx on public.rms_audit_log (table_name, row_id);

-- Helper functions ----------------------------------------------------
create or replace function public.rms_my_role()
returns public.rms_role language sql stable security definer set search_path = '' as $$
  select role from public.rms_profiles where id = (select auth.uid()) and is_active
$$;

create or replace function public.rms_my_office()
returns uuid language sql stable security definer set search_path = '' as $$
  select office_id from public.rms_profiles where id = (select auth.uid()) and is_active
$$;

create or replace function public.rms_can_view(p_record_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.rms_records r
    join public.rms_profiles p on p.id = (select auth.uid()) and p.is_active
    where r.id = p_record_id
      and (
        p.role in ('admin', 'records_officer')
        or (
          (r.origin_office_id = p.office_id
            or r.current_office_id = p.office_id
            or exists (select 1 from public.rms_routes rt
                       where rt.record_id = r.id and rt.to_office_id = p.office_id))
          and (r.confidentiality <> 'confidential'
               or (p.role = 'dept_head' and (r.origin_office_id = p.office_id or r.current_office_id = p.office_id)))
        )
      )
  )
$$;

-- Tracking number + search vector -------------------------------------
create or replace function public.rms_records_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_year int := extract(year from now() at time zone 'Asia/Manila');
  v_next int;
begin
  insert into public.rms_counters (direction, year, last_value)
  values (new.direction, v_year, 1)
  on conflict (direction, year) do update set last_value = public.rms_counters.last_value + 1
  returning last_value into v_next;

  new.tracking_no := (case new.direction when 'incoming' then 'IN' else 'OUT' end)
                     || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
  new.status := 'registered';
  new.current_office_id := coalesce(new.current_office_id, new.origin_office_id);
  return new;
end $$;

create trigger rms_records_before_insert
before insert on public.rms_records
for each row execute function public.rms_records_before_insert();

create or replace function public.rms_records_set_search()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.search :=
    setweight(to_tsvector('simple', coalesce(new.tracking_no, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.subject, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(new.keywords, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C') ||
    setweight(to_tsvector('simple', concat_ws(' ', new.sender_name, new.sender_org, new.recipient_name, new.recipient_org)), 'C');
  new.updated_at := now();
  return new;
end $$;

create trigger rms_records_set_search
before insert or update on public.rms_records
for each row execute function public.rms_records_set_search();

-- First history row when a record is registered
create or replace function public.rms_records_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by, created_at)
  values (new.id, null, new.origin_office_id, 'registered',
          case new.direction when 'incoming' then 'Received and registered' else 'Registered for release' end,
          new.created_by, new.created_at);
  return new;
end $$;

create trigger rms_records_after_insert
after insert on public.rms_records
for each row execute function public.rms_records_after_insert();

-- A route row moves the record
create or replace function public.rms_routes_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'registered' then
    return new;
  end if;
  update public.rms_records
     set status = new.status,
         current_office_id = coalesce(new.to_office_id, current_office_id)
   where id = new.record_id;
  return new;
end $$;

create trigger rms_routes_apply
after insert on public.rms_routes
for each row execute function public.rms_routes_apply();

create or replace function public.rms_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger rms_profiles_touch before update on public.rms_profiles
for each row execute function public.rms_touch_updated_at();

-- Audit trail ---------------------------------------------------------
create or replace function public.rms_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'search' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'search' end;
begin
  insert into public.rms_audit_log (table_name, row_id, action, old_data, new_data, actor_id)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), tg_op, v_old, v_new, auth.uid());
  return coalesce(new, old);
end $$;

create trigger rms_audit_records after insert or update or delete on public.rms_records for each row execute function public.rms_audit();
create trigger rms_audit_routes after insert or update or delete on public.rms_routes for each row execute function public.rms_audit();
create trigger rms_audit_attachments after insert or update or delete on public.rms_attachments for each row execute function public.rms_audit();
create trigger rms_audit_profiles after insert or update or delete on public.rms_profiles for each row execute function public.rms_audit();
create trigger rms_audit_offices after insert or update or delete on public.rms_offices for each row execute function public.rms_audit();
create trigger rms_audit_doc_types after insert or update or delete on public.rms_document_types for each row execute function public.rms_audit();

-- Row-level security --------------------------------------------------
alter table public.rms_offices enable row level security;
alter table public.rms_document_types enable row level security;
alter table public.rms_profiles enable row level security;
alter table public.rms_counters enable row level security;
alter table public.rms_records enable row level security;
alter table public.rms_routes enable row level security;
alter table public.rms_attachments enable row level security;
alter table public.rms_audit_log enable row level security;

-- reference data: readable by any active RMS user, managed by admins
create policy rms_offices_select on public.rms_offices for select to authenticated
  using ((select public.rms_my_role()) is not null);
create policy rms_offices_admin_insert on public.rms_offices for insert to authenticated
  with check ((select public.rms_my_role()) = 'admin');
create policy rms_offices_admin_update on public.rms_offices for update to authenticated
  using ((select public.rms_my_role()) = 'admin') with check ((select public.rms_my_role()) = 'admin');

create policy rms_doc_types_select on public.rms_document_types for select to authenticated
  using ((select public.rms_my_role()) is not null);
create policy rms_doc_types_admin_insert on public.rms_document_types for insert to authenticated
  with check ((select public.rms_my_role()) = 'admin');
create policy rms_doc_types_admin_update on public.rms_document_types for update to authenticated
  using ((select public.rms_my_role()) = 'admin') with check ((select public.rms_my_role()) = 'admin');

-- profiles: everyone in RMS can see names (for timelines); only admins change them
create policy rms_profiles_select on public.rms_profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.rms_my_role()) is not null);
create policy rms_profiles_admin_insert on public.rms_profiles for insert to authenticated
  with check ((select public.rms_my_role()) = 'admin');
create policy rms_profiles_admin_update on public.rms_profiles for update to authenticated
  using ((select public.rms_my_role()) = 'admin') with check ((select public.rms_my_role()) = 'admin');

-- records
-- inline checks first so INSERT ... RETURNING works (the helper cannot see the new row yet)
create policy rms_records_select on public.rms_records for select to authenticated
  using (
    (select public.rms_my_role()) in ('admin', 'records_officer')
    or (
      (origin_office_id = (select public.rms_my_office()) or current_office_id = (select public.rms_my_office()))
      and (confidentiality <> 'confidential' or (select public.rms_my_role()) = 'dept_head')
    )
    or public.rms_can_view(id)
  );
create policy rms_records_insert on public.rms_records for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select public.rms_my_role()) in ('admin', 'records_officer')
      or (direction = 'outgoing' and origin_office_id = (select public.rms_my_office()))
    )
  );
create policy rms_records_update on public.rms_records for update to authenticated
  using (
    (select public.rms_my_role()) in ('admin', 'records_officer')
    or (current_office_id = (select public.rms_my_office()) and (select public.rms_my_role()) = 'dept_head')
  )
  with check (
    (select public.rms_my_role()) in ('admin', 'records_officer')
    or (current_office_id = (select public.rms_my_office()) and (select public.rms_my_role()) = 'dept_head')
  );

-- routes: visible with the record; added by RO/admin or by the office currently holding it
create policy rms_routes_select on public.rms_routes for select to authenticated
  using ((select public.rms_can_view(record_id)));
create policy rms_routes_insert on public.rms_routes for insert to authenticated
  with check (
    acted_by = (select auth.uid())
    and status <> 'registered'
    and (
      (select public.rms_my_role()) in ('admin', 'records_officer')
      or exists (select 1 from public.rms_records r
                 where r.id = record_id
                   and r.current_office_id = (select public.rms_my_office()))
    )
  );

-- attachments
create policy rms_attachments_select on public.rms_attachments for select to authenticated
  using ((select public.rms_can_view(record_id)));
create policy rms_attachments_insert on public.rms_attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (select public.rms_can_view(record_id)));

-- audit log: admins read; nobody writes directly
create policy rms_audit_select on public.rms_audit_log for select to authenticated
  using ((select public.rms_my_role()) = 'admin');

-- rms_counters: no policies -> only security definer functions touch it

-- Storage -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rms-attachments', 'rms-attachments', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- object path = <record_id>/<uuid>-<file name>
create policy rms_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'rms-attachments'
         and (select public.rms_can_view(((storage.foldername(name))[1])::uuid)));
create policy rms_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rms-attachments'
              and (select public.rms_can_view(((storage.foldername(name))[1])::uuid)));

-- Lock down helper execution to signed-in users
revoke execute on function public.rms_my_role() from public, anon;
revoke execute on function public.rms_my_office() from public, anon;
revoke execute on function public.rms_can_view(uuid) from public, anon;
grant execute on function public.rms_my_role() to authenticated;
grant execute on function public.rms_my_office() to authenticated;
grant execute on function public.rms_can_view(uuid) to authenticated;
revoke execute on function public.rms_records_before_insert() from public, anon, authenticated;
revoke execute on function public.rms_records_after_insert() from public, anon, authenticated;
revoke execute on function public.rms_routes_apply() from public, anon, authenticated;
revoke execute on function public.rms_audit() from public, anon, authenticated;
