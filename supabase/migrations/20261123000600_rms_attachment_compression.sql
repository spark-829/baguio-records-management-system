-- Attachment compression: hashes, original size, thumbnail path, orphan cleanup.
-- The audit trigger rms_audit_attachments (schema.sql:254) uses to_jsonb(new) (20261122000300:12),
-- so the new columns are audited without any change to the trigger.

alter table public.rms_attachments add column if not exists sha256 text;
alter table public.rms_attachments add column if not exists original_sha256 text;
alter table public.rms_attachments add column if not exists original_size_bytes bigint;
alter table public.rms_attachments add column if not exists thumb_path text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rms_attachments_sha256_format') then
    alter table public.rms_attachments add constraint rms_attachments_sha256_format
      check (sha256 ~ '^[0-9a-f]{64}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rms_attachments_original_sha256_format') then
    alter table public.rms_attachments add constraint rms_attachments_original_sha256_format
      check (original_sha256 ~ '^[0-9a-f]{64}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rms_attachments_original_size_positive') then
    alter table public.rms_attachments add constraint rms_attachments_original_size_positive
      check (original_size_bytes > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rms_attachments_thumb_path_format') then
    alter table public.rms_attachments add constraint rms_attachments_thumb_path_format
      check (thumb_path ~ '^[0-9a-f-]{36}/thumbs/[0-9a-f-]{36}\.jpg$') not valid;
  end if;
end $$;

create index if not exists rms_attachments_record_sha_idx on public.rms_attachments (record_id, sha256);

create or replace function public.rms_attachments_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.mime_type not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp') then
    raise exception 'only PDF, PNG, JPG and WEBP files can be attached';
  end if;
  if new.file_path not like new.record_id::text || '/%' then
    raise exception 'the file must be stored under its own record';
  end if;
  if new.thumb_path is not null and new.thumb_path !~ ('^' || new.record_id::text || '/thumbs/[0-9a-f-]{36}\.jpg$') then
    raise exception 'the thumbnail must be stored under its own record';
  end if;
  new.uploaded_at := now();
  return new;
end $$;

revoke execute on function public.rms_attachments_guard_insert() from public, anon, authenticated;

-- True when no attachment row points at this storage object (used to allow cleanup of failed uploads).
create or replace function public.rms_storage_is_orphan(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.rms_attachments a where a.file_path = p_name or a.thumb_path = p_name)
$$;

revoke execute on function public.rms_storage_is_orphan(text) from public, anon;
grant execute on function public.rms_storage_is_orphan(text) to authenticated;

-- No storage delete policy existed, so storage.remove() silently deleted nothing.
-- Allow a user to remove only their own, recent, unreferenced objects.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'rms_storage_delete_orphan') then
    create policy rms_storage_delete_orphan on storage.objects for delete to authenticated
      using (bucket_id = 'rms-attachments'
             and owner_id = (select auth.uid())::text
             and created_at > now() - interval '1 hour'
             and public.rms_storage_is_orphan(name));
  end if;
end $$;

notify pgrst, 'reload schema';
