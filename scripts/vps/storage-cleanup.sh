#!/usr/bin/env bash
set -euo pipefail

# Reclaims storage-byte reservations and removes abandoned direct-upload
# objects. The cron secret is injected by the VPS operator, never committed.
BASE_URL="${PLANNER_URL:-https://planner.laratik.com}"
curl --fail --silent --show-error --max-time 55 \
  -H "Authorization: Bearer ${CRON_SECRET:?CRON_SECRET is required}" \
  -X POST "${BASE_URL}/api/cron/storage-cleanup"
printf '\n'
