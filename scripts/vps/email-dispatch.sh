#!/usr/bin/env bash
# scripts/vps/email-dispatch.sh (FEAT-10)
#
# Email outbox cron caller. Mirrors outbox-dispatch.sh: invokes
# the authenticated route /api/cron/email-dispatch once per cron
# tick (every minute per scripts/vps/install-cron.sh). The route
# requires the CRON_SECRET in an `Authorization: Bearer <secret>`
# header.
#
# Reads due outbox_events rows using the email-specific delivery
# state, fans them out as Mailcow emails honouring
# notification_preferences.email_enabled, and leaves in-app
# delivery state untouched. Per-recipient failures remain in the
# email queue for the next tick (retry-safe).
#
# Security + exit codes match outbox-dispatch.sh so the cron
# behaviour is uniform.

set -u

# Allow either /opt/laratik-planner/.env or a developer-provided env.
if [ -f /opt/laratik-planner/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /opt/laratik-planner/.env
  set +a
fi

: "${CRON_SECRET:?CRON_SECRET is required for the email-dispatch cron caller}"

APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3100}"
ENDPOINT="${APP_BASE_URL%/}/api/cron/email-dispatch"

HTTP_RESPONSE="$(curl --silent --show-error --max-time 60 \
  --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  --write-out '\n__HTTP_STATUS__:%{http_code}\n' \
  "${ENDPOINT}" 2>&1)" || {
  echo "[email-dispatch] curl failed to reach ${ENDPOINT}" >&2
  exit 1
}

HTTP_STATUS="$(printf '%s' "${HTTP_RESPONSE}" | awk -F: '/^__HTTP_STATUS__:/ {print $2}')"
HTTP_BODY="$(printf '%s' "${HTTP_RESPONSE}" | sed '/^__HTTP_STATUS__:/d')"

case "${HTTP_STATUS}" in
  2*)
    # Always silent on success — cron only mails on non-zero exit.
    ;;
  401)
    echo "[email-dispatch] 401 from ${ENDPOINT} — check CRON_SECRET and proxy auth" >&2
    exit 2
    ;;
  5*)
    echo "[email-dispatch] ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 3
    ;;
  *)
    echo "[email-dispatch] unexpected ${HTTP_STATUS} from ${ENDPOINT}: ${HTTP_BODY}" >&2
    exit 4
    ;;
esac
