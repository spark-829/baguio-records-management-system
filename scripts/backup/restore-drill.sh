#!/usr/bin/env bash
# Restore drill: download the latest backup, decrypt it, restore into a throwaway local Supabase, check it.
# Needs R2 keys and BACKUP_PASSPHRASE. Requires docker, supabase CLI, psql, gpg, aws, jq.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

r2_configured || skip "R2 secrets are not set (see docs/backups.md)."
[[ -n "${BACKUP_PASSPHRASE:-}" ]] || skip "BACKUP_PASSPHRASE is not set (see docs/backups.md)."

start_ts="$(date +%s)"
start_h="$(TZ=Asia/Manila date '+%F %T')"
work="$(mktemp -d)"
stack_dir="$work/stack"
mkdir -p "$stack_dir" "$work/dl" "$work/x"
cleanup() {
  (cd "$stack_dir" 2>/dev/null && supabase stop --no-backup >/dev/null 2>&1) || true
  rm -rf "${work:?}"
}
trap cleanup EXIT

key="$(r2 s3 cp "s3://$R2_BUCKET/latest.txt" - --only-show-errors)"
[[ "$key" =~ ^daily/rms-[0-9-]+\.tar\.gz\.gpg$ ]] || fail "latest.txt has an unexpected value."
base="$(basename "$key")"
r2 s3 cp "s3://$R2_BUCKET/$key" "$work/dl/$base" --only-show-errors
r2 s3 cp "s3://$R2_BUCKET/$key.sha256" "$work/dl/$base.sha256" --only-show-errors
(cd "$work/dl" && sha256sum -c "$base.sha256") || fail "Checksum of $base does not match."

printf '%s' "$BACKUP_PASSPHRASE" | gpg --decrypt --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
  --output "$work/dl/backup.tar.gz" "$work/dl/$base" 2>/dev/null || fail "Could not decrypt $base (wrong passphrase?)."
tar -C "$work/x" -xzf "$work/dl/backup.tar.gz"
manifest="$work/x/manifest.json"
[[ -f "$manifest" ]] || fail "manifest.json missing from backup."

# A separate temp project keeps the repo's migrations from being applied to the drill database.
(cd "$stack_dir" && supabase init --force </dev/null >/dev/null \
  && supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta >/dev/null)
local_db="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Roles often exist already in a fresh stack, so errors from roles.sql are tolerated.
psql "$local_db" -X -q --file "$work/x/roles.sql" >/dev/null 2>&1 || echo "roles.sql reported errors (expected when roles already exist)."
psql "$local_db" -X -q --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$work/x/schema.sql" --command 'SET session_replication_role = replica' --file "$work/x/data.sql" >/dev/null \
  || fail "Restore into the local database failed."

failed=0
rows=""
while IFS=$'\t' read -r tbl want; do
  [[ "$tbl" =~ ^rms_[a-z0-9_]+$ ]] || fail "Unexpected table name in manifest."
  got="$(psql "$local_db" -X -A -t -q -v ON_ERROR_STOP=1 -c "select count(*) from public.\"$tbl\"")"
  if [[ "$got" == "$want" ]]; then ok="yes"; else ok="NO"; failed=1; fi
  rows+="| $tbl | $want | $got | $ok |"$'\n'
done < <(jq -r '.row_counts | to_entries[] | [.key, .value] | @tsv' "$manifest")

chain="$(verify_audit_chain "$local_db")"
chain_ok="yes"
[[ "$chain" == "null" ]] || { chain_ok="NO (first bad entry: $chain)"; failed=1; }

want_id="$(jq -r '.latest_audit.id // empty' "$manifest")"
want_hash="$(jq -r '.latest_audit.row_hash // empty' "$manifest")"
got_hash="$(psql "$local_db" -X -A -t -q -v ON_ERROR_STOP=1 -v id="${want_id:-0}" -c "select row_hash from public.rms_audit_log where id = :id")"
hash_ok="yes"
[[ -n "$want_hash" && "$got_hash" == "$want_hash" ]] || { hash_ok="NO"; failed=1; }

end_ts="$(date +%s)"
dur=$((end_ts - start_ts))
summary "### Restore drill"
summary "- Backup used: \`$key\`"
summary "- Started (Manila): $start_h, duration: ${dur}s"
summary "- Audit chain intact: $chain_ok"
summary "- Latest audit seal matches manifest: $hash_ok"
summary ""
summary "| Table | Expected rows | Restored rows | Match |"
summary "| --- | --- | --- | --- |"
summary "${rows%$'\n'}"
[[ $failed -eq 0 ]] || fail "Restore drill found a mismatch. See the summary table."
echo "Restore drill passed in ${dur}s."
