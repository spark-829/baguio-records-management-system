#!/usr/bin/env bash
# Shared helpers for the backup scripts. Source this file; do not run it.
# Never print secrets. Every secret-dependent script skips cleanly when its secrets are missing.

PROJECT_REF="${SUPABASE_PROJECT_REF:-zocbkfargjtueqnqgumf}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-/dev/null}"

summary() { printf '%s\n' "$*" >>"$SUMMARY_FILE"; }

notice() {
  echo "::notice::$*"
  summary "$*"
}

# skip "message": record a notice and stop with success (secrets not set up yet).
skip() {
  notice "Skipped: $*"
  exit 0
}

fail() {
  echo "::error::$*" >&2
  summary "FAILED: $*"
  exit 1
}

r2_configured() {
  [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" && -n "${R2_BUCKET:-}" ]]
}

# r2 <aws args>: aws cli pointed at Cloudflare R2.
r2() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    aws --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" "$@"
}

# first active admin's id (used to run the audit check as an admin)
admin_id() {
  local id
  id="$(psql "$1" -X -A -t -q -v ON_ERROR_STOP=1 \
    -c "select id from public.rms_profiles where role = 'admin' and is_active order by id limit 1")"
  [[ "$id" =~ ^[0-9a-fA-F-]{36}$ ]] || return 1
  printf '%s' "$id"
}

# verify_audit_chain <db-url>: prints the first bad audit entry id, or "null" if intact.
# Runs as the first active admin inside a transaction that is rolled back.
verify_audit_chain() {
  local url="$1" admin out
  admin="$(admin_id "$url")" || fail "No active admin found in rms_profiles; cannot run the audit check."
  out="$(psql "$url" -X -A -t -q -v ON_ERROR_STOP=1 -v admin="$admin" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true) is not null;
select 'RESULT=' || coalesce(public.rms_verify_audit_chain()::text, 'null');
rollback;
SQL
)"
  grep '^RESULT=' <<<"$out" | tail -n 1 | cut -d= -f2
}

# latest_audit <db-url>: prints "id|row_hash" of the newest audit entry.
latest_audit() {
  psql "$1" -X -A -t -q -v ON_ERROR_STOP=1 -F '|' \
    -c "select id, row_hash from public.rms_audit_log order by id desc limit 1"
}
