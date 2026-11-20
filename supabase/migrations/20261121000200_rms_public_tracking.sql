-- Public document tracking for citizens.
-- Each record gets a short tracking code printed on the acknowledgment receipt given to the person who filed it.
-- With the tracking number AND the code, anyone can see the document's progress: status, office and dates only.
-- No names, subject, remarks or files are ever shown. Confidential records show only "being processed".

create or replace function public.rms_new_track_code()
returns text language sql volatile set search_path = '' as $$
  -- 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L)
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '')
  from (select extensions.gen_random_bytes(6) as b) x, generate_series(0, 5) as i;
$$;

alter table public.rms_records add column if not exists track_code text;
update public.rms_records set track_code = public.rms_new_track_code() where track_code is null;
alter table public.rms_records alter column track_code set default public.rms_new_track_code();
alter table public.rms_records alter column track_code set not null;

-- Failed lookups are counted per IP so the code cannot be guessed by trying many times.
create table if not exists public.rms_track_attempts (
  id bigint generated always as identity primary key,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
alter table public.rms_track_attempts enable row level security;
-- no policies: only the security definer function below can read or write it
create index if not exists rms_track_attempts_ip_at on public.rms_track_attempts (ip, at);

create or replace function public.rms_public_track(p_tracking text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := public.rms_client_ip();
  v_fails int;
  r record;
  v_steps jsonb;
begin
  select count(*) into v_fails from public.rms_track_attempts
   where ip is not distinct from v_ip and not ok and at > now() - interval '15 minutes';
  if v_fails >= 10 then
    return jsonb_build_object('error', 'too_many');
  end if;
  -- A cap across everyone too, since a caller could fake the IP header.
  if (select count(*) from public.rms_track_attempts where not ok and at > now() - interval '1 minute') >= 60 then
    return jsonb_build_object('error', 'too_many');
  end if;

  select rec.id, rec.tracking_no, rec.direction, rec.status, rec.confidentiality, rec.created_at, rec.due_date,
         dt.name as doc_type, o.name as office
    into r
    from public.rms_records rec
    join public.rms_document_types dt on dt.id = rec.document_type_id
    join public.rms_offices o on o.id = rec.current_office_id
   where rec.tracking_no = upper(trim(p_tracking))
     and rec.track_code = upper(trim(p_code))
     and rec.deleted_at is null;

  insert into public.rms_track_attempts (ip, ok) values (v_ip, r.id is not null);
  if r.id is null then
    return jsonb_build_object('error', 'not_found');
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
revoke all on function public.rms_new_track_code() from public, anon;
