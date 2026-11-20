# Turnover guide

For the person who will run and maintain the system.

## Components
| Part | Where | Notes |
| --- | --- | --- |
| Web app | Cloudflare Workers (`baguio-rms`) | Next.js 15 built with OpenNext; `npm run deploy` |
| Database, logins, files | Supabase project | Tables, functions and policies prefixed `rms_` |
| AI | Anthropic API, model `claude-haiku-5-5` | Key stored as the Cloudflare secret `ANTHROPIC_API_KEY` |
| Source code | GitHub repository | `supabase/migrations` is the database's source of truth |

## Configuration
| Setting | Where | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `wrangler.jsonc` vars | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) | `wrangler.jsonc` vars | No, protected by row-level security |
| `ANTHROPIC_API_KEY` | `wrangler secret put` | Yes |

The app has no service-role key. If AI is not configured, everything else still works and AI buttons show a clear message.

## Routine tasks
- **Add an office or document type:** insert a row in `rms_offices` / `rms_document_types` (admin role in the app, or SQL editor).
- **New user:** Users page (admin).
- **Someone leaves:** untick **Active** on the Users page. Their history stays.
- **Backups:** Supabase daily backups; download a CSV export monthly for paper filing if required.
- **Change the database:** add a new file in `supabase/migrations/`, apply it, then run `supabase/tests/access_rules.sql` to confirm access rules still hold.

## Checks before each release
```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```
Then run `supabase/tests/access_rules.sql`. It rolls back and changes nothing.

## Known limits of the demo
- Overdue is based on a single due date per record, not per office step.
- Files are limited to 10 MB PDF and image scans.
- Retention years are recorded per document type but no automatic disposal runs.
