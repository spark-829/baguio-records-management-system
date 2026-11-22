-- AI budget, rate limits and result cache for the DeepSeek features.
-- Run after 20261122000200. Safe to run again.
-- The spending cap is clamped to 0.33 USD in the database itself, whatever the setting says.
-- Reservations are atomic: they are serialized with an advisory lock, so calls cannot overshoot the cap.

-- rms_settings has no id column (its key is "key"), so the audit trigger failed on every settings write.
-- Fall back to the key for the row id. Same behavior otherwise.
create or replace function public.rms_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'search' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'search' end;
begin
  insert into public.rms_audit_log (table_name, row_id, action, old_data, new_data, actor_id)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key'), tg_op, v_old, v_new, auth.uid());
  return coalesce(new, old);
end $$;

create table if not exists public.rms_ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.rms_profiles (id),
  feature text not null check (feature in ('intake', 'search', 'summary', 'chat')),
  model text,
  reserved_usd numeric(12,6) not null,
  cache_hit_tokens int not null default 0,
  cache_miss_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,6),
  ok boolean,                -- null = reserved, call in flight
  finalized_at timestamptz
);
create index if not exists rms_ai_usage_user_created_idx on public.rms_ai_usage (user_id, created_at desc);
alter table public.rms_ai_usage enable row level security;
revoke all on public.rms_ai_usage from public, anon, authenticated;
grant select on public.rms_ai_usage to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_ai_usage' and policyname = 'rms_ai_usage_admin_select') then
    create policy rms_ai_usage_admin_select on public.rms_ai_usage for select to authenticated
      using ((select public.rms_my_role()) = 'admin');
  end if;
end $$;

create table if not exists public.rms_ai_cache (
  key text primary key,
  feature text not null check (feature in ('intake', 'search')),
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.rms_ai_cache enable row level security;   -- no policies: functions only
revoke all on public.rms_ai_cache from public, anon, authenticated;

insert into public.rms_settings (key, value, description)
values ('ai_spend_cap_usd', '0.33', 'Most the demo may spend on DeepSeek AI, in US dollars (the database never allows more than 0.33)')
on conflict (key) do nothing;

create or replace function public.rms_ai_spent() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when ok is null then reserved_usd else coalesce(cost_usd, 0) end), 0) from public.rms_ai_usage
$$;
create or replace function public.rms_ai_cap() returns numeric
language sql stable security definer set search_path = '' as $$
  select least(coalesce((select (value #>> '{}')::numeric from public.rms_settings where key = 'ai_spend_cap_usd'), 0.33), 0.33)
$$;

create or replace function public.rms_ai_reserve(p_feature text, p_model text, p_estimate_usd numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_spent numeric; v_cap numeric; v_hour int; v_day int; v_inflight int; v_day_usd numeric; v_id uuid;
begin
  if public.rms_my_role() is null then raise exception 'not an RMS user'; end if;
  if p_feature not in ('intake', 'search', 'summary', 'chat') then raise exception 'unknown feature'; end if;
  if p_estimate_usd is null or p_estimate_usd <= 0 or p_estimate_usd > 0.05 then raise exception 'bad estimate'; end if;
  perform pg_advisory_xact_lock(hashtext('rms_ai_budget'));   -- serializes reservations: no overshoot
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day from public.rms_ai_usage where user_id = v_uid and created_at > now() - interval '1 day';
  if v_hour >= 20 or v_day >= 60 then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;
  select count(*) filter (where ok is null and created_at > now() - interval '10 minutes'),
         coalesce(sum(case when ok is null then reserved_usd else coalesce(cost_usd, 0) end), 0)
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

create or replace function public.rms_ai_finalize(p_id uuid, p_ok boolean, p_cache_hit int, p_cache_miss int, p_output int, p_cost_usd numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is null then raise exception 'not an RMS user'; end if;
  update public.rms_ai_usage
     set ok = coalesce(p_ok, false),
         cache_hit_tokens = greatest(coalesce(p_cache_hit, 0), 0),
         cache_miss_tokens = greatest(coalesce(p_cache_miss, 0), 0),
         output_tokens = greatest(coalesce(p_output, 0), 0),
         cost_usd = least(greatest(coalesce(p_cost_usd, reserved_usd), 0), 1),
         finalized_at = now()
   where id = p_id and user_id = auth.uid() and ok is null;
end $$;

create or replace function public.rms_ai_spend_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  return (select jsonb_build_object('spent', public.rms_ai_spent(), 'cap', public.rms_ai_cap(),
      'calls', count(*) filter (where ok), 'failed', count(*) filter (where ok = false),
      'in_flight', count(*) filter (where ok is null), 'last_at', max(created_at)) from public.rms_ai_usage);
end $$;

create or replace function public.rms_ai_cache_get(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select c.result from public.rms_ai_cache c
   where public.rms_my_role() is not null and c.key = p_key and c.created_at > now() - interval '30 days'
$$;
create or replace function public.rms_ai_cache_put(p_key text, p_feature text, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is null then raise exception 'not an RMS user'; end if;
  if p_feature not in ('intake', 'search') or length(p_key) > 200 or pg_column_size(p_result) > 20000 then
    raise exception 'bad cache entry';
  end if;
  insert into public.rms_ai_cache (key, feature, result) values (p_key, p_feature, p_result)
  on conflict (key) do update set result = excluded.result, created_at = now();
end $$;

revoke execute on function public.rms_ai_spent(), public.rms_ai_cap(),
  public.rms_ai_reserve(text, text, numeric), public.rms_ai_finalize(uuid, boolean, int, int, int, numeric),
  public.rms_ai_spend_summary(), public.rms_ai_cache_get(text), public.rms_ai_cache_put(text, text, jsonb)
  from public, anon;
grant execute on function public.rms_ai_reserve(text, text, numeric), public.rms_ai_finalize(uuid, boolean, int, int, int, numeric),
  public.rms_ai_spend_summary(), public.rms_ai_cache_get(text), public.rms_ai_cache_put(text, text, jsonb) to authenticated;
revoke execute on function public.rms_ai_spent(), public.rms_ai_cap() from authenticated;
