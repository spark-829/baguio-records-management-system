# Token usage log

Claude cannot read exact token counts. Vic can see real usage on claude.ai
under Settings, then Usage. This file tracks what drives usage and what to do.

## Biggest drivers (checked 2026-11-24)

1. Scheduled QA wakes: each wake reloads the long QA thread history.
2. Long-lived threads (build, QA, resilience) re-read everything per message.
3. Several threads working at once, plus 3-agent pipeline runs per change.
4. Opus used for routine checks.

## Rules now in force

See "Saving tokens" in `CLAUDE.md`. QA schedule cut on 2026-11-24 from 24
wakes a day to 6.

## Log

| Date | Observation | Recommendation | Done? |
|---|---|---|---|
| 2026-11-24 | QA tasks woke ~24x/day; old threads very long | Cut QA wakes, start fresh threads, one big thread at a time | QA cut done; fresh threads pending |
| 2026-11-24 | Admin hub thread (PR #67): designer, planner, implementer (2 rounds), reviewer (2 rounds) used ~660k subagent tokens; the planner alone was ~160k | For features with a written design spec, have the planner return a shorter plan (no full SQL bodies) and let the implementer write the SQL | Open |
| 2026-11-25 | Citizen's Charter thread (PR #69, 5 phases): designer, planner, implementers per phase, reviewer 2 rounds, 3 Sonnet QA testers (~300k tokens for QA alone); thread past 40 turns | Batch several phases into one plan and one QA run (done here, worked well); start a fresh thread for the QA-049/050 follow-ups | Open |
| 2026-11-25 | Features per department thread (PR #73): charter PDF extraction (Sonnet), designer, planner (~180k), implementer 5 rounds (~290k), reviewer 4 rounds, 2 QA testers + 2 re-tests, SQL applied by Sonnet agents; thread past 40 turns | Apply big generated SQL through a Sonnet agent reading the file (kept the main context small); never put a test BEGIN/ROLLBACK in the same call as DDL; start a fresh thread for follow-ups | Open |

## Weekly check (ask Claude: "check my usage")

- Compare Vic's Settings > Usage numbers with the last row above.
- List active threads and scheduled tasks; flag any long or idle-firing ones.
- Add a row and one recommendation.
