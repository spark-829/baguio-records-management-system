-- QA wave 1 fixes (QA-001, QA-002). Run once in the Supabase SQL Editor. Safe to run again.

-- QA-001: the demo admin login is public, so "Add user" must not become a way to fill auth.users.
-- New accounts must use an @rms-demo.test address (a reserved test domain that can never receive mail),
-- and at most 20 accounts can be added per day across the whole demo.
create or replace function public.rms_admin_create_user(
  p_email text, p_password text, p_full_name text, p_role public.rms_role, p_office_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if public.rms_my_role() is distinct from 'admin' then
    raise exception 'only admins can create users';
  end if;
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

-- QA-002: the old cap of 60 failed lookups a minute across everyone let one person block /track for all.
-- Like bank and parcel-tracking sites, the lockout now applies per caller and per tracking number instead:
-- 10 wrong codes in 15 minutes from one IP, or 10 wrong codes for one tracking number, locks only that.
-- The per-number limit still stops guessing when someone fakes their IP header.
alter table public.rms_track_attempts add column if not exists tracking text;
create index if not exists rms_track_attempts_tracking_at on public.rms_track_attempts (tracking, at);

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
  if (select count(*) from public.rms_track_attempts
       where ip is not distinct from v_ip and not ok and at > now() - interval '15 minutes') >= 10
  or (select count(*) from public.rms_track_attempts
       where tracking = v_no and not ok and at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('error', 'too_many');
  end if;

  select rec.id, rec.tracking_no, rec.direction, rec.status, rec.confidentiality, rec.created_at, rec.due_date,
         dt.name as doc_type, o.name as office
    into r
    from public.rms_records rec
    join public.rms_document_types dt on dt.id = rec.document_type_id
    join public.rms_offices o on o.id = rec.current_office_id
   where rec.tracking_no = v_no
     and rec.track_code = upper(trim(p_code))
     and rec.deleted_at is null;

  insert into public.rms_track_attempts (ip, ok, tracking) values (v_ip, r.id is not null, v_no);
  delete from public.rms_track_attempts where at < now() - interval '1 day';
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
