# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- City Hall staff of Baguio City (records officers, office staff, department heads, admins, auditors). Many are long-time employees who kept paper logbooks; some are older and not technical. They log letters as they arrive, route them, receive them by QR scan, act on them and report on lateness.
- Citizens on phones who check a document's progress at `/track` with the tracking number and code from their receipt.

## Product Purpose
A demo Records Management System built to show fit for the Baguio City Government Junior Software Developer job (records registration, classification, attachments, search, status history, actions, access control, reports). Success: a hiring panel can use it without training and believe City Hall staff could too.

## Operating Context
Office desks with shared Windows PCs and printers (routing slips and QR receipts are printed), phones for QR receiving and citizen tracking, mixed English and Filipino. ARTA (Anti-Red Tape Act) working-day deadlines decide what is late. Data Privacy Act notices and audit logs are part of daily use.

## Capabilities and Constraints
- Next.js on Cloudflare Workers free plan: heavy pages hit CPU limits, so no UI libraries, web fonts, large images or decorative client JavaScript.
- Supabase with row-level security; every view and download is logged.
- AI (DeepSeek) has a hard spend cap and a demo fallback.
- Bilingual: every string goes through `t()` with a Filipino line; Filipino runs about 30% longer.

## Brand Commitments
- Looks like it belongs to Baguio City (the baguio.gov.ph teal and mint palette) but never uses the official seal or logo.
- Footer note on every page: "Demo system, not an official City Government of Baguio service."
- Office vocabulary: log, route, forward, receive, routing slip, receipt, tracking number.

## Evidence on Hand
Simulated records only (tagged seed data); no real citizen data. Screenshots in the project files. Do not invent statistics, testimonials or official endorsements.

## Product Principles
1. Plain and obvious beats clever: an older clerk should finish a task on first try.
2. Paper habits carry over: routing slips, receipts and logbook-style lists.
3. Every action leaves a visible trace (status, history, audit).
4. Proven patterns from well-known apps and government design systems, named when used.
5. Light pages: fast on the free plan and on slow phones.

## Accessibility & Inclusion
WCAG 2.2 AA. Body text 18px, nothing under 15px, 44px touch targets on phones, visible focus, no colour-only status. Details in `docs/design/principles.md`.
