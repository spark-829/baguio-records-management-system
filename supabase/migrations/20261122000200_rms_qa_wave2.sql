-- QA wave 2 fixes (QA-009, QA-005, QA-013, QA-007). Run once in the Supabase SQL Editor, after
-- 20261122000100_rms_qa_wave1.sql. Safe to run again.

-- QA-009: "Late" must use the Manila calendar day, like the dashboard. current_date is UTC, so between
-- midnight and 8 AM Manila the overdue list showed fewer records than the dashboard.
create or replace function public.rms_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Manila')::date
$$;
grant execute on function public.rms_today() to anon, authenticated;

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
    and (p_from is null or r.created_at >= (p_from::timestamp at time zone 'Asia/Manila'))
    and (p_to is null or r.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila'))
    and (not p_overdue or (r.due_date < public.rms_today() and r.status not in ('completed', 'released', 'archived')))
  order by 17 desc, r.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke execute on function public.rms_search_records from public, anon;
grant execute on function public.rms_search_records to authenticated;

-- QA-005: the IP and browser in the audit and access logs came from x-rms-* headers that anyone calling
-- the database API directly could fake. Now those headers count only when they come with a secret key
-- that only the app server knows (the same idea as Cloudflare's authenticated origin pulls).
-- Without the key, the IP is the one the database API itself saw, and Cloudflare's own addresses are
-- left blank instead of being stored as if they were the user's.
create table if not exists public.rms_private_config (
  key text primary key,
  value text not null
);
alter table public.rms_private_config enable row level security;
-- no policies: only security definer functions can read it
revoke all on public.rms_private_config from public, anon, authenticated;
insert into public.rms_private_config (key, value)
values ('proxy_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create or replace function public.rms_request_header(p_name text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_headers json := coalesce(current_setting('request.headers', true), '{}')::json;
  v_key text;
begin
  if lower(p_name) like 'x-rms-%' then
    select value into v_key from public.rms_private_config where key = 'proxy_key';
    if v_key is null or (v_headers ->> 'x-rms-proxy-key') is distinct from v_key then
      return null;
    end if;
  end if;
  return nullif(left(v_headers ->> lower(p_name), 300), '');
end $$;

create or replace function public.rms_is_cloudflare_ip(p_ip text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v inet;
begin
  begin
    v := p_ip::inet;
  exception when others then
    return false;
  end;
  -- Cloudflare's published ranges (cloudflare.com/ips)
  return v <<= any (array[
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
    '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
    '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32']::inet[]);
end $$;

create or replace function public.rms_client_ip()
returns text language sql stable set search_path = '' as $$
  select case when public.rms_is_cloudflare_ip(ip) then null else ip end
  from (select coalesce(public.rms_request_header('x-rms-client-ip'),
                        nullif(trim(split_part(public.rms_request_header('x-forwarded-for'), ',', 1)), '')) as ip) x
$$;

-- New audit rows also hash the browser (user_agent), so it can't be changed later without breaking the chain.
-- Older rows keep their original hash (hash_v 1), so the chain still verifies.
alter table public.rms_audit_log add column if not exists hash_v smallint not null default 1;

create or replace function public.rms_audit_hash2(
  p_prev text, p_table text, p_row text, p_action text, p_old jsonb, p_new jsonb,
  p_actor uuid, p_at timestamptz, p_ip text, p_ua text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(
    concat_ws('|', coalesce(p_prev, 'genesis'), p_table, p_row, p_action,
              coalesce(p_old::text, ''), coalesce(p_new::text, ''), coalesce(p_actor::text, ''),
              to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), coalesce(p_ip, ''), coalesce(p_ua, '')),
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
  new.hash_v := 2;
  select row_hash into new.prev_hash from public.rms_audit_log order by id desc limit 1;
  new.row_hash := public.rms_audit_hash2(new.prev_hash, new.table_name, new.row_id, new.action,
                                         new.old_data, new.new_data, new.actor_id, new.created_at, new.ip, new.user_agent);
  return new;
end $$;

create or replace function public.rms_verify_audit_chain()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare r record; v_prev text := null;
begin
  if public.rms_my_role() is distinct from 'admin' then raise exception 'admins only'; end if;
  for r in select * from public.rms_audit_log order by id loop
    if r.prev_hash is distinct from v_prev
       or r.row_hash is distinct from (case when r.hash_v >= 2
            then public.rms_audit_hash2(v_prev, r.table_name, r.row_id, r.action, r.old_data, r.new_data, r.actor_id, r.created_at, r.ip, r.user_agent)
            else public.rms_audit_hash(v_prev, r.table_name, r.row_id, r.action, r.old_data, r.new_data, r.actor_id, r.created_at, r.ip) end) then
      return r.id;
    end if;
    v_prev := r.row_hash;
  end loop;
  return null;
end $$;
revoke execute on function public.rms_verify_audit_chain() from public, anon;
grant execute on function public.rms_verify_audit_chain() to authenticated;

-- QA-013: moving a record to the bin and restoring it now show in the record's own history.
-- They come from the tamper-evident audit log, so staff see who did it, when and why.
create or replace function public.rms_record_bin_history(p_record_id uuid)
returns table (at timestamptz, event text, actor text, reason text)
language sql stable security definer set search_path = '' as $$
  select a.created_at,
         case when a.new_data ->> 'deleted_at' is not null then 'deleted' else 'restored' end,
         p.full_name,
         a.new_data ->> 'delete_reason'
    from public.rms_audit_log a
    left join public.rms_profiles p on p.id = a.actor_id
   where a.table_name = 'rms_records'
     and a.row_id = p_record_id::text
     and a.action = 'UPDATE'
     and (a.old_data ->> 'deleted_at') is distinct from (a.new_data ->> 'deleted_at')
     and (public.rms_can_view(p_record_id) or public.rms_my_role() in ('admin', 'records_officer'))
   order by a.created_at
$$;
revoke execute on function public.rms_record_bin_history(uuid) from public, anon;
grant execute on function public.rms_record_bin_history(uuid) to authenticated;

-- QA-007: a correct number and code for a record that was moved to the bin used to say "check your number",
-- so the citizen kept retrying until the lockout. Now it counts as a good lookup and says to visit the
-- Records Section. Same per-IP and per-number lockout as wave 1.
create or replace function public.rms_public_track(p_tracking text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := public.rms_client_ip();
  v_no text := left(upper(trim(p_tracking)), 40);
  r record;
  v_steps jsonb;
begin
  -- An unknown IP (no trusted header yet) is not one shared bucket: the per-number limit covers it.
  if (v_ip is not null and (select count(*) from public.rms_track_attempts
       where ip = v_ip and not ok and at > now() - interval '15 minutes') >= 10)
  or (select count(*) from public.rms_track_attempts
       where tracking = v_no and not ok and at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('error', 'too_many');
  end if;

  select rec.id, rec.tracking_no, rec.direction, rec.status, rec.confidentiality, rec.created_at, rec.due_date,
         rec.deleted_at, dt.name as doc_type, o.name as office
    into r
    from public.rms_records rec
    join public.rms_document_types dt on dt.id = rec.document_type_id
    join public.rms_offices o on o.id = rec.current_office_id
   where rec.tracking_no = v_no
     and rec.track_code = upper(trim(p_code));

  insert into public.rms_track_attempts (ip, ok, tracking) values (v_ip, r.id is not null, v_no);
  delete from public.rms_track_attempts where at < now() - interval '1 day';
  if r.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if r.deleted_at is not null then
    return jsonb_build_object('tracking_no', r.tracking_no, 'doc_type', r.doc_type, 'received', r.created_at,
                              'status', 'binned', 'steps', '[]'::jsonb);
  end if;

  if r.confidentiality = 'confidential' then
    return jsonb_build_object('tracking_no', r.tracking_no, 'doc_type', r.doc_type, 'received', r.created_at,
                              'status', 'restricted', 'steps', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('at', rt.created_at, 'status', rt.status, 'office', o.name) order by rt.created_at), '[]')
    into v_steps
    from public.rms_routes rt
    join public.rms_offices o on o.id = rt.to_office_id
   where rt.record_id = r.id;

  return jsonb_build_object('tracking_no', r.tracking_no, 'doc_type', r.doc_type, 'received', r.created_at,
                            'status', r.status, 'office', r.office, 'due', r.due_date, 'steps', v_steps);
end $$;
revoke all on function public.rms_public_track(text, text) from public;
grant execute on function public.rms_public_track(text, text) to anon, authenticated;

-- After running this, copy the key for the app (keep it secret, never paste it in chat):
--   select value from public.rms_private_config where key = 'proxy_key';
-- and add it in Cloudflare as a secret named RMS_PROXY_KEY on the baguio-rms worker.
