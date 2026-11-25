"""Generates supabase/seed_more.sql: a fuller set of fictional demo records for Baguio RMS.

Every record has a believable history (registered -> forwarded -> received -> acted on -> done/sent out/archived),
spread over the last five months, across all offices and document types. Names and cases are fictional.
Run:  python3 supabase/tools/gen_more_seed.py > supabase/seed_more.sql
"""

def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"

# (key, email, full name, role, office)
USERS = [
    ("th", "treasury.head@rms-demo.test", "Edgar Lim (City Treasurer)", "dept_head", "CTO"),
    ("bo", "budget.head@rms-demo.test", "Ramon Villanueva (Budget Officer)", "dept_head", "CBO"),
    ("hr", "hrmo.staff@rms-demo.test", "Grace Tolentino (HRMO Staff)", "staff", "HRMO"),
    ("lo", "legal.head@rms-demo.test", "Atty. Teresa Navarro (City Legal Officer)", "dept_head", "CLO"),
    ("ca", "admin.office@rms-demo.test", "Benjie Castillo (City Administrator's Office)", "staff", "CAO"),
    ("ph", "planning.head@rms-demo.test", "Rosa Aquino (Planning Head)", "dept_head", "CPDO"),
]
EXISTING = {"ro": "records@rms-demo.test", "eh": "engineering.head@rms-demo.test", "es": "engineering.staff@rms-demo.test",
            "ts": "treasury.staff@rms-demo.test", "adm": "admin@rms-demo.test"}

# Short routing scripts. Each step: (days after logging, kind, to-office or None, actor, action, remark)
# kinds: fwd, rcv, act, note, done, out, arch
R = []
def rec(direction, subject, desc, dtype, cat, kw, prio, conf, name, org, mode, days_ago, origin, due, steps):
    R.append(dict(direction=direction, subject=subject, desc=desc, dtype=dtype, cat=cat, kw=kw, prio=prio, conf=conf,
                  name=name, org=org, mode=mode, days_ago=days_ago, origin=origin, due=due, steps=steps))

# ---- finished and archived (older) ----
rec("incoming", "Request for permit to hold Panagbenga street dancing practice at Burnham Park",
    "School cluster asks to use the Burnham Park athletic bowl for weekend street dancing practice in January and February.",
    "Request", "Tourism and events", ["panagbenga", "burnham park", "permit", "festival"], "normal", "public",
    "Mrs. Lourdes Cabrera", "Baguio Central School Cluster", "walk-in", 140, "CMO", 10,
    [(1, "fwd", "CAO", "ro", "Forwarded for scheduling", "Coordinate with the festival foundation calendar."),
     (1, "rcv", None, "ca", "Received by City Administrator's Office", None),
     (4, "act", None, "ca", "Checked venue calendar", "Weekends of Jan 10 to Feb 21 are free."),
     (6, "done", None, "ca", "Permit approved", "Approval letter released to the school."),
     (30, "arch", None, "ro", "Filed", None)])
rec("incoming", "Disbursement voucher for October electricity bill of City Hall",
    "Voucher for payment of the October power bill of the City Hall complex.",
    "Disbursement Voucher", "Finance", ["voucher", "electricity", "city hall", "utilities"], "normal", "internal",
    "General Services", "City General Services Office", "internal", 32, "CMO", 7,
    [(0, "fwd", "CBO", "ro", "Forwarded for budget certification", None),
     (1, "rcv", None, "bo", "Received by Budget Office", None),
     (1, "note", None, "bo", "Funds available certified", "Charged to MOOE, utilities."),
     (2, "fwd", "CTO", "bo", "Forwarded for payment", None),
     (2, "rcv", None, "ts", "Received by Treasury", None),
     (4, "done", None, "th", "Check issued", "Check no. 0045821.")])
rec("incoming", "Memorandum circular on observance of fire prevention month",
    "Circular from the Bureau of Fire Protection asking offices to hold fire drills in March.",
    "Memorandum", "Administration", ["fire drill", "safety", "circular"], "low", "public",
    "City Fire Marshal", "Bureau of Fire Protection - Baguio", "courier", 150, "CMO", None,
    [(1, "fwd", "HRMO", "ro", "Forwarded for dissemination", "Please schedule drills for all City Hall offices."),
     (2, "rcv", None, "hr", "Received by HRMO", None),
     (9, "done", None, "hr", "Drill schedule issued to all offices", None),
     (40, "arch", None, "ro", "Filed", None)])
rec("outgoing", "Reply to request for certified true copy of Ordinance on plastic bags",
    "Sends certified true copies of the ordinance regulating plastic bags to the requesting university.",
    "Letter", "Legislation", ["ordinance", "plastic", "certified copy"], "normal", "public",
    "Dr. Ferdinand Abad", "Cordillera State University Research Office", "mail", 95, "CLO", None,
    [(1, "done", None, "lo", "Signed by City Legal Officer", None),
     (2, "out", None, "lo", "Sent by registered mail", "Registry receipt no. 2210.")])

# ---- in progress, on time ----
rec("incoming", "Complaint on uncollected garbage along Kayang Street",
    "Store owners report that garbage has not been collected for four days.",
    "Request", "Environment", ["garbage", "kayang", "complaint", "collection"], "urgent", "public",
    "Mr. Danilo Ramos", "Kayang Street Vendors Association", "walk-in", 3, "CMO", 4,
    [(0, "fwd", "CEO", "ro", "Forwarded for immediate action", "Coordinate with the collection contractor today."),
     (0, "rcv", None, "es", "Received by Engineering", None),
     (1, "act", None, "eh", "Collection truck dispatched", "Truck 7 assigned to Kayang Street route.")])
rec("incoming", "Application for building permit, four-storey residential building in Barangay Pacdal",
    "Owner submits plans and requirements for a four-storey residential building.",
    "Request", "Building permits", ["building permit", "pacdal", "residential"], "normal", "public",
    "Engr. Victor Santiago", "for Mr. and Mrs. Robles", "walk-in", 6, "CMO", 9,
    [(0, "fwd", "CEO", "ro", "Forwarded for plan evaluation", None),
     (1, "rcv", None, "es", "Received by Engineering", None),
     (2, "act", None, "es", "Plan evaluation started", "Structural review assigned."),
     (4, "note", None, "eh", "Geohazard clearance requested", "Lot is near a slope; ask CPDO for hazard map check.")])
rec("incoming", "Request for hazard map assessment of a slope in Barangay Pacdal",
    "Engineering asks Planning to check the hazard map for a building permit application.",
    "Memorandum", "Disaster risk reduction", ["hazard map", "slope", "pacdal", "landslide"], "normal", "internal",
    "City Engineer", "City Engineering Office", "internal", 2, "CEO", 7,
    [(0, "fwd", "CPDO", "eh", "Forwarded for hazard assessment", "Needed for the Pacdal building permit."),
     (1, "rcv", None, "ph", "Received by Planning", None)])
rec("incoming", "Purchase request for 20 units of laptops for the City Treasurer's Office",
    "Replacement of laptops older than seven years used at the payment windows.",
    "Purchase Request", "Procurement", ["laptops", "ict", "procurement", "treasury"], "normal", "internal",
    "City Treasurer", "City Treasurer's Office", "internal", 12, "CTO", 20,
    [(0, "fwd", "CBO", "th", "Forwarded for budget certification", None),
     (2, "rcv", None, "bo", "Received by Budget Office", None),
     (3, "act", None, "bo", "Checking available appropriation", "Charge to capital outlay, ICT equipment.")])
rec("incoming", "Request for financial assistance for burial of a senior citizen",
    "Family requests burial assistance under the city's social welfare program.",
    "Request", "Social services", ["financial assistance", "burial", "senior citizen"], "urgent", "confidential",
    "Mrs. Elena Dulay", None, "walk-in", 1, "CMO", 3,
    [(0, "fwd", "CTO", "ro", "Forwarded for release of assistance", "Approved by the City Mayor. Handle as confidential."),
     (0, "rcv", None, "ts", "Received by Treasury", None)])
rec("incoming", "Endorsement of application for business permit renewal of a Session Road restaurant",
    "Barangay clearance and fire safety certificate endorsed for permit renewal.",
    "Endorsement", "Business permits", ["business permit", "session road", "renewal", "restaurant"], "normal", "public",
    "Barangay Captain", "Barangay Session Road Area", "walk-in", 5, "CMO", 6,
    [(0, "fwd", "CTO", "ro", "Forwarded for assessment of fees", None),
     (1, "rcv", None, "ts", "Received by Treasury", None),
     (2, "act", None, "ts", "Fees assessed", "Assessment slip given to the owner.")])
rec("incoming", "Notice of hearing on the proposed amendment of the Baguio zoning ordinance",
    "City Council committee invites the Planning Office to a public hearing.",
    "Letter", "Legislation", ["zoning", "ordinance", "hearing", "city council"], "normal", "public",
    "Committee Secretary", "Sangguniang Panlungsod - Committee on Urban Planning", "courier", 4, "CMO", 8,
    [(0, "fwd", "CPDO", "ro", "Forwarded for attendance", "Hearing is next Thursday, 2 PM, Session Hall."),
     (1, "rcv", None, "ph", "Received by Planning", None),
     (2, "note", None, "ph", "Position paper being drafted", None)])
rec("incoming", "Request for leave credits certification of a retiring employee",
    "Retiring employee asks for a certification of unused leave credits for terminal leave pay.",
    "Request", "Human resources", ["leave credits", "retirement", "certification"], "normal", "confidential",
    "Mr. Rodolfo Baccay", "City Engineering Office", "internal", 8, "CMO", 10,
    [(0, "fwd", "HRMO", "ro", "Forwarded for certification", None),
     (1, "rcv", None, "hr", "Received by HRMO", None),
     (3, "act", None, "hr", "Computing leave credits", "Service record requested from Engineering.")])
rec("incoming", "Report of a leaning pine tree near the Wright Park riding circle",
    "Park visitor reports a pine tree leaning over the footpath after heavy rain.",
    "Request", "Environment", ["pine tree", "wright park", "safety", "rain"], "urgent", "public",
    "Ms. Joy Pacio", None, "email", 2, "CMO", 3,
    [(0, "fwd", "CEO", "ro", "Forwarded for inspection", "Possible danger to visitors. Please inspect today."),
     (0, "rcv", None, "es", "Received by Engineering", None),
     (1, "act", None, "es", "Area cordoned off", "Inspection with the City Environment team set tomorrow.")])

# ---- overdue ----
rec("incoming", "Request for repair of streetlights along Marcos Highway, Barangay Irisan",
    "Barangay council reports twelve streetlights not working near the Irisan junction.",
    "Request", "Infrastructure", ["streetlights", "irisan", "marcos highway", "repair"], "urgent", "public",
    "Punong Barangay", "Barangay Irisan", "walk-in", 16, "CMO", 7,
    [(0, "fwd", "CEO", "ro", "Forwarded for repair", "Road safety concern at night."),
     (2, "rcv", None, "es", "Received by Engineering", None),
     (4, "act", None, "eh", "Materials requested", "Waiting for bulbs and wiring from Supply.")])
rec("incoming", "Audit observation memorandum on unliquidated cash advances",
    "Audit team asks offices to explain cash advances not liquidated after 60 days.",
    "Memorandum", "Finance", ["audit", "cash advance", "liquidation"], "urgent", "confidential",
    "Audit Team Leader", "Commission on Audit - Baguio City", "courier", 21, "CMO", 15,
    [(0, "fwd", "CTO", "ro", "Forwarded for reply", "Reply due within 15 days."),
     (1, "rcv", None, "th", "Received by Treasury", None),
     (3, "act", None, "th", "Collecting liquidation reports", "Three offices have not responded yet.")])
rec("incoming", "Request for road widening plan copy for a subdivision in Barangay Bakakeng",
    "Homeowners association requests a copy of the road widening plan affecting their area.",
    "Letter", "Infrastructure", ["road widening", "bakakeng", "plan", "homeowners"], "normal", "public",
    "Mr. Arnel Tabora", "Bakakeng Norte Homeowners Association", "mail", 25, "CMO", 10,
    [(1, "fwd", "CPDO", "ro", "Forwarded for reply", None),
     (3, "rcv", None, "ph", "Received by Planning", None)])
rec("incoming", "Disbursement voucher for catering services during the city tourism summit",
    "Payment to the caterer for meals served during the two-day tourism summit.",
    "Disbursement Voucher", "Finance", ["voucher", "catering", "tourism summit"], "normal", "internal",
    "Tourism Office", "City Tourism Office", "internal", 18, "CMO", 5,
    [(0, "fwd", "CBO", "ro", "Forwarded for budget certification", None),
     (1, "rcv", None, "bo", "Received by Budget Office", None),
     (2, "note", None, "bo", "Returned for missing attendance sheet", "Please attach the signed attendance sheets."),
     (2, "fwd", "CMO", "bo", "Sent back to records desk", "Waiting for attendance sheets from Tourism.")])

# ---- forwarded, waiting to be received ----
rec("incoming", "Request for use of the Baguio Convention Center for a regional teachers' conference",
    "DepEd division asks to reserve the convention center for three days in February.",
    "Letter", "Tourism and events", ["convention center", "conference", "deped", "reservation"], "normal", "public",
    "Schools Division Superintendent", "DepEd Schools Division of Baguio City", "courier", 1, "CMO", 10,
    [(0, "fwd", "CAO", "ro", "Forwarded for venue booking", None)])
rec("incoming", "Legal opinion request on the lease of market stalls at the Baguio City Public Market",
    "Market superintendent asks whether stall leases may be transferred to relatives.",
    "Memorandum", "Legal", ["market stalls", "lease", "legal opinion", "public market"], "normal", "internal",
    "Market Superintendent", "City Public Market Office", "internal", 1, "CMO", 14,
    [(0, "fwd", "CLO", "ro", "Forwarded for legal opinion", None)])

# ---- completed / sent out, not yet archived ----
rec("outgoing", "Notice of award for asphalt overlay of Kisad Road",
    "Notice of award issued to the winning bidder for the Kisad Road asphalt overlay project.",
    "Letter", "Procurement", ["notice of award", "kisad road", "asphalt", "bidding"], "normal", "public",
    "General Manager", "Highland Builders Corporation", "courier", 10, "CEO", None,
    [(1, "fwd", "CMO", "eh", "Forwarded for signature of the City Mayor", None),
     (1, "rcv", None, "ro", "Received by records desk", None),
     (3, "done", None, "ro", "Signed by the City Mayor", None),
     (4, "out", None, "ro", "Sent by courier", "Receiving copy returned and filed.")])
rec("outgoing", "Executive order creating the City Records Digitization Task Force",
    "Creates a task force to scan and index permanent records of all City Hall offices.",
    "Executive Order", "Administration", ["executive order", "digitization", "task force", "records"], "normal", "public",
    "All Department Heads", "City Government of Baguio", "internal", 45, "CMO", None,
    [(1, "done", None, "ro", "Signed and numbered", "EO No. 47, series of 2026."),
     (2, "out", None, "ro", "Copies sent to all offices", None)])
rec("incoming", "Approved resolution on the 2027 annual investment program",
    "City Council resolution approving the annual investment program for 2027.",
    "Resolution", "Planning", ["resolution", "annual investment program", "2027", "budget"], "normal", "public",
    "Secretary to the Sanggunian", "Sangguniang Panlungsod", "internal", 28, "CMO", None,
    [(0, "fwd", "CPDO", "ro", "Forwarded for implementation", None),
     (1, "rcv", None, "ph", "Received by Planning", None),
     (5, "done", None, "ph", "Programs uploaded to the planning database", None)])
rec("incoming", "Ordinance regulating the cutting of pine trees in private lots",
    "Approved ordinance requiring a city permit before cutting pine trees on private land.",
    "Ordinance", "Environment", ["ordinance", "pine trees", "tree cutting", "permit"], "normal", "public",
    "Secretary to the Sanggunian", "Sangguniang Panlungsod", "internal", 60, "CMO", None,
    [(1, "fwd", "CEO", "ro", "Forwarded for implementation", None),
     (2, "rcv", None, "es", "Received by Engineering", None),
     (8, "done", None, "eh", "Permit form and checklist prepared", None),
     (20, "arch", None, "ro", "Filed (permanent record)", None)])
rec("outgoing", "Reply to request for list of accredited tour guides",
    "Sends the current list of accredited tour guides to a travel agency.",
    "Letter", "Tourism and events", ["tour guides", "accreditation", "tourism"], "low", "public",
    "Operations Manager", "Pine City Travel and Tours", "email", 15, "CAO", None,
    [(0, "done", None, "ca", "Signed by City Administrator", None),
     (0, "out", None, "ca", "Sent by email", None)])
rec("incoming", "Request for certified payroll of job order workers for October",
    "GSIS asks for the certified payroll for verification of contributions.",
    "Letter", "Human resources", ["payroll", "job order", "certification"], "normal", "confidential",
    "Branch Manager", "GSIS Baguio Branch", "mail", 22, "CMO", 12,
    [(0, "fwd", "HRMO", "ro", "Forwarded for certification", None),
     (1, "rcv", None, "hr", "Received by HRMO", None),
     (6, "done", None, "hr", "Certified payroll sent", "Sent by registered mail.")])
rec("incoming", "Purchase request for rain gear of street sweepers",
    "Raincoats and boots for 80 street sweepers before the rainy season.",
    "Purchase Request", "Procurement", ["rain gear", "street sweepers", "procurement"], "normal", "internal",
    "City Engineer", "City Engineering Office", "internal", 70, "CEO", 21,
    [(0, "fwd", "CBO", "eh", "Forwarded for budget certification", None),
     (2, "rcv", None, "bo", "Received by Budget Office", None),
     (3, "done", None, "bo", "Funds certified", None),
     (30, "arch", None, "ro", "Filed", None)])
rec("incoming", "Request for traffic rerouting plan during the Session Road in Bloom",
    "Festival committee asks for a rerouting plan while Session Road is closed to vehicles.",
    "Request", "Traffic", ["traffic", "rerouting", "session road", "panagbenga"], "urgent", "public",
    "Festival Director", "Baguio Flower Festival Foundation", "walk-in", 120, "CMO", 14,
    [(0, "fwd", "CEO", "ro", "Forwarded for traffic plan", None),
     (1, "rcv", None, "es", "Received by Engineering", None),
     (6, "done", None, "eh", "Rerouting plan approved", "Plan posted on the city page."),
     (40, "arch", None, "ro", "Filed", None)])
rec("incoming", "Request for list of flood-prone streets for the rainy season",
    "Disaster office asks Planning for the latest list of flood-prone streets.",
    "Memorandum", "Disaster risk reduction", ["flood", "rainy season", "drrm", "streets"], "normal", "internal",
    "City DRRM Officer", "City Disaster Risk Reduction and Management Office", "internal", 100, "CMO", 7,
    [(0, "fwd", "CPDO", "ro", "Forwarded for reply", None),
     (1, "rcv", None, "ph", "Received by Planning", None),
     (4, "done", None, "ph", "List sent to DRRM Office", None)])
rec("incoming", "Letter of appreciation from visiting sister city delegation",
    "Delegation from a sister city thanks Baguio for the cultural exchange visit.",
    "Letter", "External relations", ["sister city", "appreciation", "delegation"], "low", "public",
    "Mayor's Office", "Sister City Committee", "email", 50, "CMO", None,
    [(0, "done", None, "ro", "Acknowledged", None),
     (10, "arch", None, "ro", "Filed", None)])
rec("incoming", "Subpoena in a civil case involving a city road right-of-way",
    "Court subpoena asking for documents on the acquisition of a road right-of-way.",
    "Letter", "Legal", ["subpoena", "right-of-way", "court", "civil case"], "urgent", "confidential",
    "Clerk of Court", "Regional Trial Court Branch 6", "courier", 9, "CMO", 5,
    [(0, "fwd", "CLO", "ro", "Forwarded to City Legal Office", "Handle as confidential."),
     (0, "rcv", None, "lo", "Received by City Legal Office", None),
     (2, "act", None, "lo", "Gathering deeds and plans", "Requested plans from Engineering.")])
rec("outgoing", "Invitation to barangay captains for the quarterly peace and order council meeting",
    "Invitation to all barangay captains for the quarterly peace and order council meeting.",
    "Letter", "Peace and order", ["peace and order", "barangay captains", "meeting"], "normal", "public",
    "All Punong Barangays", "Barangays of Baguio City", "email", 7, "CMO", None,
    [(0, "done", None, "ro", "Signed by the City Mayor", None),
     (0, "out", None, "ro", "Sent by email to 129 barangays", None)])
rec("incoming", "Request for budget realignment for scholarship program",
    "Scholarship office asks to realign savings to cover more college grantees.",
    "Memorandum", "Finance", ["budget", "realignment", "scholarship"], "normal", "internal",
    "Scholarship Coordinator", "City Scholarship Office", "internal", 11, "CMO", 18,
    [(0, "fwd", "CBO", "ro", "Forwarded for review", None),
     (2, "rcv", None, "bo", "Received by Budget Office", None)])
rec("incoming", "Water interruption advisory affecting City Hall",
    "Water district advises of a 12-hour interruption for pipe repair.",
    "Memorandum", "Administration", ["water", "interruption", "advisory"], "low", "public",
    "Public Relations Officer", "Baguio Water District", "email", 13, "CMO", None,
    [(0, "fwd", "CAO", "ro", "Forwarded for information", None),
     (0, "rcv", None, "ca", "Received", None),
     (1, "done", None, "ca", "Advisory posted at all entrances", None)])
rec("incoming", "Request for a copy of the Comprehensive Land Use Plan by a graduate student",
    "Student asks for the land use maps for a thesis on urban growth.",
    "Request", "Planning", ["clup", "land use", "student", "research"], "low", "public",
    "Mr. Kevin Dalisay", "University of the Philippines Baguio", "email", 3, "CMO", 15,
    [(0, "fwd", "CPDO", "ro", "Forwarded for reply", None)])
rec("incoming", "Notice of salary adjustment under the new salary standardization law",
    "Department of Budget and Management circular on the 2027 salary adjustment.",
    "Memorandum", "Human resources", ["salary", "standardization", "dbm", "circular"], "normal", "public",
    "Regional Director", "DBM Cordillera Regional Office", "courier", 6, "CMO", 20,
    [(0, "fwd", "HRMO", "ro", "Forwarded for implementation", None),
     (1, "rcv", None, "hr", "Received by HRMO", None),
     (2, "fwd", "CBO", "hr", "Forwarded for budget impact", "Please estimate the cost for 2027."),
     (3, "rcv", None, "bo", "Received by Budget Office", None)])

STATUS = {"fwd": "forwarded", "rcv": "received", "act": "under_action", "done": "completed", "out": "released", "arch": "archived"}

print("-- Generated by supabase/tools/gen_more_seed.py. Fictional demo data: more people, records and histories.")
print("-- Safe to run more than once: it stops if these records already exist.\n")
print("do $$\ndeclare\n  u record;\n  v_id uuid;\nbegin")
print("  for u in select * from (values")
print(",\n".join(f"    ({q(e)}, {q(n)}, {q(r)}::public.rms_role, {q(o)})" for _, e, n, r, o in USERS))
print("  ) as t(email, full_name, role, office_code)\n  loop")
print("""    select id into v_id from auth.users where email = u.email;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
              extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"],"app":"rms"}', jsonb_build_object('full_name', u.full_name),
              now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true),
              'email', now(), now(), now());
    end if;
    insert into public.rms_profiles (id, full_name, role, office_id)
    values (v_id, u.full_name, u.role, (select id from public.rms_offices where code = u.office_code))
    on conflict (id) do nothing;
  end loop;
end $$;
""")

emails = dict(EXISTING, **{k: e for k, e, *_ in USERS})
import json
data = []
for x in sorted(R, key=lambda x: -x["days_ago"]):  # oldest first, so tracking numbers follow the logging order
    for d, *_ in x["steps"]:
        if d >= x["days_ago"]:
            raise SystemExit(f"step not in the past: {x['subject']}")
    data.append({
        "dir": x["direction"], "sub": x["subject"], "desc": x["desc"], "type": x["dtype"], "cat": x["cat"], "kw": x["kw"],
        "prio": x["prio"], "conf": x["conf"], "name": x["name"], "org": x["org"], "mode": x["mode"], "ago": x["days_ago"],
        "origin": x["origin"], "due": x["due"], "by": x["steps"][0][3] if x["origin"] != "CMO" else "ro",
        "steps": [[d, k, to, a, act, rem] for d, k, to, a, act, rem in x["steps"]],
    })
users = {k: e for k, e in emails.items()}
print("do $do$\ndeclare")
print("  umap jsonb := " + q(json.dumps(users, ensure_ascii=False, separators=(",", ":"))) + ";")
print("  recs jsonb := " + q(json.dumps(data, ensure_ascii=False, separators=(",", ":"))) + ";")
print("""  st jsonb := '{"fwd":"forwarded","rcv":"received","act":"under_action","done":"completed","out":"released","arch":"archived"}';
  x jsonb; s jsonb; r uuid; cur text; dest text; created timestamptz; i int;
  uid jsonb := '{}';
  k text;
begin
  if exists (select 1 from public.rms_records where subject = recs->0->>'sub') then return; end if;
  for k in select jsonb_object_keys(umap) loop
    uid := uid || jsonb_build_object(k, (select id from auth.users where email = umap->>k));
  end loop;
  for x in select * from jsonb_array_elements(recs) loop
    created := now() - make_interval(days => (x->>'ago')::int) - make_interval(mins => (length(x->>'sub') * 7) % 300);
    insert into public.rms_records (direction, subject, description, document_type_id, category, keywords, priority, confidentiality,
      sender_name, sender_org, recipient_name, recipient_org, mode, document_date, origin_office_id, due_date, created_by, created_at)
    values ((x->>'dir')::public.rms_direction, x->>'sub', x->>'desc',
      (select id from public.rms_document_types where name = x->>'type'), x->>'cat',
      array(select jsonb_array_elements_text(x->'kw')), (x->>'prio')::public.rms_priority, (x->>'conf')::public.rms_confidentiality,
      case when x->>'dir' = 'incoming' then x->>'name' end, case when x->>'dir' = 'incoming' then x->>'org' end,
      case when x->>'dir' = 'outgoing' then x->>'name' end, case when x->>'dir' = 'outgoing' then x->>'org' end,
      x->>'mode', (created at time zone 'Asia/Manila')::date - 1,
      (select id from public.rms_offices where code = x->>'origin'),
      case when x->>'due' is not null then (created at time zone 'Asia/Manila')::date + (x->>'due')::int end,
      (uid->>(x->>'by'))::uuid, created)
    returning id into r;
    cur := x->>'origin';
    i := 0;
    for s in select * from jsonb_array_elements(x->'steps') loop
      dest := case when s->>1 = 'fwd' then s->>2 else cur end;
      insert into public.rms_routes (record_id, from_office_id, to_office_id, status, action_taken, remarks, acted_by, created_at)
      values (r, (select id from public.rms_offices where code = cur), (select id from public.rms_offices where code = dest),
        coalesce((st->>(s->>1))::public.rms_status, (select status from public.rms_records where id = r)),
        s->>4, s->>5, (uid->>(s->>3))::uuid,
        created + make_interval(days => (s->>0)::int, mins => 30 + i * 50));
      cur := dest;
      i := i + 1;
    end loop;
  end loop;
end $do$;""")
