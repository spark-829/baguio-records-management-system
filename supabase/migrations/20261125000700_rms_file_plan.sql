-- File plan (records series) per document type, and "Request / Complaint" renamed to "Request".
--
-- Why: the type list had both "Complaint" (drives the 72-hour complaint clock) and the older
-- "Request / Complaint", so clerks could file a complaint under the wrong type.
--
-- Series codes are the City's own file plan codes (ADM administrative, EXE executive,
-- LEG legislative, FIN finance, PRO procurement, CS citizen services), grouped by records
-- series the way public records are scheduled under RA 9470 (National Archives of the
-- Philippines Act of 2007) and the NAP records disposition schedules. They are NOT NAP
-- General Records Disposition Schedule item numbers: check them against the City's
-- NAP-approved Records Disposition Schedule before real use.
-- Keep periods (retention_years) are not changed here.
--
-- Safe before the new app deploys: the new columns are nullable and the old app does not
-- read them; the rename keeps the row id, so every record keeps its type. Idempotent.

-- a. Columns ------------------------------------------------------------------------------
alter table public.rms_document_types add column if not exists series_code text;
alter table public.rms_document_types add column if not exists series_title text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'rms_document_types_series_code_check'
                    and conrelid = 'public.rms_document_types'::regclass) then
    alter table public.rms_document_types add constraint rms_document_types_series_code_check
      check (series_code is null or series_code ~ '^[A-Z]{2,5}(-[A-Z0-9]{1,8}){1,3}$');
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'rms_document_types_series_title_check'
                    and conrelid = 'public.rms_document_types'::regclass) then
    alter table public.rms_document_types add constraint rms_document_types_series_title_check
      check (series_title is null or char_length(series_title) between 1 and 120);
  end if;
end $$;

create unique index if not exists rms_document_types_series_code_key
  on public.rms_document_types (series_code) where series_code is not null;

-- b. Rename "Request / Complaint" to "Request" (same row, so records keep their type) -----
update public.rms_document_types
   set name = 'Request'
 where name = 'Request / Complaint'
   and not exists (select 1 from public.rms_document_types where name = 'Request');

-- c. File plan codes; only where none is set yet, so later admin edits are kept ----------
update public.rms_document_types t
   set series_code = v.code, series_title = v.title
  from (values
    ('Letter',               'ADM-COR', 'Correspondence (letters received and sent)'),
    ('Memorandum',           'ADM-MEM', 'Office memoranda and circulars'),
    ('Endorsement',          'ADM-END', 'Endorsements and transmittals'),
    ('Report',               'ADM-RPT', 'Reports'),
    ('Executive Order',      'EXE-EO',  'Executive orders of the City Mayor'),
    ('Ordinance',            'LEG-ORD', 'City ordinances'),
    ('Resolution',           'LEG-RES', 'Resolutions'),
    ('Disbursement Voucher', 'FIN-DV',  'Disbursement vouchers and supporting papers'),
    ('Purchase Request',     'PRO-PR',  'Purchase requests'),
    ('Request',              'CS-REQ',  'Requests for city services'),
    ('Complaint',            'CS-CMP',  'Complaints and feedback'),
    ('Request for copy',     'CS-COPY', 'Requests for copies of records')
  ) as v(name, code, title)
 where t.name = v.name
   and t.series_code is null
   and not exists (select 1 from public.rms_document_types x where x.series_code = v.code);

-- d. Owner-only demo seeder: use the new name. Rewrites only the type-name string in the
--    stored definition (CREATE OR REPLACE keeps the owner and the revoked grants).
do $$
declare
  v_def text;
begin
  if to_regprocedure('public.rms_seed_demo(date, date, text, numeric, uuid)') is null then
    return;
  end if;
  v_def := pg_get_functiondef('public.rms_seed_demo(date, date, text, numeric, uuid)'::regprocedure);
  if position('Request / Complaint' in v_def) > 0 then
    execute replace(v_def, 'Request / Complaint', 'Request');
  end if;
end $$;

-- e. Charter services (added by a later branch) name their document type by text ----------
do $$
begin
  if to_regclass('public.rms_services') is not null then
    execute $q$update public.rms_services set doc_type_name = 'Request'
                where doc_type_name = 'Request / Complaint'$q$;
  end if;
end $$;

notify pgrst, 'reload schema';
