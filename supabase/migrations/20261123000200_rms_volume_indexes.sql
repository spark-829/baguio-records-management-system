-- Baguio RMS: indexes for a large audit/access history (run before the volume seed). Safe to run again.
-- The indexes and the PARALLEL SAFE markings do not change any result, and no audit row is touched.

-- Chain tip lookup in rms_audit_chain (20261123000100) and the newest-first /admin/audit list.
create index if not exists rms_audit_log_created_id_idx on public.rms_audit_log (created_at desc, id desc);
-- /admin/audit filtered by table.
create index if not exists rms_audit_log_table_created_idx on public.rms_audit_log (table_name, created_at desc);
-- /admin/access filtered by event.
create index if not exists rms_access_log_event_created_idx on public.rms_access_log (event, created_at desc);

-- The hash functions are pure, so the planner may use them in parallel scans (chain verification).
alter function public.rms_audit_hash(text, text, text, text, jsonb, jsonb, uuid, timestamptz, text) parallel safe;
alter function public.rms_audit_hash2(text, text, text, text, jsonb, jsonb, uuid, timestamptz, text, text) parallel safe;

-- Chain tip lookup that stays fast as the log grows. The planner expects the anti-join to keep only one
-- row (the tip), so it chose a hash anti-join over the whole table: every audit insert read the full log.
-- Fast path: look among the newest 64 entries by index (the tip is the newest entry, because inserts are
-- serialised by the advisory lock). Fallback: the exact earlier query, so the result is always the same.
-- Copy of 20261123000100 with only the tip lookup changed.
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
    from (select n.row_hash, n.created_at, n.id
            from public.rms_audit_log n
           order by n.created_at desc, n.id desc
           limit 64) a
   where not exists (select 1 from public.rms_audit_log c where c.prev_hash = a.row_hash)
   order by a.created_at desc, a.id desc
   limit 1;
  if not found then
    select a.row_hash into new.prev_hash
      from public.rms_audit_log a
     where not exists (select 1 from public.rms_audit_log c where c.prev_hash = a.row_hash)
     order by a.created_at desc, a.id desc
     limit 1;
  end if;
  new.row_hash := public.rms_audit_hash2(new.prev_hash, new.table_name, new.row_id, new.action,
                                         new.old_data, new.new_data, new.actor_id, new.created_at, new.ip, new.user_agent);
  return new;
end $$;
