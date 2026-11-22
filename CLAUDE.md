# CLAUDE.md

Baguio City Records Management System demo: Next.js on Cloudflare Workers
(OpenNext), Supabase for database and auth, Vitest for tests.

Commands: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## Model pipeline: plan -> implement -> review

For any task that changes code (features, bug fixes, refactors), route the
work through the three subagents in `.claude/agents/` instead of doing it all
in the main session:

1. **planner** (Opus 5.5): send it the task and any context from the user.
   It returns a plan with Goal, Files, Steps, Tests and Risks.
2. **implementer** (Sonnet 5.5): send it the planner's full plan, word for
   word. It edits the code and runs lint and tests.
3. **reviewer** (Opus 5.5): send it the plan plus the implementer's report.
   It reviews `git diff` and ends with `VERDICT: APPROVE` or
   `VERDICT: CHANGES REQUESTED`.
4. If changes are requested, send the reviewer's fix list to the
   implementer, then review again. Stop after 3 review rounds and report
   what is still open to the user.
5. Only commit, push or open a PR after `VERDICT: APPROVE`.

Skip the pipeline for questions, explanations, one-line edits (typos, copy
changes, config values) and pure documentation. Say in one line when you
skip it.

The main session's job is to coordinate: pass full context between agents
(each starts with none of the conversation), and summarize the result for
the user.
