#!/usr/bin/env bash
# scripts/vps/social-metrics-sync.sh
#
# M4 — social-metrics cron caller. Invokes the authenticated route
# /api/cron/social-metrics once per cron tick (every 15 minutes per
# scripts/vps/install-cron.sh). The route requires the CRON_SECRET
# in an `Authorization: Bearer <secret>` header.
#
# Security:
#   - The secret is read from /opt/laratik-planner/.env and never
#     echoed to stdout/stderr.
#   - The script always sets a 60-second timeout so a hung app
#     cannot keep the cron job alive forever.
#   - The script is idempotent and exits non-zero only on network
#     failure or non-2xx response, so cron sends the standard mail
#     for any anomaly.
#
# On the VPS this file lives at /opt/laratik-planner/scripts/vps/.
# Source the .env to get CRON_SECRET; fall back to the env if the
# file is missing (e.g. when developing locally).

set -u

# Allow either /opt/laratik-planner/.env or a developer-provided env.
if [ -f /opt/laratik-planner/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /opt/laratik-planner/.env
  set +a
fi

: "${CRON_SECRET:?CRON_SECRET is required for the social-metrics cron caller}"

APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3100}"
ENDPOINT="${APP_BASE_URL%/}/api/cron/social-metrics"

# -s silent, -S show errors, -o write body, -w write status, --max-time 60s.
HTTP_RESPONSE="$(curl --silent --show-error --max-time 60 \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  --write-out '\n__HTTP_STATUS__:%{http_code}\n' \
  "${ENDPOINT}" 2>&1)" || {
  echo "[social-metrics] curl failed to reach ${ENDPOINT}" >&2
  exit 1
}

HTTP_STATUS="$(printf '%s' "${HTTP_RESPONSE}" | awk -F: '/^__HTTP_STATUS__:/ {print $2}')"
HTTP_BODY="$(printf '%s' "${HTTP_RESPONSE}" | sed '/^__HTTP_STATUS__:/d')"

case "${HTTP_STATUS}" in
  2*)
    # Always silent on success — cron only mails on non-zero exit.
    ;;
  401)
    echo "[social-metrics] 401 from ${ENDPOINT} — check CRON_SECRET and proxy auth" >&2
    exit 2
    ;;
  5*)
    echo "[social-metrics] ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 3
    ;;
  *)
    echo "[social-metrics] unexpected ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 4
    ;;
esac
