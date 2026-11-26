-- Sign-in page extras (2026-11-26, Vic):
--  a. "Forgot password?" sends a request to the administrator: rms_password_help (append-only, audit trigger),
--     rms_request_password_help (anyone, rate-limited, same answer whether or not the email has an account),
--     rms_password_help_done (administrator marks a request handled).
--  b. "Last signed in" note: rms_my_signin_info returns the person's previous sign-in and whether this one comes
--     from a network never used before, plus earlier browsers so the app can flag a new device.
-- Idempotent: create ... if not exists, create or replace, DO blocks. No DROP or DELETE.

-- a. Password help requests -------------------------------------------------------------------------------
create table if not exists public.rms_password_help (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 3 and 254),
  user_id uuid references public.rms_profiles (id),
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.rms_profiles (id)
);
create index if not exists rms_password_help_open_idx on public.rms_password_help (created_at desc) where handled_at is null;
create index if not exists rms_password_help_email_idx on public.rms_password_help (email, created_at desc);
create index if not exists rms_password_help_ip_idx on public.rms_password_help (ip, created_at desc);

alter table public.rms_password_help enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_password_help' and policyname = 'rms_password_help_select') then
    create policy rms_password_help_select on public.rms_password_help for select to authenticated
      using ((select public.rms_my_role()) = 'admin');
  end if;
end $$;
-- No insert, update or delete policies: rows are written only by the two functions below.
revoke insert, update, delete on public.rms_password_help from anon, authenticated;

-- Only the handled fields may change, once; rows are never deleted.
create or replace function public.rms_password_help_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'password help requests cannot be deleted'; end if;
  if old.handled_at is not null
     or new.id <> old.id or new.email <> old.email or new.user_id is distinct from old.user_id
     or new.ip is distinct from old.ip or new.user_agent is distinct from old.user_agent or new.created_at <> old.created_at then
    raise exception 'only an open request can be marked handled';
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'rms_password_help_guard' and tgrelid = 'public.rms_password_help'::regclass) then
    create trigger rms_password_help_guard before update or delete on public.rms_password_help
      for each row execute function public.rms_password_help_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'rms_audit_password_help' and tgrelid = 'public.rms_password_help'::regclass) then
    create trigger rms_audit_password_help after insert or update or delete on public.rms_password_help
      for each row execute function public.rms_audit();
  end if;
end $$;

-- Anyone on the sign-in page may ask. The answer never says whether the email has an account.
-- At most 3 requests per email, 10 per network address and 200 in all in an hour; extra ones are ignored quietly.
create or replace function public.rms_request_password_help(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ip text := public.rms_client_ip();
  v_user uuid;
begin
  if char_length(v_email) < 3 or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return;
  end if;
  if (select count(*) from public.rms_password_help where email = v_email and created_at > now() - interval '1 hour') >= 3 then
    return;
  end if;
  if (select count(*) from public.rms_password_help where created_at > now() - interval '1 hour') >= 200 then
    return;
  end if;
  if v_ip is not null and (select count(*) from public.rms_password_help where ip = v_ip and created_at > now() - interval '1 hour') >= 10 then
    return;
  end if;
  select p.id into v_user from auth.users u join public.rms_profiles p on p.id = u.id where lower(u.email) = v_email;
  insert into public.rms_password_help (email, user_id, ip, user_agent)
  values (v_email, v_user, v_ip, left(public.rms_request_header('x-rms-user-agent'), 400));
end $$;
revoke all on function public.rms_request_password_help(text) from public;
grant execute on function public.rms_request_password_help(text) to anon, authenticated;

create or replace function public.rms_password_help_done(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'administrators only'; end if;
  update public.rms_password_help set handled_at = now(), handled_by = auth.uid()
  where id = p_id and handled_at is null;
end $$;
revoke all on function public.rms_password_help_done(bigint) from public, anon;
grant execute on function public.rms_password_help_done(bigint) to authenticated;

-- b. Last sign-in note ------------------------------------------------------------------------------------
-- Call right after rms_login_succeeded: the newest login_success row is this sign-in, the one before is "last time".
create or replace function public.rms_my_signin_info()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now record;
  v_prev record;
  v_seen_ip boolean;
  v_uas jsonb;
begin
  if auth.uid() is null or public.rms_my_role() is null then return null; end if;
  select id, ip, user_agent, created_at into v_now from public.rms_access_log
  where user_id = auth.uid() and event = 'login_success' order by created_at desc, id desc limit 1;
  if not found then return null; end if;
  select id, ip, user_agent, created_at into v_prev from public.rms_access_log
  where user_id = auth.uid() and event = 'login_success' and id <> v_now.id and created_at <= v_now.created_at
  order by created_at desc, id desc limit 1;
  if not found then return jsonb_build_object('first', true, 'current_ua', v_now.user_agent); end if;
  select exists (
    select 1 from public.rms_access_log
    where user_id = auth.uid() and event = 'login_success' and id <> v_now.id
      and created_at > now() - interval '180 days' and ip = v_now.ip
  ) into v_seen_ip;
  select coalesce(jsonb_agg(ua), '[]'::jsonb) into v_uas from (
    select distinct user_agent as ua from (
      select user_agent from public.rms_access_log
      where user_id = auth.uid() and event = 'login_success' and id <> v_now.id
        and created_at > now() - interval '180 days' and user_agent is not null
      order by created_at desc limit 50
    ) recent
  ) d;
  return jsonb_build_object(
    'first', false,
    'previous_at', v_prev.created_at,
    'previous_ua', v_prev.user_agent,
    'current_ua', v_now.user_agent,
    'new_ip', v_now.ip is not null and not v_seen_ip,
    'earlier_uas', v_uas
  );
end $$;
revoke all on function public.rms_my_signin_info() from public, anon;
grant execute on function public.rms_my_signin_info() to authenticated;
