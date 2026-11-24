---
name: Baguio RMS
description: City of Pines records system for City Hall staff and citizens
colors:
  brand-50: "#eff6f0"
  brand-100: "#dcebdf"
  brand-200: "#b9d6c0"
  brand-600: "#22663f"
  brand-700: "#1b5136"
  brand-800: "#143d29"
  brand-900: "#0e2a1c"
  gold-100: "#f8edcf"
  gold-300: "#e6c66f"
  gold-500: "#c8962e"
  gold-800: "#6b4c0e"
  slate-400: "#5f6b7a"
  slate-500: "#4a5565"
  slate-600: "#3c4655"
  input-border: "#8a948f"
  page: "#f3f5f2"
  line: "#d3d9d4"
  ink: "#1a1f1c"
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
page. Calm, civic and plain: deep pine green header with a gold stripe,
cool off-white page, white content cards, large type. Ambition shows as
precision and restraint, not decoration.

## Colors
### Primary
Pine green (`brand-700` buttons and links, `brand-800` header, `brand-900`
headings). White on brand-700 is 9.2:1.
### Secondary
Gold: `gold-500` for the header stripe and highlights only, `gold-800` on
`gold-100` for text. Never gold text on white.
### Neutral
`ink` on `page` for body (15.2:1). Secondary text `slate-500`/`slate-600`
(remapped darker so they pass AA). No lighter greys for text.
`line` (#d3d9d4) for card edges and dividers; decorative (1.4:1), never the only signal.
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
their own box on phones. The assistant button sits at the right end of the nav bar (icon only below `lg`, beside the Menu button on phones). Its panel opens bottom-right on wider screens and full screen on phones; closing returns focus to the button. No floating buttons.

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
- Focus: 3px brand-700 outline, gold on dark backgrounds.
