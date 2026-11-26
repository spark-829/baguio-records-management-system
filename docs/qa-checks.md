# QA checks: one owner per check

Every control is checked once, by the cheapest layer that can catch it.
If a check has an owner below, nobody else repeats it. The tester brief
(`qa/brief.md` in the project files) and the nightly QA task point here.

## Layers

| Layer | When | Checks it owns |
| --- | --- | --- |
| **reviewer** agent | every PR, before merge | Correctness, security in the diff (RLS, roles, input, secrets), tests, and the diff-only design items: `t()` strings with a Filipino line, tokens instead of raw colours, D-WEIGHT-1. No browser runs. |
| **designer** agent | before a UI change | The design spec, and live-page design reviews when Vic asks. Runs `npm run design-check` only on the pages in scope. |
| **regression** (scripted, nightly) | every run, first | All `qa/regression/*.js` scripts (re-test of every fixed finding) and `npm run design-check` on the 5 smoke pages **plus** every page changed since the last run. This is the only routine run of the automated design and WCAG checks on the live site. |
| **one tester** (Sonnet, nightly) | after regression | The manual checks of its group below, on changed areas plus its group's 5 riskiest flows. |

## Tester groups (rotate one per night)

Each role owns distinct checks. Roles that tested the same thing were merged.

| Group | Role | Owns |
| --- | --- | --- |
| A security | outside attacker (was pen tester + outside malicious actor) | Signed-out attacks: API and RPC calls, auth, rate limits, headers, public `/track`, file URLs |
| A security | malicious employee | Signed-in abuse: other offices' records, role escalation, tampering, bin and restore misuse |
| A security | Data Privacy Officer | DPA: masking, consent, access reports, retention, AI redaction |
| B core work | everyday staff (was normal user + older non-technical user) | Register, receive, route, act and remark in plain office words (also covers D-LANG-1, D-ERROR-1, D-STATUS-1 on these flows) |
| B core work | records officer | Records desk volume work: search, file plan, boxes, release, reports |
| B core work | department head | Assign, approve, overdue and on-time views |
| B core work | COA-style auditor | Audit chain, history and reports add up (not privacy: that is the DPO) |
| B core work | citizen | `/track` and receipts on a phone |
| C people and devices | user with disability | Keyboard-only and screen-reader use, focus order, D-OBSCURE-1. Not contrast, labels or target size: the script checks those. |
| C people and devices | phone on slow connection (was mobile user + gentle performance) | Throttled loads, Error 1102 rate, offline and retry behaviour. Max 2 parallel, under 100 requests. Not layout at 375px: the script checks that. |
| D polish | design checker | Only the non-auto checklist items (D-HIER-1, D-CONSIST-1, D-EMPTY-1, D-DESTROY-1, D-GENERIC-1) on at most 3 screenshots, using the designer agent's review format. Does not re-run `design-check`. |

## Rules that stop repeats

- A fix is re-tested by its regression script, never by a tester. It
  closes when the script passes on two nights.
- Testers never report what the script reports (any `axe:*` or auto
  `D-*` ID) and never re-report open rows of `qa/findings.md`.
- A full sweep (only when Vic asks) visits each page once per viewport:
  one crawl collects page text, `design-check` and phone layout together,
  then each group works from that crawl instead of loading the pages again.
  The security group works through the API, not page visits.
- Rules for testers (no DoS, no hard deletes, `[QA]` subjects, AI call
  cap and so on) live only in `qa/brief.md`.
