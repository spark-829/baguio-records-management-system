-- Baguio RMS: legacy import (paper logbook migration) and owner-only demo data generators.
-- Run after 20261123000200. Safe to run again. Nothing here drops or deletes data.
--
-- Legacy import: a city hall that moves from paper logbooks needs to load old records with their real
-- dates, status and location. rms_legacy_import() is true only for the database owner (SQL editor / MCP)
-- after it sets rms.import = 'on'. API users can never meet it. Every record, route and audit row is still
-- written through the normal triggers, so the audit chain stays valid.

-- ============================================================================================
-- a. The import switch
-- ============================================================================================
-- session_user is the login role. API requests log in as "authenticator", and the "role" setting stays
-- "authenticated" even inside SECURITY DEFINER code, so API users can never meet this, even if they
-- managed to set the flag.
create or replace function public.rms_legacy_import()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('rms.import', true), '') = 'on'
     and session_user::text in ('postgres', 'supabase_admin')
     and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
$$;
-- rms_records_set_search runs as the caller, so app inserts need EXECUTE. It always returns false for them.
revoke execute on function public.rms_legacy_import() from public, anon;
grant execute on function public.rms_legacy_import() to authenticated, service_role;

-- ============================================================================================
-- b. Tracking number: import keeps the record's own year, status and office
-- ============================================================================================
create or replace function public.rms_records_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_year int;
  v_next int;
begin
  if public.rms_legacy_import() then
    v_year := extract(year from (coalesce(new.created_at, now()) at time zone 'Asia/Manila'));
  else
    v_year := extract(year from (now() at time zone 'Asia/Manila'));
  end if;

  insert into public.rms_counters (direction, year, last_value)
  values (new.direction, v_year, 1)
  on conflict (direction, year) do update set last_value = public.rms_counters.last_value + 1
  returning last_value into v_next;

  -- lpad cuts longer text, so 10000 would have become 1000 and collided: never go below the real length.
  new.tracking_no := (case new.direction when 'incoming' then 'IN' else 'OUT' end)
                     || '-' || v_year || '-' || lpad(v_next::text, greatest(4, length(v_next::text)), '0');
  if public.rms_legacy_import() then
    new.status := coalesce(new.status, 'registered');
  else
    new.status := 'registered';
  end if;
  new.current_office_id := coalesce(new.current_office_id, new.origin_office_id);
  return new;
end $$;

-- ============================================================================================
-- c. Search vector (copy of 20261120000200) + keep updated_at in import mode
-- ============================================================================================
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
  if not public.rms_legacy_import() then
    new.updated_at := now();
  end if;
  return new;
end $$;

-- ============================================================================================
-- d. A route row moves the record (copy of the schema version); import rows already hold the final state
-- ============================================================================================
create or replace function public.rms_routes_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'registered' or public.rms_legacy_import() then
    return new;
  end if;
  update public.rms_records
     set status = new.status,
         current_office_id = coalesce(new.to_office_id, current_office_id)
   where id = new.record_id;
  return new;
end $$;

-- ============================================================================================
-- e. Tag table for seeded records
-- ============================================================================================
-- Deliberately no audit trigger: this table is a server-only tag, each tagged record's INSERT is already
-- audited, and an audit trigger would add about 20% to the audit rows. Seeded access-log rows are tagged
-- with detail = {"seed": <batch>}.
create table if not exists public.rms_seed_records (
  record_id uuid primary key references public.rms_records (id) on delete cascade,
  batch text not null,
  seeded_at timestamptz not null default now()
);
create index if not exists rms_seed_records_batch_idx on public.rms_seed_records (batch);
alter table public.rms_seed_records enable row level security;   -- no policies
revoke all on public.rms_seed_records from public, anon, authenticated, service_role;

-- ============================================================================================
-- Helper functions for the generators (owner-only, see the revoke at the end)
-- ============================================================================================
-- Weekends, Philippine holidays and Baguio Charter Day (09-01), plus Holy Thursday and Good Friday.
create or replace function public.rms_seed_off_day(p_day date)
returns boolean language sql immutable set search_path = '' as $$
  select extract(isodow from p_day) >= 6
      or to_char(p_day, 'MM-DD') in ('01-01', '02-25', '04-09', '05-01', '06-12', '08-21', '09-01',
                                     '11-01', '11-30', '12-08', '12-25', '12-30', '12-31')
      or p_day in (date '2025-04-17', date '2025-04-18', date '2026-04-02', date '2026-04-03')
$$;

-- Moves a moment into office hours (08:00-17:30 Manila, working days only).
create or replace function public.rms_seed_office_hours(p_ts timestamptz)
returns timestamptz language plpgsql volatile set search_path = '' as $$
declare
  v_l timestamp := p_ts at time zone 'Asia/Manila';
begin
  if v_l::time < time '08:00' then
    v_l := v_l::date::timestamp + interval '8 hours' + random() * interval '90 minutes';
  elsif v_l::time > time '17:30' then
    v_l := (v_l::date + 1)::timestamp + interval '8 hours' + random() * interval '90 minutes';
  end if;
  while public.rms_seed_off_day(v_l::date) loop
    v_l := (v_l::date + 1)::timestamp + interval '8 hours' + random() * interval '90 minutes';
  end loop;
  return v_l at time zone 'Asia/Manila';
end $$;

-- Weighted pick: items and weights line up by position.
create or replace function public.rms_seed_pick(p_items text[], p_weights int[])
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_r double precision;
  v_acc int := 0;
  v_i int;
begin
  v_r := random() * (select sum(t.w) from unnest(p_weights) as t(w));
  for v_i in 1 .. array_length(p_items, 1) loop
    v_acc := v_acc + p_weights[v_i];
    if v_r < v_acc then
      return p_items[v_i];
    end if;
  end loop;
  return p_items[array_length(p_items, 1)];
end $$;

create or replace function public.rms_seed_choice(p_items text[])
returns text language sql volatile set search_path = '' as $$
  select p_items[1 + floor(random() * cardinality(p_items))::int]
$$;

create or replace function public.rms_seed_jpick(p_items jsonb)
returns text language sql volatile set search_path = '' as $$
  select p_items ->> (floor(random() * jsonb_array_length(p_items))::int)
$$;

-- A random actor from {office code: [profile ids]}, or the fallback when the office has none.
create or replace function public.rms_seed_actor(p_actors jsonb, p_code text, p_fallback uuid)
returns uuid language sql volatile set search_path = '' as $$
  select coalesce(
    (select ((p_actors -> p_code) ->> (floor(random() * jsonb_array_length(p_actors -> p_code))::int))::uuid
      where jsonb_typeof(p_actors -> p_code) = 'array'),
    p_fallback)
$$;

-- Appends one step to a plan: kind, target office code (forward only), delay in hours.
create or replace function public.rms_seed_step(p_plan jsonb, p_k text, p_to text, p_h double precision)
returns jsonb language sql immutable set search_path = '' as $$
  select p_plan || jsonb_build_array(jsonb_build_object('k', p_k, 'to', p_to, 'h', p_h))
$$;

create or replace function public.rms_seed_fill(
  p_text text, p_barangay text, p_street text, p_office text, p_item text, p_month text, p_event text, p_amount text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(replace(replace(p_text,
    '{barangay}', p_barangay), '{street}', p_street), '{office}', p_office), '{item}', p_item),
    '{month}', p_month), '{event}', p_event), '{amount}', p_amount)
$$;

-- ============================================================================================
-- f. Records, routes and audit rows for a date window
-- ============================================================================================
-- Run as the database owner. Call once per month, in date order. Every row goes through the normal
-- triggers (audit chain, search vector, tracking numbers). Fictional names only.
create or replace function public.rms_seed_demo(
  p_from date,
  p_to date,
  p_batch text default 'volume-2026-11',
  p_per_workday numeric default 11,
  p_actor uuid default null)
returns integer language plpgsql volatile security invoker set search_path = '' as $fn$
declare
  v_all constant text[] := array['CMO', 'CAO', 'CEO', 'CTO', 'CBO', 'HRMO', 'CLO', 'CPDO'];
  v_first constant text[] := array['Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Luz', 'Ramon', 'Elena', 'Carlos', 'Rosario',
    'Dominic', 'Grace', 'Benedict', 'Marites', 'Rodel', 'Joy', 'Eduardo', 'Cecilia', 'Noel', 'Jenny',
    'Ferdinand', 'Lorna', 'Alfredo', 'Mylene', 'Rommel', 'Imelda', 'Joel', 'Teresita', 'Arnel', 'Corazon',
    'Ambrosio', 'Liza', 'Mario', 'Dolores', 'Bernard', 'Sheila', 'Gilbert', 'Norma', 'Rey', 'Cherry'];
  v_surnames constant text[] := array['Bagni', 'Dulnuan', 'Tinda', 'Pacio', 'Lumbaya', 'Daoey', 'Pucay', 'Saguid', 'Bayangan', 'Galiwan',
    'Calpito', 'Wacnang', 'Cosalan', 'Sagpaey', 'Ticag', 'Longid', 'Palaganas', 'Dumlao', 'Cariaso', 'Santos',
    'Reyes', 'Cruz', 'Garcia', 'Mendoza', 'Ramos', 'Dizon', 'Bautista', 'Villanueva', 'Aquino', 'Castro',
    'Flores', 'Navarro', 'Domingo', 'Soriano', 'Valdez', 'Pascual', 'Manalo', 'Tolentino', 'Aguilar', 'Balao-as'];
  v_streets constant text[] := array['Session Rd', 'Harrison Rd', 'Magsaysay Ave', 'Kennon Rd', 'Marcos Hwy', 'Naguilian Rd',
    'Leonard Wood Rd', 'Loakan Rd', 'Abanao St', 'Gen. Luna Rd', 'Legarda Rd', 'Bokawkan Rd'];
  -- Public works and services (complaints, requests, letters, legislation) vs goods and services bought (DV, PR).
  v_items constant text[] := array['drainage canal', 'street lights', 'road surface', 'garbage collection', 'water supply',
    'public market stalls', 'tree cutting', 'traffic signage', 'school building', 'sidewalk', 'footbridge',
    'waiting shed', 'barangay health station', 'riprap wall', 'stray dog control'];
  v_goods constant text[] := array['office supplies', 'laptop computers', 'janitorial services', 'fuel and lubricants',
    'construction materials', 'employee uniforms', 'health center medicines', 'printer toner', 'catering services',
    'sound system rental', 'vehicle repair', 'drainage pipes'];
  v_events constant text[] := array['Panagbenga Festival', 'Baguio Day celebration', 'Adivay Festival', 'Flower Festival grand parade',
    'Charter Day celebration', 'clean-up drive', 'tree planting day', 'Fire Prevention Month program',
    'disaster preparedness drill', 'job fair'];
  v_positions constant text[] := array['President', 'Chairperson', 'Secretary', 'Regional Director', 'Principal',
    'General Manager', 'Officer-in-Charge'];
  v_encl constant text[] := array['barangay certification', 'photographs of the site', 'sketch plan', 'signed petition',
    'copy of the earlier request', 'price quotations', 'delivery receipt', 'copy of the permit', 'letter of authority'];
  v_orgs constant jsonb := '[
    "Barangay {barangay} Council", "Barangay {barangay} Peace and Order Committee",
    "DepEd Schools Division Office, Baguio City", "DENR Cordillera Regional Office",
    "DILG Cordillera Regional Office", "DPWH Cordillera Administrative Region",
    "Department of Tourism Regional Office", "Baguio Central School Parents-Teachers Association",
    "Session Road Merchants Association", "Burnham Park Vendors Association",
    "Irisan Jeepney Operators Cooperative", "Loakan Homeowners Association",
    "Baguio Business and Professionals Club", "Cordillera Youth Development Council",
    "Mines View Residents Association"]';
  -- Subject templates per type: five English, then two Filipino.
  v_subj constant jsonb := '{
    "Letter": [
      "Request for assistance on {item} in Barangay {barangay}",
      "Inquiry on the status of the {item} project along {street}",
      "Invitation to the {event}",
      "Request for a meeting with the City Mayor regarding {item}",
      "Letter of appreciation for the {event}",
      "Hiling na tulong para sa {item} sa Barangay {barangay}",
      "Pasasalamat sa pagdalo sa {event}"],
    "Letter out": [
      "Reply to the request of Barangay {barangay} on {item}",
      "Response to the complaint on {item} along {street}",
      "Notice of inspection of {item} along {street}",
      "Transmittal of approved documents on {item}",
      "Invitation to the {event}",
      "Sagot sa kahilingan ng Barangay {barangay} tungkol sa {item}",
      "Abiso ng inspeksyon ng {item} sa {street}"],
    "Request / Complaint": [
      "Complaint about clogged {item} along {street}",
      "Request for repair of {item} in Barangay {barangay}",
      "Complaint on uncollected garbage at {street}",
      "Request for clearance to hold the {event}",
      "Request for certified true copy of documents on {item}",
      "Reklamo sa ingay ng videoke sa Barangay {barangay}",
      "Hiling na ayusin ang {item} sa {street}"],
    "Endorsement": [
      "Endorsement of the {item} request of Barangay {barangay}",
      "Endorsement for approval: {item} for {office}",
      "Endorsement of the {event} proposal for {month}",
      "Endorsement of application for {item} along {street}",
      "Endorsement of residents petition on {item} in Barangay {barangay}",
      "Pag-endorso ng kahilingan para sa {item} sa Barangay {barangay}",
      "Pag-endorso ng petisyon ng mga residente sa {street}"],
    "Disbursement Voucher": [
      "Disbursement voucher for payment of {item}, {month}",
      "Payment of {item} for {office}",
      "Reimbursement of expenses for the {event}",
      "Payment of progress billing for {item} along {street}",
      "Cash advance for the {event}",
      "Bayad para sa {item} ng {office}",
      "Reimbursement ng gastos para sa {event}"],
    "Purchase Request": [
      "Purchase request for {item} for {office}",
      "Purchase request for {item}, {month} requirement",
      "Procurement of {item} for the {event}",
      "Purchase request for supplies for the {item} project",
      "Replenishment of {item} for {office}",
      "Pagbili ng {item} para sa {office}",
      "Kahilingan sa pagbili ng {item} para sa {event}"],
    "Resolution": [
      "Resolution requesting funds for {item} in Barangay {barangay}",
      "Resolution authorizing the City Mayor to enter into a contract for {item}",
      "Resolution commending the organizers of the {event}",
      "Resolution declaring support for the {event}",
      "Resolution on the regulation of {item} along {street}",
      "Resolusyon na humihiling ng pondo para sa {item} sa Barangay {barangay}",
      "Resolusyon na nagpapasalamat sa mga nag-organisa ng {event}"],
    "Ordinance": [
      "Ordinance regulating {item} along {street}",
      "Ordinance appropriating funds for {item}",
      "Ordinance amending the schedule of fees for {item}",
      "Ordinance establishing a policy on {item} in Barangay {barangay}",
      "Ordinance on the observance of the {event}",
      "Ordinansa na nagtatakda ng patakaran sa {item} sa Barangay {barangay}",
      "Ordinansa sa paggamit ng pondo para sa {item}"],
    "Memorandum": [
      "Memorandum on preparations for the {event}",
      "Memorandum on submission of reports for {month}",
      "Memorandum on the use of {item} in {office}",
      "Reminder on office hours and attendance during the {event}",
      "Memorandum on the inspection of {item} along {street}",
      "Paalala hinggil sa pagsumite ng ulat para sa {month}",
      "Memorandum tungkol sa paghahanda para sa {event}"],
    "Executive Order": [
      "Executive Order creating a task force for the {event}",
      "Executive Order on the regulation of {item} along {street}",
      "Executive Order designating officers for the {event}",
      "Executive Order on the implementation of {item} in all barangays",
      "Executive Order adjusting working hours for {month}",
      "Kautusang Tagapagpaganap sa pagbuo ng task force para sa {event}",
      "Kautusang Tagapagpaganap sa pagsasaayos ng {item}"]}';
  -- Body paragraphs per family: six English (0-5), then three Filipino (6-8).
  v_bodies constant jsonb := '{
    "cr": [
      "We respectfully write to bring to your attention the condition of the {item} along {street} in Barangay {barangay}. The problem has persisted for several weeks and is causing inconvenience and risk to residents and passersby, especially during the rainy season.",
      "The undersigned is a resident of Barangay {barangay} and wishes to formally request the assistance of your office regarding the {item}. Despite earlier verbal reports to the barangay, no action has been taken, and the matter now affects many households in the area.",
      "We are requesting an on-site inspection of the affected area near {street} at the earliest possible date. Attached are photographs and a signed list of residents who support this request, which we trust will help your office assess the urgency of the situation.",
      "This complaint is filed in accordance with the citizens charter of the City Government. We ask that the concerned personnel of {office} be directed to investigate, take the necessary measures, and inform us of the action taken within the prescribed period.",
      "The condition has worsened since {month}, and residents have raised the concern during the last barangay assembly. We believe that a prompt response from the City Government will prevent further damage to property and protect the safety of the community.",
      "We also request that a copy of the findings and the planned schedule of work be furnished to the barangay council so that residents may be properly informed and may cooperate with the concerned offices while the work is ongoing.",
      "Magalang po naming ipinararating sa inyong tanggapan ang suliranin sa {item} sa {street}, Barangay {barangay}. Ilang linggo na po itong problema at nagdudulot ng abala at panganib sa mga residente, lalo na kapag tag-ulan.",
      "Hinihiling po namin ang agarang pagsisiyasat ng {office} sa nasabing lugar. Kalakip po ang mga larawan at lagda ng mga residenteng sumusuporta sa kahilingang ito upang makita ang bigat ng sitwasyon.",
      "Umaasa po kami sa mabilis at kaukulang aksyon ng pamahalaang lungsod. Maaari po ninyo kaming kontakin sa pamamagitan ng barangay hall para sa anumang karagdagang impormasyon. Maraming salamat po."],
    "le": [
      "I am writing on behalf of our organization to formally communicate our request regarding the {item} in Barangay {barangay}. We have coordinated with the concerned offices and believe that the support of the City Government is essential for its success.",
      "In connection with the {event} scheduled this {month}, we respectfully seek the cooperation of your office in the form of technical assistance, security personnel, and the use of facilities along {street}.",
      "This endorsement is made after due evaluation of the supporting documents submitted by the proponent. The undersigned finds the request consistent with existing city policies and recommends its favorable consideration by {office}.",
      "Attached for your reference are the complete requirements, including the application form, the barangay certification, and the sketch plan of the proposed activity. Please let us know if additional documents are needed.",
      "We assure your office that all conditions and guidelines set by the City Government will be strictly observed, and that the organizers will take full responsibility for the orderly conduct of the activity.",
      "Your favorable action on this matter will be of great help to the community. We would appreciate a written reply or notice of the decision at your earliest convenience so that preparations may proceed on schedule.",
      "Magalang po naming isinusulat ang liham na ito upang hilingin ang tulong ng inyong tanggapan hinggil sa {item} sa Barangay {barangay}. Naniniwala po kaming makatutulong ito nang malaki sa ating mga kababayan.",
      "Kaugnay po ng {event} ngayong {month}, hinihiling namin ang pakikipagtulungan ng {office} sa paghahanda at pagbabantay sa lugar sa {street}. Handa po kaming sumunod sa lahat ng patakaran ng pamahalaang lungsod.",
      "Kalakip po ng liham na ito ang mga kinakailangang dokumento. Nais po naming malaman ang inyong magiging desisyon sa lalong madaling panahon. Maraming salamat po sa inyong atensyon."],
    "fin": [
      "This voucher covers payment for {item} in the amount of {amount}, chargeable against the appropriation of {office} for the current fiscal year. The supporting documents are attached for pre-audit and for the certification of the concerned offices.",
      "The undersigned certifies that the expenses are necessary and lawful, that the supplies have been delivered and inspected, and that the amount claimed is correct. The corresponding certificate of availability of funds is attached.",
      "We request that this purchase request for {item}, with an estimated cost of {amount}, be processed through the appropriate mode of procurement. The items are needed by {office} to ensure the continuity of services for {month}.",
      "Attached are the technical specifications, the approved purchase request, the delivery receipt, and the inspection and acceptance report. Please note that the claim is within the approved budget ceiling of the office.",
      "The request is based on the approved annual procurement plan of the office. Quotations from at least three suppliers have been obtained and the lowest responsive quotation was selected after canvass.",
      "Kindly route this document to the Budget Office and the City Treasurer for certification and payment. Any deficiency in the supporting papers will be corrected immediately upon notice from the concerned office.",
      "Ang voucher na ito ay para sa bayad sa {item} na nagkakahalaga ng {amount}, na sisingilin sa pondo ng {office} para sa kasalukuyang taon. Kalakip po ang mga kinakailangang dokumento para sa pre-audit.",
      "Pinatutunayan po namin na kinakailangan at tama ang halagang sinisingil at natanggap na ang mga gamit. Nakalakip din ang sertipikasyon ng pondo mula sa tanggapang may kinalaman.",
      "Hinihiling po namin ang agarang pagproseso ng kahilingang ito upang hindi maantala ang serbisyo ng {office} ngayong {month}. Maraming salamat po."],
    "leg": [
      "WHEREAS, the City Government of Baguio recognizes the need to address the concerns relating to {item} in the interest of public welfare, order, and the sustainable development of the city and its communities;",
      "WHEREAS, the matter was thoroughly discussed in a public consultation with the barangay officials of {barangay} and other stakeholders, who expressed their support for the proposed measure;",
      "NOW, THEREFORE, be it resolved, as it is hereby resolved, that the City Government shall implement the measures set forth herein, particularly those concerning {street} and the surrounding areas;",
      "The concerned city offices, led by {office}, are hereby directed to prepare the implementing guidelines, to coordinate with the barangays, and to submit a progress report within thirty days from the effectivity of this issuance.",
      "The amount of {amount} shall be charged against the appropriate funds of the City Government, subject to the usual accounting and auditing rules and regulations.",
      "This issuance shall take effect immediately upon approval and shall be posted in at least three conspicuous places in the city, and furnished to all offices concerned for their guidance and compliance.",
      "SAPAGKAT, kinikilala ng Pamahalaang Lungsod ng Baguio ang pangangailangang tugunan ang mga usapin hinggil sa {item} para sa kapakanan ng mamamayan at ng mga komunidad sa lungsod;",
      "NAKASAAD DITO na ang {office} ang mangunguna sa paghahanda ng mga alituntunin at makikipag-ugnayan sa mga barangay, kabilang ang Barangay {barangay}, para sa maayos na pagpapatupad nito;",
      "Ang kautusang ito ay magkakabisa agad sa araw ng pag-apruba at ilalathala sa mga pangunahing lugar sa lungsod upang malaman ng lahat ng may kinalaman."],
    "memo": [
      "This is to inform all concerned that the City Government will hold the {event} this {month}. All offices are enjoined to extend full support and to designate focal persons who will coordinate with {office}.",
      "In view of the foregoing, all heads of offices are directed to submit the required reports, together with the supporting documents, not later than the deadline stated herein. Late submissions will not be accepted.",
      "Please be reminded that the use of {item} must follow the existing guidelines of the City Government. Any violation will be subject to the appropriate administrative action under civil service rules.",
      "For proper coordination, offices are requested to send their representatives to a meeting at the Mayor Office conference room. Attendance of the designated representatives is required.",
      "Heads of offices are advised to relay this memorandum to all personnel under their supervision and to ensure strict compliance. Inquiries may be directed to {office} during regular office hours.",
      "This memorandum supersedes all previous issuances inconsistent herewith and shall remain in force until revoked or modified by a subsequent order from the City Mayor.",
      "Ipinababatid po sa lahat ng kinauukulan na idaraos ng pamahalaang lungsod ang {event} ngayong {month}. Hinihiling ang buong suporta ng lahat ng tanggapan at ang pagtatalaga ng kinatawan na makikipag-ugnayan sa {office}.",
      "Kaugnay nito, inaatasan ang lahat ng pinuno ng tanggapan na isumite ang mga kinakailangang ulat bago ang itinakdang petsa. Hindi na tatanggapin ang mga ulat na lalampas sa itinakdang araw.",
      "Pinaaalalahanan ang lahat na sundin ang mga patakaran sa paggamit ng {item}. Ang sinumang lalabag ay mapapatawan ng kaukulang parusang administratibo. Para sa mga katanungan, makipag-ugnayan sa {office}."]}';
  -- Closing paragraph shared by all families: four English (0-3), then two Filipino (4-5).
  v_tail constant jsonb := '[
    "We trust that this matter will receive your immediate and favorable attention. Should you need more information, please contact the undersigned through the Office of the City Mayor, or send a reply through the Records Section at City Hall, Baguio City.",
    "Kindly acknowledge receipt of this document and advise us of the action taken. For urgent concerns, the undersigned may be reached during office hours, Monday to Friday, at the contact details on file with the Records Section.",
    "This document is submitted in good faith and for the purposes stated above. The undersigned is ready to provide any additional clarification, documents, or personal appearance that your office may require.",
    "Thank you very much for your kind attention and for the continued service of the City Government to the people of Baguio. We look forward to your favorable response.",
    "Umaasa po kami sa inyong agarang at positibong tugon. Kung may nais pong linawin, maaari po ninyo kaming makausap sa mga oras ng opisina. Maraming salamat po sa inyong oras at atensyon.",
    "Maraming salamat po sa inyong pang-unawa at patuloy na serbisyo sa mamamayan ng Baguio. Hinihintay po namin ang inyong tugon, at handa po kaming magbigay ng karagdagang dokumento kung kinakailangan."]';
  -- Step remarks, eight per step kind. {office} is the office the record moves to.
  v_rems constant jsonb := '{
    "forward": ["For appropriate action", "Please handle and report back", "Forwarded for your review and comment",
      "For immediate action, thank you", "For evaluation and recommendation", "Kindly prepare the reply for signature",
      "Pakitingnan at aksyunan", "Endorsed to {office} for proper disposition"],
    "receive": ["Received complete with attachments", "Received, will review", "Received in good order",
      "Document received at the office counter", "Received, to be scheduled for processing", "Natanggap na ang dokumento",
      "Received copy for our records", "Received, originals to follow"],
    "act": ["Reviewing the documents", "Site inspection scheduled", "Preparing the reply", "Coordinating with the barangay",
      "Computing the amounts", "Drafting the report", "Sinisimulan na ang pagproseso",
      "Waiting for additional requirements from the sender"],
    "remark": ["Requested additional documents from the sender", "Spoke with the requester by phone",
      "Updated the sender on the status", "Referred to the department head for guidance", "Awaiting budget certification",
      "Attachment checked and complete", "Meeting held with the concerned staff", "Naghihintay ng sagot mula sa kabilang opisina"],
    "complete": ["Reply prepared and signed", "Request granted", "Action completed and documented", "Payment processed",
      "Inspection done, report attached", "Signed by the department head", "Tapos na ang aksyon",
      "Issue resolved, requester informed"],
    "release": ["Signed copy released with the transmittal", "Original released, file copy retained",
      "Acknowledgment receipt attached", "Released to the messenger for delivery", "Received by the addressee office",
      "Delivery confirmed", "Inilabas na ang orihinal na kopya", "Copy furnished to the concerned offices"],
    "archive": ["Filed in the records room", "Archived per retention schedule", "Box and shelf number noted",
      "Filed with related documents", "Moved to the records storage", "Closed and filed", "Nakaarkibo na sa records room",
      "Scanned copy kept, paper filed"]}';

  v_oid jsonb;          -- office code -> id
  v_oname jsonb;        -- office code -> name
  v_types jsonb;        -- document type name -> id
  v_act jsonb;          -- office code -> [profile ids of dept_head / staff]
  v_brgy text[];
  v_officer uuid;
  v_admin uuid;
  v_prev_claims text := current_setting('request.jwt.claims', true);
  v_start timestamptz := p_from::timestamp at time zone 'Asia/Manila';

  v_day date;
  v_n int;
  v_i int;
  v_k int;
  v_secs int[];
  v_count int := 0;
  v_days int := 0;

  v_created timestamptz;
  v_cd date;
  v_fil boolean;
  v_dir text;
  v_type text;
  v_origin text;
  v_main text;          -- action office (incoming) or origin office (outgoing)
  v_other text;         -- another office, for internal senders and recipients
  v_choice text[];
  v_creator uuid;
  v_prio text;
  v_conf text;
  v_mode text;
  v_internal boolean;
  v_brg text;
  v_bt text;
  v_street text;
  v_item text;
  v_event text;
  v_month text;
  v_amount text;
  v_mname text;
  v_pool jsonb;
  v_len int;
  v_idx int;
  v_subject text;
  v_desc text;
  v_cat text;
  v_kw text[];
  v_due date;
  v_sname text;
  v_sorg text;
  v_rname text;
  v_rorg text;
  v_pos text;
  v_addr text;
  v_sal text;
  v_close text;
  v_fam text;
  v_np int;
  v_tl int;
  v_lo int;
  v_mod int;
  v_rnd int;
  v_body text;
  v_content text;

  v_plan jsonb;
  v_trim jsonb;
  v_item_j jsonb;
  v_b text;
  v_kind text;
  v_stuck boolean;
  v_steps jsonb;
  v_t timestamptz;
  v_last timestamptz;
  v_cur text;
  v_to text;
  v_status text;
  v_st text;
  v_by uuid;
  v_text text;
  v_rem text;
  v_id uuid;
begin
  -- Guards ------------------------------------------------------------------------------
  perform set_config('rms.import', 'on', true);
  if not public.rms_legacy_import() then
    raise exception 'run as the database owner (SQL editor / MCP), not through the API';
  end if;
  if p_from is null or p_to is null or p_from < date '2024-12-01' or p_to > public.rms_today() or p_from > p_to then
    raise exception 'dates must satisfy 2024-12-01 <= p_from <= p_to <= today';
  end if;
  if p_per_workday is null or p_per_workday <= 0 or p_batch is null or length(p_batch) = 0 then
    raise exception 'give a positive p_per_workday and a batch name';
  end if;
  if exists (select 1
               from public.rms_seed_records s
               join public.rms_records r on r.id = s.record_id
              where s.batch = p_batch and r.created_at >= v_start) then
    raise exception 'batch % already has records from % or later: run the windows in date order, once each', p_batch, p_from;
  end if;
  if p_actor is not null then
    perform set_config('request.jwt.claims',
                       json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  end if;
  perform setseed((hashtext(p_batch || p_from::text)::bigint % 1000000) / 1000000.0);

  -- Lookups ------------------------------------------------------------------------------
  select jsonb_object_agg(code, id), jsonb_object_agg(code, name)
    into v_oid, v_oname
    from public.rms_offices
   where code = any (v_all);
  if (select count(*) from jsonb_object_keys(coalesce(v_oid, '{}'::jsonb))) <> array_length(v_all, 1) then
    raise exception 'one of the offices CMO, CAO, CEO, CTO, CBO, HRMO, CLO, CPDO is missing';
  end if;

  select jsonb_object_agg(name, id)
    into v_types
    from public.rms_document_types
   where name in ('Letter', 'Memorandum', 'Executive Order', 'Ordinance', 'Resolution', 'Disbursement Voucher',
                  'Purchase Request', 'Endorsement', 'Request / Complaint');
  if (select count(*) from jsonb_object_keys(coalesce(v_types, '{}'::jsonb))) <> 9 then
    raise exception 'one of the nine standard document types is missing';
  end if;

  select id into v_officer from public.rms_profiles where role = 'records_officer' and is_active order by created_at limit 1;
  select id into v_admin from public.rms_profiles where role = 'admin' and is_active order by created_at limit 1;
  v_officer := coalesce(v_officer, v_admin);
  if v_officer is null then
    raise exception 'no active records officer or admin found';
  end if;

  select coalesce(jsonb_object_agg(x.code, x.ids), '{}'::jsonb)
    into v_act
    from (select o.code, jsonb_agg(p.id) as ids
            from public.rms_profiles p
            join public.rms_offices o on o.id = p.office_id
           where p.is_active and p.role in ('dept_head', 'staff')
           group by o.code) x;

  select coalesce(array_agg(name order by name), array[]::text[]) into v_brgy from public.rms_barangays;
  if cardinality(v_brgy) = 0 then
    raise exception 'rms_barangays is empty';
  end if;

  -- Days --------------------------------------------------------------------------------
  for v_day in select g::date from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g loop
    continue when public.rms_seed_off_day(v_day);
    v_days := v_days + 1;
    v_n := round((p_per_workday::float8 * (0.5 + random())
                  * case when extract(isodow from v_day) = 1 then 1.2 else 1.0 end))::int;

    -- arrival times between 08:00 and 16:30 Manila, in order
    select coalesce(array_agg(q.s order by q.s), array[]::int[])
      into v_secs
      from (select 28800 + floor(random() * 30600)::int as s from generate_series(1, v_n)) q;

    for v_i in 1 .. cardinality(v_secs) loop
      v_created := (v_day::timestamp + make_interval(secs => v_secs[v_i])) at time zone 'Asia/Manila';
      continue when v_created > now();
      v_cd := v_day;

      -- Direction, type, offices -----------------------------------------------------------
      v_fil := random() < 0.2;
      v_dir := case when random() < 0.7 then 'incoming' else 'outgoing' end;
      if v_dir = 'incoming' then
        v_type := public.rms_seed_pick(
          array['Letter', 'Request / Complaint', 'Endorsement', 'Disbursement Voucher', 'Purchase Request',
                'Resolution', 'Memorandum', 'Ordinance'],
          array[28, 25, 14, 8, 8, 8, 6, 3]);
        v_origin := 'CMO';
        v_choice := case v_type
          when 'Request / Complaint' then array['CEO', 'CMO', 'CPDO', 'CLO', 'CAO']
          when 'Disbursement Voucher' then array['CTO', 'CBO']
          when 'Purchase Request' then array['CBO', 'CAO']
          when 'Resolution' then array['CLO', 'CMO']
          when 'Ordinance' then array['CLO', 'CMO']
          when 'Endorsement' then array['CMO', 'CEO', 'CPDO', 'HRMO']
          else v_all
        end;
        v_main := public.rms_seed_choice(v_choice);
        v_creator := v_officer;
      else
        v_type := public.rms_seed_pick(
          array['Letter', 'Memorandum', 'Disbursement Voucher', 'Endorsement', 'Executive Order',
                'Purchase Request', 'Resolution'],
          array[35, 25, 10, 10, 8, 7, 5]);
        v_origin := public.rms_seed_choice(v_all);
        v_main := v_origin;
        v_creator := public.rms_seed_actor(v_act, v_origin, v_officer);
      end if;
      v_other := (array_remove(v_all, v_main))[1 + floor(random() * 7)::int];
      v_mname := v_oname ->> v_main;

      v_prio := public.rms_seed_pick(array['low', 'normal', 'urgent'], array[15, 70, 15]);
      if v_main in ('HRMO', 'CLO') then
        v_conf := public.rms_seed_pick(array['public', 'internal', 'confidential'], array[10, 70, 20]);
      else
        v_conf := public.rms_seed_pick(array['public', 'internal', 'confidential'], array[27, 70, 3]);
      end if;

      if v_dir = 'incoming' then
        v_mode := case
          when v_type in ('Disbursement Voucher', 'Purchase Request', 'Memorandum') then 'internal'
          else public.rms_seed_pick(array['walk-in', 'email', 'courier', 'mail', 'internal'], array[40, 30, 10, 10, 10])
        end;
      else
        v_mode := case
          when v_type in ('Disbursement Voucher', 'Purchase Request', 'Memorandum', 'Executive Order') then 'internal'
          else public.rms_seed_pick(array['courier', 'mail', 'email', 'internal'], array[30, 20, 30, 20])
        end;
      end if;
      v_internal := v_mode = 'internal';

      -- Place, text parts ------------------------------------------------------------------
      v_brg := null;
      if (v_dir = 'incoming' and v_type in ('Request / Complaint', 'Letter', 'Resolution', 'Endorsement') and random() < 0.75)
         or (v_dir = 'outgoing' and v_type = 'Letter' and random() < 0.4) then
        v_brg := v_brgy[1 + floor(random() * cardinality(v_brgy))::int];
      end if;
      v_bt := coalesce(v_brg, v_brgy[1 + floor(random() * cardinality(v_brgy))::int]);
      v_street := public.rms_seed_choice(v_streets);
      v_item := public.rms_seed_choice(case when v_type in ('Disbursement Voucher', 'Purchase Request') then v_goods else v_items end);
      v_event := public.rms_seed_choice(v_events);
      v_month := to_char(v_created at time zone 'Asia/Manila', 'FMMonth');
      v_amount := 'PHP ' || to_char(5000 + floor(random() * 495000), 'FM999,999,999');

      v_pool := v_subj -> (case when v_dir = 'outgoing' and v_type = 'Letter' then 'Letter out' else v_type end);
      v_len := jsonb_array_length(v_pool);
      v_idx := case when v_fil then v_len - 2 + floor(random() * 2)::int else floor(random() * (v_len - 2))::int end;
      v_subject := public.rms_seed_fill(v_pool ->> v_idx, v_bt, v_street, v_mname, v_item, v_month, v_event, v_amount);

      -- Sender, recipient, signatory -------------------------------------------------------
      v_sname := public.rms_seed_choice(v_first) || ' ' || public.rms_seed_choice(v_surnames);
      v_rname := public.rms_seed_choice(v_first) || ' ' || public.rms_seed_choice(v_surnames);
      if v_dir = 'incoming' then
        if v_internal then
          v_sorg := v_oname ->> v_other;
          v_pos := 'Department Head';
        else
          v_sorg := case
            when v_brg is not null and random() < 0.5 then 'Barangay ' || v_brg || ' Council'
            else public.rms_seed_fill(public.rms_seed_jpick(v_orgs), v_bt, '', '', '', '', '', '')
          end;
          v_pos := case when v_sorg like 'Barangay %' then 'Punong Barangay' else public.rms_seed_choice(v_positions) end;
        end if;
        v_rname := null;
        v_rorg := v_mname;
        v_addr := case when v_main = 'CMO' then 'The Honorable City Mayor, City Hall, Baguio City'
                       else 'The Head, ' || v_mname || ', City Hall, Baguio City' end;
        v_desc := v_type || ' received from ' || v_sorg || ' for action by ' || v_mname || '.';
      else
        v_sorg := v_mname;
        v_pos := 'Head, ' || v_mname;
        if v_internal then
          v_rorg := v_oname ->> v_other;
          v_addr := 'The Head, ' || v_rorg || ', City Hall, Baguio City';
        else
          v_rorg := public.rms_seed_fill(public.rms_seed_jpick(v_orgs), v_bt, '', '', '', '', '', '');
          v_addr := 'The Chairperson, ' || v_rorg || ', Baguio City';
        end if;
        v_desc := v_type || ' prepared by ' || v_sorg || ' for ' || v_rorg || '.';
      end if;

      -- Category from the topic, then the type ---------------------------------------------
      v_cat := case
        when v_subject ~* 'festival|celebration|parade|job fair|invitation|program' then 'Tourism and events'
        when v_subject ~* 'health|hospital|medical' then 'Health'
        when v_subject ~* 'garbage|\mtree\M|clean-up|planting|stray' then 'Environment'
        when v_subject ~* 'road|drainage|street lights|signage|sidewalk|footbridge|waiting shed|riprap|water supply|building|market' then 'Infrastructure'
        when v_subject ~* 'ingay|videoke|noise|security|peace|drill' then 'Peace and order'
        when v_type = 'Disbursement Voucher' then 'Finance'
        when v_type = 'Purchase Request' then 'Procurement'
        when v_type in ('Resolution', 'Ordinance', 'Executive Order') then 'Legal'
        when v_main in ('CTO', 'CBO') then 'Finance'
        when v_main = 'CEO' then 'Infrastructure'
        when v_main = 'HRMO' then 'Personnel'
        when v_main = 'CLO' then 'Legal'
        when v_main = 'CPDO' then 'Environment'
        when v_main = 'CAO' then 'Social services'
        else public.rms_seed_choice(array['Social services', 'Peace and order', 'Tourism and events', 'Infrastructure'])
      end;

      select coalesce(array_agg(k.w), array[]::text[])
        into v_kw
        from (select d.w
                from (select distinct lower(x) as w
                        from regexp_split_to_table(regexp_replace(v_subject, '[^A-Za-z ]', '', 'g'), ' ') as x
                       where length(x) > 4) d
               limit (3 + floor(random() * 3)::int)) k;

      -- Due date, counted from the created date --------------------------------------------
      v_due := null;
      if v_dir = 'incoming' then
        v_due := case v_type
          when 'Request / Complaint' then v_cd + case when v_prio = 'urgent' then 3 else 7 end
          when 'Endorsement' then v_cd + 10
          when 'Purchase Request' then v_cd + 10
          when 'Disbursement Voucher' then v_cd + 5
          when 'Letter' then case when random() < 0.5 then v_cd + 15 end
          when 'Resolution' then case when random() < 0.5 then v_cd + 30 end
          when 'Ordinance' then case when random() < 0.5 then v_cd + 30 end
        end;
      elsif random() < 0.2 then
        v_due := v_cd + 10;
      end if;

      -- OCR-like document text -------------------------------------------------------------
      v_fam := case v_type
        when 'Request / Complaint' then 'cr'
        when 'Letter' then 'le'
        when 'Endorsement' then 'le'
        when 'Disbursement Voucher' then 'fin'
        when 'Purchase Request' then 'fin'
        when 'Memorandum' then 'memo'
        else 'leg'
      end;
      v_pool := v_bodies -> v_fam;
      if v_fil then
        v_np := 3; v_lo := 6; v_mod := 3; v_tl := 4;
        v_sal := 'Mahal na Ginoo/Ginang:';
        v_close := 'Lubos na gumagalang,';
      else
        v_np := 4 + floor(random() * 3)::int; v_lo := 0; v_mod := 6; v_tl := 0;
        v_sal := 'Dear Sir/Madam:';
        v_close := 'Respectfully yours,';
      end if;
      v_rnd := floor(random() * v_mod)::int;
      v_body := '';
      for v_k in 0 .. v_np - 1 loop
        v_body := v_body || (v_pool ->> (v_lo + (v_rnd + v_k) % v_mod)) || E'\n\n';
      end loop;
      -- two closing paragraphs: both Filipino ones, or two neighbouring English ones
      v_rnd := case when v_fil then 0 else floor(random() * 3)::int end;
      v_body := v_body || (v_tail ->> (v_tl + v_rnd)) || E'\n\n' || (v_tail ->> (v_tl + v_rnd + 1)) || E'\n\n'
                       || 'Enclosures: ' || public.rms_seed_choice(v_encl) || ', ' || public.rms_seed_choice(v_encl) || E'\n\n';
      v_content := public.rms_seed_fill(
        'Republic of the Philippines' || E'\n' || upper(v_sorg) || E'\n'
        || to_char(v_created at time zone 'Asia/Manila', 'FMMonth FMDD, YYYY') || E'\n\n'
        || v_addr || E'\n\n'
        || 'Subject: ' || v_subject || E'\n\n'
        || v_sal || E'\n\n' || v_body || v_close || E'\n\n'
        || upper(v_sname) || E'\n' || v_pos
        || case when random() < 0.25 then E'\n\ncc: ' || (v_oname ->> v_other) || '; Records Section' else '' end
        || case when random() < 0.15 then E'\n\n' || case when v_fil then 'Pahina 1 ng 2' else 'Page 1 of 2' end else '' end,
        v_bt, v_street, v_mname, v_item, v_month, v_event, v_amount);

      -- Plan the steps (kind, target office, delay in hours) -------------------------------
      v_plan := '[]'::jsonb;
      if v_dir = 'incoming' then
        if v_main <> 'CMO' then
          v_plan := public.rms_seed_step(v_plan, 'forward', v_main, random() * 3);
          v_plan := public.rms_seed_step(v_plan, 'receive', null, 0.5 + random() * 23.5);
        end if;
        v_plan := public.rms_seed_step(v_plan, 'act', null, random() * 48);
        for v_k in 1 .. floor(random() * 3)::int loop
          v_plan := public.rms_seed_step(v_plan, 'remark', null, 1 + random() * 30);
        end loop;
        if random() < 0.15 then
          v_b := case when v_cat in ('Finance', 'Procurement') then 'CBO' else 'CLO' end;
          if v_b = v_main then v_b := 'CAO'; end if;
          v_plan := public.rms_seed_step(v_plan, 'forward', v_b, 1 + random() * 8);
          v_plan := public.rms_seed_step(v_plan, 'receive', null, 0.5 + random() * 24);
          v_plan := public.rms_seed_step(v_plan, 'act', null, random() * 24);
        end if;
        v_plan := public.rms_seed_step(v_plan, 'complete', null,
                    case when v_prio = 'urgent' then 12 + random() * 48
                         when random() < 0.25 then 24 * (8 + random() * 20)   -- slow cases: some run past the due date
                         else 24 * (1 + random() * 9) end);
        if random() < 0.7 then
          v_plan := public.rms_seed_step(v_plan, 'archive', null, 24 * (5 + random() * 35));
        end if;
      else
        v_plan := public.rms_seed_step(v_plan, 'act', null, random() * 24);
        if random() < 0.3 and v_origin <> 'CMO' then
          v_plan := public.rms_seed_step(v_plan, 'forward', 'CMO', 1 + random() * 24);
          v_plan := public.rms_seed_step(v_plan, 'receive', null, 0.5 + random() * 24);
          v_plan := public.rms_seed_step(v_plan, 'act', null, random() * 24);
        end if;
        if random() < 0.5 then
          v_plan := public.rms_seed_step(v_plan, 'remark', null, 1 + random() * 30);
        end if;
        v_plan := public.rms_seed_step(v_plan, 'complete', null, 24 * (0.5 + random() * 4));
        v_plan := public.rms_seed_step(v_plan, 'release', null, random() * 72);
        if random() < 0.5 then
          v_plan := public.rms_seed_step(v_plan, 'archive', null, 24 * (5 + random() * 40));
        end if;
      end if;

      -- 0.6% of records older than 30 days are stuck after received or under action; they get a past due date.
      v_stuck := false;
      if v_created < now() - interval '30 days' and random() < 0.006 then
        v_kind := case when v_dir = 'incoming' and v_main <> 'CMO' and random() < 0.5 then 'receive' else 'act' end;
        v_trim := '[]'::jsonb;
        for v_item_j in select value from jsonb_array_elements(v_plan) loop
          v_trim := v_trim || jsonb_build_array(v_item_j);
          exit when v_item_j ->> 'k' = v_kind;
        end loop;
        v_plan := v_trim;
        v_stuck := true;
        v_due := least(coalesce(v_due, v_cd + 7), v_cd + 7);
      end if;

      -- Simulate forward from the registration; stop at the first step later than now() -----
      v_t := v_created;
      v_last := v_created;
      v_cur := v_origin;
      v_status := 'registered';
      v_steps := '[]'::jsonb;
      for v_item_j in select value from jsonb_array_elements(v_plan) loop
        v_kind := v_item_j ->> 'k';
        v_t := public.rms_seed_office_hours(
                 v_t + interval '1 minute' + ((v_item_j ->> 'h')::double precision * interval '1 hour'));
        exit when v_t > now();
        v_to := v_cur;
        v_by := public.rms_seed_actor(v_act, v_cur, v_officer);
        case v_kind
          when 'forward' then
            v_st := 'forwarded'; v_to := v_item_j ->> 'to';
            v_text := 'Sent to ' || (v_oname ->> v_to);
          when 'receive' then
            v_st := 'received';
            v_text := case when random() < 0.3 then 'Received (QR scan)' else 'Received' end;
          when 'act' then
            v_st := 'under_action'; v_text := 'Work started';
          when 'remark' then
            v_st := v_status; v_text := 'Note added';
          when 'complete' then
            v_st := 'completed'; v_text := 'Done';
          when 'release' then
            v_st := 'released'; v_text := 'Sent out';
          else
            v_st := 'archived'; v_text := 'Filed away (archived)'; v_by := v_officer;
        end case;

        v_rem := null;
        if random() < (case v_kind when 'remark' then 1.0 when 'release' then 1.0 when 'forward' then 0.7
                                   when 'complete' then 0.8 else 0.5 end) then
          v_rem := replace(public.rms_seed_jpick(v_rems -> v_kind), '{office}', v_oname ->> v_to);
        end if;
        if v_kind = 'release' then
          v_rem := case v_mode
                     when 'courier' then 'Sent through courier. '
                     when 'email' then 'Sent by email. '
                     when 'mail' then 'Sent by registered mail. '
                     else 'Delivered by hand. '
                   end || coalesce(v_rem, '');
        end if;

        v_steps := v_steps || jsonb_build_array(jsonb_build_object(
          'status', v_st, 'from', v_oid ->> v_cur, 'to', v_oid ->> v_to, 'by', v_by,
          'act', v_text, 'rem', v_rem, 'at', v_t));
        v_status := v_st;
        v_cur := v_to;
        v_last := v_t;
      end loop;

      -- Writes: the record holds its final state; the trigger adds the registered route -----
      v_id := gen_random_uuid();
      insert into public.rms_records (
        id, direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
        sender_name, sender_org, recipient_name, recipient_org, mode, document_date, origin_office_id,
        current_office_id, status, due_date, created_by, created_at, updated_at, barangay, content_text)
      values (
        v_id, v_dir::public.rms_direction, v_subject, v_desc, (v_types ->> v_type)::uuid, v_cat, v_kw,
        v_prio::public.rms_priority, v_conf::public.rms_confidentiality,
        v_sname, v_sorg, v_rname, v_rorg, v_mode, v_cd - floor(random() * 6)::int, (v_oid ->> v_origin)::uuid,
        (v_oid ->> v_cur)::uuid, v_status::public.rms_status, v_due, v_creator, v_created, v_last, v_brg, v_content);

      insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at)
      select v_id, (e.s ->> 'from')::uuid, (e.s ->> 'to')::uuid, (e.s ->> 'status')::public.rms_status,
             e.s ->> 'act', e.s ->> 'rem', (e.s ->> 'by')::uuid, (e.s ->> 'at')::timestamptz
        from jsonb_array_elements(v_steps) with ordinality as e(s, n)
       order by e.n;

      insert into public.rms_seed_records (record_id, batch) values (v_id, p_batch);
      v_count := v_count + 1;
    end loop;
  end loop;

  perform set_config('rms.import', 'off', true);
  if p_actor is not null then
    perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  end if;
  raise notice 'rms_seed_demo %: % records over % workdays, % to %', p_batch, v_count, v_days, p_from, p_to;
  return v_count;
end $fn$;

-- ============================================================================================
-- g. Access history for a date window (run after rms_seed_demo covered the same window)
-- ============================================================================================
-- Sessions (login, MFA for admins, logout) for each workday, and views of the seeded records around
-- each route step. Written set-based. No downloads: seeded records have no attachments. Addresses are
-- documentation ranges only (RFC 5737 TEST-NET).
create or replace function public.rms_seed_demo_access(
  p_from date,
  p_to date,
  p_batch text default 'volume-2026-11',
  p_views_per_route numeric default 4)
returns integer language plpgsql volatile security invoker set search_path = '' as $fn$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Asia/Manila';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Manila';
  v_n int;
  -- four desktop browsers (1-4), then two mobile ones (5-6)
  v_ua constant text[] := array[
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'];
begin
  perform set_config('rms.import', 'on', true);
  if not public.rms_legacy_import() then
    raise exception 'run as the database owner (SQL editor / MCP), not through the API';
  end if;
  if p_from is null or p_to is null or p_from < date '2024-12-01' or p_to > public.rms_today() or p_from > p_to then
    raise exception 'dates must satisfy 2024-12-01 <= p_from <= p_to <= today';
  end if;
  if exists (select 1 from public.rms_access_log
              where created_at >= v_from and detail ->> 'seed' = p_batch) then
    raise exception 'batch % already has access rows from % or later: run the windows in date order, once each', p_batch, p_from;
  end if;
  perform setseed((hashtext(p_batch || 'access' || p_from::text)::bigint % 1000000) / 1000000.0);

  with days as (
    select g::date as day
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
     where not public.rms_seed_off_day(g::date)
  ),
  who as (
    select p.id, p.role, u.email::text as email,
           '203.0.113.' || (20 + (hashtext(coalesce(o.code, 'none')) & 2147483647) % 200) as office_ip,
           1 + (hashtext(p.id::text) & 2147483647) % 4 as ua_idx
      from public.rms_profiles p
      join auth.users u on u.id = p.id
      left join public.rms_offices o on o.id = p.office_id
     where p.is_active
  ),
  -- one row per user and present day; the viewer is in about 40% of days, everyone else 90%
  sess as materialized (
    select w.id, w.email, w.role, d.day,
           d.day::timestamp + make_interval(secs => 27600 + floor(random() * 6600)) as login_l,
           d.day::timestamp + make_interval(secs => 60300 + floor(random() * 6300)) as out_l,
           random() as r_fail,
           random() as r_out,
           case when random() < 0.85 then w.office_ip
                else '198.51.100.' || (1 + floor(random() * 250))::int end as ip,
           v_ua[case when random() < 0.1 then 5 + w.ua_idx % 2 else w.ua_idx end] as ua
      from who w
     cross join days d
     where random() < case when w.role = 'viewer' then 0.4 else 0.9 end
  ),
  cand as (
    select o.id as office_id, array_agg(p.id) as ids
      from public.rms_offices o
      join public.rms_profiles p on p.is_active and (p.office_id = o.id or p.role in ('admin', 'records_officer'))
     group by o.id
  ),
  rt as materialized (
    select r.record_id, r.acted_by, r.to_office_id, r.created_at as ts
      from public.rms_routes r
      join public.rms_seed_records s on s.record_id = r.record_id and s.batch = p_batch
     where r.created_at >= v_from and r.created_at < v_to
  ),
  vw as materialized (
    -- the person who acted looked at the record 1-10 minutes before the step
    select r.record_id, r.acted_by as uid,
           r.ts - make_interval(secs => 60 + floor(random() * 540)) as ts
      from rt r
    union all
    -- other offices look within 72 hours; about p_views_per_route - 1 of them, from 0 to twice that.
    -- A fixed series filtered by random() per row: an uncorrelated generate_series(1, random()) would be
    -- evaluated once for the whole query and give every route the same count.
    select r.record_id, c.ids[1 + floor(random() * cardinality(c.ids))::int],
           r.ts + make_interval(secs => 60 + floor(random() * 259000))
      from rt r
      join cand c on c.office_id = r.to_office_id
     cross join generate_series(1, ceil(2 * greatest(p_views_per_route::float8 - 1, 0))::int) g
     where random() < (greatest(p_views_per_route::float8 - 1, 0)) / greatest(ceil(2 * greatest(p_views_per_route::float8 - 1, 0)), 1)
  ),
  ev as (
    select 'login_failed' as event, s.id as uid, s.email, null::uuid as record_id, s.ip, s.ua,
           jsonb_build_object('seed', p_batch, 'attempt', 1) as detail,
           (s.login_l - interval '40 seconds') at time zone 'Asia/Manila' as ts
      from sess s where s.r_fail < 0.06
    union all
    select 'login_success', s.id, s.email, null::uuid, s.ip, s.ua, jsonb_build_object('seed', p_batch),
           s.login_l at time zone 'Asia/Manila'
      from sess s
    union all
    select 'mfa_verified', s.id, s.email, null::uuid, s.ip, s.ua, jsonb_build_object('seed', p_batch),
           (s.login_l + interval '1 minute') at time zone 'Asia/Manila'
      from sess s where s.role = 'admin'
    union all
    select 'logout', s.id, s.email, null::uuid, s.ip, s.ua, jsonb_build_object('seed', p_batch),
           s.out_l at time zone 'Asia/Manila'
      from sess s where s.r_out < 0.70
    union all
    select 'idle_logout', s.id, s.email, null::uuid, s.ip, s.ua, jsonb_build_object('seed', p_batch),
           s.out_l at time zone 'Asia/Manila'
      from sess s where s.r_out >= 0.70 and s.r_out < 0.95
    union all
    select 'view_record', v.uid, w.email, v.record_id,
           case when random() < 0.85 then w.office_ip
                else '198.51.100.' || (1 + floor(random() * 250))::int end,
           v_ua[case when random() < 0.1 then 5 + w.ua_idx % 2 else w.ua_idx end],
           jsonb_build_object('seed', p_batch),
           public.rms_seed_office_hours(v.ts)
      from vw v
      join who w on w.id = v.uid
  )
  insert into public.rms_access_log (event, user_id, email, record_id, ip, user_agent, detail, created_at)
  select e.event, e.uid, e.email, e.record_id, e.ip, e.ua, e.detail, e.ts
    from ev e
   where e.ts >= v_from and e.ts < v_to and e.ts <= now()
   order by e.ts;

  get diagnostics v_n = row_count;
  perform set_config('rms.import', 'off', true);
  raise notice 'rms_seed_demo_access %: % access rows, % to %', p_batch, v_n, p_from, p_to;
  return v_n;
end $fn$;

-- ============================================================================================
-- h. Owner only. Supabase grants EXECUTE to each role by name, so all four are listed.
-- ============================================================================================
revoke all on function
  public.rms_seed_demo(date, date, text, numeric, uuid),
  public.rms_seed_demo_access(date, date, text, numeric),
  public.rms_seed_off_day(date),
  public.rms_seed_office_hours(timestamptz),
  public.rms_seed_pick(text[], int[]),
  public.rms_seed_choice(text[]),
  public.rms_seed_jpick(jsonb),
  public.rms_seed_actor(jsonb, text, uuid),
  public.rms_seed_step(jsonb, text, text, double precision),
  public.rms_seed_fill(text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
