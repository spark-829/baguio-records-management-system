# Email intake (not built)

Today the records desk registers an email by saving it as a `.eml` file and choosing it on the Register screen. The file is read in the browser only. Automatic intake of emails is **not built**. This page describes how it could be added later. No paid service is needed.

## What it needs
- A domain on Cloudflare (free plan) and **Email Routing** turned on for an address such as `records@your-domain`.
- An **Email Worker** (a Worker with an `email()` handler). It receives the raw message and either:
  - saves it to a Supabase Storage bucket (for example `rms-intake`), using a service-role secret that is held only in the Worker (never in this app), or
  - forwards it to a records mailbox that the records desk opens as usual.

## Suggested next phase
A records-desk "Inbox" screen that lists the saved messages. Opening one would run the same browser-side reading as the `.eml` upload (`src/lib/eml.ts`) and fill the Register form.

## Cautions
- Treat every email as untrusted. Show text only; never render the email's HTML.
- Attachments must still pass the upload rules (PDF, JPG or PNG, up to 10 MB) and the storage guard.
- Keep the service-role secret out of this repository and out of the browser.
