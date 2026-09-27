#!/usr/bin/env bash
set -euo pipefail

# Enforces retention on the in-app error mirror.
#
# Closing the server-side capture gap (instrumentation.ts `onRequestError`
# now records every render / route-handler / server-action failure) turns
# a rare write path into a potentially hot one. Retention ships in the
# same change for exactly that reason: 30 days for `app_error_event`,
# 90 days for `app_error_group` but only once a group has been resolved.
#
# Idempotent — a second run in the same day deletes nothing and still
# exits 0. `curl --fail` turns a non-2xx into a non-zero exit, which the
# vps-ops cron surfaces as an alert.
#
# The cron secret is injected by the VPS operator, never committed.
BASE_URL="${PLANNER_URL:-https://planner.laratik.com}"
curl --fail --silent --show-error --max-time 55 \
  -H "Authorization: Bearer ${CRON_SECRET:?CRON_SECRET is required}" \
  -X POST "${BASE_URL}/api/cron/error-retention"
printf '\n'
