# Recovery runbook

**Targets:** back online within **4 hours**. Lose at most **24 hours** of data (backups run every night).

First, stay calm. Write down the time and what you see. Then find your case below.

## Where alerts come from

- GitHub emails the repository owner when a workflow fails: Uptime check (every 15 minutes), Nightly backup, Audit check, Restore drill.
- Staff may also tell you the site is down.
- The red bar on the Audit log page.

## Who to call

| Who | Name | Phone / contact |
| --- | --- | --- |
| System owner (Vic) |  |  |
| Office head / DPO |  |  |
| IT or network person |  |  |
| Internet provider |  |  |
| Electric cooperative / building admin |  |  |

## Site is down

1. Open the site on your phone data. If it works there, the problem is the office internet (see below).
2. Open `/api/health` on the site. `"db":"down"` means Supabase. No answer at all means Cloudflare or the app.
3. Check status pages: cloudflarestatus.com and status.supabase.com.
4. If a recent change caused it: Cloudflare dashboard > Workers > the app > Deployments > roll back to the previous version.
5. If staff cannot work, switch to `paper-fallback.md`.

## Cloudflare outage

Nothing to fix on our side. Check cloudflarestatus.com, tell staff, use the paper fallback, and wait. Recheck every 30 minutes.

## Supabase outage or paused project

1. Check status.supabase.com.
2. If the project is **paused** (the free plan pauses after a week of no activity): open the Supabase dashboard > the project > **Restore project**. Wait a few minutes.
3. If the project is gone or damaged, do the manual restore in `restore-drill.md`.

## Bad change or data loss

1. Stop staff from editing, if the damage is spreading.
2. Deleted records: use the **Bin** page first. Records deleted by mistake can be restored there (soft delete). This is the fastest fix.
3. If data is changed wrongly in many rows, or a database change broke things: restore from backup.
   1. Follow "Manual restore into a fresh Supabase project" in `restore-drill.md`. Use a new project, not the live one.
   2. Check the restored data. Only then switch the app to it.
4. Write down what was lost (up to 24 hours) and tell the office head. Staff can re-enter records from the paper fallback log.

## Audit chain alert

A red bar on the Audit log page, or a failed "Audit check" run, means the log was changed directly in the database, or an entry is missing.

1. Do not delete or edit anything. Note the entry number from the message.
2. Open the Audit check run in GitHub. If it says "History was rewritten", the off-site copy proves the log was altered.
3. Treat it as a possible break-in: do the "stolen account" list below.
4. Compare with the newest backup (restore drill, restored copy). Report to the DPO.

## Office internet down

1. Use phone data to check whether the site itself is up.
2. Switch to `paper-fallback.md`. Log every document in the outage logbook.
3. When the internet returns, enter the paper records.

## Power cut

1. Paper fallback now. The system keeps running in the cloud, so nothing is lost there.
2. Anything not saved on a screen when power failed must be re-entered.
3. When power returns, enter paper records.

## Stolen account: revoke everything

Do these in order. Work from a clean, trusted computer.

1. **Supabase:** sign out all sessions (Authentication > Users, or change the JWT secret in Project Settings if needed). Deactivate the affected user on the Users page.
2. **Database password:** rotate it (Project Settings > Database). Update the GitHub secret `SUPABASE_DB_URL`.
3. **Supabase API keys:** rotate them. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Cloudflare and redeploy.
4. **Supabase S3 keys:** delete and recreate. Update `SUPABASE_S3_ACCESS_KEY_ID` and `SUPABASE_S3_SECRET_ACCESS_KEY`.
5. **R2 tokens:** delete both tokens and create new ones. Update the `R2_*` secrets and the `rms-r2` profile on the PC.
6. **DeepSeek key:** create a new key. Update it in Cloudflare secrets and delete the old one.
7. **GitHub:** sign out all sessions, revoke personal access tokens, remove and re-add passkeys, check Settings > Security log.
8. **Cloudflare:** revoke API tokens, sign out other sessions, change the password and passkeys.
9. **Review:** recent commits, recent deploys, and the audit log for actions you do not recognise.
10. If data may have been changed, restore from backup (`restore-drill.md`). BACKUP_PASSPHRASE is not changed by this unless it was exposed. If it was, set a new one; older backups still need the old one, so keep it safe.
