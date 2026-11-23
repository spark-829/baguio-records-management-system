# Backups

The free Supabase plan has **no downloadable backups**. This system makes its own.

## What is backed up

- The whole database: records, routes, users and offices, settings, and the audit log.
- Attached files (the scans and PDFs in the `rms-attachments` bucket).
- A `manifest.json` with row counts per table and the newest audit entry. The restore drill uses it to prove the backup is complete.

## Where it goes (the 3-2-1 rule)

Keep 3 copies, on 2 kinds of storage, with 1 copy off-site.

| Copy | Where | How |
| --- | --- | --- |
| 1. Live data | Supabase | Always on |
| 2. Off-site copy | Cloudflare R2 bucket | Automatic, every night |
| 3. Local copy | Vic's PC, D drive (`D:\RMS-Backups`) | `pull-to-d-drive.ps1`, daily |

Later, the D drive copy can move to the office home server, and each user's PC can keep a copy of their own files.

## Schedule and retention

- Runs every night at **2:00 AM Manila time** (GitHub Actions, "Nightly backup").
- The audit check runs at 2:30 AM and the restore drill on the 2nd of each month.
- Daily copies are kept **30 days**. The copy made on the 1st of each month is kept **365 days**.
- A bucket lock rule stops anyone (including a thief with a stolen key) from deleting a backup for 30 days.

## Encryption

Every backup is encrypted (AES-256) before it leaves GitHub. Cloudflare and anyone who steals the file see only scrambled data. The key is the **BACKUP_PASSPHRASE**.

**Store BACKUP_PASSPHRASE in a password manager that is not on the D drive.** If you lose it, the backups cannot be opened. Nobody can recover it for you.

In the main production system, a separate AI will first scan all code for trojans and other backdoors.

## Set it up (one time, about 30 minutes)

Until you do this, the jobs run, show a "Skipped" notice and stay green. Nothing breaks.

### 1. Create the R2 bucket

1. Sign in to Cloudflare. Open **R2 Object Storage**. Add a payment method if asked (the free tier is enough).
2. Click **Create bucket**. Name it `rms-backups`. Location: Asia-Pacific.
3. Open the bucket, then **Settings > Object lifecycle rules > Add rule**.
   - Rule 1: prefix `daily/`, delete objects after **30 days**.
   - Rule 2: prefix `monthly/`, delete objects after **365 days**.
4. In **Settings > Bucket lock rules**, add two rules so nobody can delete or change a backup early, even with a stolen key:
   - Prefix `daily/`, retain for **30 days**.
   - Prefix `monthly/`, retain for **365 days**.
   - Do not lock the whole bucket: `latest.txt` and `fingerprints/latest.json` are replaced every night, and a lock would block that.
5. On the R2 overview page, copy your **Account ID**.

### 2. Create two R2 API tokens

1. R2 overview > **Manage API tokens > Create API token**.
2. Token 1 (for GitHub): permission **Object Read & Write**, bucket `rms-backups` only. Copy the **Access Key ID** and **Secret Access Key** now. They are shown once.
3. Token 2 (for your PC): permission **Object Read only**, same bucket only. Copy both values.

### 3. Get the Supabase keys

1. **Files (S3 keys):** Supabase dashboard > project > **Storage > S3 Connection** > **New access key**. Copy the Access Key ID and Secret. The region is shown on the same page (for example `ap-southeast-1`).
2. **Database URL:** click **Connect** at the top of the project. Choose **Session pooler**. Copy the URI. Replace `[YOUR-PASSWORD]` with the database password. (If you do not know it, reset it in Project Settings > Database.)

### 4. Add the GitHub secrets

GitHub repository > **Settings > Secrets and variables > Actions > New repository secret**. Add each one:

| Secret | What it is |
| --- | --- |
| `SUPABASE_DB_URL` | Session pooler URI with the real password. Required. |
| `BACKUP_PASSPHRASE` | A long random passphrase you make up. Required. Keep a copy in your password manager. |
| `SUPABASE_S3_ACCESS_KEY_ID` | Supabase Storage S3 access key ID (for the attached files). |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | Supabase Storage S3 secret. |
| `SUPABASE_S3_REGION` | Region shown on the S3 Connection page. Defaults to `ap-southeast-1`. |
| `R2_ACCOUNT_ID` | Cloudflare account ID. |
| `R2_ACCESS_KEY_ID` | Access key ID of the read and write token. |
| `R2_SECRET_ACCESS_KEY` | Secret of the read and write token. |
| `R2_BUCKET` | `rms-backups` |

### 5. Test it

1. GitHub > **Actions > Nightly backup > Run workflow**. It should finish green.
2. Open the run and read the summary. It should say "Uploaded to R2: true".
3. Run **Audit check**, then **Restore drill**. Fill in the results table in `docs/restore-drill.md`.

Without R2 secrets, the encrypted backup is kept as a GitHub artifact for 7 days only. That is a stop-gap, not a real backup.

## Copy backups to the D drive

1. Install the AWS CLI on your PC.
2. Run `aws configure --profile rms-r2` and enter the **read-only** token's Access Key ID and Secret. Region: `auto`.
3. Set your R2 address once (PowerShell): `setx RMS_R2_ENDPOINT "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"` and also set `RMS_R2_BUCKET` to `rms-backups`. Open a new window afterwards.
4. Test: `powershell -ExecutionPolicy Bypass -File scripts\backup\pull-to-d-drive.ps1`. Check `D:\RMS-Backups\pull.log`.
5. Schedule it (Command Prompt). Daily at 7:00 AM:
   `schtasks /Create /TN "RMS backup pull" /SC DAILY /ST 07:00 /TR "powershell -ExecutionPolicy Bypass -File C:\path\to\repo\scripts\backup\pull-to-d-drive.ps1"`
   And also at logon (catches days the PC was off):
   `schtasks /Create /TN "RMS backup pull (logon)" /SC ONLOGON /TR "powershell -ExecutionPolicy Bypass -File C:\path\to\repo\scripts\backup\pull-to-d-drive.ps1"`

The script only downloads and checks files. It never decrypts them.

## Alerts

If a job fails, GitHub emails the repository owner. Watch for "Nightly backup", "Audit check", "Restore drill" and "Uptime check". See `recovery-runbook.md`.
