#!/usr/bin/env bash
# Hourly cron caller for authenticated content deadline reminders.

set -u

if [ -f /opt/laratik-planner/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /opt/laratik-planner/.env
  set +a
fi

: "${CRON_SECRET:?CRON_SECRET is required for the deadline reminders cron caller}"

APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3100}"
ENDPOINT="${APP_BASE_URL%/}/api/cron/deadline-reminders"

HTTP_RESPONSE="$(curl --silent --show-error --max-time 60 \
  --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  --write-out '\n__HTTP_STATUS__:%{http_code}\n' \
  "${ENDPOINT}" 2>&1)" || {
  echo "[deadline-reminders] curl failed to reach ${ENDPOINT}" >&2
  exit 1
}

HTTP_STATUS="$(printf '%s' "${HTTP_RESPONSE}" | awk -F: '/^__HTTP_STATUS__:/ {print $2}')"
HTTP_BODY="$(printf '%s' "${HTTP_RESPONSE}" | sed '/^__HTTP_STATUS__:/d')"

case "${HTTP_STATUS}" in
  2*) ;;
  401)
    echo "[deadline-reminders] 401 from ${ENDPOINT} — check CRON_SECRET and proxy auth" >&2
    exit 2
    ;;
  5*)
    echo "[deadline-reminders] ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 3
    ;;
  *)
    echo "[deadline-reminders] unexpected ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 4
    ;;
esac
