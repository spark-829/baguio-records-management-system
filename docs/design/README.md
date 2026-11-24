# Design guides

| File | Use it for |
| --- | --- |
| `principles.md` | The rules, digested from NN/g, WCAG 2.2, GOV.UK, USWDS, Vercel, Refactoring UI, Material, Apple HIG and Anthropic's frontend-design skill. Read only the section you need. |
| `checklist.md` | Testable checks with IDs, used by the designer, reviewer and QA. |
| `../../scripts/design-check/check.mjs` | `npm run design-check`: axe-core WCAG 2.2 scan plus house checks, phone and desktop. |

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
