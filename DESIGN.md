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
  page: "#f5f4ee"
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
  md: "8px"
  lg: "12px"
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
off-white page, white content cards, large type. Ambition shows as
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
their own box on phones. Fixed bottom-left assistant button; keep focus
clear of it.

## Elevation & Depth
Flat. Cards use a 1px slate-300 border and the smallest shadow. No stacked
shadows, no glass.

## Shapes
8px radius on controls, 12px on cards, pill only for status badges.

## Components
- Buttons: `btn-primary` (one per area), `btn-secondary`, red text for
  destructive with a confirm. 44px tall minimum.
- Inputs: `input` + `label` above, hint under the label, 2px border
  `input-border` (3.1:1), green focus ring.
- Badges: `badge`, word + colour, never colour alone.
- Cards: `card` only to group related content.
- Focus: 3px brand-700 outline, gold on dark backgrounds.
