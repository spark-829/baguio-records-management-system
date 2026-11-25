---
name: Baguio RMS
description: City records system for City Hall staff and citizens
colors:
  brand-50: "#ebf7f4"
  brand-100: "#d6efe9"
  brand-200: "#addfd3"
  brand-600: "#288c75"
  brand-700: "#1f7360"
  brand-800: "#1c373e"
  brand-900: "#0f342c"
  gold-100: "#d6efe9"
  gold-300: "#addfd3"
  gold-500: "#addfd3"
  gold-800: "#0f342c"
  slate-400: "#4f6a86"
  slate-500: "#355c87"
  slate-600: "#2a4a6c"
  input-border: "#7d8b99"
  page: "#ebeff3"
  line: "#d3dbe3"
  ink: "#404040"
  surface: "#ffffff"
typography:
  body:
    fontFamily: "Segoe UI, Noto Sans, Roboto, Helvetica Neue, Arial, system-ui, sans-serif"
    fontSize: "1.125rem"
    lineHeight: 1.6
  small:
    fontSize: "1.0625rem"
    lineHeight: 1.55
  smallest:
    fontSize: "0.9375rem"
    lineHeight: 1.45
  h-lg:
    fontSize: "1.3125rem"
  h-xl:
    fontSize: "1.5rem"
  h-2xl:
    fontSize: "1.875rem"
  h-3xl:
    fontSize: "2.25rem"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, Segoe UI Mono, Menlo, Consolas, monospace"
rounded:
  md: "6px"
  lg: "8px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-700}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.brand-800}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand-800}"
    rounded: "{rounded.md}"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.lg}"
  header:
    backgroundColor: "{colors.brand-800}"
    textColor: "{colors.surface}"
---

# Design System: Baguio RMS

Source of truth for tokens is `src/app/globals.css` (with contrast ratios);
rules and checks are in `docs/design/principles.md` and
`docs/design/checklist.md`. This file is the summary Impeccable reads.

## Overview
An Operate-mode tool for City Hall staff, plus a Read-mode public tracking
page. Calm, civic and plain: dark teal header with a mint stripe (the
baguio.gov.ph palette), cool grey page, white content cards, large type. Ambition shows as
precision and restraint, not decoration.

## Colors
### Primary
City teal from baguio.gov.ph, for every office and role (`brand-700`
#1f7360 buttons and links, `brand-800` #1c373e header, `brand-900` #0f342c
headings). White on brand-700 is 5.7:1. `brand-600` #288c75 is 4.1:1 on
white: large text, borders and accents only.

### Secondary
Mint (the `gold-*` token names are kept so classes stay stable; the city
site has no gold): `gold-500` #addfd3 for the header stripe and highlights,
`gold-800` on `gold-100` for text (11.2:1). Never mint text on white.
### Neutral
`ink` #404040 on `page` #ebeff3 for body (9:1). Secondary text
`slate-500`/`slate-600` (city navy, 4.9 to 9.2:1). No lighter greys for text.
`line` (#d3dbe3) for card edges and dividers; decorative (1.4:1), never the only signal.
### Named Rules
- Status colours are fixed: red = late or destructive, amber = due soon or
  warning, emerald = done or on track, blue/indigo = in progress. Always
  with a word.
- No gradients, no new hues without a contrast ratio.

## Typography
One system sans stack, no web fonts (CPU and load budget). Mono only for
tracking numbers. Senior-friendly scale: 15 / 17 / 18 (body) / 21 / 24 /
30 / 36px. Sentence case everywhere; no all-caps labels.

## Layout
Max width 7xl, 16px side gutter on phones. Left-aligned text and forms.
Header + horizontal nav on desktop, Menu button on phones. Tables scroll in
their own box on phones. The assistant is one labelled button fixed at the bottom right ("Ask" on phones, "Ask the assistant" from 640px up), lifted above sticky action bars such as the register form's Save bar. Its panel opens bottom-right on wider screens and full screen on phones; closing returns focus to the button.
Header: lockup left; language, alerts, name block (name plus role · office, truncated with the full text on hover), My account and Sign out on the right. One row at 1280.
Page header: h1 text-2xl, meta line, actions right (secondary first, primary last).
Public pages (/login, /track) use the same header with lockup and language only.
The assistant panel is non-modal on wider screens: Esc closes it when focus is inside; it is modal and full screen on phones.

## Elevation & Depth
Flat. Cards use a 1px `line` border and no shadow. No stacked
shadows, no glass.

## Shapes
6px radius on controls, 8px on cards, pill only for status badges.

## Components
- Buttons: `btn-primary` (one per area), `btn-secondary`, red text for
  destructive with a confirm. 44px tall minimum.
- Inputs: `input` + `label` above, hint under the label, 2px border
  `input-border` (3.1:1), green focus ring.
- Badges: `badge`, word + colour, never colour alone.
- Cards: `card` only to group related content.
- Focus: 3px brand-700 outline, mint on dark backgrounds.
- Callouts: tinted, 1px border all round, never a side stripe.

## Component kit
Use these patterns; do not invent a new one for the same job.

- Summary numbers: `StatStrip`. Label above, big tabular number below. The
  label is a link only when it has an `href`. Red only for late items.
- Tables: inside a scroll box. Sentence-case headers
  (`text-sm font-semibold text-slate-600`). Numbers are `text-right
  tabular-nums`, header included. One link per row. Mono only for tracking
  numbers.
- Tabs: `TabNav` (`src/components/tab-nav.tsx`). `aria-current="page"` on the
  current tab, 2px brand-700 underline, scrolls sideways in its own box on
  phones. The URL holds the state. Used by the records saved views and
  `ReportsNav`.
- File picker: an `sr-only` peer input plus a `label.btn-secondary`. When
  there are several, name the peers (`peer/x`). Focus shows on the label with
  `peer-focus-visible` outline-3, outline-offset-2, outline-brand-700. Use
  outline, not ring: the `.btn-*` box-shadow beats ring utilities. Show the
  chosen name and size, and a hint for allowed type and size. Examples:
  `AttachForm` in `src/app/(app)/records/[id]/forms.tsx`, the drop zone in
  `src/app/(app)/records/new/register-form.tsx`.
- Status order: `STATUS_ORDER` in `src/lib/labels.ts` drives every status list,
  filter and chart, for all roles. Reports no longer sort status by count.
- One layout for every role (since 2026-11-26): record page with the Actions
  sidebar and named buttons, Register drop zone form, saved-view tabs on
  Records. Start screens by role come from `startScreen(me)` in
  `src/lib/office-features.ts`: records desk, office window (window clerk),
  office head ("Needs your decision" and the office's late list), plain
  dashboard for other staff and read-only accounts, Security overview for the
  Administrator. The month calendar sits below, behind "Show month calendar".
  `isRecordsDesk` (any records officer) only changes desk wording and the
  desk's extra tabs and service picker order.
- Guards: `npm run design-check` enforces D-CAPS-1 (sentence case) and D-NUM-1
  (numbers right aligned). Printed letterheads marked `data-letterhead` may
  use caps.
