#!/usr/bin/env bash
# Authenticated caller for /api/cron/advertising-sync.
# The route is globally disabled until controlled Meta UAT enables it.

set -u

if [ -f /opt/laratik-planner/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /opt/laratik-planner/.env
  set +a
fi

: "${CRON_SECRET:?CRON_SECRET is required for the advertising-sync cron caller}"

APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3100}"
ENDPOINT="${APP_BASE_URL%/}/api/cron/advertising-sync"

HTTP_RESPONSE="$(curl --silent --show-error --max-time 60 \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  --write-out '\n__HTTP_STATUS__:%{http_code}\n' \
  "${ENDPOINT}" 2>&1)" || {
  echo "[advertising-sync] curl failed to reach ${ENDPOINT}" >&2
  exit 1
}

HTTP_STATUS="$(printf '%s' "${HTTP_RESPONSE}" | awk -F: '/^__HTTP_STATUS__:/ {print $2}')"
HTTP_BODY="$(printf '%s' "${HTTP_RESPONSE}" | sed '/^__HTTP_STATUS__:/d')"

case "${HTTP_STATUS}" in
  2*) ;;
  401)
    echo "[advertising-sync] 401 from ${ENDPOINT} — check CRON_SECRET and proxy auth" >&2
    exit 2
    ;;
  5*)
    echo "[advertising-sync] ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 3
    ;;
  *)
    echo "[advertising-sync] unexpected ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 4
    ;;
esac
