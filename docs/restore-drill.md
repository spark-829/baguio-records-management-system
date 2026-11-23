# Restore drill

A backup you have never restored is only a hope. The drill proves the backup works.

## What the automated drill does

1. Reads `latest.txt` in R2 and downloads the newest backup.
2. Checks the checksum, then decrypts it with BACKUP_PASSPHRASE.
3. Starts a throwaway database on the GitHub runner and restores the backup into it.
4. Compares the row count of every table with `manifest.json`.
5. Runs the audit chain check, and compares the newest audit seal with the manifest.
6. Writes the times, a results table and pass or fail to the run summary. Any mismatch fails the job, and GitHub emails you.

It never touches the live database. It runs on the 2nd of every month at 4:00 AM Manila time. It skips quietly until the R2 secrets are added (see `backups.md`).

A small mismatch can happen if someone added a record while the nightly backup was running. Run the drill again before you worry.

## Run it yourself

1. GitHub repository > **Actions** tab.
2. Click **Restore drill** in the left list.
3. Click **Run workflow**, then the green **Run workflow** button.
4. Wait about 10 to 15 minutes. Open the run and read the summary.
5. Add a row to the table below.

## Manual restore into a fresh Supabase project

Use this when the live project is lost. Allow about 1 hour.

1. Download the newest `.tar.gz.gpg` and `.sha256` from R2 (or from `D:\RMS-Backups`).
2. Check the file: `sha256sum -c rms-YYYY-MM-DD.tar.gz.gpg.sha256` (Windows: `Get-FileHash -Algorithm SHA256` and compare with the text in the `.sha256` file).
3. Decrypt. Install Gpg4win on Windows, then run:
   `gpg --output backup.tar.gz --decrypt rms-YYYY-MM-DD.tar.gz.gpg`
   Type BACKUP_PASSPHRASE when asked.
4. Unpack: `mkdir restore && tar -xzf backup.tar.gz -C restore`. You get `roles.sql`, `schema.sql`, `data.sql`, `manifest.json` and a `files` folder.
5. Create a new Supabase project. Copy its **session pooler** connection string from the Connect button.
6. Restore, using that string as `<URL>`:
   ```
   psql -f restore/roles.sql "<URL>"
   psql --single-transaction --variable ON_ERROR_STOP=1 --file restore/schema.sql --command "SET session_replication_role = replica" --file restore/data.sql "<URL>"
   ```
   Errors from `roles.sql` about roles that already exist are normal.
7. Create the private bucket `rms-attachments` in Storage, then upload the contents of `restore/files` (Supabase S3 connection with the aws CLI: `aws s3 sync restore/files s3://rms-attachments --endpoint-url https://<new-ref>.supabase.co/storage/v1/s3`).
8. Check: compare a few table counts with `manifest.json`. Sign in as an admin. Open the Audit log page: the red bar must not appear.
9. Point the app at the new project: update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Cloudflare, redeploy, and update the GitHub secrets `SUPABASE_DB_URL` and the S3 keys. If the project ref changed, set `SUPABASE_PROJECT_REF` in the backup workflow.

## Results

| Date | Backup used | Duration | Rows match | Audit chain OK | Notes |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |
