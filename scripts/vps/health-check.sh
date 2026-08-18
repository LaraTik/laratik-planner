#!/usr/bin/env bash
# scripts/vps/health-check.sh — VPS-side. Hit the health endpoint and exit non-zero
# if the app is not healthy. Used by the deploy script and the cron watchdog.
set -euo pipefail
URL="${HEALTH_URL:-http://localhost:3000/api/health}"

response="$(curl -fsS -m 5 -w "\n%{http_code}" "$URL" || true)"
body="${response%$'\n'*}"
code="${response##*$'\n'}"

if [ "$code" != "200" ]; then
  echo "✗ Health check failed (HTTP $code): $body" >&2
  exit 1
fi

ok="$(echo "$body" | sed -n 's/.*"ok":\s*\([a-z]*\).*/\1/p')"
if [ "$ok" != "true" ]; then
  echo "✗ Health check reports ok=false: $body" >&2
  exit 1
fi

echo "✅ Health OK: $body"
