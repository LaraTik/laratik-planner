#!/usr/bin/env bash
# scripts/vps/health-check.sh — VPS-side. Hit the health endpoint and exit non-zero
# if the app is not healthy. Used by the deploy script and the cron watchdog.
#
# Retries up to 30 times (60s total, 2s between attempts) because the app
# container can be "Started" in docker-compose before the HTTP port is bound
# — without the retry, the curl in scripts/deploy.sh:53 fires too early
# after `docker compose up -d` returns and reports a false-negative failure.
set -euo pipefail
URL="${HEALTH_URL:-http://localhost:3000/api/health}"
MAX_ATTEMPTS="${HEALTH_CHECK_MAX_ATTEMPTS:-30}"
SLEEP_SECONDS="${HEALTH_CHECK_SLEEP_SECONDS:-2}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  response="$(curl -fsS -m 5 -w "\n%{http_code}" "$URL" || true)"
  body="${response%$'\n'*}"
  code="${response##*$'\n'}"

  if [ "$code" = "200" ]; then
    ok="$(echo "$body" | sed -n 's/.*"ok":\s*\([a-z]*\).*/\1/p')"
    if [ "$ok" = "true" ]; then
      echo "✅ Health OK (attempt ${attempt}/${MAX_ATTEMPTS}): $body"
      exit 0
    fi
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "→ Health not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}, code=${code:-000}), waiting ${SLEEP_SECONDS}s…"
    sleep "$SLEEP_SECONDS"
  fi
done

echo "✗ Health check failed after ${MAX_ATTEMPTS} attempts (~$((MAX_ATTEMPTS * SLEEP_SECONDS))s) at ${URL}: code=${code:-000} body=${body:-empty}" >&2
exit 1
