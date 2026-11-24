-- Baguio RMS: HRMO consolidates client satisfaction city-wide; CMO and CAO heads get a read-only city-wide view.
-- Run after 20261125000500. Safe to run again. Safe with the previous app version. No drops or deletes.
-- No RLS is broadened on rms_records, rms_routes or rms_attachments: the city views are guarded definer functions
-- that return counts, tracking numbers and office names only (no remarks, no person names, no attachments).

-- a. HRMO reads the satisfaction answers of every office (additive policy) ---------------------------------------
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rms_satisfaction' and policyname = 'rms_satisfaction_select_hrmo') then
    create policy rms_satisfaction_select_hrmo on public.rms_satisfaction for select to authenticated
      using ((select public.rms_is_hrmo_css()));
  end if;
end $$;

-- b. Which offices sent their monthly satisfaction summary ------------------------------------------------------------
create or replace function public.rms_css_status(p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.rms_my_role() in ('admin', 'records_officer') or public.rms_is_hrmo_css()) then
    raise exception 'not allowed';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('office_id', g.office_id, 'record_id', g.id, 'tracking_no', g.tracking_no, 'sent_at', g.created_at)
                     order by g.office_id)
      from (
        select distinct on (r.origin_office_id) r.origin_office_id as office_id, r.id, r.tracking_no, r.created_at
          from public.rms_records r
         where r.direction = 'outgoing' and r.deleted_at is null and r.category = 'CSS summary'
           and ('css-' || to_char(p_month, 'YYYY-MM')) = any (r.keywords)
         order by r.origin_office_id, r.created_at
      ) g
  ), '[]'::jsonb);
end $$;
revoke execute on function public.rms_css_status(date) from public, anon;
grant execute on function public.rms_css_status(date) to authenticated;

-- c. City overview (open, late, waiting per office) ---------------------------------------------------------------------
create or replace function public.rms_oversight_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_today date := public.rms_today();
begin
  if not (public.rms_is_oversight() or public.rms_my_role() = 'records_officer') then
    raise exception 'not allowed';
  end if;
  return (
    with o as (
      select r.id, r.tracking_no, r.subject, r.confidentiality, r.status, r.due_date,
             r.current_office_id, c.code as office_code, c.name as office_name
        from public.rms_records r
        join public.rms_offices c on c.id = r.current_office_id
       where r.deleted_at is null and r.status not in ('completed', 'released', 'archived')
    )
    select jsonb_build_object(
      'totals', jsonb_build_object(
        'open', (select count(*) from o),
        'late', (select count(*) from o where due_date < v_today),
        'due_soon', (select count(*) from o where due_date >= v_today and due_date <= v_today + 3),
        'waiting', (select count(*) from o where status = 'forwarded')),
      'offices', coalesce((
        select jsonb_agg(jsonb_build_object('code', f.code, 'name', f.name, 'open', f.n_open, 'late', f.n_late, 'waiting', f.n_wait)
                         order by f.code)
          from (
            select x.code, x.name,
                   count(o.id) as n_open,
                   count(o.id) filter (where o.due_date < v_today) as n_late,
                   count(o.id) filter (where o.status = 'forwarded') as n_wait
              from public.rms_offices x
              left join o on o.current_office_id = x.id
             where x.is_active
             group by x.code, x.name
          ) f), '[]'::jsonb),
      'late', coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'tracking_no', l.tracking_no, 'office_code', l.office_code,
                                            'office', l.office_name, 'due_date', l.due_date, 'status', l.status,
                                            'confidential', l.confidentiality = 'confidential',
                                            'subject', case when l.confidentiality = 'confidential' then null else l.subject end)
                         order by l.due_date, l.tracking_no)
          from (select * from o where due_date < v_today order by due_date, tracking_no limit 50) l), '[]'::jsonb)
    )
  );
end $$;
revoke execute on function public.rms_oversight_overview() from public, anon;
grant execute on function public.rms_oversight_overview() to authenticated;

-- d. City record list -----------------------------------------------------------------------------------------------------
create or replace function public.rms_oversight_records(
  p_q text default null,
  p_office_code text default null,
  p_late boolean default false,
  p_limit int default 50
)
returns table (
  id uuid, tracking_no text, subject text, confidential boolean, status public.rms_status,
  office_code text, office text, origin_code text, due_date date, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.rms_is_oversight() or public.rms_my_role() = 'records_officer') then
    raise exception 'not allowed';
  end if;
  return query
    select r.id, r.tracking_no,
           case when r.confidentiality = 'confidential' then null else r.subject end,
           r.confidentiality = 'confidential', r.status,
           c.code, c.name, oo.code, r.due_date, r.created_at
      from public.rms_records r
      join public.rms_offices c on c.id = r.current_office_id
      join public.rms_offices oo on oo.id = r.origin_office_id
     where r.deleted_at is null
       and (nullif(btrim(p_office_code), '') is null or c.code = upper(btrim(p_office_code)))
       and (not coalesce(p_late, false)
            or (r.due_date < public.rms_today() and r.status not in ('completed', 'released', 'archived')))
       and (nullif(btrim(p_q), '') is null
            or (r.confidentiality <> 'confidential'
                and (r.tracking_no ilike btrim(p_q) || '%'
                     or r.subject ilike '%' || btrim(p_q) || '%'
                     or lower(r.reference_no) like lower(btrim(p_q)) || '%')))
     order by r.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;
revoke execute on function public.rms_oversight_records(text, text, boolean, int) from public, anon;
grant execute on function public.rms_oversight_records(text, text, boolean, int) to authenticated;

-- e. One record, read only (no remarks, no person names, no attachments) --------------------------------------------
create or replace function public.rms_oversight_record(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_conf boolean;
  v_email text;
begin
  if not (public.rms_is_oversight() or public.rms_my_role() = 'records_officer') then
    raise exception 'not allowed';
  end if;
  select x.*, dt.name as doc_type, co.name as current_name, co.code as current_code, oo.name as origin_name,
         sv.title as service_title
    into r
    from public.rms_records x
    join public.rms_document_types dt on dt.id = x.document_type_id
    join public.rms_offices co on co.id = x.current_office_id
    join public.rms_offices oo on oo.id = x.origin_office_id
    left join public.rms_services sv on sv.id = x.service_id
   where x.id = p_id and x.deleted_at is null;
  if not found then
    return null;
  end if;
  v_conf := r.confidentiality = 'confidential';
  select email into v_email from auth.users where id = auth.uid();
  insert into public.rms_access_log (event, user_id, email, record_id, attachment_id, ip, user_agent, detail)
  values ('view_record', auth.uid(), v_email, p_id, null, public.rms_client_ip(),
          public.rms_request_header('x-rms-user-agent'), '{"scope":"city"}'::jsonb);
  return jsonb_build_object(
    'tracking_no', r.tracking_no,
    'direction', r.direction,
    'subject', case when v_conf then null else r.subject end,
    'confidential', v_conf,
    'document_type', r.doc_type,
    'status', r.status,
    'transaction_type', r.transaction_type,
    'arta_class', r.arta_class,
    'due_date', r.due_date,
    'created_at', r.created_at,
    'origin_office', r.origin_name,
    'current_office', r.current_name,
    'current_office_code', r.current_code,
    'intake_window', coalesce(r.intake_window, false),
    'service_title', r.service_title,
    'service_steps', (
      select jsonb_agg((e.v - 'done_by' - 'route_id') order by e.ord)
        from jsonb_array_elements(r.service_steps) with ordinality as e(v, ord)),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status', h.status, 'from_code', fo.code, 'to_code', tt.code, 'created_at', h.created_at,
               'action_taken', case when v_conf then null else h.action_taken end)
             order by h.created_at)
        from public.rms_routes h
        left join public.rms_offices fo on fo.id = h.from_office_id
        left join public.rms_offices tt on tt.id = h.to_office_id
       where h.record_id = p_id), '[]'::jsonb)
  );
end $$;
revoke execute on function public.rms_oversight_record(uuid) from public, anon;
grant execute on function public.rms_oversight_record(uuid) to authenticated;

notify pgrst, 'reload schema';
