"""Generates supabase/seed_batch3.sql: a third set of fictional demo records for Baguio RMS.

Focus: work that is current this week, due dates running into December, vouchers waiting at the Budget Office,
outgoing replies, and a few confidential HR and legal matters. Times fall within office hours (8 AM to 5 PM Manila).
Run:  python3 supabase/tools/gen_seed_batch3.py > supabase/seed_batch3.sql
Needs the users from seed.sql and seed_more.sql. Safe to run twice: it stops if the first record already exists.
"""
import json

def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"

R = []
def rec(direction, subject, desc, dtype, cat, kw, prio, conf, name, org, mode, days_ago, hour, origin, due, steps):
    R.append(dict(dir=direction, sub=subject, desc=desc, type=dtype, cat=cat, kw=kw, prio=prio, conf=conf, name=name, org=org,
                  mode=mode, ago=days_ago, hour=hour, origin=origin, due=due, steps=steps))

# Steps: (days after logging, kind, to-office, actor, action, remark). Step times are spread over the working day.
rec("incoming", "Disbursement voucher for asphalt overlay of Naguilian Road, progress billing no. 2",
    "Contractor's second progress billing for the Naguilian Road asphalt overlay project.",
    "Disbursement Voucher", "Finance", ["voucher", "asphalt", "naguilian road", "progress billing"], "urgent", "internal",
    "Accounts Section", "City Engineering Office", "internal", 4, 9, "CMO", 6,
    [(0, "fwd", "CBO", "ro", "Forwarded for budget certification", "Attach the accomplishment report."),
     (1, "rcv", None, "bo", "Received by Budget Office", None),
     (2, "note", None, "bo", "Waiting for accomplishment report", "Engineering to submit the signed report.")])
rec("incoming", "Disbursement voucher for medicines of the City Health Services Office",
    "Payment for the fourth-quarter delivery of maintenance medicines for barangay health stations.",
    "Disbursement Voucher", "Finance", ["voucher", "medicines", "health", "barangay health stations"], "normal", "internal",
    "Supply Officer", "City Health Services Office", "internal", 2, 10, "CMO", 8,
    [(0, "fwd", "CBO", "ro", "Forwarded for budget certification", None),
     (0, "rcv", None, "bo", "Received by Budget Office", None)])
rec("incoming", "Disbursement voucher for meals of the Christmas lighting volunteers",
    "Meals for 80 volunteers who installed the Session Road Christmas lights.",
    "Disbursement Voucher", "Finance", ["voucher", "meals", "christmas", "session road", "volunteers"], "low", "internal",
    "Events Unit", "City Mayor's Office", "internal", 1, 14, "CMO", 12,
    [(0, "fwd", "CBO", "ro", "Forwarded for budget certification", None)])
rec("incoming", "Request for repair of the Burnham Park lake fountain before Christmas",
    "Park management reports the fountain pump failed and asks for repair before the holiday crowds.",
    "Request / Complaint", "Infrastructure", ["burnham park", "fountain", "repair", "christmas"], "urgent", "public",
    "Park Superintendent", "Burnham Park Management", "walk-in", 5, 8, "CMO", 14,
    [(0, "fwd", "CEO", "ro", "Forwarded for inspection", "Mayor wants it working by December 15."),
     (1, "rcv", None, "es", "Received by Engineering", None),
     (2, "act", None, "eh", "Pump inspected", "Replacement pump needed; purchase request being prepared.")])
rec("incoming", "Purchase request for replacement fountain pump, Burnham Park",
    "Purchase request for one 7.5 horsepower submersible pump for the Burnham Park fountain.",
    "Purchase Request", "Procurement", ["purchase request", "pump", "burnham park"], "urgent", "internal",
    "Engineering Supply Unit", "City Engineering Office", "internal", 2, 15, "CEO", 10,
    [(0, "fwd", "CBO", "eh", "Forwarded for budget certification", "Linked to the fountain repair request."),
     (1, "rcv", None, "bo", "Received by Budget Office", None)])
rec("incoming", "Invitation to the City Christmas lighting ceremony at Session Road",
    "Organizers invite department heads to the lighting ceremony on the first Saturday of December.",
    "Letter", "Tourism and events", ["christmas", "lighting", "session road", "invitation"], "low", "public",
    "Organizing Committee", "Baguio Christmas Festival Committee", "email", 6, 11, "CMO", None,
    [(0, "fwd", "CAO", "ro", "Forwarded for information and attendance", None),
     (1, "rcv", None, "ca", "Received", None),
     (1, "done", None, "ca", "Attendance confirmed for all department heads", None)])
rec("incoming", "Request for road clearing after landslide on Kennon Road access, Barangay Camp 7",
    "Barangay reports soil and rocks blocking one lane after heavy rain.",
    "Request / Complaint", "Disaster response", ["landslide", "camp 7", "road clearing", "kennon road"], "urgent", "public",
    "Hon. Rogelio Bautista", "Barangay Camp 7", "walk-in", 9, 8, "CMO", 2,
    [(0, "fwd", "CEO", "ro", "Forwarded for immediate action", "Coordinate with CDRRMO."),
     (0, "rcv", None, "es", "Received by Engineering", None),
     (0, "act", None, "eh", "Backhoe deployed", "One lane opened by 3 PM."),
     (3, "note", None, "eh", "Slope protection needed", "Recommend a retaining wall; refer to Planning for funding.")])
rec("incoming", "Request for inclusion of the Camp 7 retaining wall in the 2027 investment program",
    "Engineering asks Planning to include a retaining wall at the Camp 7 landslide site.",
    "Memorandum", "Planning", ["retaining wall", "camp 7", "investment program", "landslide"], "normal", "internal",
    "City Engineer", "City Engineering Office", "internal", 5, 13, "CEO", 25,
    [(0, "fwd", "CPDO", "eh", "Forwarded for programming", None),
     (2, "rcv", None, "ph", "Received by Planning", None)])
rec("incoming", "Leave application and medical certificate of an Engineering employee",
    "Application for 15 days of sick leave with a medical certificate.",
    "Memorandum", "Human resources", ["leave", "sick leave", "medical certificate"], "normal", "confidential",
    "Engineering employee", "City Engineering Office", "internal", 3, 9, "CEO", 7,
    [(0, "fwd", "HRMO", "eh", "Forwarded for processing", None),
     (1, "rcv", None, "hr", "Received by HRMO", None),
     (1, "act", None, "hr", "Leave credits being checked", None)])
rec("incoming", "Notice of hearing in a civil case involving a city lot in Barangay Irisan",
    "Court notice setting a pre-trial hearing on a boundary dispute over a city-owned lot.",
    "Letter", "Legal", ["court", "hearing", "irisan", "lot", "boundary"], "urgent", "confidential",
    "Clerk of Court", "Regional Trial Court Branch 7, Baguio City", "courier", 4, 10, "CMO", 9,
    [(0, "fwd", "CLO", "ro", "Forwarded for appearance", "Hearing date is in December."),
     (0, "rcv", None, "lo", "Received by City Legal Office", None),
     (1, "act", None, "lo", "Preparing pre-trial brief", None)])
rec("incoming", "Request for business permit inspection schedule, Upper Session Road establishments",
    "Business owners ask for the inspection schedule needed to renew their permits in January.",
    "Request / Complaint", "Business permits", ["business permit", "inspection", "session road", "renewal"], "normal", "public",
    "Ms. Carmela Yu", "Upper Session Road Business Association", "walk-in", 8, 15, "CMO", 20,
    [(0, "fwd", "CAO", "ro", "Forwarded for scheduling", None),
     (1, "rcv", None, "ca", "Received", None),
     (3, "act", None, "ca", "Joint inspection team being formed", "Engineering, fire and health to join.")])
rec("incoming", "Request for financial assistance for typhoon-damaged homes, Barangay Pinsao Proper",
    "Barangay requests assistance for 14 families whose roofs were damaged.",
    "Request / Complaint", "Social welfare", ["typhoon", "financial assistance", "pinsao", "families"], "urgent", "internal",
    "Hon. Mercy Dulay", "Barangay Pinsao Proper", "walk-in", 12, 9, "CMO", 5,
    [(0, "fwd", "CAO", "ro", "Forwarded for validation", "List of families attached."),
     (1, "rcv", None, "ca", "Received", None),
     (4, "note", None, "ca", "Validation visit done", "12 of 14 families validated."),
     (5, "fwd", "CBO", "ca", "Forwarded for fund availability", None)])
rec("incoming", "Submission of the proposed 2027 annual budget of the City Treasurer's Office",
    "Treasury submits its proposed 2027 budget for consolidation.",
    "Memorandum", "Finance", ["budget", "2027", "treasury", "proposal"], "normal", "internal",
    "City Treasurer", "City Treasurer's Office", "internal", 18, 14, "CTO", 15,
    [(0, "fwd", "CBO", "th", "Forwarded for consolidation", None),
     (1, "rcv", None, "bo", "Received by Budget Office", None),
     (6, "done", None, "bo", "Included in the consolidated budget", None)])
rec("incoming", "Request for tax clearance of a market stall lease applicant",
    "Applicant for a public market stall asks for a tax clearance certificate.",
    "Request / Complaint", "Revenue", ["tax clearance", "market", "stall", "lease"], "low", "internal",
    "Mr. Arnel Pascua", None, "walk-in", 2, 11, "CMO", 5,
    [(0, "fwd", "CTO", "ro", "Forwarded for issuance", None),
     (0, "rcv", None, "ts", "Received by Treasury", None),
     (1, "done", None, "ts", "Tax clearance issued", "Applicant has no unpaid fees.")])
rec("outgoing", "Reply to Barangay Camp 7 on the landslide clearing and retaining wall plan",
    "Informs the barangay that the road is clear and a retaining wall is proposed for 2027.",
    "Letter", "Disaster response", ["reply", "camp 7", "landslide", "retaining wall"], "normal", "public",
    "Hon. Rogelio Bautista", "Barangay Camp 7", "mail", 4, 16, "CEO", None,
    [(0, "done", None, "eh", "Signed by the City Engineer", None),
     (1, "out", None, "eh", "Sent by mail", None)])
rec("outgoing", "Memorandum to all offices on the December work schedule and holiday skeleton force",
    "Sets the skeleton force and office hours for December 24 to January 2.",
    "Memorandum", "Human resources", ["holiday", "skeleton force", "december", "schedule"], "normal", "public",
    "All department heads", "City Government of Baguio", "email", 1, 10, "HRMO", None,
    [(0, "done", None, "hr", "Approved by the City Mayor", None),
     (0, "out", None, "hr", "Sent to all offices by email", None)])
rec("outgoing", "Request to the Department of Public Works and Highways for joint inspection of Marcos Highway drainage",
    "Asks the regional DPWH office for a joint inspection of clogged highway drainage.",
    "Letter", "Infrastructure", ["dpwh", "marcos highway", "drainage", "joint inspection"], "normal", "public",
    "Regional Director", "DPWH Cordillera Regional Office", "courier", 1, 16, "CEO", 10,
    [])
rec("incoming", "Endorsement of the senior citizens' Christmas party venue request",
    "Federation of Senior Citizens asks to use the Baguio Convention Center on December 18.",
    "Endorsement", "Social welfare", ["senior citizens", "christmas party", "convention center"], "normal", "public",
    "Mrs. Erlinda Ocampo", "Federation of Senior Citizens Associations of Baguio", "walk-in", 1, 15, "CMO", 7,
    [(0, "fwd", "CAO", "ro", "Forwarded for venue booking", "Please check availability for December 18.")])
rec("incoming", "Letter of thanks from Barangay Loakan Proper for drainage clearing",
    "The barangay thanks the City Engineering Office for clearing the Loakan Road canal.",
    "Letter", "Infrastructure", ["thanks", "loakan", "drainage"], "low", "public",
    "Hon. Herminia Ramos Bacani", "Barangay Loakan Proper", "email", 1, 16, "CMO", None,
    [])

data = []
for x in sorted(R, key=lambda x: (-x["ago"], x["hour"])):
    for d, *_ in x["steps"]:
        if d > x["ago"]:
            raise SystemExit(f"step in the future: {x['sub']}")
    x["by"] = "ro" if x["origin"] == "CMO" else (x["steps"][0][3] if x["steps"] else {"CEO": "eh"}[x["origin"]])
    x["steps"] = [list(s) for s in x["steps"]]
    data.append(x)

users = {"ro": "records@rms-demo.test", "eh": "engineering.head@rms-demo.test", "es": "engineering.staff@rms-demo.test",
         "ts": "treasury.staff@rms-demo.test", "th": "treasury.head@rms-demo.test", "bo": "budget.head@rms-demo.test",
         "hr": "hrmo.staff@rms-demo.test", "lo": "legal.head@rms-demo.test", "ca": "admin.office@rms-demo.test",
         "ph": "planning.head@rms-demo.test"}

print("-- Generated by supabase/tools/gen_seed_batch3.py. Fictional demo data, logged within office hours (Manila).")
print("do $do$\ndeclare")
print("  umap jsonb := " + q(json.dumps(users, separators=(",", ":"))) + ";")
print("  recs jsonb := " + q(json.dumps(data, ensure_ascii=False, separators=(",", ":"))) + ";")
print("""  st jsonb := '{"fwd":"forwarded","rcv":"received","act":"under_action","done":"completed","out":"released","arch":"archived"}';
  x jsonb; s jsonb; r uuid; cur text; dest text; created timestamptz; step_at timestamptz; i int;
  today date := (now() at time zone 'Asia/Manila')::date;
  uid jsonb := '{}';
  k text;
begin
  if exists (select 1 from public.rms_records where subject = recs->0->>'sub') then return; end if;
  for k in select jsonb_object_keys(umap) loop
    uid := uid || jsonb_build_object(k, (select id from auth.users where email = umap->>k));
  end loop;
  for x in select * from jsonb_array_elements(recs) loop
    -- Logged at the given hour (Manila) on that day, plus a few minutes so records don't share a time
    created := ((today - (x->>'ago')::int) + make_time((x->>'hour')::int, (length(x->>'sub') * 7) % 50, 0)) at time zone 'Asia/Manila';
    if created > now() then created := now() - interval '20 minutes'; end if;
    insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
      sender_name, sender_org, recipient_name, recipient_org, mode, document_date, origin_office_id, due_date, created_by, created_at)
    values ((x->>'dir')::public.rms_direction, x->>'sub', x->>'desc',
      (select id from public.rms_document_types where name = x->>'type'), x->>'cat',
      array(select jsonb_array_elements_text(x->'kw')), (x->>'prio')::public.rms_priority, (x->>'conf')::public.rms_confidentiality,
      case when x->>'dir' = 'incoming' then x->>'name' end, case when x->>'dir' = 'incoming' then x->>'org' end,
      case when x->>'dir' = 'outgoing' then x->>'name' end, case when x->>'dir' = 'outgoing' then x->>'org' end,
      x->>'mode', today - (x->>'ago')::int - 1,
      (select id from public.rms_offices where code = x->>'origin'),
      case when x->>'due' is not null then today - (x->>'ago')::int + (x->>'due')::int end,
      (uid->>(x->>'by'))::uuid, created)
    returning id into r;
    cur := x->>'origin';
    i := 0;
    for s in select * from jsonb_array_elements(x->'steps') loop
      dest := case when s->>1 = 'fwd' then s->>2 else cur end;
      -- Same-day steps follow 40 minutes apart; later days start at 9 AM. Never in the future.
      step_at := case when (s->>0)::int = 0 then created + make_interval(mins => 25 + i * 40)
                      else ((today - (x->>'ago')::int + (s->>0)::int) + make_time(9 + i % 7, (i * 13) % 60, 0)) at time zone 'Asia/Manila' end;
      if step_at > now() then step_at := now() - make_interval(mins => 10 - least(i, 9)); end if;
      insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at)
      values (r, (select id from public.rms_offices where code = cur), (select id from public.rms_offices where code = dest),
        coalesce((st->>(s->>1))::public.rms_status, (select status from public.rms_records where id = r)),
        s->>4, s->>5, (uid->>(s->>3))::uuid, step_at);
      cur := dest;
      i := i + 1;
    end loop;
  end loop;
end $do$;""")
