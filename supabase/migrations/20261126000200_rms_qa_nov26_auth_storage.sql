-- QA deep security pass, 2026-11-26: QA-087, QA-088, QA-089, QA-093, QA-094.
-- Idempotent. No DROP or DELETE statements.
--
-- 1. Attachments are read and uploaded only through the app's server (QA-088, QA-093). The storage
--    policies now also require the server-held proxy key header, so a signed-in user can no longer
--    download files straight from Storage (no access log, no watermark) or mint long-lived signed links,
--    and cannot upload around the server's file checks.
-- 2. Sign-in tickets + an Auth hook (QA-087). rms_login_check (called by the sign-in page's server, with
--    the proxy key) issues a one-time ticket valid for 2 minutes. The hook rms_auth_token_hook refuses a
--    password sign-in for an RMS account without a ticket, so sign-ins sent straight to Supabase Auth
--    skip neither the lockout nor the access log. It also refuses tokens for locked or switched-off
--    accounts and refresh after the session's maximum age. Accounts that are not RMS accounts (other
--    sites share this Auth project) pass through unchanged.
--    MANUAL STEP: Supabase dashboard > Authentication > Hooks > Custom Access Token > Postgres >
--    schema public, function rms_auth_token_hook. Until then the hook exists but does not run.
-- 3. Sessions end for good (QA-089, QA-094). rms_my_role(), which nearly every row rule goes through,
--    now also requires the token's session to still exist and to be younger than session_max_hours
--    (default 12). After sign-out, idle sign-out or the time limit, a copied access token stops working
--    on the REST API at once instead of lasting up to an hour.

-- 1. Storage: server only ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'rms_storage_select') then
    alter policy rms_storage_select on storage.objects
      using (bucket_id = 'rms-attachments'
             and public.rms_request_header('x-rms-proxy-key') is not null
             and (select public.rms_can_view(((storage.foldername(objects.name))[1])::uuid)));
  else
    create policy rms_storage_select on storage.objects for select to authenticated
      using (bucket_id = 'rms-attachments'
             and public.rms_request_header('x-rms-proxy-key') is not null
             and (select public.rms_can_view(((storage.foldername(objects.name))[1])::uuid)));
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'rms_storage_insert') then
    alter policy rms_storage_insert on storage.objects
      with check (bucket_id = 'rms-attachments'
                  and public.rms_request_header('x-rms-proxy-key') is not null
                  and (select public.rms_can_attach(((storage.foldername(objects.name))[1])::uuid)));
  else
    create policy rms_storage_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'rms-attachments'
                  and public.rms_request_header('x-rms-proxy-key') is not null
                  and (select public.rms_can_attach(((storage.foldername(objects.name))[1])::uuid)));
  end if;
end $$;

-- 2. Sign-in tickets and the Auth hook ---------------------------------------------------------------
create table if not exists public.rms_login_tickets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  issued_at timestamptz not null default now(),
  used_at timestamptz
);
-- Short-lived sign-in state, read and written only by the two definer functions below; sign-ins
-- themselves are recorded in rms_access_log, so the table has no audit trigger of its own.
alter table public.rms_login_tickets enable row level security;
revoke all on public.rms_login_tickets from anon, authenticated;

insert into public.rms_settings (key, value, description)
values ('session_max_hours', '12', 'Hours a sign-in lasts at most, even with activity')
on conflict (key) do nothing;

create or replace function public.rms_login_check(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  -- Only the app's server (which holds the proxy key) can open the door for one password sign-in (QA-087).
  if p.id is not null and public.rms_request_header('x-rms-proxy-key') is not null then
    insert into public.rms_login_tickets (user_id, issued_at, used_at) values (p.id, now(), null)
    on conflict (user_id) do update set issued_at = now(), used_at = null;
  end if;
  return jsonb_build_object('locked', false);
end $function$;

create or replace function public.rms_auth_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid;
  v_method text := event ->> 'authentication_method';
  p record;
  v_ticket boolean;
  v_created timestamptz;
  v_max int;
begin
  v_uid := (event ->> 'user_id')::uuid;
  select id, is_active, locked_until into p from public.rms_profiles where id = v_uid;
  if p.id is null then
    return event; -- not an RMS account: other sites on this Auth project are untouched
  end if;

  if not p.is_active or (p.locked_until is not null and p.locked_until > now()) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'This RMS account is locked or switched off. Ask an administrator.'));
  end if;

  if v_method = 'password' then
    update public.rms_login_tickets set used_at = now()
    where user_id = v_uid and used_at is null and issued_at > now() - interval '2 minutes'
    returning true into v_ticket;
    if v_ticket is null then
      insert into public.rms_access_log (event, user_id, detail)
      values ('locked_attempt', v_uid, jsonb_build_object('reason', 'direct_auth_sign_in'));
      return jsonb_build_object('error', jsonb_build_object('http_code', 400,
        'message', 'Sign in through the RMS sign-in page.'));
    end if;
  elsif v_method = 'token_refresh' then
    select s.created_at into v_created from auth.sessions s
    where s.id = nullif(event -> 'claims' ->> 'session_id', '')::uuid;
    v_max := coalesce((public.rms_setting('session_max_hours') #>> '{}')::int, 12);
    if v_created is not null and v_max > 0 and v_created < now() - make_interval(hours => v_max) then
      return jsonb_build_object('error', jsonb_build_object('http_code', 401,
        'message', 'Your sign-in has ended. Please sign in again.'));
    end if;
  end if;
  return event;
exception when others then
  -- A fault here must never stop sign-in for the other sites that share this Auth project.
  return event;
end $function$;

revoke all on function public.rms_auth_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.rms_auth_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- 3. Revoked and expired sessions stop at the database ------------------------------------------------
create or replace function public.rms_my_role()
returns public.rms_role
language sql
stable security definer
set search_path to ''
as $function$
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
    -- QA-089/QA-094: the token's session must still exist (not signed out) and be within the time limit.
    and exists (
      select 1 from auth.sessions s
      where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
        and s.user_id = p.id
        and s.created_at > now() - make_interval(hours => coalesce((select (st.value #>> '{}')::int from public.rms_settings st where st.key = 'session_max_hours'), 12))
    )
$function$;

-- One-off, done live on 2026-11-26 and not repeated here: the two demo letter.pdf files were moved to new
-- names so a 1-year signed link minted during QA no longer opens anything (QA-088). Temporary policies
-- rms_tmp_qa088_retire_* were used for the move and then set to false (they allow nothing).
