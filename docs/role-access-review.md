# Role access review (2026-11-26)

What each role can reach, checked in the UI and in the database (RLS policies, `security definer` RPC guards).
Search, reports, the map and the assistant's sources all run as the signed-in user (`security invoker`
or RLS), so they show exactly the records in the Records column.

| Role (demo accounts) | Records (RLS `rms_records_select`, `rms_can_view`) | Attachments | Pages in the menu | Reports | Audit log, access history |
| --- | --- | --- | --- | --- | --- |
| Administrator (`admin@`) | all except confidential (incl. deleted); Bin lists confidential ones with the subject hidden | all except confidential | Security, Users, Offices, Access history, Audit log, Analytics, Records, Bin, Settings | all (not in menu) | yes |
| Records Officer, CGSO desk (`records@`) | all, incl. confidential (custodian) | all | Dashboard, Records, Register, Boxes, Map, Reports | all incl. retention, step times, logbook | no |
| Head (`*.head@`, 21) | own office's (incl. confidential), plus public/internal routed to them | same as records | Dashboard, Records, Register, Map*, Reports | summary, office workload, satisfaction*, logbook* | no |
| Head, CMO / CAO (`cmo.head@`, `cao.head@`) | as Head, plus read-only city view with confidential subjects masked | as Head | as Head | as Head | no |
| Head, HRMO (`hrmo.head@`) | as Head, plus city-wide satisfaction | as Head | as Head | as Head + city CSS | no |
| Head, CLO (`legal.head@`) | as Head, decides copy requests (DPO) | as Head | as Head | as Head | no |
| Window clerk (`*.window@`, 13) | own office non-confidential, plus confidential they logged at the window | same | Dashboard, Records, Register, Map* | none | no |
| Staff (`*.staff@`, `admin.office@`) | own office non-confidential, plus routed public/internal | same | Dashboard, Records, Register, Map* | none (HRMO window staff: satisfaction) | no |
| Viewer (`viewer@`, City Planning) | own office non-confidential, plus routed public/internal; read only | same | Dashboard, Records, Map*, Reports | summary | no (was yes until 2026-11-26) |
| Auditor (`auditor@`, new, no office) | none | none | Audit log, Access history | none | yes |

`*` when the office has the feature switched on in /admin/offices.

## Findings

1. Too broad (fixed by `supabase/seed_auditor.sql`, applied 2026-11-26): the QA-097 auditor flag sat on the City
   Planning viewer, so a planning clerk could read the full audit trail and everyone's access history.
   The flag moves to a separate `auditor@` account with no office.
2. Too broad (`20261126000100`, applied 2026-11-26 with `is_auditor` added to the column grant): table-level SELECT on `rms_profiles` is still granted
   live, so any signed-in user can read every account's `last_login_at` and `failed_attempts` through the API.
3. Gap (fixed in app): the admin Users screen could not see or set the auditor flag, had no "no office"
   choice, and changing an auditor's role failed silently (the database refuses `is_auditor` on non-viewers).
4. Too broad (Vic chose "list only, confidential masked"; `20261126000500`, applied 2026-11-26): the Administrator read every
   confidential record, file and assistant answer although the role does no records work. Now hidden in the
   database; the Bin and the audit log show confidential entries with details hidden. Raw audit rows still hold
   the old values (the hash chain cannot be edited), so an admin calling the API directly could read them.
5. Open question: the DPO (City Legal head) cannot run the "who viewed this person's records" report needed
   for data subject requests; only admin and auditor can.
6. Low: `admin@` is attached to the City Mayor's Office (no effect on access, admin already sees all).
7. Fine as designed: records desk reads confidential records (custodian); boxes readable by every office
   role (locations only); settings readable by all (no secrets).
