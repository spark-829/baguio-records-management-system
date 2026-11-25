# Design principles

The rules this app is designed and reviewed against. Each section is a short
digest of a published, widely used source (links at the end). Read the
section you need, not the whole file. Testable checks with IDs are in
`checklist.md`.

Who we design for: City Hall staff, many of them long-time employees who
used paper logbooks, plus citizens on phones checking `/track`. Plain,
calm and obvious beats clever.

## 1. Usability heuristics (Nielsen Norman Group, 10 heuristics)

1. **Show system status.** Every action gets feedback within a second:
   "Saving…", a success message, the new status badge. Long work shows
   progress.
2. **Match the real world.** Use the office's words (log, route, receive,
   routing slip), not database words. Dates read "Nov 24, 2026".
3. **User control and freedom.** Clear Back/Cancel, Undo or a bin for
   destructive steps, no dead ends.
4. **Consistency and standards.** Same word, colour and place for the same
   thing on every page. Follow platform conventions (links underlined,
   primary button on the right of a form's action row or full width on
   phones).
5. **Error prevention.** Constrain input (pick lists, date pickers), confirm
   destructive steps, warn about unsaved changes.
6. **Recognition over recall.** Show options, recent items and examples.
   Never make people remember a code from another screen.
7. **Flexibility and efficiency.** Shortcuts (QR scan, search, keyboard)
   for power users that do not get in the way of new users.
8. **Aesthetic and minimalist design.** Every element competes for
   attention. Remove what does not help the task on this screen.
9. **Help users recover from errors.** Plain-language message, what went
   wrong, how to fix it, next to the field.
10. **Help and documentation.** Inline hints first; `/help` is task based.

## 2. Accessibility (WCAG 2.2 level AA, W3C)

The legal and ethical floor. The ones this app most often trips on:

- **1.4.3 / 1.4.11 Contrast.** Text 4.5:1 (large text 3:1); borders of
  inputs, focus rings and icons 3:1. Tokens in `src/app/globals.css` list
  their ratios; use them, do not invent greys.
- **1.4.1 Use of colour.** Status is never colour only: badges have words,
  calendar dots have a legend and a text list.
- **1.4.4 / 1.4.10 Resize and reflow.** Works at 200% zoom and at 320px wide
  without sideways scrolling (tables may scroll inside their own box).
- **1.4.12 Text spacing.** No fixed heights that clip text when spacing
  grows.
- **2.4.3 / 2.4.7 Focus order and visible focus.** Tab order follows the
  reading order; the 3px focus ring stays.
- **2.4.11 Focus not obscured (new in 2.2).** Sticky bars and the assistant
  button must never cover the focused field or the last content
  (hence `scroll-padding-bottom` and the footer's bottom padding).
- **2.5.3 Label in name.** An `aria-label` starts with the visible text.
- **2.5.8 Target size (new in 2.2).** At least 24×24px, or spaced so a 24px
  circle does not touch another target. House rule is stricter: 44px on
  phones.
- **3.2.6 Consistent help (new in 2.2).** Help is in the same place on
  every page.
- **3.3.1 / 3.3.3 Errors.** Identify the field in words and suggest a fix.
- **3.3.7 Redundant entry (new in 2.2).** Do not ask for the same data
  twice in one process; prefill it.
- **3.3.8 Accessible authentication (new in 2.2).** No puzzles to sign in;
  paste and password managers work.
- **4.1.2 Name, role, value.** Native elements first (`button`, `a`,
  `label`, `table`), ARIA only to fill gaps.

## 3. Government service patterns (GOV.UK Design System, USWDS)

Both are built for the public sector and tested with millions of users,
including older and low-literacy users. Borrow freely.

- **Start with user needs.** Each page has one job; say it in the `h1`.
- **One thing per page** for long or unfamiliar forms (question pages).
  Short forms for daily staff work can stay on one page, grouped with
  `fieldset` + `legend`.
- **Labels above fields**, hint text under the label, never a placeholder
  as the only label.
- **Error summary** at the top on submit (linked to each field) plus an
  inline message on the field; move focus to the summary.
- **Buttons say what they do** ("Save record", not "Submit"). One primary
  button per screen area; secondary actions look secondary; destructive
  actions are red and confirmed.
- **Plain language.** Sentence case, short sentences, active voice, no
  jargon or acronyms without the full name. Write for a reading age of
  about 12. Front-load the important words.
- **Tables** are for comparing data, with a caption or heading, numbers
  right aligned with tabular figures. On phones, let the table scroll in
  its own box or switch to a stacked list.
- **Status and tags**: short words in a coloured tag, colour from a small
  fixed set, the same word means the same state everywhere.
- **Notification banners** for things the user must know now; do not
  stack several.
- **Service header and footer** are identical on every page; the footer
  carries the "Demo system" notice.

## 4. Interface craft (Vercel Web Interface Guidelines)

- Inputs at least 16px text on phones (stops iOS zoom); never disable zoom.
- Loading buttons keep their label and show "Saving…"; keep submit enabled
  until the request starts.
- Errors inline next to fields; on submit focus the first error.
- `autocomplete`, correct `type` and `inputmode` on every field; never
  block paste.
- The URL reflects state: filters, tabs and pages are deep-linkable. Search and filter forms use `next/form` (`<Form action="/path" prefetch={false}>`), never a plain `<form method="get">`, so a search keeps the page on screen instead of a full white reload.
- Page changes keep the current page visible and show the thin mint bar at the top (`NavProgress`) until the next page is ready; no full-page skeletons that blank the screen.
- Links are `<a>`/`<Link>`; never a `div` with `onClick` for navigation.
- Confirm destructive actions or give an Undo window.
- Honour `prefers-reduced-motion`; animate only `transform` and `opacity`;
  never `transition: all`.
- Design empty, sparse, dense and error states. Long names and subjects
  wrap or truncate cleanly (`min-w-0`, `break-words`).
- `tabular-nums` where numbers are compared; locale-aware dates via
  `Intl`; use the `…` character.
- `<title>` matches the page; one `h1`; skip link to main content.
- Hover, active and focus states increase contrast.

## 5. Visual hierarchy and layout (Refactoring UI, Material, Apple HIG)

- **Hierarchy through weight and colour first, size second.** Primary text
  dark, secondary text slate-600, never lighter than the AA tokens.
- **Spacing scale**, not ad-hoc pixels: Tailwind steps 1, 2, 3, 4, 6, 8, 12.
  More space between groups than within them (proximity).
- **Limited palette**: city teal for primary actions and links, mint for
  accent stripes and highlights, red only for late/destructive, amber for
  warnings, emerald for done. No new hues without a reason.
- **Type scale** is fixed in `globals.css` (15, 17, 18, 21, 24, 30, 36px).
  Body 18px. Nothing below 15px. Line length 45 to 80 characters for
  reading text (`max-w-prose`).
- **Alignment**: left-align text and forms; centre only short, standalone
  items (empty states, one-line confirmations).
- **Cards** only to group related content, not as decoration for every
  block. Not every section needs a border and a shadow.
- **Touch targets** 44px (Apple HIG) / 48dp (Material) on phones, with 8px
  between neighbours.
- **Icons** support a text label; icon-only buttons need an `aria-label`
  and should be rare.
- **Motion** only to show what changed after a user action.

## 6. Avoid the generic look (Anthropic frontend-design skill)

Generated UIs drift to the same defaults. Do not add these unless the
content needs them: identical rounded cards with the same shadow for every
block, ALL-CAPS eyebrow labels over each heading, gradient washes,
"→" appended to every link, numbered 01/02/03 markers on things that are
not a sequence, fade-up animation on every section. Visual structure is
information: a border, number or label must say something about the
content.

## 7. House constraints (this project)

- **Older, non-technical staff first**: 18px body, plain labels, big
  targets, help nearby (see project memory "design direction").
- **Baguio City look without official marks**: the baguio.gov.ph teal and mint palette, no
  seal or logo files, keep the "Demo system" footer note.
- **Cloudflare free plan CPU budget**: design changes must not make pages
  heavier. Prefer CSS over client JavaScript, no new UI libraries, no web
  fonts, no large images, no extra server queries for decoration.
- **Bilingual**: every visible string goes through `t()` with a Filipino
  line; Filipino runs about 30% longer, so leave room.
- **Proven patterns** (Vic's rule): name the app or design system a
  pattern comes from when proposing it.
- **App shell**: GOV.UK header over a white service-nav bar. The assistant has one entry point on every page and for every role: a labelled "Ask the assistant" button fixed bottom-right (never icon-only), hidden while its panel is open. The panel is full height on the right: docked and pushing the page (non-modal; Esc closes it only from inside) from 1280px; a modal sheet from 640 to 1279px; full screen on phones. The page keeps bottom padding so the button never covers the last content or a sticky action bar.

## Sources

- Nielsen Norman Group, "10 Usability Heuristics for User Interface
  Design": https://www.nngroup.com/articles/ten-usability-heuristics/
- W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/ and "What's new in 2.2":
  https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- GOV.UK Design System: https://design-system.service.gov.uk/ and
  GOV.UK content style guide: https://www.gov.uk/guidance/content-design
- U.S. Web Design System: https://designsystem.digital.gov/
- Vercel Web Interface Guidelines:
  https://github.com/vercel-labs/web-interface-guidelines
- Anthropic `frontend-design` skill:
  https://github.com/anthropics/skills/tree/main/skills/frontend-design
- Refactoring UI (Wathan and Schoger): https://www.refactoringui.com/
- Material Design 3, accessibility and layout: https://m3.material.io/
- Apple Human Interface Guidelines, accessibility:
  https://developer.apple.com/design/human-interface-guidelines/accessibility
- Deque axe-core (the rule engine `npm run design-check` runs):
  https://github.com/dequelabs/axe-core
