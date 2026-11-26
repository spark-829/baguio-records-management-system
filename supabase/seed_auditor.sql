-- Role review 2026-11-26: the demo auditor gets its own account. Run as owner (SQL editor or execute_sql).
-- Idempotent. No DROP or DELETE.
--
-- Why: QA-097 flagged viewer@rms-demo.test (City Planning, read-only) as the demo auditor, so a planning
-- clerk could read the whole audit trail and everyone's access history. An auditor is an independent
-- person (for example the COA resident auditor), not a member of a city office.
--
-- 1. viewer@rms-demo.test goes back to a plain Viewer (reads City Planning records only).
-- 2. auditor@rms-demo.test (password Demo@2026): Viewer, no office, is_auditor. Sees the audit log and
--    access history and nothing else (no office means no records; the app shows audit pages only).

update public.rms_profiles p set is_auditor = false
from auth.users u
where u.id = p.id and u.email = 'viewer@rms-demo.test' and p.is_auditor;

do $$
declare
  v_id uuid;
  v_email text := 'auditor@rms-demo.test';
  v_name text := 'Resident Auditor (COA, read-only)';
begin
  select id into v_id from auth.users where email = v_email;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
            extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"],"app":"rms"}', jsonb_build_object('full_name', v_name),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
  end if;
  insert into public.rms_profiles (id, full_name, role, office_id, is_auditor)
  values (v_id, v_name, 'viewer', null, true)
  on conflict (id) do update set role = 'viewer', office_id = null, is_auditor = true
    where public.rms_profiles.role = 'viewer';
end $$;

-- Check (expect viewer false / CPDO, auditor true / no office):
-- select u.email, p.role, p.office_id, p.is_auditor from auth.users u join public.rms_profiles p on p.id = u.id
-- where u.email in ('viewer@rms-demo.test', 'auditor@rms-demo.test');
