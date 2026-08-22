#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/vps/check-smtp-cert.sh
#
# Open a TLS handshake to the production SMTP host (mail.laratik.com:465)
# and report the cert's `notAfter` date. Used for:
#
#   1. The `check-smtp-cert` CI job in `.github/workflows/ci.yml` (gates
#      every push to main + runs on a nightly schedule).
#   2. The VPS-side daily cron that emails a renewal warning when the
#      cert is < 30 days from expiry (see `docs/operations/runbook.md`).
#
# Exit codes:
#   0 — healthy (> 30 days remaining)
#   1 — warning  (14–30 days remaining) — renew soon
#   2 — critical (< 14 days remaining) — renew immediately, page on-call
#   3 — could not parse the cert (TLS handshake failed, hostname mismatch,
#       openssl missing, etc.)
#
# Output:
#   A single JSON line on stdout suitable for CI parsing or log scraping.
#   The JSON shape is stable; do not break it without updating the CI
#   consumer and the VPS-side alerting script.
#
# Usage:
#   ./scripts/vps/check-smtp-cert.sh                    # default thresholds
#   ./scripts/vps/check-smtp-cert.sh --warn 45          # override warn threshold
#   ./scripts/vps/check-smtp-cert.sh --critical 21      # override critical threshold
#   SMTP_HOST=mail.example.com ./scripts/vps/check-smtp-cert.sh
#   SMTP_PORT=587 ./scripts/vps/check-smtp-cert.sh      # STARTTLS-style port
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SMTP_HOST="${SMTP_HOST:-mail.laratik.com}"
SMTP_PORT="${SMTP_PORT:-465}"
WARN_DAYS=30
CRITICAL_DAYS=14

while [[ $# -gt 0 ]]; do
  case "$1" in
    --warn) WARN_DAYS="$2"; shift 2 ;;
    --critical) CRITICAL_DAYS="$2"; shift 2 ;;
    --host) SMTP_HOST="$2"; shift 2 ;;
    --port) SMTP_PORT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 3 ;;
  esac
done

# Use `openssl s_client` to fetch the leaf cert. Port 465 = implicit TLS
# (connect with TLS right away). For STARTTLS ports (587), pass the
# `-starttls smtp` flag — but the production SMTP_PORT is 465, so we
# only emit the starttls flag when the port is the standard submission
# port. Auto-detect by trying the starttls probe first on 587/25.
SCLIENT_FLAGS=("-connect" "${SMTP_HOST}:${SMTP_PORT}" "-servername" "${SMTP_HOST}")
if [[ "$SMTP_PORT" == "587" || "$SMTP_PORT" == "25" ]]; then
  SCLIENT_FLAGS=("-starttls" "smtp" "${SCLIENT_FLAGS[@]}")
fi

# Capture the PEM and the parsed `notAfter`/`subject`/`issuer` lines.
# `2>/dev/null` suppresses the verbose TLS handshake transcript.
PEM="$(openssl s_client "${SCLIENT_FLAGS[@]}" </dev/null 2>/dev/null \
  | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p')"

if [[ -z "$PEM" ]]; then
  echo "{\"host\":\"${SMTP_HOST}\",\"port\":${SMTP_PORT},\"ok\":false,\"reason\":\"no_cert_returned\"}"
  exit 3
fi

# Parse `notAfter` (format: `notAfter=May 23 09:35:32 2026 GMT`).
NOT_AFTER_LINE="$(printf '%s' "$PEM" | openssl x509 -noout -enddate 2>/dev/null || true)"
SUBJECT="$(printf '%s' "$PEM" | openssl x509 -noout -subject 2>/dev/null \
  | sed -E 's/^subject=//')"
ISSUER="$(printf '%s' "$PEM" | openssl x509 -noout -issuer 2>/dev/null \
  | sed -E 's/^issuer=//')"

if [[ -z "$NOT_AFTER_LINE" ]]; then
  echo "{\"host\":\"${SMTP_HOST}\",\"port\":${SMTP_PORT},\"ok\":false,\"reason\":\"could_not_parse_cert\"}"
  exit 3
fi

# `openssl x509 -enddate` returns the literal `notAfter=` prefix; strip it.
NOT_AFTER="${NOT_AFTER_LINE#notAfter=}"

# Convert to a Unix epoch. `date -d` accepts the RFC-2253 format
# "May 23 09:35:32 2026 GMT" on GNU coreutils (the VPS + the GHA runner
# are both Linux). On macOS the flag would be `-j -f`, but this script
# only runs on the VPS + CI — keep it GNU.
NOT_AFTER_EPOCH="$(date -d "$NOT_AFTER" +%s 2>/dev/null || echo 0)"
NOW_EPOCH="$(date +%s)"

if [[ "$NOT_AFTER_EPOCH" == "0" ]]; then
  # GNU `date -d` is unavailable (BSD/macOS, or some minimal container).
  # Fall back to BSD `date -j -f`. Both accept the RFC-2253 format
  # emitted by `openssl x509 -enddate` (e.g. "Aug 21 09:35:31 2026 GMT").
  NOT_AFTER_EPOCH="$(date -j -f "%b %d %H:%M:%S %Y %Z" "$NOT_AFTER" +%s 2>/dev/null \
    || echo 0)"
fi

if [[ "$NOT_AFTER_EPOCH" == "0" ]]; then
  echo "{\"host\":\"${SMTP_HOST}\",\"port\":${SMTP_PORT},\"ok\":false,\"reason\":\"could_not_parse_date\",\"notAfterRaw\":\"${NOT_AFTER}\"}"
  exit 3
fi

DAYS_LEFT=$(( (NOT_AFTER_EPOCH - NOW_EPOCH) / 86400 ))

# Build the status string for the JSON output.
if [[ "$DAYS_LEFT" -lt 0 ]]; then
  STATUS="expired"
  EXIT_CODE=2
elif [[ "$DAYS_LEFT" -lt "$CRITICAL_DAYS" ]]; then
  STATUS="critical"
  EXIT_CODE=2
elif [[ "$DAYS_LEFT" -lt "$WARN_DAYS" ]]; then
  STATUS="warn"
  EXIT_CODE=1
else
  STATUS="ok"
  EXIT_CODE=0
fi

# JSON-safe encode: escape backslashes and double quotes.
escape_json() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

SUBJECT_ESC="$(escape_json "$SUBJECT")"
ISSUER_ESC="$(escape_json "$ISSUER")"

printf '{"host":"%s","port":%d,"ok":%s,"status":"%s","daysLeft":%d,"warnDays":%d,"criticalDays":%d,"notAfter":"%s","subject":"%s","issuer":"%s"}\n' \
  "$SMTP_HOST" "$SMTP_PORT" \
  "$([[ "$STATUS" == "ok" ]] && echo true || echo false)" \
  "$STATUS" \
  "$DAYS_LEFT" "$WARN_DAYS" "$CRITICAL_DAYS" \
  "$NOT_AFTER" \
  "$SUBJECT_ESC" \
  "$ISSUER_ESC"

exit "$EXIT_CODE"
