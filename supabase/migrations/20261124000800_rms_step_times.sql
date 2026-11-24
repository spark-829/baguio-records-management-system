-- Baguio RMS: standard minutes per step (Citizen's Charter, GSO Service 15), set by the records desk only.
-- Run after 20261124000700. Safe to run again. Safe with the previous app version. No drops or deletes.

insert into public.rms_settings (key, value, description) values
  ('step_minutes', '{"register":9,"forward":5,"receive":5,"assign":5,"act":5}'::jsonb, 'Standard minutes per step (Citizen''s Charter, GSO Service 15)')
on conflict (key) do nothing;

create or replace function public.rms_set_step_minutes(p_minutes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  clean jsonb := '{}'::jsonb;
begin
  if public.rms_my_role() is distinct from 'records_officer' then
    raise exception 'only the records desk sets standard times';
  end if;
  if p_minutes is null or jsonb_typeof(p_minutes) <> 'object' then
    raise exception 'type minutes from 1 to 600';
  end if;
  for k, v in select * from jsonb_each(p_minutes) loop
    if k not in ('register', 'forward', 'receive', 'assign', 'act')
       or jsonb_typeof(v) <> 'number'
       or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
       or (v #>> '{}')::numeric < 1 or (v #>> '{}')::numeric > 600 then
      raise exception 'type minutes from 1 to 600';
    end if;
    clean := clean || jsonb_build_object(k, (v #>> '{}')::int);
  end loop;
  insert into public.rms_settings (key, value, description)
  values ('step_minutes', clean, 'Standard minutes per step (Citizen''s Charter, GSO Service 15)')
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return clean;
end;
$$;

revoke execute on function public.rms_set_step_minutes(jsonb) from public, anon;
grant execute on function public.rms_set_step_minutes(jsonb) to authenticated;
