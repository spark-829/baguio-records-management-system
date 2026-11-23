#!/usr/bin/env bash
# Daily audit-log check: verify the hash chain, compare with yesterday's off-site fingerprint, save a new one.
# Needs SUPABASE_DB_URL. R2 keys are optional (without them only the chain check runs).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

[[ -n "${SUPABASE_DB_URL:-}" ]] || skip "SUPABASE_DB_URL is not set. Add it in GitHub > Settings > Secrets (see docs/backups.md)."
db="$SUPABASE_DB_URL"

bad="$(verify_audit_chain "$db")"
if [[ "$bad" != "null" ]]; then
  [[ "$bad" =~ ^[0-9]+$ ]] || fail "Audit chain check returned an unexpected result."
  fail "Audit chain is broken. First bad entry id: $bad. Follow docs/recovery-runbook.md (audit chain alert)."
fi
summary "### Audit check"
summary "- Hash chain: intact"

IFS='|' read -r cur_id cur_hash < <(latest_audit "$db") || true
[[ "${cur_id:-}" =~ ^[0-9]+$ && -n "${cur_hash:-}" ]] || fail "Could not read the latest audit entry."
today="$(TZ=Asia/Manila date +%F)"

if r2_configured; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "${tmp:?}"' EXIT
  if r2 s3 cp "s3://$R2_BUCKET/fingerprints/latest.json" "$tmp/latest.json" --only-show-errors 2>/dev/null; then
    old_id="$(jq -r '.id' "$tmp/latest.json")"
    old_hash="$(jq -r '.row_hash' "$tmp/latest.json")"
    [[ "$old_id" =~ ^[0-9]+$ ]] || fail "Saved fingerprint has a bad id."
    now_hash="$(psql "$db" -X -A -t -q -v ON_ERROR_STOP=1 -v id="$old_id" \
      <<<"select row_hash from public.rms_audit_log where id = :id")"
    if [[ -z "$now_hash" ]]; then
      fail "History was rewritten: audit entry $old_id (saved off-site) no longer exists."
    elif [[ "$now_hash" != "$old_hash" ]]; then
      fail "History was rewritten: audit entry $old_id has a different seal than the one saved off-site."
    fi
    summary "- Off-site fingerprint (entry $old_id): still matches"
  else
    summary "- No earlier fingerprint found (first run)"
  fi
  jq -n --argjson id "$cur_id" --arg h "$cur_hash" --arg d "$today" '{id: $id, row_hash: $h, date: $d}' >"$tmp/new.json"
  r2 s3 cp "$tmp/new.json" "s3://$R2_BUCKET/fingerprints/$today.json" --only-show-errors
  r2 s3 cp "$tmp/new.json" "s3://$R2_BUCKET/fingerprints/latest.json" --only-show-errors
else
  notice "R2 is not set up, so the off-site fingerprint was not compared or saved. See docs/backups.md."
fi
summary "- Latest entry: id $cur_id, seal \`$cur_hash\` ($today)"
echo "Audit check passed."
