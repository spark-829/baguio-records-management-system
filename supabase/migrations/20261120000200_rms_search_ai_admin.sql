-- Baguio RMS: document text, AI summary, search RPC, admin user creation, event logging

alter table public.rms_records add column if not exists content_text text;
alter table public.rms_records add column if not exists ai_summary text;

create or replace function public.rms_records_set_search()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.search :=
    setweight(to_tsvector('simple', coalesce(new.tracking_no, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.subject, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(new.keywords, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '') || ' ' || coalesce(new.ai_summary, '')), 'C') ||
    setweight(to_tsvector('simple', concat_ws(' ', new.sender_name, new.sender_org, new.recipient_name, new.recipient_org)), 'B') ||
    setweight(to_tsvector('english', left(coalesce(new.content_text, ''), 200000)), 'D');
  new.updated_at := now();
  return new;
end $$;

-- Search runs as the caller (security invoker) so row-level security still applies.
create or replace function public.rms_search_records(
  p_q text default null,
  p_person text default null,
  p_direction public.rms_direction default null,
  p_status public.rms_status default null,
  p_office_code text default null,
  p_doc_type text default null,
  p_from date default null,
  p_to date default null,
  p_overdue boolean default false,
  p_limit int default 50
)
returns table (
  id uuid, tracking_no text, direction public.rms_direction, subject text, status public.rms_status,
  priority public.rms_priority, confidentiality public.rms_confidentiality, document_type text,
  current_office text, origin_office text, sender text, recipient text, created_by_name text,
  created_at timestamptz, due_date date, ai_summary text, rank real
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(trim(p_q), '') is null then null
           else websearch_to_tsquery('english', p_q) || websearch_to_tsquery('simple', p_q) end as tsq
  )
  select r.id, r.tracking_no, r.direction, r.subject, r.status, r.priority, r.confidentiality,
         dt.name, co.code, oo.code,
         concat_ws(', ', r.sender_name, r.sender_org), concat_ws(', ', r.recipient_name, r.recipient_org),
         p.full_name, r.created_at, r.due_date, r.ai_summary,
         case when q.tsq is null then 0 else ts_rank(r.search, q.tsq) end::real
  from public.rms_records r
  cross join q
  join public.rms_document_types dt on dt.id = r.document_type_id
  join public.rms_offices co on co.id = r.current_office_id
  join public.rms_offices oo on oo.id = r.origin_office_id
  left join public.rms_profiles p on p.id = r.created_by
  where (q.tsq is null or r.search @@ q.tsq or r.subject ilike '%' || p_q || '%' or r.tracking_no ilike p_q || '%')
    and (p_person is null or concat_ws(' ', r.sender_name, r.sender_org, r.recipient_name, r.recipient_org, p.full_name) ilike '%' || p_person || '%'
         or exists (select 1 from public.rms_routes rt join public.rms_profiles ap on ap.id = rt.acted_by
                    where rt.record_id = r.id and ap.full_name ilike '%' || p_person || '%'))
    and (p_direction is null or r.direction = p_direction)
    and (p_status is null or r.status = p_status)
    and (p_office_code is null or co.code = upper(p_office_code) or oo.code = upper(p_office_code))
    and (p_doc_type is null or dt.name ilike '%' || p_doc_type || '%')
    and (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at < p_to + 1)
    and (not p_overdue or (r.due_date < current_date and r.status not in ('completed', 'released', 'archived')))
  order by 17 desc, r.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke execute on function public.rms_search_records from public, anon;
grant execute on function public.rms_search_records to authenticated;

-- App-level events (AI suggestions, exports) go to the audit log through this function only.
create or replace function public.rms_log_event(p_table text, p_row_id text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.rms_my_role() is null then
    raise exception 'not an RMS user';
  end if;
  insert into public.rms_audit_log (table_name, row_id, action, new_data, actor_id)
  values (left(p_table, 60), left(p_row_id, 100), 'INSERT', p_data, auth.uid());
end $$;
revoke execute on function public.rms_log_event from public, anon;
grant execute on function public.rms_log_event to authenticated;

-- Admins create accounts without exposing a service key to the app.
create or replace function public.rms_admin_create_user(
  p_email text, p_password text, p_full_name text, p_role public.rms_role, p_office_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if public.rms_my_role() is distinct from 'admin' then
    raise exception 'only admins can create users';
  end if;
  if length(p_password) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;
  if exists (select 1 from auth.users where email = lower(p_email)) then
    raise exception 'email already registered';
  end if;
  v_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),
          extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"],"app":"rms"}', jsonb_build_object('full_name', p_full_name),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true),
          'email', now(), now(), now());
  insert into public.rms_profiles (id, full_name, role, office_id) values (v_id, p_full_name, p_role, p_office_id);
  return v_id;
end $$;
revoke execute on function public.rms_admin_create_user from public, anon;
grant execute on function public.rms_admin_create_user to authenticated;
