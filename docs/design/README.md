# Design guides

| File | Use it for |
| --- | --- |
| `principles.md` | The rules, digested from NN/g, WCAG 2.2, GOV.UK, USWDS, Vercel, Refactoring UI, Material, Apple HIG and Anthropic's frontend-design skill. Read only the section you need. |
| `checklist.md` | Testable checks with IDs, used by the designer, reviewer and QA. |
| `../../scripts/design-check/check.mjs` | `npm run design-check`: axe-core WCAG 2.2 scan plus house checks, phone and desktop. |

Installed design skills (vendored copies, upstream pinned below):

| Skill | What it adds | Upstream |
| --- | --- | --- |
| `.claude/skills/impeccable/` | Impeccable 4.8.0: design playbooks (critique, audit, polish, clarify, harden, adapt...) and an anti-generic "craft floor". Reads `PRODUCT.md` and `DESIGN.md` at the repo root. | Vic's "impeccable-taste" set, copied from spark-829/bebetterwellcenter_website @ 2a741ce (installed there from bergside/awesome-design-skills; original pbakaus/impeccable, Apache 2.0). Windows engine binary left out. |
| `.claude/skills/design-taste-frontend/` | tasteskill v2: anti-slop art direction and a look-and-fix loop; `references/app-screens.md` has the rules for dashboards and admin screens. | Same source (installed there from Leonxlnx/taste-skill). |
| `.claude/skills/ui-ux-pro-max/` | UI/UX Pro Max 2.15.0: 141 UX guidelines, palettes, type pairings, chart and stack guidance as searchable CSV. | github.com/nextlevelbuilder/ui-ux-pro-max-skill @ 4f2dbb6 (MIT) |

Notes: Impeccable's detector engine (`scripts/impeccable`) downloads a
checksum-verified binary from its GitHub releases on first run; Claude
cloud sessions block running it, so agents read the playbooks instead.
Do not use `impeccable live` (it can start an agent with permission checks
off). Per Vic's production rule, have an independent AI scan these folders
before any real deployment.

Tokens (colours with contrast ratios, type scale, button and input styles)
live in `src/app/globals.css`. Change them there, not in components.

Who does what:

- **designer** agent (`.claude/agents/designer.md`): writes a short design
  spec for UI work, citing the principle and the proven app pattern, before
  the planner plans it. Also does design reviews of live pages.
- **reviewer** agent: runs the checklist on any diff that touches `.tsx` or
  CSS.
- **QA design checker**: runs `npm run design-check` against the live site
  and reviews screenshots against the checklist in the nightly rotation.
