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

## Weekly check (ask Claude: "check my usage")

- Compare Vic's Settings > Usage numbers with the last row above.
- List active threads and scheduled tasks; flag any long or idle-firing ones.
- Add a row and one recommendation.
