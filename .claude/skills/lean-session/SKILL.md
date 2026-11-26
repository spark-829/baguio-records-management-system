---
name: lean-session
description: Keep threads short and cheap. Every message re-reads the whole thread, so long threads full of screenshots and tool output burn tokens fast. Use at the start of every thread, when a topic is finished or blocked, when Vic switches topic, when the thread has many screenshots or more than about 25 back-and-forth turns, before any multi-step build or QA run (plan it in the fewest turns), and when Vic says wrap up, hand off, new thread, save tokens, or the thread feels slow or expensive.
---

# Lean session

Each new message makes Claude re-read the entire thread, including every
screenshot and long tool output. Cost grows with every turn, so the cheapest
habit is: **one topic per thread, handed off cleanly, then start fresh.**
The always-on rules are in `CLAUDE.md` under "Saving tokens"; this skill is
the how-to for starting and ending a thread.

## At the start of a thread
1. Read `CLAUDE.md`, then `docs/codebase-map.md` for where things live. Open
   other docs only for the part you need, with Grep or an offset/limit read.
2. Confirm the single topic in one line. If a second topic arrives, finish or
   hand off the first, then suggest a fresh thread for the second.

## While working: keep the context small
- **Text over screenshots.** Ask Vic for pasted error text or a one-line
  description, not a screenshot. For pages, use page text, the accessibility
  tree or `npm run design-check` PASS/FAIL output first; screenshot only what
  must be judged by eye, at deviceScaleFactor 1, cropped to the part that
  matters. One screenshot costs more than a page of text, every turn after it.
- **Batch Vic's clicks.** Give all the steps for a stage at once with a check
  after each, and ask for one reply at the end ("reply: step 1 ok, step 2
  error ..."), not a screenshot after every click.
- **Prefer code over clicking.** If something needs many manual clicks or
  repeated tool calls, write a script that does it once and prints only
  PASS/FAIL lines.
- **Trim tool output.** `tail -n 40` / `grep`, query only the needed columns,
  never print whole files, seed SQL, JSON payloads or logs.
- **Don't re-read** files already in context; edit by exact strings. Load
  skills and tool schemas once.
- **Loops over many items** (records, QA cases, pages): read the instructions
  once, not per item; no commentary between items; write one result line per
  item to a log file; on something unclear, mark that item STOPPED with the
  reason and go on.
- **No exploring for its own sake.** Search with a precise query; stop when
  you have enough.

## When to hand off (any of these)
- The topic is done, or blocked waiting on Vic.
- About 25+ turns, or 5+ screenshots, in this thread (CLAUDE.md's hard
  limit: about 2 days or 40 turns).
- Vic says "wrap up", "save tokens", "new thread", or switches topic.

## Hand-off procedure
1. Write lasting facts where the next thread will find them: `docs/` (and
   `docs/codebase-map.md` if files moved), or project memory for preferences.
   Not in the thread.
2. Big thread? Add a row to `docs/token-usage.md` with one recommendation.
3. Tell Vic, short:
   - what is done (2-3 lines) and the PR link,
   - what Vic does next, if anything,
   - a ready-to-paste opener for the next thread, for example:
     `Continue the records search fix: read CLAUDE.md and docs/codebase-map.md, then finish QA-112.`
4. Recommend starting that fresh thread.

## Honest limit
This skill relies on Claude noticing the thread is long; it does not measure
tokens. Real usage is on claude.ai under Settings, then Usage.
