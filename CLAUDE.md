# CLAUDE.md

Baguio City Records Management System demo. Next.js 15 (App Router, TS) on
Cloudflare Workers via OpenNext, Supabase (Postgres, Auth, Storage, RLS),
DeepSeek for AI, Vitest for tests.

**Start with `docs/codebase-map.md`.** It says where everything lives, so you
do not need to explore the tree.

## Commands

- `npx tsc --noEmit` and `npm run lint` (type check, lint)
- `npm test` (all tests), `npx vitest run tests/<name>.test.ts` (one file)
- `npm run build` only when routing, config or server/client boundaries change

## Saving tokens (follow always)

- Read only the files the task needs. Find code with Grep (`-n`, a tight
  `glob`) and read the matching range with `offset`/`limit`, not whole files.
- Never read: `package-lock.json`, `node_modules/`, `.next/`, `.open-next/`,
  `.wrangler/`, binaries in `public/`. Seed SQL and `src/lib/i18n/fil.ts`
  (700+ lines): grep them, do not read them.
- Do not re-read a file you just edited or already read this session.
- For SQL, read only the latest migration that defines the object (the map
  lists them). Older migrations are history.
- Pipe noisy commands through `tail -n 40` or `grep`; show only failures.
- Keep replies short: the result, what changed, anything left. No replaying
  of tool output.

## Conventions

- All tables and SQL functions are prefixed `rms_`. Access rules live in the
  database (RLS + guard triggers); the app uses the signed-in user's client,
  never a service key. New tables need RLS and audit triggers.
- Schema changes: new file `supabase/migrations/YYYYMMDDHHMMSS_rms_<what>.sql`,
  idempotent (`create or replace`, `if not exists`, `DO` blocks). Avoid
  `DROP`/`DELETE` statements.
- UI text is English in code, wrapped in `t("...")` (`getT()` on the server,
  `useT()` on the client). Add the Filipino line to `src/lib/i18n/fil.ts`.
- AI calls go through `runAi()` in `src/lib/ai-gate.ts` (budget, cache,
  demo fallback). Never call DeepSeek directly from a route.
- Pure logic goes in `src/lib/` with a test in `tests/`.
- Design: follow `docs/design/principles.md`; UI diffs must pass
  `docs/design/checklist.md` (`npm run design-check` for the automated half).

## Model pipeline: plan -> implement -> review

For code changes (features, bug fixes, refactors) use the subagents in
`.claude/agents/`:

0. **designer** (Opus 5.5), only for screens, layout, copy or styling:
   returns a design spec grounded in `docs/design/`. Pass it to the planner.
1. **planner** (Opus 5.5): task + user context. Returns Goal, Files, Steps,
   Tests, Risks.
2. **implementer** (Sonnet 5.5): the full plan, word for word. Edits code,
   runs checks.
3. **reviewer** (Opus 5.5): the plan + implementer's report. Reviews
   `git diff`, ends with `VERDICT: APPROVE` or `VERDICT: CHANGES REQUESTED`.
4. On changes requested, send the fix list to the implementer, review again.
   Stop after 3 rounds and report what is open.
5. Commit, push or open a PR only after `VERDICT: APPROVE`.

Small fixes in one file with an obvious change: the main session writes a
short plan itself and skips the planner. Skip the whole pipeline for
questions, one-line edits, config values and pure docs; say so in one line.

When briefing an agent, give file paths and line ranges, not pasted file
contents; it can read them itself.
