-- Baguio RMS: features per office (hidden, never deleted), the office window flag on accounts, reference-number labels, document type Report.
-- Run after 20261125000100. Safe to run again. Safe with the previous app version. No drops or deletes.

-- a. Columns -----------------------------------------------------------------------------------------------
alter table public.rms_offices add column if not exists features text[];
alter table public.rms_offices add column if not exists ref_label text check (ref_label is null or length(ref_label) <= 80);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rms_offices_features_known' and conrelid = 'public.rms_offices'::regclass) then
    alter table public.rms_offices add constraint rms_offices_features_known
      check (features is null or features <@ array['window','services','logbook','copies','boxes','map','satisfaction','refno','oversight']::text[]);
  end if;
end $$;
-- Nullable on purpose: the app treats null as false.
alter table public.rms_profiles add column if not exists window_intake boolean default false;

-- b. Defaults (never overwrite an administrator's later choice) ---------------------------------------------
update public.rms_offices o set features = v.f::text[]
  from (values
    ('CMO',     '{services,satisfaction,refno,window,logbook,oversight}'),
    ('CAO',     '{services,satisfaction,refno,window,logbook,oversight}'),
    ('CEO',     '{services,satisfaction,refno,window,logbook,map}'),
    ('CTO',     '{services,satisfaction,refno,window,logbook}'),
    ('CBO',     '{services,satisfaction,refno}'),
    ('HRMO',    '{services,satisfaction,refno,window,logbook,copies}'),
    ('CLO',     '{services,satisfaction,refno,window,logbook,copies}'),
    ('CPDO',    '{services,satisfaction,refno,window,logbook,map}'),
    ('SP',      '{services,satisfaction,refno,window,logbook,copies,boxes}'),
    ('CACCO',   '{services,satisfaction,refno,window}'),
    ('CASSO',   '{services,satisfaction,refno,window,logbook,copies,map}'),
    ('CBAO',    '{services,satisfaction,refno,window,logbook,copies,map}'),
    ('CCRO',    '{services,satisfaction,refno,window,logbook,copies,boxes}'),
    ('CEPMO',   '{services,satisfaction,refno,window,logbook,map}'),
    ('CGSO',    '{services,satisfaction,refno,logbook,copies,boxes,map}'),
    ('HSO',     '{services,satisfaction,refno,window,logbook,map}'),
    ('CSWDO',   '{services,satisfaction,refno,window,logbook,map}'),
    ('CTCAO',   '{services,satisfaction,refno,window,logbook}'),
    ('CVAO',    '{services,satisfaction,refno,window,logbook,map}'),
    ('CMO-PLD', '{services,satisfaction,refno,window,logbook,map}'),
    ('PESO',    '{services,satisfaction,refno,window,logbook}'),
    ('CDRRMO',  '{services,satisfaction,refno,window,logbook,map}')
  ) v(code, f)
 where o.code = v.code and o.features is null;

update public.rms_offices o set ref_label = v.l
  from (values
    ('CMO',     'Executive order no.'),
    ('CAO',     'Reference no.'),
    ('CEO',     'Project or work order no.'),
    ('CTO',     'Official receipt no.'),
    ('CBO',     'Obligation request no.'),
    ('HRMO',    'Plantilla item no.'),
    ('CLO',     'Contract or case no.'),
    ('CPDO',    'Locational clearance no.'),
    ('SP',      'Ordinance or resolution no.'),
    ('CACCO',   'Disbursement voucher no.'),
    ('CASSO',   'Tax declaration no.'),
    ('CBAO',    'Building permit no.'),
    ('CCRO',    'Registry no.'),
    ('CEPMO',   'Clearance or permit no.'),
    ('CGSO',    'Purchase request or order no.'),
    ('HSO',     'Certificate no.'),
    ('CSWDO',   'Case no.'),
    ('CTCAO',   'Permit no.'),
    ('CVAO',    'Certificate no.'),
    ('CMO-PLD', 'Business permit no.'),
    ('PESO',    'Reference no.'),
    ('CDRRMO',  'Reference no.')
  ) v(code, l)
 where o.code = v.code and o.ref_label is null;

-- c. Helper functions ----------------------------------------------------------------------------------------
create or replace function public.rms_office_has(p_office uuid, p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select o.features from public.rms_offices o where o.id = p_office) @> array[p_feature], false)
$$;
revoke execute on function public.rms_office_has(uuid, text) from public, anon;
grant execute on function public.rms_office_has(uuid, text) to authenticated;

-- Who may log documents handed in at an office window: its active head, or staff flagged as window staff,
-- when the office has the Office window feature on.
create or replace function public.rms_can_window_intake()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.rms_profiles p
      join public.rms_offices o on o.id = p.office_id and o.is_active
     where p.id = (select auth.uid())
       and p.is_active
       and (p.locked_until is null or p.locked_until < now())
       and (p.role = 'dept_head' or (p.role = 'staff' and coalesce(p.window_intake, false)))
       and coalesce(o.features, '{}'::text[]) @> array['window']
  )
$$;
revoke execute on function public.rms_can_window_intake() from public, anon;
grant execute on function public.rms_can_window_intake() to authenticated;

-- City oversight (read only): the CMO and CAO heads, when the office has the feature on.
create or replace function public.rms_is_oversight()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.rms_profiles p
      join public.rms_offices o on o.id = p.office_id and o.is_active
     where p.id = (select auth.uid())
       and p.is_active
       and (p.locked_until is null or p.locked_until < now())
       and p.role = 'dept_head'
       and o.code in ('CMO', 'CAO')
       and coalesce(o.features, '{}'::text[]) @> array['oversight']
  )
$$;
revoke execute on function public.rms_is_oversight() from public, anon;
grant execute on function public.rms_is_oversight() to authenticated;

-- HRMO consolidates the satisfaction results: its head, and HRMO staff flagged as window staff.
create or replace function public.rms_is_hrmo_css()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.rms_profiles p
      join public.rms_offices o on o.id = p.office_id
     where p.id = (select auth.uid())
       and p.is_active
       and (p.locked_until is null or p.locked_until < now())
       and o.code = 'HRMO'
       and (p.role = 'dept_head' or (p.role = 'staff' and coalesce(p.window_intake, false)))
  )
$$;
revoke execute on function public.rms_is_hrmo_css() from public, anon;
grant execute on function public.rms_is_hrmo_css() to authenticated;

-- d. Document type Report (used by the monthly satisfaction summary) -----------------------------------------
insert into public.rms_document_types (name, retention_years) values ('Report', 5) on conflict (name) do nothing;

-- e. Reload the API schema --------------------------------------------------------------------------------------
notify pgrst, 'reload schema';
