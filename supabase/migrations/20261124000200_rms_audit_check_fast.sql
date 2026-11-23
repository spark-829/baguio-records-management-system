-- QA-018 regression: rms_verify_audit_chain() timed out (8 s limit for the authenticated role) because it
-- re-computed the seal of every audit row (~40k rows) on each call. The self-seal check is now incremental:
-- a saved checkpoint (everything up to it was verified) plus a rotating batch that re-checks older rows,
-- so each call does bounded work and the whole log is still re-checked over a few page loads.
-- The cheap structural checks (links, forks, genesis, walk) still run over the full table every time.

-- "Is this row's own seal correct?" (same rule as before: hash v2 includes user agent, older rows do not)
create or replace function public.rms_audit_row_ok(a public.rms_audit_log)
returns boolean language sql stable set search_path = '' as $$
  select a.row_hash is not distinct from (case when a.hash_v >= 2
    then public.rms_audit_hash2(a.prev_hash, a.table_name, a.row_id, a.action, a.old_data, a.new_data, a.actor_id, a.created_at, a.ip, a.user_agent)
    else public.rms_audit_hash(a.prev_hash, a.table_name, a.row_id, a.action, a.old_data, a.new_data, a.actor_id, a.created_at, a.ip) end)
$$;
revoke execute on function public.rms_audit_row_ok(public.rms_audit_log) from public, anon, authenticated;

-- Internal bookkeeping (one row), not a business table: no audit trigger on purpose.
-- The checkpoint row is itself checked (verified_to_hash must match the row it points at).
create table if not exists public.rms_audit_checkpoint (
  id int primary key default 1 check (id = 1),
  verified_to_id bigint not null default 0,   -- every row with id <= this has had its seal re-computed and matched
  verified_to_hash text,                      -- row_hash of that row, to detect tampering with the checkpoint
  scrub_next_id bigint not null default 0,    -- rotation cursor for re-checking older rows
  last_full_pass_at timestamptz,              -- when the rotation last wrapped around (every row re-checked since the previous wrap)
  checked_at timestamptz
);
alter table public.rms_audit_checkpoint enable row level security;   -- no policies: functions only
revoke all on public.rms_audit_checkpoint from public, anon, authenticated;
insert into public.rms_audit_checkpoint (id) values (1) on conflict (id) do nothing;

-- One-time seed: full self-seal check (this runs as postgres in the SQL editor, no 8 s limit).
do $$
declare v_bad bigint; v_max bigint; v_hash text;
begin
  if not exists (select 1 from public.rms_private_config where key = 'audit_checkpoint_seeded') then
    select min(a.id) into v_bad from public.rms_audit_log a where not public.rms_audit_row_ok(a);
    if v_bad is null then
      select a.id, a.row_hash into v_max, v_hash from public.rms_audit_log a order by a.id desc limit 1;
      if v_max is not null then
        update public.rms_audit_checkpoint
           set verified_to_id = v_max, verified_to_hash = v_hash, scrub_next_id = 0, last_full_pass_at = now(), checked_at = now()
         where id = 1;
      end if;
    end if;
    -- if a bad row exists, verified_to_id stays 0: the function works through the backlog in batches and reports it
    insert into public.rms_private_config (key, value) values ('audit_checkpoint_seeded', now()::text);
  end if;
end $$;

-- Returns the first bad entry id, or null if intact. Bounded work per call (see top of file).
create or replace function public.rms_verify_audit_chain()
returns bigint language plpgsql volatile security definer set search_path = '' set jit = off as $$
declare
  cp public.rms_audit_checkpoint;
  v_bad bigint; v_unreached bigint;
  v_cut bigint; v_target bigint; v_target_hash text;
  v_n int; v_last bigint; v_scrub_bad bigint;
  v_next bigint; v_pass timestamptz;
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  -- serialize concurrent admins on the checkpoint row
  select * into cp from public.rms_audit_checkpoint where id = 1 for update;
  if not found then
    insert into public.rms_audit_checkpoint (id) values (1) on conflict (id) do nothing;
    select * into cp from public.rms_audit_checkpoint where id = 1 for update;
  end if;

  -- 0. the checkpoint must still point at the same entry
  if cp.verified_to_id > 0 and not exists (
       select 1 from public.rms_audit_log a where a.id = cp.verified_to_id and a.row_hash is not distinct from cp.verified_to_hash) then
    v_bad := cp.verified_to_id;
  end if;

  -- 1a. own seal of the next batch of new entries
  -- One statement, so the seal check and the new checkpoint come from the same snapshot.
  -- The checkpoint never moves past entries from the last 2 minutes (a lower id can commit slightly later);
  -- those are checked again next time, and the rotating re-check below is the backstop.
  with batch as materialized (
    select a.id, a.row_hash, a.created_at, public.rms_audit_row_ok(a) as ok
      from public.rms_audit_log a
     where a.id > cp.verified_to_id
     order by a.id
     limit 5000
  ), agg as (
    select min(id) filter (where not ok) as bad, count(*)::int as n,
           min(id) filter (where created_at > now() - interval '2 minutes') as cut
      from batch
  ), tgt as (
    select b.id, b.row_hash from batch b, agg
     where agg.cut is null or b.id < agg.cut
     order by b.id desc
     limit 1
  )
  select agg.bad, agg.n, agg.cut, tgt.id, tgt.row_hash
    into v_scrub_bad, v_n, v_cut, v_target, v_target_hash
    from agg left join tgt on true;
  v_bad := least(v_bad, v_scrub_bad);

  -- 1b. rotating re-check of older entries (backstop for anything that changed below the checkpoint)
  select min(a.id) filter (where not public.rms_audit_row_ok(a)), count(*), max(a.id)
    into v_scrub_bad, v_n, v_last
    from (select b.id from public.rms_audit_log b where b.id >= cp.scrub_next_id and b.id <= cp.verified_to_id order by b.id limit 3000) s
    join public.rms_audit_log a on a.id = s.id;
  v_bad := least(v_bad, v_scrub_bad);
  v_next := cp.scrub_next_id; v_pass := cp.last_full_pass_at;
  if v_n < 3000 then
    v_next := 0;
    if cp.verified_to_id > 0 then v_pass := now(); end if;
  else
    v_next := v_last + 1;
  end if;

  -- 2. exactly one first entry
  v_bad := least(v_bad, (select min(id) from public.rms_audit_log where prev_hash is null
                          and id > (select min(id) from public.rms_audit_log where prev_hash is null)));
  -- 3. every link points at an entry that exists (a removed entry leaves a dangling link)
  v_bad := least(v_bad, (select min(a.id) from public.rms_audit_log a where a.prev_hash is not null
                          and not exists (select 1 from public.rms_audit_log p where p.row_hash = a.prev_hash)));
  -- 4. no two entries share a seal
  v_bad := least(v_bad, (select min(a.id) from public.rms_audit_log a
                          where exists (select 1 from public.rms_audit_log b where b.row_hash = a.row_hash and b.id < a.id)));
  -- 5. no branches, except those noted when the QA-018 fix was installed
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
  v_bad := least(v_bad, v_unreached);

  if v_bad is null then
    update public.rms_audit_checkpoint
       set verified_to_id = coalesce(v_target, verified_to_id),
           verified_to_hash = case when v_target is not null then v_target_hash else verified_to_hash end,
           scrub_next_id = v_next, last_full_pass_at = v_pass, checked_at = now()
     where id = 1;
  else
    -- a failure is reported on every call: leave the checkpoint where it is
    update public.rms_audit_checkpoint set checked_at = now() where id = 1;
  end if;
  return v_bad;
end $$;
revoke execute on function public.rms_verify_audit_chain() from public, anon;
grant execute on function public.rms_verify_audit_chain() to authenticated;

-- How much of the log the last checks covered (for the audit page).
create or replace function public.rms_audit_check_info()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cp public.rms_audit_checkpoint;
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  select * into cp from public.rms_audit_checkpoint where id = 1;
  return jsonb_build_object(
    'total', (select count(*) from public.rms_audit_log),
    'verified_to_id', coalesce(cp.verified_to_id, 0),
    -- entries from the last 2 minutes are left for the next visit on purpose, so they do not count as a backlog
    'pending', (select count(*) from public.rms_audit_log a where a.id > coalesce(cp.verified_to_id, 0)
                  and a.created_at <= now() - interval '2 minutes'),
    'scrub_next_id', coalesce(cp.scrub_next_id, 0),
    'last_full_pass_at', cp.last_full_pass_at,
    'checked_at', cp.checked_at);
end $$;
revoke execute on function public.rms_audit_check_info() from public, anon;
grant execute on function public.rms_audit_check_info() to authenticated;

-- Read-only checks you can run in the SQL Editor:
--   select * from public.rms_audit_checkpoint;
--   select count(*) from public.rms_audit_log where id > (select verified_to_id from public.rms_audit_checkpoint);
--   select min(a.id) from public.rms_audit_log a where not public.rms_audit_row_ok(a);   -- full self-seal check (slow, run here only)
-- Then open /admin/audit while signed in as admin. (In the SQL Editor, rms_verify_audit_chain() and
-- rms_audit_check_info() raise "admins only" because there is no signed-in user.)
