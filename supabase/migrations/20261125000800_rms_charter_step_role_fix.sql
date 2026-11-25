-- Baguio RMS: QA review fix for rms_mark_charter_step. A staff member without the window flag could mark steps on an
-- unassigned record because a null comparison skipped the refusal. The check now fails closed.
-- Run after 20261125000600. Safe to run again. Safe with the previous app version. No drops or deletes.

create or replace function public.rms_mark_charter_step(p_record_id uuid, p_step int, p_undo boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role public.rms_role := public.rms_my_role();
  v_flag boolean;
  r record;
  e jsonb;
  v_low int;
  v_high int;
  v_route uuid;
  v_new jsonb;
begin
  if v_role is null or v_role in ('admin', 'viewer') then
    raise exception 'only office staff mark charter steps';
  end if;
  perform public.rms_lock_record(p_record_id);
  select status, current_office_id, assigned_to, service_steps, deleted_at into r
    from public.rms_records where id = p_record_id;
  if not found or r.deleted_at is not null then
    raise exception 'record not found';
  end if;
  if r.service_steps is null then
    raise exception 'this record has no charter steps';
  end if;
  if r.status not in ('registered', 'received', 'under_action') then
    raise exception 'charter steps can be marked only while the office is working on the record';
  end if;
  select coalesce(window_intake, false) into v_flag from public.rms_profiles where id = auth.uid();
  if not coalesce(public.rms_my_office() is not distinct from r.current_office_id
          and (r.assigned_to is not distinct from auth.uid() or v_role in ('dept_head', 'records_officer') or (v_role = 'staff' and coalesce(v_flag, false))), false) then
    raise exception 'only the office holding this record can mark its charter steps';
  end if;

  select min((x.v ->> 'n')::int) filter (where x.v ->> 'done_at' is null),
         max((x.v ->> 'n')::int) filter (where x.v ->> 'done_at' is not null)
    into v_low, v_high
    from jsonb_array_elements(r.service_steps) as x(v);

  if not coalesce(p_undo, false) then
    if p_step is distinct from v_low then
      raise exception 'mark the steps in order';
    end if;
    select x.v into e from jsonb_array_elements(r.service_steps) as x(v) where (x.v ->> 'n')::int = p_step;
    insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by)
    values (p_record_id, r.current_office_id, r.current_office_id, r.status,
            'Step ' || p_step || ' done: ' || coalesce(e ->> 'action', ''), auth.uid())
    returning id into v_route;
    select jsonb_agg(case when (x.v ->> 'n')::int = p_step
                          then x.v || jsonb_build_object('done_at', now(), 'done_by', auth.uid(), 'route_id', v_route)
                          else x.v end
                    order by x.ord)
      into v_new from jsonb_array_elements(r.service_steps) with ordinality as x(v, ord);
  else
    select x.v into e from jsonb_array_elements(r.service_steps) as x(v) where (x.v ->> 'n')::int = p_step;
    if e is null or p_step is distinct from v_high or p_step <= 1
       or (e ->> 'done_by') is distinct from auth.uid()::text
       or (e ->> 'done_at')::timestamptz <= now() - interval '10 minutes' then
      raise exception 'this step can no longer be undone';
    end if;
    insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, acted_by)
    values (p_record_id, r.current_office_id, r.current_office_id, r.status,
            'Step ' || p_step || ' undone: ' || coalesce(e ->> 'action', ''), auth.uid());
    select jsonb_agg(case when (x.v ->> 'n')::int = p_step
                          then x.v - 'done_at' - 'done_by' - 'route_id'
                          else x.v end
                    order by x.ord)
      into v_new from jsonb_array_elements(r.service_steps) with ordinality as x(v, ord);
  end if;
  update public.rms_records set service_steps = v_new where id = p_record_id;
  return v_new;
end $$;
revoke execute on function public.rms_mark_charter_step(uuid, int, boolean) from public, anon;
grant execute on function public.rms_mark_charter_step(uuid, int, boolean) to authenticated;

notify pgrst, 'reload schema';
