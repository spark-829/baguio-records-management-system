-- QA fixes 2026-11-23 (QA-018, QA-015, QA-005, QA-016, QA-017). Run after 20261122000300. Safe to run again.
-- Nothing here drops or deletes data, and no existing audit row is rewritten.

-- ============================================================================================
-- QA-018: audit chain. Two entries written at the same moment could both link to the same
-- earlier entry (a fork). New entries now link to the real chain tip, and the check follows links.
-- ============================================================================================
create index if not exists rms_audit_log_prev_hash_idx on public.rms_audit_log (prev_hash);
create index if not exists rms_audit_log_row_hash_idx on public.rms_audit_log (row_hash);

-- Link each new entry to the chain tip (the newest entry nothing links to yet), chosen inside the lock.
-- The id is assigned before the lock, so "highest id" was not always the last entry chained.
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
  new.hash_v := 2;
  select a.row_hash into new.prev_hash
    from public.rms_audit_log a
   where not exists (select 1 from public.rms_audit_log c where c.prev_hash = a.row_hash)
   order by a.created_at desc, a.id desc
   limit 1;
  new.row_hash := public.rms_audit_hash2(new.prev_hash, new.table_name, new.row_id, new.action,
                                         new.old_data, new.new_data, new.actor_id, new.created_at, new.ip, new.user_agent);
  return new;
end $$;

-- Branches that already exist from the old bug: written once, never edited. Both entries in each are original.
create table if not exists public.rms_audit_known_forks (
  prev_hash text primary key,
  child_ids bigint[] not null,
  noted_at timestamptz not null default now(),
  note text not null
);
alter table public.rms_audit_known_forks enable row level security;   -- no policies: functions only
revoke all on public.rms_audit_known_forks from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from public.rms_private_config where key = 'audit_forks_noted') then
    insert into public.rms_audit_known_forks (prev_hash, child_ids, note)
    select prev_hash, array_agg(id order by id),
           'Two entries were written at the same moment before the 2026-11-23 fix (QA-018). Both are original and unchanged.'
      from public.rms_audit_log
     where prev_hash is not null
     group by prev_hash
    having count(*) > 1
    on conflict (prev_hash) do nothing;
    insert into public.rms_private_config (key, value) values ('audit_forks_noted', now()::text);
  end if;
end $$;

-- Verify by following the links, not by id order. Returns the first bad entry id, or null if intact.
create or replace function public.rms_verify_audit_chain()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare v_bad bigint; v_unreached bigint;
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  -- 1. each entry's own seal matches its contents and the seal it points back to
  select min(a.id) into v_bad from public.rms_audit_log a
   where a.row_hash is distinct from (case when a.hash_v >= 2
     then public.rms_audit_hash2(a.prev_hash, a.table_name, a.row_id, a.action, a.old_data, a.new_data, a.actor_id, a.created_at, a.ip, a.user_agent)
     else public.rms_audit_hash(a.prev_hash, a.table_name, a.row_id, a.action, a.old_data, a.new_data, a.actor_id, a.created_at, a.ip) end);
  -- 2. exactly one first entry
  v_bad := least(v_bad, (select min(id) from public.rms_audit_log where prev_hash is null
                          and id > (select min(id) from public.rms_audit_log where prev_hash is null)));
  -- 3. every link points at an entry that exists (a removed entry leaves a dangling link)
  v_bad := least(v_bad, (select min(a.id) from public.rms_audit_log a where a.prev_hash is not null
                          and not exists (select 1 from public.rms_audit_log p where p.row_hash = a.prev_hash)));
  -- 4. no two entries share a seal
  v_bad := least(v_bad, (select min(a.id) from public.rms_audit_log a
                          where exists (select 1 from public.rms_audit_log b where b.row_hash = a.row_hash and b.id < a.id)));
  -- 5. no branches, except those noted when this fix was installed
  v_bad := least(v_bad, (select min(a.id) from public.rms_audit_log a
                          where a.prev_hash is not null
                            and exists (select 1 from public.rms_audit_log b where b.prev_hash = a.prev_hash and b.id <> a.id)
                            and not exists (select 1 from public.rms_audit_known_forks k
                                             where k.prev_hash = a.prev_hash and a.id = any (k.child_ids))));
  -- 5b. every noted fork entry must still exist with the same link
  v_bad := least(v_bad, (select min(c) from public.rms_audit_known_forks k, unnest(k.child_ids) c where not exists (select 1 from public.rms_audit_log a where a.id = c and a.prev_hash = k.prev_hash)));
  -- 6. walk the links from the first entry: every entry must be reached (each has one parent, so at most once)
  with recursive walk(id, row_hash) as (
    select a.id, a.row_hash from public.rms_audit_log a where a.prev_hash is null
    union
    select c.id, c.row_hash from walk w join public.rms_audit_log c on c.prev_hash = w.row_hash
  )
  select min(a.id) into v_unreached from public.rms_audit_log a left join walk w on w.id = a.id where w.id is null;
  return least(v_bad, v_unreached);
end $$;
revoke execute on function public.rms_verify_audit_chain() from public, anon;
grant execute on function public.rms_verify_audit_chain() to authenticated;

-- Read-only checks you can run in the SQL Editor:
--   select prev_hash, array_agg(id order by id) from public.rms_audit_log where prev_hash is not null group by 1 having count(*) > 1;
--   select * from public.rms_audit_known_forks;
-- Then open /admin/audit while signed in as admin. (In the SQL Editor, rms_verify_audit_chain() raises
-- "admins only" because there is no signed-in user.)

-- ============================================================================================
-- QA-015: AI budget. The budget functions accept calls only from the app server (which holds the
-- proxy key). A reservation that never finished stops blocking new calls after 10 minutes, but its
-- possible cost still counts against the cap (an unfinished reservation counts at its reserved amount).
-- ============================================================================================
-- True only when the request carries the server-held key (the app server), never for direct API callers.
create or replace function public.rms_from_app()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_key text; v_sent text;
begin
  select value into v_key from public.rms_private_config where key = 'proxy_key';
  begin
    v_sent := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-rms-proxy-key';
  exception when others then
    return false;
  end;
  return v_key is not null and length(v_key) >= 32 and v_sent is not null and v_sent = v_key;
end $$;
-- The AI functions below are security definer, so they can still call it.
revoke execute on function public.rms_from_app() from public, anon, authenticated;

create or replace function public.rms_ai_spent() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(coalesce(cost_usd, reserved_usd)), 0)
    from public.rms_ai_usage
$$;

create or replace function public.rms_ai_reserve(p_feature text, p_model text, p_estimate_usd numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_spent numeric; v_cap numeric; v_hour int; v_day int; v_inflight int; v_day_usd numeric; v_id uuid;
begin
  if not public.rms_from_app() then raise exception 'AI requests must come through the app server' using errcode = '42501'; end if;
  if public.rms_my_role() is null then raise exception 'not an RMS user'; end if;
  if p_feature not in ('intake', 'search', 'summary', 'chat') then raise exception 'unknown feature'; end if;
  if p_estimate_usd is null or p_estimate_usd <= 0 or p_estimate_usd > 0.05 then raise exception 'bad estimate'; end if;
  perform pg_advisory_xact_lock(hashtext('rms_ai_budget'));   -- serializes reservations: no overshoot
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day from public.rms_ai_usage where user_id = v_uid and created_at > now() - interval '1 day';
  if v_hour >= 20 or v_day >= 60 then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;
  select count(*) filter (where ok is null and created_at > now() - interval '10 minutes'),
         coalesce(sum(coalesce(cost_usd, reserved_usd)), 0)
    into v_inflight, v_day_usd from public.rms_ai_usage where user_id = v_uid and created_at > now() - interval '1 day';
  if v_inflight >= 2 or v_day_usd >= 0.10 then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;
  v_spent := public.rms_ai_spent(); v_cap := public.rms_ai_cap();
  if v_spent + p_estimate_usd >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'spent', v_spent, 'cap', v_cap);
  end if;
  insert into public.rms_ai_usage (user_id, feature, model, reserved_usd)
  values (v_uid, p_feature, left(p_model, 60), p_estimate_usd) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- The recorded cost can never be more than what was reserved.
create or replace function public.rms_ai_finalize(p_id uuid, p_ok boolean, p_cache_hit int, p_cache_miss int, p_output int, p_cost_usd numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.rms_from_app() then raise exception 'AI requests must come through the app server' using errcode = '42501'; end if;
  if public.rms_my_role() is null then raise exception 'not an RMS user'; end if;
  update public.rms_ai_usage
     set ok = coalesce(p_ok, false),
         cache_hit_tokens = greatest(coalesce(p_cache_hit, 0), 0),
         cache_miss_tokens = greatest(coalesce(p_cache_miss, 0), 0),
         output_tokens = greatest(coalesce(p_output, 0), 0),
         cost_usd = least(greatest(coalesce(p_cost_usd, reserved_usd), 0), reserved_usd),
         finalized_at = now()
   where id = p_id and user_id = auth.uid() and ok is null;
end $$;

create or replace function public.rms_ai_cache_put(p_key text, p_feature text, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.rms_from_app() then raise exception 'AI requests must come through the app server' using errcode = '42501'; end if;
  if public.rms_my_role() is null then raise exception 'not an RMS user'; end if;
  if p_feature not in ('intake', 'search') or length(p_key) > 200 or pg_column_size(p_result) > 20000 then
    raise exception 'bad cache entry';
  end if;
  insert into public.rms_ai_cache (key, feature, result) values (p_key, p_feature, p_result)
  on conflict (key) do update set result = excluded.result, created_at = now();
end $$;

-- The app calls these with the user's session (auth.uid() must work); the key check blocks direct callers.
revoke execute on function public.rms_ai_spent(), public.rms_ai_cap(),
  public.rms_ai_reserve(text, text, numeric), public.rms_ai_finalize(uuid, boolean, int, int, int, numeric),
  public.rms_ai_cache_put(text, text, jsonb)
  from public, anon;
grant execute on function public.rms_ai_reserve(text, text, numeric), public.rms_ai_finalize(uuid, boolean, int, int, int, numeric),
  public.rms_ai_cache_put(text, text, jsonb) to authenticated;
revoke execute on function public.rms_ai_spent(), public.rms_ai_cap() from authenticated;

-- ============================================================================================
-- QA-005: client IP. Use the app's header (valid only with the proxy key), otherwise the LAST hop
-- of X-Forwarded-For (added by Supabase's own proxy). Earlier hops are whatever the caller typed.
-- ============================================================================================
create or replace function public.rms_client_ip()
returns text language plpgsql stable set search_path = '' as $$
declare v text; v_inet inet;
begin
  -- Trusted: the app's header, which counts only with the proxy key. Otherwise the LAST hop of
  -- X-Forwarded-For (added by Supabase's own proxy); earlier hops are whatever the caller typed.
  v := coalesce(public.rms_request_header('x-rms-client-ip'),
                nullif(trim(substring(coalesce(public.rms_request_header('x-forwarded-for'), '') from '([^,]*)$')), ''));
  if v is null then return null; end if;
  begin
    v_inet := v::inet;
  exception when others then
    return null;
  end;
  v := host(v_inet);
  -- Cloudflare's and private or internal addresses are not the user's, and must not become one shared lockout bucket.
  if public.rms_is_cloudflare_ip(v)
     or v_inet <<= any (array['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16',
                              '100.64.0.0/10', '::1/128', 'fc00::/7', 'fe80::/10']::inet[]) then
    return null;
  end if;
  return v;
end $$;

-- ============================================================================================
-- QA-002: no change. The live rms_public_track (20261122000200) already skips the per-IP check
-- when the IP is null; the per-number lock stays.
-- ============================================================================================

-- ============================================================================================
-- QA-016: "Add user" refuses an empty email or password with a clear message.
-- ============================================================================================
create or replace function public.rms_admin_create_user(
  p_email text, p_password text, p_full_name text, p_role public.rms_role, p_office_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if public.rms_my_role() is distinct from 'admin' then
    raise exception 'only admins can create users';
  end if;
  if p_email is null or trim(p_email) = '' then raise exception 'email is required'; end if;
  if p_password is null or p_password = '' then raise exception 'password is required'; end if;
  if lower(trim(p_email)) !~ '^[a-z0-9._-]+@rms-demo\.test$' then
    raise exception 'In this demo, new accounts must use an @rms-demo.test email.';
  end if;
  if length(p_password) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;
  if (select count(*) from auth.users
       where raw_app_meta_data ->> 'app' = 'rms' and created_at > now() - interval '1 day') >= 20 then
    raise exception 'The demo allows 20 new accounts a day. Try again tomorrow.';
  end if;
  if exists (select 1 from auth.users where email = lower(trim(p_email))) then
    raise exception 'email already registered';
  end if;
  v_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(trim(p_email)),
          extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"],"app":"rms"}', jsonb_build_object('full_name', p_full_name),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', lower(trim(p_email)), 'email_verified', true),
          'email', now(), now(), now());
  insert into public.rms_profiles (id, full_name, role, office_id) values (v_id, p_full_name, p_role, p_office_id);
  return v_id;
end $$;
revoke execute on function public.rms_admin_create_user from public, anon;
grant execute on function public.rms_admin_create_user to authenticated;

-- ============================================================================================
-- QA-017: the same "received" step twice (double tap, or two scans at once) is refused.
-- ============================================================================================
-- Locks a record row until the end of the caller's transaction, so two steps on one record are applied one after the other.
-- Security definer because staff have no UPDATE policy on records (FOR UPDATE would otherwise find no row).
create or replace function public.rms_lock_record(p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is null then return; end if;
  perform 1 from public.rms_records where id = p_record_id for no key update;
end $$;
revoke execute on function public.rms_lock_record(uuid) from public, anon;
grant execute on function public.rms_lock_record(uuid) to authenticated;

create or replace function public.rms_routes_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  v_central boolean := v_role in ('admin', 'records_officer');
  r record;
  v_allowed public.rms_status[];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  perform public.rms_lock_record(new.record_id);
  select status, direction, current_office_id into r from public.rms_records where id = new.record_id;
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

-- After running this file: copy the result of
--   select value from public.rms_private_config where key = 'proxy_key';
-- into Cloudflare as the secret RMS_PROXY_KEY on the baguio-rms worker. Until then AI shows its demo suggestion.
