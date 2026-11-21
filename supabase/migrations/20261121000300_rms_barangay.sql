-- Barangay a record is addressed to or is about, for the barangay map.
-- Run once in the Supabase SQL Editor. Safe to run again.
-- Boundaries and names: PSGC barangays of Baguio City (github.com/faeldon/philippines-json-maps).

create table if not exists public.rms_barangays (
  name text primary key,
  psgc bigint not null unique
);
alter table public.rms_barangays enable row level security;
drop policy if exists rms_barangays_select on public.rms_barangays;
create policy rms_barangays_select on public.rms_barangays for select to authenticated
  using ((select public.rms_my_role()) is not null);

insert into public.rms_barangays (name, psgc) values
  ('A. Bonifacio-Caguioa-Rimando', 1430300125),
  ('Abanao-Zandueta-Kayong-Chugum-Otek', 1430300129),
  ('Alfonso Tabora', 1430300136),
  ('Ambiong', 1430300126),
  ('Andres Bonifacio', 1430300117),
  ('Apugan-Loakan', 1430300001),
  ('Asin Road', 1430300002),
  ('Atok Trail', 1430300003),
  ('Aurora Hill Proper', 1430300067),
  ('Aurora Hill, North Central', 1430300078),
  ('Aurora Hill, South Central', 1430300128),
  ('BGH Compound', 1430300131),
  ('Bagong Lipunan', 1430300130),
  ('Bakakeng Central', 1430300004),
  ('Bakakeng North', 1430300005),
  ('Bal-Marcoville', 1430300068),
  ('Balsigan', 1430300007),
  ('Bayan Park East', 1430300010),
  ('Bayan Park Village', 1430300132),
  ('Bayan Park West', 1430300008),
  ('Brookside', 1430300012),
  ('Brookspoint', 1430300011),
  ('Cabinet Hill-Teacher''s Camp', 1430300013),
  ('Camdas Subdivision', 1430300133),
  ('Camp 7', 1430300017),
  ('Camp 8', 1430300018),
  ('Camp Allen', 1430300016),
  ('Campo Filipino', 1430300019),
  ('City Camp Central', 1430300022),
  ('City Camp Proper', 1430300023),
  ('Country Club Village', 1430300025),
  ('Cresencia Village', 1430300026),
  ('DPS Area', 1430300029),
  ('Dagsian, Lower', 1430300058),
  ('Dagsian, Upper', 1430300028),
  ('Dizon Subdivision', 1430300030),
  ('Dominican Hill-Mirador', 1430300135),
  ('Dontogan', 1430300137),
  ('Engineers'' Hill', 1430300035),
  ('Fairview Village', 1430300036),
  ('Ferdinand', 1430300138),
  ('Fort del Pilar', 1430300037),
  ('Gabriela Silang', 1430300144),
  ('General Emilio F. Aguinaldo', 1430300062),
  ('General Luna, Lower', 1430300039),
  ('General Luna, Upper', 1430300038),
  ('Gibraltar', 1430300040),
  ('Greenwater Village', 1430300041),
  ('Guisad Central', 1430300042),
  ('Guisad Sorong', 1430300043),
  ('Happy Hollow', 1430300006),
  ('Happy Homes', 1430300139),
  ('Harrison-Claudio Carantes', 1430300140),
  ('Hillside', 1430300045),
  ('Holy Ghost Extension', 1430300046),
  ('Holy Ghost Proper', 1430300047),
  ('Honeymoon', 1430300141),
  ('Imelda R. Marcos', 1430300120),
  ('Imelda Village', 1430300049),
  ('Irisan', 1430300050),
  ('Kabayanihan', 1430300142),
  ('Kagitingan', 1430300053),
  ('Kayang Extension', 1430300051),
  ('Kayang-Hilltop', 1430300143),
  ('Kias', 1430300052),
  ('Legarda-Burnham-Kisad', 1430300119),
  ('Liwanag-Loakan', 1430300145),
  ('Loakan Proper', 1430300054),
  ('Lopez Jaena', 1430300055),
  ('Lourdes Subdivision Extension', 1430300056),
  ('Lourdes Subdivision, Lower', 1430300059),
  ('Lourdes Subdivision, Proper', 1430300122),
  ('Lualhati', 1430300063),
  ('Lucnab', 1430300064),
  ('MRR-Queen Of Peace', 1430300091),
  ('Magsaysay Private Road', 1430300066),
  ('Magsaysay, Lower', 1430300065),
  ('Magsaysay, Upper', 1430300159),
  ('Malcolm Square-Perfecto', 1430300147),
  ('Manuel A. Roxas', 1430300148),
  ('Market Subdivision, Upper', 1430300160),
  ('Middle Quezon Hill Subdivision', 1430300154),
  ('Military Cut-off', 1430300071),
  ('Mines View Park', 1430300072),
  ('Modern Site, East', 1430300074),
  ('Modern Site, West', 1430300075),
  ('New Lucban', 1430300076),
  ('Outlook Drive', 1430300081),
  ('Pacdal', 1430300082),
  ('Padre Burgos', 1430300149),
  ('Padre Zamora', 1430300161),
  ('Palma-Urbano', 1430300134),
  ('Phil-Am', 1430300152),
  ('Pinget', 1430300086),
  ('Pinsao Pilot Project', 1430300087),
  ('Pinsao Proper', 1430300088),
  ('Poliwes', 1430300089),
  ('Pucsusan', 1430300090),
  ('Quezon Hill Proper', 1430300153),
  ('Quezon Hill, Upper', 1430300150),
  ('Quirino Hill, East', 1430300034),
  ('Quirino Hill, Lower', 1430300061),
  ('Quirino Hill, Middle', 1430300069),
  ('Quirino Hill, West', 1430300116),
  ('Quirino-Magsaysay, Upper', 1430300124),
  ('Rizal Monument Area', 1430300155),
  ('Rock Quarry, Lower', 1430300092),
  ('Rock Quarry, Middle', 1430300151),
  ('Rock Quarry, Upper', 1430300114),
  ('SLU-SVP Housing Village', 1430300156),
  ('Saint Joseph Village', 1430300110),
  ('Salud Mitra', 1430300094),
  ('San Antonio Village', 1430300096),
  ('San Luis Village', 1430300097),
  ('San Roque Village', 1430300098),
  ('San Vicente', 1430300099),
  ('Sanitary Camp, North', 1430300079),
  ('Sanitary Camp, South', 1430300109),
  ('Santa Escolastica', 1430300100),
  ('Santo Rosario', 1430300101),
  ('Santo Tomas Proper', 1430300103),
  ('Santo Tomas School Area', 1430300102),
  ('Scout Barrio', 1430300105),
  ('Session Road Area', 1430300106),
  ('Slaughter House Area', 1430300107),
  ('South Drive', 1430300157),
  ('Teodora Alonzo', 1430300111),
  ('Trancoville', 1430300112),
  ('Victoria Village', 1430300115)
on conflict (name) do nothing;

alter table public.rms_records add column if not exists barangay text references public.rms_barangays(name) on update cascade;
create index if not exists rms_records_barangay_idx on public.rms_records (barangay) where deleted_at is null;

-- Sample data: fill in a barangay for demo records that do not have one yet.
-- A place name in the subject, description or sender/recipient wins; other records that came from
-- or went to the public get a spread of busy barangays so the map has something to show.
-- Records passed only between City offices stay blank, like they would in real life.
with picked as (
  select r.id,
    case
      when txt ilike '%Session Road%' then 'Session Road Area'
      when txt ilike '%Loakan%' then 'Loakan Proper'
      when txt ilike '%Irisan%' then 'Irisan'
      when txt ilike '%Burnham%' then 'Legarda-Burnham-Kisad'
      when txt ilike '%Wright Park%' then 'South Drive'
      when txt ilike '%Mines View%' then 'Mines View Park'
      when txt ilike '%Camp John Hay%' then 'Country Club Village'
      when txt ilike '%Market%' then 'Market Subdivision, Upper'
      when txt ilike '%Aurora Hill%' then 'Aurora Hill Proper'
      when txt ilike '%Quezon Hill%' then 'Quezon Hill Proper'
      when txt ilike '%Bakakeng%' then 'Bakakeng Central'
      when txt ilike '%Pinsao%' then 'Pinsao Proper'
      when txt ilike '%Asin Road%' then 'Asin Road'
      when txt ilike '%Kias%' then 'Kias'
      when txt ilike '%Dontogan%' then 'Dontogan'
      when txt ilike '%Pacdal%' then 'Pacdal'
      when txt ilike '%Camp 7%' then 'Camp 7'
      when txt ilike '%Camp 8%' then 'Camp 8'
      when txt ilike '%Hillside%' then 'Hillside'
      when txt ilike '%Lucnab%' then 'Lucnab'
      when txt ilike '%Engineers%' then 'Engineers'' Hill'
      when txt ilike '%Teachers%' then 'Cabinet Hill-Teacher''s Camp'
      when txt ilike '%Magsaysay%' then 'Magsaysay, Lower'
      when txt ilike '%Trancoville%' then 'Trancoville'
      when txt ilike '%Guisad%' then 'Guisad Central'
      when txt ilike '%Bonifacio%' then 'Andres Bonifacio'
      when txt ilike '%Gibraltar%' then 'Gibraltar'
      when txt ilike '%Happy Hollow%' then 'Happy Hollow'
      when txt ilike '%Rock Quarry%' then 'Rock Quarry, Lower'
      when txt ilike '%Kayang%' then 'Kayang-Hilltop'
      when txt ilike '%Harrison%' then 'Harrison-Claudio Carantes'
      when txt ilike '%Abanao%' then 'Abanao-Zandueta-Kayong-Chugum-Otek'
      when txt ilike '%Lourdes%' then 'Lourdes Subdivision, Proper'
      when txt ilike '%Dominican%' then 'Dominican Hill-Mirador'
      when txt ilike '%Santo Tomas%' then 'Santo Tomas Proper'
      when txt ilike '%Sto. Tomas%' then 'Santo Tomas Proper'
      when txt ilike '%City Camp%' then 'City Camp Central'
      when txt ilike '%Military Cut-off%' then 'Military Cut-off'
      when txt ilike '%Ambiong%' then 'Ambiong'
      when txt ilike '%Pucsusan%' then 'Pucsusan'
      when txt ilike '%Fort del Pilar%' then 'Fort del Pilar'
      when txt ilike '%BGH%' then 'BGH Compound'
      when txt ilike '%Bayan Park%' then 'Bayan Park Village'
      when txt ilike '%San Vicente%' then 'San Vicente'
      when txt ilike '%Outlook%' then 'Outlook Drive'
      when txt ilike '%Brookside%' then 'Brookside'
      when txt ilike '%Scout Barrio%' then 'Scout Barrio'
      when coalesce(r.mode, '') <> 'internal' and coalesce(r.sender_org, r.recipient_org, '') not ilike 'City %'
        then (array['Irisan', 'Bakakeng Central', 'Pinsao Proper', 'Asin Road', 'Loakan Proper', 'Camp 7', 'Aurora Hill Proper', 'Quezon Hill Proper', 'Kias', 'Dontogan', 'Bakakeng North', 'Irisan', 'Pinsao Pilot Project', 'Camp 8', 'Lucnab', 'Ambiong', 'Pacdal', 'Session Road Area', 'Market Subdivision, Upper', 'Irisan', 'Bakakeng Central', 'Quirino Hill, East', 'Guisad Central', 'Trancoville', 'Magsaysay, Lower', 'Legarda-Burnham-Kisad', 'Hillside', 'Gibraltar', 'Asin Road', 'Loakan Proper', 'Santo Tomas Proper', 'Dominican Hill-Mirador', 'Military Cut-off', 'City Camp Central', 'Fort del Pilar', 'Kayang-Hilltop'])[1 + abs(hashtext(r.id::text)) % 36]
    end as b
  from public.rms_records r,
    lateral (select concat_ws(' ', r.subject, r.description, r.sender_org, r.recipient_org) as txt) t
  where r.barangay is null
)
update public.rms_records r set barangay = p.b from picked p where p.id = r.id and p.b is not null;
