-- Baguio RMS demo seed: reference data, demo accounts, sample records.
-- Demo accounts share the password  Demo@2026  (demo data only).

insert into public.rms_offices (code, name) values
  ('CMO',  'City Mayor''s Office'),
  ('CAO',  'City Administrator''s Office'),
  ('CEO',  'City Engineering Office'),
  ('CTO',  'City Treasury Office'),
  ('CBO',  'City Budget Office'),
  ('HRMO', 'City Human Resource Management Office'),
  ('CLO',  'City Legal Office'),
  ('CPDO', 'City Planning, Development and Sustainability Office'),
  ('CGSO', 'City General Services Office')
on conflict (code) do nothing;

insert into public.rms_document_types (name, retention_years, series_code, series_title) values
  ('Letter', 5, 'ADM-COR', 'Correspondence (letters received and sent)'),
  ('Memorandum', 5, 'ADM-MEM', 'Office memoranda and circulars'),
  ('Executive Order', 10, 'EXE-EO', 'Executive orders of the City Mayor'),
  ('Ordinance', 50, 'LEG-ORD', 'City ordinances'),
  ('Resolution', 50, 'LEG-RES', 'Resolutions'),
  ('Disbursement Voucher', 10, 'FIN-DV', 'Disbursement vouchers and supporting papers'),
  ('Purchase Request', 10, 'PRO-PR', 'Purchase requests'),
  ('Endorsement', 5, 'ADM-END', 'Endorsements and transmittals'),
  ('Request', 5, 'CS-REQ', 'Requests for city services')
on conflict (name) do nothing;

-- Demo users ------------------------------------------------------------
do $$
declare
  u record;
  v_id uuid;
begin
  for u in
    select * from (values
      ('admin@rms-demo.test',      'Maria Santos (Admin)',          'admin'::public.rms_role,           'CMO'),
      ('records@rms-demo.test',    'Jose Reyes (Records Officer)',  'records_officer'::public.rms_role, 'CGSO'),
      ('engineering.head@rms-demo.test', 'Ana Dizon (Engineering Head)', 'dept_head'::public.rms_role, 'CEO'),
      ('engineering.staff@rms-demo.test','Carlo Bautista (Engineering Staff)', 'staff'::public.rms_role, 'CEO'),
      ('treasury.staff@rms-demo.test',   'Liza Mendoza (Treasury Staff)', 'staff'::public.rms_role, 'CTO'),
      ('viewer@rms-demo.test',           'Paolo Garcia (Planning, read-only)', 'viewer'::public.rms_role, 'CPDO')
    ) as t(email, full_name, role, office_code)
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
    values (v_id, u.full_name, u.role, (select id from public.rms_offices where code = u.office_code))
    on conflict (id) do nothing;
  end loop;
end $$;

-- Sample records ----------------------------------------------------------
do $$
declare
  ro uuid := (select id from auth.users where email = 'records@rms-demo.test');
  eh uuid := (select id from auth.users where email = 'engineering.head@rms-demo.test');
  es uuid := (select id from auth.users where email = 'engineering.staff@rms-demo.test');
  ts uuid := (select id from auth.users where email = 'treasury.staff@rms-demo.test');
  cmo uuid := (select id from public.rms_offices where code = 'CMO');
  ceo uuid := (select id from public.rms_offices where code = 'CEO');
  cto uuid := (select id from public.rms_offices where code = 'CTO');
  clo uuid := (select id from public.rms_offices where code = 'CLO');
  t_letter uuid := (select id from public.rms_document_types where name = 'Letter');
  t_req uuid := (select id from public.rms_document_types where name = 'Request');
  t_dv uuid := (select id from public.rms_document_types where name = 'Disbursement Voucher');
  t_memo uuid := (select id from public.rms_document_types where name = 'Memorandum');
  t_pr uuid := (select id from public.rms_document_types where name = 'Purchase Request');
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid;
begin
  if exists (select 1 from public.rms_records) then return; end if;

  insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
    sender_name, sender_org, mode, document_date, origin_office_id, due_date, created_by, created_at)
  values ('incoming', 'Request for road repair along Session Road extension', 'Barangay council requests repair of potholes and drainage near the market.',
    t_req, 'Infrastructure', '{road,repair,drainage,barangay}', 'urgent', 'public',
    'Punong Barangay', 'Barangay Session Road Area', 'walk-in', current_date - 9, cmo, current_date - 2, ro, now() - interval '9 days')
  returning id into r1;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at) values
    (r1, cmo, ceo, 'forwarded', 'Forwarded for site inspection', 'Please inspect within 3 working days.', ro, now() - interval '8 days'),
    (r1, ceo, ceo, 'received', 'Received by Engineering', null, es, now() - interval '7 days'),
    (r1, ceo, ceo, 'under_action', 'Site inspection scheduled', 'Inspection team assigned.', eh, now() - interval '6 days');

  insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
    sender_name, sender_org, mode, document_date, origin_office_id, due_date, created_by, created_at)
  values ('incoming', 'Disbursement voucher for drainage materials', 'Voucher for purchase of culverts and cement.',
    t_dv, 'Finance', '{voucher,drainage,materials}', 'normal', 'internal',
    'Supply Section', 'City General Services Office', 'internal', current_date - 6, cmo, current_date + 4, ro, now() - interval '6 days')
  returning id into r2;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at) values
    (r2, cmo, cto, 'forwarded', 'Forwarded for payment processing', null, ro, now() - interval '5 days'),
    (r2, cto, cto, 'received', 'Received by Treasury', null, ts, now() - interval '5 days'),
    (r2, cto, cto, 'under_action', 'Checking supporting documents', 'Missing delivery receipt; requested from supplier.', ts, now() - interval '4 days');

  insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
    sender_name, sender_org, mode, document_date, origin_office_id, due_date, created_by, created_at)
  values ('incoming', 'Notice of administrative complaint', 'Confidential complaint referred for legal review.',
    t_letter, 'Legal', '{complaint,administrative,legal}', 'urgent', 'confidential',
    'Private complainant', null, 'mail', current_date - 3, cmo, current_date + 7, ro, now() - interval '3 days')
  returning id into r3;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at) values
    (r3, cmo, clo, 'forwarded', 'Referred to City Legal Office', 'Handle as confidential.', ro, now() - interval '2 days');

  insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
    recipient_name, recipient_org, mode, document_date, origin_office_id, created_by, created_at)
  values ('outgoing', 'Reply to barangay on road repair schedule', 'Advises the barangay of the inspection result and repair schedule.',
    t_letter, 'Infrastructure', '{road,repair,reply}', 'normal', 'public',
    'Punong Barangay', 'Barangay Session Road Area', 'courier', current_date - 1, ceo, eh, now() - interval '2 days')
  returning id into r4;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at) values
    (r4, ceo, ceo, 'completed', 'Signed by department head', null, eh, now() - interval '1 day'),
    (r4, ceo, ceo, 'released', 'Released via courier', 'Courier receipt attached.', es, now() - interval '20 hours');

  insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
    sender_name, sender_org, mode, document_date, origin_office_id, created_by, created_at)
  values ('incoming', 'Memorandum on records digitization guidelines', 'Internal memo setting naming and scanning standards.',
    t_memo, 'Administration', '{memo,records,digitization}', 'low', 'internal',
    'City Administrator', 'City Administrator''s Office', 'internal', current_date - 20, cmo, ro, now() - interval '20 days')
  returning id into r5;
  insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at) values
    (r5, cmo, cmo, 'completed', 'Disseminated to all offices', null, ro, now() - interval '18 days'),
    (r5, cmo, cmo, 'archived', 'Filed', null, ro, now() - interval '15 days');

  insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
    sender_name, sender_org, mode, document_date, origin_office_id, due_date, created_by, created_at)
  values ('incoming', 'Purchase request for office scanners', 'Two document scanners for the records section.',
    t_pr, 'Procurement', '{scanner,procurement,records}', 'normal', 'internal',
    'Records Section', 'City Mayor''s Office', 'internal', current_date, cmo, current_date + 10, ro, now() - interval '2 hours')
  returning id into r6;
end $$;
