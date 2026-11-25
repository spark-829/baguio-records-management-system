-- Baguio RMS: the Citizen's Charter service catalog (one row per service, steps kept as JSON).
-- Run after 20261125000200. Safe to run again. Safe with the previous app version. No drops or deletes.
-- Rows are loaded by 20261125000400 (generated). Read-only for every signed-in user; no write policies.

create table if not exists public.rms_services (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.rms_offices (id),
  service_no text not null check (length(service_no) <= 10),
  title text not null check (length(title) between 3 and 200),
  division text,
  who text,
  fee_text text,
  fee_php numeric(12, 2),
  total_minutes int,
  total_text text,
  classification text not null check (classification in ('simple', 'complex', 'highly_technical')),
  tx_types text[] not null check (cardinality(tx_types) >= 1 and tx_types <@ array['G2C', 'G2G', 'G2B']::text[]),
  confidential boolean not null default false,
  doc_type_name text not null default 'Letter',
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (office_id, service_no)
);
create index if not exists rms_services_office_idx on public.rms_services (office_id, sort_order);
alter table public.rms_services enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_services' and policyname = 'rms_services_select') then
    create policy rms_services_select on public.rms_services for select to authenticated
      using ((select public.rms_my_role()) is not null);
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'rms_audit_services' and tgrelid = 'public.rms_services'::regclass) then
    create trigger rms_audit_services after insert or update or delete on public.rms_services
      for each row execute function public.rms_audit();
  end if;
end $$;
-- No insert, update or delete policies: rows are loaded by the generated migration, run as the owner.
revoke all on public.rms_services from anon;
revoke insert, update, delete, truncate on public.rms_services from authenticated;

notify pgrst, 'reload schema';
