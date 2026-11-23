#!/usr/bin/env bash
# Nightly encrypted backup: database dumps + attached files -> tar.gz -> gpg -> Cloudflare R2.
# Needs: SUPABASE_DB_URL, BACKUP_PASSPHRASE. Optional: Supabase S3 keys (files), R2 keys (upload).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

[[ -n "${SUPABASE_DB_URL:-}" ]] || skip "SUPABASE_DB_URL is not set. Add it in GitHub > Settings > Secrets (see docs/backups.md)."
[[ -n "${BACKUP_PASSPHRASE:-}" ]] || skip "BACKUP_PASSPHRASE is not set. Add it in GitHub > Settings > Secrets (see docs/backups.md)."

out_dir="${BACKUP_OUT_DIR:-$PWD/backup-out}"
mkdir -p "$out_dir"
work="$(mktemp -d)"
stamp="$(TZ=Asia/Manila date +%F)"
day="$(TZ=Asia/Manila date +%d)"
name="rms-$stamp.tar.gz"
cleanup() {
  rm -rf "${work:?}"
  rm -f "${out_dir:?}/${name:?}"   # plaintext archive must never stay on disk
}
trap cleanup EXIT
pkg="$work/pkg"
mkdir -p "$pkg/files"

# Newest audit entry before the dump: the restored copy must contain it with the same seal.
IFS='|' read -r audit_id audit_hash < <(latest_audit "$SUPABASE_DB_URL") || true

echo "Dumping database..."
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$pkg/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$pkg/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$pkg/data.sql"

file_note="included"
if [[ -n "${SUPABASE_S3_ACCESS_KEY_ID:-}" && -n "${SUPABASE_S3_SECRET_ACCESS_KEY:-}" ]]; then
  echo "Syncing attached files..."
  AWS_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION="${SUPABASE_S3_REGION:-ap-southeast-1}" AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    aws s3 sync "s3://rms-attachments" "$pkg/files" \
      --endpoint-url "https://${PROJECT_REF}.supabase.co/storage/v1/s3" --only-show-errors
else
  file_note="skipped (Supabase S3 keys not set)"
  notice "Attached files were not backed up: SUPABASE_S3_ACCESS_KEY_ID / SUPABASE_S3_SECRET_ACCESS_KEY are not set. The database backup still ran."
fi
file_count="$(find "$pkg/files" -type f | wc -l | tr -d ' ')"
file_bytes="$(find "$pkg/files" -type f -printf '%s\n' | awk '{s+=$1} END {print s+0}')"

echo "Counting rows in the dump..."
# Counted from data.sql itself, so the numbers match exactly what was saved even if staff kept working.
counts="$work/counts.json"
awk '
  /^COPY / && / FROM stdin;$/ {
    t = $2; gsub(/"/, "", t)
    if (t ~ /^public\.rms_[a-z0-9_]+$/) { sub(/^public\./, "", t); cur = t; n[cur] = 0 } else { cur = "" }
    inblk = 1; next
  }
  inblk && $0 == "\\." { inblk = 0; cur = ""; next }
  inblk && cur != "" { n[cur]++ }
  END { for (k in n) printf "%s\t%d\n", k, n[k] }
' "$pkg/data.sql" | jq -R -n '[inputs | split("\t") | {(.[0]): (.[1] | tonumber)}] | add // {}' >"$counts"
[[ "$(jq 'length' "$counts")" -gt 0 ]] || fail "No rms_ tables found in the data dump."

jq -n --arg created "$(date -u +%FT%TZ)" --arg sha "${GITHUB_SHA:-unknown}" \
  --slurpfile counts "$counts" --arg aid "${audit_id:-}" --arg ahash "${audit_hash:-}" \
  --argjson fc "$file_count" --argjson fb "$file_bytes" \
  '{created_at: $created, git_sha: $sha, row_counts: $counts[0],
    latest_audit: {id: ($aid | if . == "" then null else tonumber end), row_hash: (if $ahash == "" then null else $ahash end)},
    files: {count: $fc, bytes: $fb}}' >"$pkg/manifest.json"

echo "Packing and encrypting..."
tar -C "$pkg" -czf "$out_dir/$name" .
printf '%s' "$BACKUP_PASSPHRASE" | gpg --symmetric --cipher-algo AES256 --batch --yes \
  --pinentry-mode loopback --passphrase-fd 0 --output "$out_dir/$name.gpg" "$out_dir/$name"
rm -f "${out_dir:?}/${name:?}"
(cd "$out_dir" && sha256sum "$name.gpg" >"$name.gpg.sha256")
size="$(stat -c %s "$out_dir/$name.gpg")"

uploaded=false
if r2_configured; then
  echo "Uploading to R2..."
  key="daily/$name.gpg"
  r2 s3 cp "$out_dir/$name.gpg" "s3://$R2_BUCKET/$key" --only-show-errors
  r2 s3 cp "$out_dir/$name.gpg.sha256" "s3://$R2_BUCKET/$key.sha256" --only-show-errors
  if [[ "$day" == "01" ]]; then
    r2 s3 cp "s3://$R2_BUCKET/$key" "s3://$R2_BUCKET/monthly/$name.gpg" --only-show-errors
    r2 s3 cp "s3://$R2_BUCKET/$key.sha256" "s3://$R2_BUCKET/monthly/$name.gpg.sha256" --only-show-errors
  fi
  printf '%s' "$key" | r2 s3 cp - "s3://$R2_BUCKET/latest.txt" --only-show-errors
  uploaded=true
else
  notice "R2 is not set up, so the backup is kept as a GitHub artifact for 7 days only. See docs/backups.md."
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "uploaded=$uploaded"
    echo "gpg_path=$out_dir/$name.gpg"
    echo "sha_path=$out_dir/$name.gpg.sha256"
  } >>"$GITHUB_OUTPUT"
fi
summary "### Backup $stamp"
summary "- Encrypted size: $size bytes"
summary "- Attached files: $file_count ($file_bytes bytes), $file_note"
summary "- Uploaded to R2: $uploaded"
echo "Done."
