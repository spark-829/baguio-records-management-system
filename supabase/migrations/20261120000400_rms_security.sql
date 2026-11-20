-- Baguio RMS: security and privacy controls
-- settings, lockout, admin MFA, Public/Internal/Confidential visibility, Viewer role,
-- soft delete, IP capture, hash-chained audit log, access history, privacy report.

-- Settings ---------------------------------------------------------------
create table public.rms_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.rms_profiles (id)
);
insert into public.rms_settings (key, value, description) values
  ('lockout_threshold', '5', 'Failed sign-in attempts before the account locks'),
  ('lockout_minutes', '15', 'Minutes an account stays locked'),
  ('idle_timeout_minutes', '15', 'Minutes of inactivity before automatic sign-out'),
  ('watermark_downloads', 'true', 'Stamp "Viewed by name, date" on downloaded files'),
  ('ai_exclude_confidential', 'true', 'Keep Confidential records and their files out of AI features');

-- Profiles: lockout state ----------------------------------------------------
alter table public.rms_profiles
  add column failed_attempts int not null default 0,
  add column locked_until timestamptz,
  add column last_login_at timestamptz;

-- Records: soft delete -------------------------------------------------------
alter table public.rms_records
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.rms_profiles (id),
  add column delete_reason text;
create index rms_records_deleted_idx on public.rms_records (deleted_at) where deleted_at is not null;
create index rms_records_deleted_by_idx on public.rms_records (deleted_by);
create index rms_settings_updated_by_idx on public.rms_settings (updated_by);

-- Request context: client IP and user agent (sent by the app server) -------
create or replace function public.rms_request_header(p_name text)
returns text language sql stable set search_path = '' as $$
  select nullif(left(coalesce(current_setting('request.headers', true), '{}')::json ->> p_name, 300), '')
$$;

create or replace function public.rms_client_ip()
returns text language sql stable set search_path = '' as $$
  select coalesce(public.rms_request_header('x-rms-client-ip'),
                  split_part(public.rms_request_header('x-forwarded-for'), ',', 1))
$$;

-- Identity helpers: locked accounts and admins without their second step get no access
create or replace function public.rms_my_role()
returns public.rms_role language sql stable security definer set search_path = '' as $$
  select p.role
  from public.rms_profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and (p.locked_until is null or p.locked_until < now())
    and not (
      p.role = 'admin'
      and exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
      and coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2'
    )
$$;

create or replace function public.rms_my_office()
returns uuid language sql stable security definer set search_path = '' as $$
  select case when public.rms_my_role() is null then null else
    (select office_id from public.rms_profiles where id = (select auth.uid())) end
$$;

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

-- Records policies: Public visible to all, Viewer read-only, deleted records admin-only
drop policy rms_records_select on public.rms_records;
create policy rms_records_select on public.rms_records for select to authenticated
  using (
    (select public.rms_my_role()) is not null
    and (deleted_at is null or (select public.rms_my_role()) = 'admin')
    and (
      (select public.rms_my_role()) in ('admin', 'records_officer')
      or confidentiality = 'public'
      or (
        (origin_office_id = (select public.rms_my_office()) or current_office_id = (select public.rms_my_office()))
        and (confidentiality <> 'confidential' or (select public.rms_my_role()) = 'dept_head')
      )
      or public.rms_can_view(id)
    )
  );

drop policy rms_records_insert on public.rms_records;
create policy rms_records_insert on public.rms_records for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and deleted_at is null
    and (
      (select public.rms_my_role()) in ('admin', 'records_officer')
      or (direction = 'outgoing'
          and (select public.rms_my_role()) in ('dept_head', 'staff')
          and origin_office_id = (select public.rms_my_office()))
    )
  );

drop policy rms_routes_insert on public.rms_routes;
create policy rms_routes_insert on public.rms_routes for insert to authenticated
  with check (
    acted_by = (select auth.uid())
    and status <> 'registered'
    and (
      (select public.rms_my_role()) in ('admin', 'records_officer')
      or ((select public.rms_my_role()) in ('dept_head', 'staff')
          and exists (select 1 from public.rms_records r
                      where r.id = record_id and r.deleted_at is null
                        and r.current_office_id = (select public.rms_my_office())))
    )
  );

drop policy rms_attachments_insert on public.rms_attachments;
create policy rms_attachments_insert on public.rms_attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (select public.rms_my_role()) <> 'viewer'
    and (select public.rms_can_view(record_id))
  );

drop policy rms_storage_insert on storage.objects;
create policy rms_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rms-attachments'
              and (select public.rms_my_role()) <> 'viewer'
              and (select public.rms_can_view(((storage.foldername(name))[1])::uuid)));

-- Soft delete only through these functions -------------------------------------
create or replace function public.rms_guard_soft_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.deleted_at is distinct from old.deleted_at
      or new.deleted_by is distinct from old.deleted_by
      or new.delete_reason is distinct from old.delete_reason)
     and coalesce(current_setting('rms.soft_delete', true), '') <> 'on' then
    raise exception 'use rms_delete_record / rms_restore_record';
  end if;
  return new;
end $$;
create trigger rms_records_guard_soft_delete before update on public.rms_records
for each row execute function public.rms_guard_soft_delete();

create or replace function public.rms_delete_record(p_record_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is null or public.rms_my_role() not in ('admin', 'records_officer') then
    raise exception 'only the records desk or an admin can delete records';
  end if;
  if length(coalesce(trim(p_reason), '')) < 5 then
    raise exception 'give a reason for deleting';
  end if;
  perform set_config('rms.soft_delete', 'on', true);
  update public.rms_records
     set deleted_at = now(), deleted_by = auth.uid(), delete_reason = left(trim(p_reason), 500)
   where id = p_record_id and deleted_at is null;
  if not found then raise exception 'record not found or already deleted'; end if;
  perform set_config('rms.soft_delete', 'off', true);
end $$;

create or replace function public.rms_restore_record(p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is distinct from 'admin' then
    raise exception 'only an admin can restore records';
  end if;
  perform set_config('rms.soft_delete', 'on', true);
  update public.rms_records set deleted_at = null, deleted_by = null, delete_reason = null
   where id = p_record_id and deleted_at is not null;
  if not found then raise exception 'record is not in the bin'; end if;
  perform set_config('rms.soft_delete', 'off', true);
end $$;

-- Settings policies ---------------------------------------------------------------
alter table public.rms_settings enable row level security;
create policy rms_settings_select on public.rms_settings for select to authenticated
  using ((select public.rms_my_role()) is not null);
create policy rms_settings_admin_update on public.rms_settings for update to authenticated
  using ((select public.rms_my_role()) = 'admin') with check ((select public.rms_my_role()) = 'admin');

create trigger rms_audit_settings after insert or update or delete on public.rms_settings
for each row execute function public.rms_audit();

create or replace function public.rms_setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.rms_settings where key = p_key
$$;

-- Tamper-evident audit log --------------------------------------------------------
alter table public.rms_audit_log
  add column ip text,
  add column user_agent text,
  add column prev_hash text,
  add column row_hash text;

create or replace function public.rms_audit_hash(
  p_prev text, p_table text, p_row text, p_action text, p_old jsonb, p_new jsonb,
  p_actor uuid, p_at timestamptz, p_ip text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(
    concat_ws('|', coalesce(p_prev, 'genesis'), p_table, p_row, p_action,
              coalesce(p_old::text, ''), coalesce(p_new::text, ''), coalesce(p_actor::text, ''),
              to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), coalesce(p_ip, '')),
    'sha256'), 'hex')
$$;

create or replace function public.rms_audit_chain()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'the audit log cannot be changed or deleted';
  end if;
  perform pg_advisory_xact_lock(hashtext('rms_audit_log'));
  new.created_at := clock_timestamp();
  new.ip := coalesce(new.ip, public.rms_client_ip());
  new.user_agent := coalesce(new.user_agent, public.rms_request_header('x-rms-user-agent'));
  select row_hash into new.prev_hash from public.rms_audit_log order by id desc limit 1;
  new.row_hash := public.rms_audit_hash(new.prev_hash, new.table_name, new.row_id, new.action,
                                        new.old_data, new.new_data, new.actor_id, new.created_at, new.ip);
  return new;
end $$;

-- backfill the chain for existing rows, oldest first
do $$
declare r record; v_prev text := null;
begin
  for r in select * from public.rms_audit_log order by id loop
    update public.rms_audit_log
       set prev_hash = v_prev,
           row_hash = public.rms_audit_hash(v_prev, r.table_name, r.row_id, r.action, r.old_data, r.new_data, r.actor_id, r.created_at, r.ip)
     where id = r.id
    returning row_hash into v_prev;
  end loop;
end $$;

create trigger rms_audit_chain before insert or update or delete on public.rms_audit_log
for each row execute function public.rms_audit_chain();
create trigger rms_audit_no_truncate before truncate on public.rms_audit_log
for each statement execute function public.rms_audit_chain();

-- Returns null when the chain is intact, otherwise the id of the first altered entry.
create or replace function public.rms_verify_audit_chain()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare r record; v_prev text := null;
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  for r in select * from public.rms_audit_log order by id loop
    if r.prev_hash is distinct from v_prev
       or r.row_hash is distinct from public.rms_audit_hash(v_prev, r.table_name, r.row_id, r.action, r.old_data, r.new_data, r.actor_id, r.created_at, r.ip) then
      return r.id;
    end if;
    v_prev := r.row_hash;
  end loop;
  return null;
end $$;

-- Access history -------------------------------------------------------------------
create table public.rms_access_log (
  id bigint generated always as identity primary key,
  event text not null check (event in ('login_success', 'login_failed', 'account_locked', 'locked_attempt',
                                       'logout', 'idle_logout', 'mfa_verified', 'view_record', 'download')),
  user_id uuid references public.rms_profiles (id),
  email text,
  record_id uuid references public.rms_records (id),
  attachment_id uuid references public.rms_attachments (id),
  ip text,
  user_agent text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index rms_access_log_created_idx on public.rms_access_log (created_at desc);
create index rms_access_log_user_idx on public.rms_access_log (user_id, created_at desc);
create index rms_access_log_record_idx on public.rms_access_log (record_id, created_at desc);
create index rms_access_log_attachment_idx on public.rms_access_log (attachment_id);
alter table public.rms_access_log enable row level security;
create policy rms_access_log_select on public.rms_access_log for select to authenticated
  using ((select public.rms_my_role()) = 'admin');

create or replace function public.rms_access_log_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'access history cannot be changed or deleted'; end $$;
create trigger rms_access_log_append_only before update or delete on public.rms_access_log
for each row execute function public.rms_access_log_append_only();

-- Signed-in events: views, downloads, logout, MFA
create or replace function public.rms_log_access(p_event text, p_record_id uuid default null, p_attachment_id uuid default null, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if p_event not in ('logout', 'idle_logout', 'mfa_verified', 'view_record', 'download') then
    raise exception 'event not allowed';
  end if;
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if public.rms_my_role() is null and p_event not in ('logout', 'idle_logout', 'mfa_verified') then
    raise exception 'not an RMS user';
  end if;
  if p_record_id is not null and not public.rms_can_view(p_record_id) then
    raise exception 'record not visible';
  end if;
  if not exists (select 1 from public.rms_profiles where id = auth.uid()) then
    raise exception 'not an RMS user';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.rms_access_log (event, user_id, email, record_id, attachment_id, ip, user_agent, detail)
  values (p_event, auth.uid(), v_email, p_record_id, p_attachment_id, public.rms_client_ip(),
          public.rms_request_header('x-rms-user-agent'), p_detail);
  if p_event = 'download' then
    insert into public.rms_audit_log (table_name, row_id, action, new_data, actor_id)
    values ('download', coalesce(p_attachment_id::text, ''), 'INSERT',
            jsonb_build_object('record_id', p_record_id, 'attachment_id', p_attachment_id) || coalesce(p_detail, '{}'),
            auth.uid());
  end if;
end $$;

-- Sign-in guard (called before and after a password attempt; safe for anonymous callers)
create or replace function public.rms_login_check(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select pr.id, pr.locked_until into p
  from public.rms_profiles pr join auth.users u on u.id = pr.id
  where u.email = lower(trim(p_email));
  if p.id is not null and p.locked_until > now() then
    insert into public.rms_access_log (event, user_id, email, ip, user_agent)
    values ('locked_attempt', p.id, lower(trim(p_email)), public.rms_client_ip(), public.rms_request_header('x-rms-user-agent'));
    return jsonb_build_object('locked', true, 'minutes', ceil(extract(epoch from p.locked_until - now()) / 60));
  end if;
  return jsonb_build_object('locked', false);
end $$;

create or replace function public.rms_login_failed(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_attempts int;
  v_threshold int := coalesce((public.rms_setting('lockout_threshold'))::int, 5);
  v_minutes int := coalesce((public.rms_setting('lockout_minutes'))::int, 15);
begin
  select pr.id into v_id from public.rms_profiles pr join auth.users u on u.id = pr.id
  where u.email = lower(trim(p_email));
  if v_id is null then
    return jsonb_build_object('locked', false); -- unknown emails are not recorded
  end if;
  update public.rms_profiles set failed_attempts = failed_attempts + 1 where id = v_id
  returning failed_attempts into v_attempts;
  insert into public.rms_access_log (event, user_id, email, ip, user_agent, detail)
  values ('login_failed', v_id, lower(trim(p_email)), public.rms_client_ip(), public.rms_request_header('x-rms-user-agent'),
          jsonb_build_object('attempt', v_attempts));
  if v_attempts >= v_threshold then
    update public.rms_profiles set locked_until = now() + make_interval(mins => v_minutes), failed_attempts = 0 where id = v_id;
    insert into public.rms_access_log (event, user_id, email, ip, user_agent, detail)
    values ('account_locked', v_id, lower(trim(p_email)), public.rms_client_ip(), public.rms_request_header('x-rms-user-agent'),
            jsonb_build_object('minutes', v_minutes));
    return jsonb_build_object('locked', true, 'minutes', v_minutes);
  end if;
  return jsonb_build_object('locked', false, 'remaining', v_threshold - v_attempts);
end $$;

-- After a correct password: returns false if the account is locked or inactive (the app then signs out)
create or replace function public.rms_login_succeeded()
returns boolean language plpgsql security definer set search_path = '' as $$
declare p record; v_email text;
begin
  select * into p from public.rms_profiles where id = auth.uid();
  select email into v_email from auth.users where id = auth.uid();
  if p.id is null or not p.is_active or (p.locked_until is not null and p.locked_until > now()) then
    if p.id is not null then
      insert into public.rms_access_log (event, user_id, email, ip, user_agent)
      values ('locked_attempt', p.id, v_email, public.rms_client_ip(), public.rms_request_header('x-rms-user-agent'));
    end if;
    return false;
  end if;
  update public.rms_profiles set failed_attempts = 0, locked_until = null, last_login_at = now() where id = p.id;
  insert into public.rms_access_log (event, user_id, email, ip, user_agent)
  values ('login_success', p.id, v_email, public.rms_client_ip(), public.rms_request_header('x-rms-user-agent'));
  return true;
end $$;

create or replace function public.rms_admin_unlock(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  update public.rms_profiles set locked_until = null, failed_attempts = 0 where id = p_user_id;
end $$;

-- Who accessed this person's records (Data Privacy Act report)
create or replace function public.rms_person_access_report(p_person text)
returns table (tracking_no text, subject text, record_id uuid, event text, accessed_by text, ip text, accessed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  if length(coalesce(trim(p_person), '')) < 3 then raise exception 'enter at least 3 letters of the name'; end if;
  return query
    select r.tracking_no, r.subject, r.id, a.event, coalesce(pr.full_name, a.email), a.ip, a.created_at
    from public.rms_records r
    join public.rms_access_log a on a.record_id = r.id
    left join public.rms_profiles pr on pr.id = a.user_id
    where concat_ws(' ', r.sender_name, r.sender_org, r.recipient_name, r.recipient_org) ilike '%' || trim(p_person) || '%'
    order by a.created_at desc
    limit 500;
end $$;

-- Search: hide deleted records, optional exclusion of Confidential (used by AI)
drop function if exists public.rms_search_records(text, text, public.rms_direction, public.rms_status, text, text, date, date, boolean, int);
create or replace function public.rms_search_records(
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
  p_exclude_confidential boolean default false
)
returns table (
  id uuid, tracking_no text, direction public.rms_direction, subject text, status public.rms_status,
  priority public.rms_priority, confidentiality public.rms_confidentiality, document_type text,
  current_office text, origin_office text, sender text, recipient text, created_by_name text,
  created_at timestamptz, due_date date, ai_summary text, rank real,
  sender_name text, sender_org text, recipient_name text, recipient_org text
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
         r.sender_name, r.sender_org, r.recipient_name, r.recipient_org
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
    and (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at < p_to + 1)
    and (not p_overdue or (r.due_date < current_date and r.status not in ('completed', 'released', 'archived')))
  order by 17 desc, r.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;

-- Execute grants ----------------------------------------------------------------------
revoke execute on function public.rms_search_records from public, anon;
grant execute on function public.rms_search_records to authenticated;
revoke execute on function public.rms_delete_record, public.rms_restore_record, public.rms_verify_audit_chain,
  public.rms_log_access, public.rms_login_succeeded, public.rms_admin_unlock, public.rms_person_access_report,
  public.rms_setting from public, anon;
grant execute on function public.rms_delete_record, public.rms_restore_record, public.rms_verify_audit_chain,
  public.rms_log_access, public.rms_login_succeeded, public.rms_admin_unlock, public.rms_person_access_report,
  public.rms_setting to authenticated;
-- the two sign-in guards run before a session exists
revoke execute on function public.rms_login_check, public.rms_login_failed from public;
grant execute on function public.rms_login_check, public.rms_login_failed to anon, authenticated;
revoke execute on function public.rms_audit_chain, public.rms_guard_soft_delete, public.rms_access_log_append_only
  from public, anon, authenticated;
