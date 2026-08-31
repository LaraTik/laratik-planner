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
EXPECTED_APP_VERSION="${EXPECTED_APP_VERSION:-}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  # 2026-08-31: dropped `-f` (--fail) so the body is captured even on
  # 5xx. The 2026-08-31 social-cron-admin deploy returned 503 with
  # an empty body, which made it impossible to tell which of the
  # four readiness checks (db / schema / storage / rateLimit)
  # tripped the gate. The health endpoint itself already returns
  # the per-check status on the 503 body, so we just need curl
  # to not throw it away.
  response="$(curl -sS -m 5 -w "\n%{http_code}" "$URL" || true)"
  body="${response%$'\n'*}"
  code="${response##*$'\n'}"

  if [ "$code" = "200" ]; then
    ok="$(echo "$body" | sed -n 's/.*"ok":\s*\([a-z]*\).*/\1/p')"
    if [ "$ok" = "true" ]; then
      version="$(echo "$body" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
      # The health endpoint now returns a 7-char short SHA (commit
      # 721afbe moved from the full 40-char SHA to keep the response
      # body small and stable for external consumers). The deploy
      # script, however, still passes the full SHA as
      # EXPECTED_APP_VERSION. Compare on a prefix of the expected
      # value, the length of the health-reported version, so the
      # deploy-time version match works for either format.
      if [ -z "$EXPECTED_APP_VERSION" ]; then
        echo "✅ Health OK (attempt ${attempt}/${MAX_ATTEMPTS}): $body"
        exit 0
      fi
      expected_prefix="${EXPECTED_APP_VERSION:0:${#version}}"
      if [ "$version" = "$expected_prefix" ]; then
        echo "✅ Health OK (attempt ${attempt}/${MAX_ATTEMPTS}): $body"
        exit 0
      fi
      echo "→ Health is ready but build is ${version:-missing}; waiting for ${EXPECTED_APP_VERSION:0:7}…"
    fi
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "→ Health not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}, code=${code:-000}), waiting ${SLEEP_SECONDS}s…"
    sleep "$SLEEP_SECONDS"
  fi
done

echo "✗ Health check failed after ${MAX_ATTEMPTS} attempts (~$((MAX_ATTEMPTS * SLEEP_SECONDS))s) at ${URL}: code=${code:-000} body=${body:-empty}" >&2
exit 1
