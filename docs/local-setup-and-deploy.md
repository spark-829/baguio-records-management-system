# Local setup, checks and deploy

Notes for running the project on a Windows PC and shipping a change. Written
from shipping PR #100 (sticky header, 2026-11-26).

## Node and tests

- Use **Node 22** (`.nvmrc`; CI runs Node 22). `package.json` asks for
  Node 22 or newer. Node 24 works too: on 2026-11-26 `npm test` passed all
  523 tests on Node 24.13.1 with vitest 5.1.1 and vite 8.3.8.
- `npm test` runs Vitest with its default pool (worker processes).
- **If every test file fails** with
  `TypeError: Cannot read properties of undefined (reading 'config')`,
  this was seen once on Node 24 and could not be reproduced later. First
  reinstall with `npm ci`, which removes a half-finished install. If it
  still fails, run `npm run test:vm`. This runs the same tests in VM
  threads (`--pool=vmThreads`), and that pool passed all tests when the
  default one failed. Report it with the Node, vitest and vite versions
  (`node -v`, `npm ls vitest vite`).
- The Vitest config is `vitest.config.mts` (an ES module, so Vite does not
  warn about "ESM syntax in a file loaded as CommonJS").

## Line endings

`.gitattributes` stores text files with LF and checks them out with LF, so
Git no longer warns "LF will be replaced by CRLF". If an old checkout still
warns, run `git add --renormalize .` once (it changes nothing in the repo
today).

## Design check (`npm run design-check`)

The automated half of `docs/design/checklist.md` (axe-core and house rules,
phone and desktop widths). Needs Playwright and a browser. Neither is a
project dependency, so that `npm ci` stays small and CI does not download a
browser.

1. Install `playwright-core` in a folder **outside the repo**, for example:

   ```powershell
   npm i --prefix $env:USERPROFILE\pw playwright-core
   ```

2. Create `.env.local` in the repo root (Git ignores it). The script reads it
   on its own, and variables already set in the shell win:

   ```
   RMS_PLAYWRIGHT=C:\Users\<you>\pw
   RMS_BROWSER=msedge
   RMS_URL=https://<branch>-baguio-rms.vicsonyaris29.workers.dev
   # for the signed-in pages (a demo account):
   # RMS_EMAIL=records@rms-demo.test
   # RMS_PASSWORD=...
   ```

   | Variable | Flag | Meaning | Default |
   | --- | --- | --- | --- |
   | `RMS_URL` | `--url` | site to check | the live site (production) |
   | `RMS_BROWSER` | `--browser` | `msedge` or `chrome` uses the installed browser; `chromium` or empty uses Playwright's own Chromium | Playwright's Chromium |
   | `RMS_PLAYWRIGHT` | | folder holding `node_modules/playwright-core` | the repo's own `node_modules` |
   | `RMS_EMAIL`, `RMS_PASSWORD` | | sign in and check the signed-in pages too | public pages only |

   Other flags: `--only /records,/reports` and `--out report.json`.

3. Run `npm run design-check`. The first line says which site and browser it
   used.

Things to know:

- **Check the PR preview, not the live site.** The default URL is production,
  which does not have your change until it is merged.
- There is no separate staging site. Each PR's preview is the staging copy.
- The login form needs the **privacy-notice checkbox** ticked before
  "Sign in". The script does this. Your own scripts must do it too, or
  sign-in times out.
- The language cookie is named **`lang`** (`en` or `fil`), not `rms-lang`.
  Set it before loading a page to check the Filipino text.
- **Automated sign-ins are real sign-ins.** They write the normal login and
  record-view audit rows, and a wrong password counts toward the account
  lockout. Use a demo account only.
- The site runs on Cloudflare's free plan. Loading pages back to back
  sometimes returns a page without its header, or drops the session to
  `/login`. The script loads one page at a time. In your own scripts, pause
  about 1 s between loads and retry once before you call it a bug.

## Deploy (Cloudflare Workers Builds)

- Cloudflare Workers Builds is connected to the GitHub repo. **Merging to
  `main` builds and deploys production**
  (`https://baguio-rms.vicsonyaris29.workers.dev`) by itself. You do not need
  `npm run deploy`. Roll back in the Cloudflare dashboard: Workers >
  baguio-rms > Deployments.
- Every other branch (each PR) gets a **preview version** at
  `https://<branch-name>-baguio-rms.vicsonyaris29.workers.dev` (slashes in the
  branch name become dashes). Production is not changed until the merge,
  even though the build page's URL says "production".
- **The preview URL is in the check run, not the PR comment.** Cloudflare's PR
  comment can say "In progress" long after the build has finished. Read the
  Workers Builds check run's summary instead:

  ```powershell
  gh api repos/spark-829/baguio-records-management-system/commits/<sha>/check-runs --jq '.check_runs[] | {name, status, conclusion, summary: .output.summary}'
  ```

  A check run is finished when `status` is `completed`. Then `conclusion`
  says whether it passed. Do not wait on `state`.
- Right after a push, `gh pr checks <n>` can say "no checks reported" for
  about a minute, until the checks start. Wait and run it again.

## Shipping a UI change

1. Push the branch and open the PR.
2. Wait for CI and the Workers Builds check. Get the preview URL from the
   check run.
3. Run `npm run design-check` with `RMS_URL` set to the preview URL. Look at
   the page in a browser at 320/375 px and 1280 px, in English and Filipino.
4. Merge. Production deploys by itself.
