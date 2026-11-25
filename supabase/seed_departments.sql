-- Baguio RMS demo data for the 13 offices that had no accounts: a head and a window clerk each, plus 3 sample
-- window records with their charter steps. Also the CMO, CAO and HRMO heads for the city-wide views.
-- Run in the SQL editor as the owner AFTER migrations 20261125000200 to 20261125000600 (like seed_batch3.sql).
-- Fictional names only. Password for every account: Demo@2026. Safe to run again (accounts by email, records by batch).

-- Accounts ------------------------------------------------------------------------------------------------
do $$
declare
  u record;
  v_id uuid;
begin
  for u in
    select o.code, o.area,
           lower(o.code) || '.head@rms-demo.test' as head_email,
           lower(o.code) || '.window@rms-demo.test' as window_email
      from (values
        ('SP', 'Sangguniang Panlungsod'), ('CACCO', 'Accounting'), ('CASSO', 'Assessor'), ('CBAO', 'Building Official'),
        ('CCRO', 'Civil Registry'), ('CEPMO', 'Environment'), ('HSO', 'Health'), ('CSWDO', 'Social Welfare'),
        ('CTCAO', 'Tourism'), ('CVAO', 'Veterinary'), ('CMO-PLD', 'Permits and Licensing'),
        ('PESO', 'Public Employment'), ('CDRRMO', 'Disaster Risk Reduction')
      ) as o(code, area)
  loop
    -- head, then window clerk
    for i in 1..2 loop
      declare
        v_email text := case i when 1 then u.head_email else u.window_email end;
        v_name text := case i when 1 then u.area || ' Head' else u.area || ' Window Clerk' end;
        v_role public.rms_role := case i when 1 then 'dept_head' else 'staff' end;
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
        insert into public.rms_profiles (id, full_name, role, office_id)
        values (v_id, v_name, v_role, (select id from public.rms_offices where code = u.code))
        on conflict (id) do nothing;
        if i = 2 then
          update public.rms_profiles set window_intake = true where id = v_id and coalesce(window_intake, false) = false;
        end if;
      end;
    end loop;
  end loop;

  -- Heads for the city-wide views (CMO, CAO) and the HRMO satisfaction consolidation
  for u in
    select * from (values
      ('cmo.head@rms-demo.test', 'Mayor''s Office Head', 'CMO'),
      ('cao.head@rms-demo.test', 'Administrator''s Office Head', 'CAO'),
      ('hrmo.head@rms-demo.test', 'HRMO Head', 'HRMO')
    ) as h(email, full_name, code)
  loop
    select id into v_id from auth.users where email = u.email;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
              extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"],"app":"rms"}', jsonb_build_object('full_name', u.full_name),
              now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true),
              'email', now(), now(), now());
    end if;
    insert into public.rms_profiles (id, full_name, role, office_id)
    values (v_id, u.full_name, 'dept_head', (select id from public.rms_offices where code = u.code))
    on conflict (id) do nothing;
  end loop;
end $$;

-- Sample window records: the first 3 services with steps of each of the 13 offices ---------------------------------
do $$
declare
  o record;
  s record;
  v_clerk uuid;
  v_office uuid;
  v_rec uuid;
  v_k int;
  v_days int;
  v_day date;
  v_at timestamptz;
  v_action text;
  v_type uuid;
  v_letter uuid := (select id from public.rms_document_types where name = 'Letter');
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if exists (select 1 from public.rms_seed_records where batch = 'dept-2026-11') then
    return;
  end if;
  for o in
    select code from (values ('SP'), ('CACCO'), ('CASSO'), ('CBAO'), ('CCRO'), ('CEPMO'), ('HSO'), ('CSWDO'),
                             ('CTCAO'), ('CVAO'), ('CMO-PLD'), ('PESO'), ('CDRRMO')) as c(code)
  loop
    select id into v_office from public.rms_offices where code = o.code;
    select id into v_clerk from auth.users where email = lower(o.code) || '.window@rms-demo.test';
    if v_office is null or v_clerk is null then
      continue;
    end if;
    v_k := 0;
    for s in
      select * from public.rms_services
       where office_id = v_office and is_active and jsonb_array_length(steps) > 0
       order by sort_order
       limit 3
    loop
      v_k := v_k + 1;
      -- 1, 3 and 5 working days ago, at 09:00 to 15:00 Manila time
      v_days := v_k * 2 - 1;
      v_day := v_today;
      while v_days > 0 loop
        v_day := v_day - 1;
        if extract(isodow from v_day) < 6 then
          v_days := v_days - 1;
        end if;
      end loop;
      v_at := (v_day + make_time(8 + v_k * 2 + (length(s.title) % 3), (length(s.title) * 7) % 50, 0)) at time zone 'Asia/Manila';
      select id into v_type from public.rms_document_types where name = s.doc_type_name;
      insert into public.rms_records (direction, subject, document_type_id, transaction_type, priority, confidentiality,
                                      sender_name, mode, origin_office_id, current_office_id, created_by, created_at,
                                      arta_class, service_id, intake_window)
      values ('incoming', s.title, coalesce(v_type, v_letter), s.tx_types[1], 'normal', 'internal',
              'Walk-in client', 'walk-in', v_office, v_office, v_clerk, v_at,
              s.classification, s.id, true)
      returning id into v_rec;
      -- Record 1 stays registered (step 1 is done by the guard). Record 2 is under action with step 2 done. Record 3 is completed.
      if v_k = 2 then
        insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by, created_at)
        values (v_rec, v_office, v_office, 'under_action', 'Started work', v_clerk, v_at + interval '10 minutes');
        select elem->>'action' into v_action from jsonb_array_elements(s.steps) elem where (elem->>'n')::int = 2;
        update public.rms_records r
           set service_steps = (
             select jsonb_agg(case when (e.v->>'n')::int = 2
                                   then e.v || jsonb_build_object('done_at', v_at + interval '25 minutes', 'done_by', v_clerk)
                                   else e.v end order by e.ord)
               from jsonb_array_elements(r.service_steps) with ordinality as e(v, ord))
         where r.id = v_rec and jsonb_array_length(r.service_steps) >= 2;
        insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by, created_at)
        values (v_rec, v_office, v_office, 'under_action', 'Step 2 done: ' || coalesce(v_action, ''), v_clerk, v_at + interval '25 minutes');
      elsif v_k = 3 then
        insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by, created_at)
        values (v_rec, v_office, v_office, 'completed', 'Done', v_clerk, v_at + interval '30 minutes');
      end if;
      insert into public.rms_seed_records (record_id, batch) values (v_rec, 'dept-2026-11');
    end loop;
  end loop;
end $$;
