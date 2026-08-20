#!/usr/bin/env bash
# scripts/vps/preflight.sh — VPS-side. Verify the project .env on the VPS has
# at least one complete authentication provider before a new release is
# rolled out.
#
# Why this exists:
#   The auth provider list in src/lib/auth/config.ts is built by filtering
#   `serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET` (and the
#   SMTP block) at request time. If the VPS .env is missing those vars, the
#   Google provider is silently dropped and the sign-in page responds with
#   `Configuration` for every click of "Continue with Google" — see
#   src/app/signin/auth-error-codes.ts:9-10. The deploy script has no
#   awareness of providers; without this check, a bad .env rolls out
#   silently and the only signal is user-facing sign-in failures.
#
# This is a structural check on the .env file at PREFLIGHT_ENV_FILE
# (default ./.env, which on the VPS resolves to /opt/laratik-planner/.env).
# It does not contact the running container, so it works on the very first
# deploy (before any image is pulled) and on subsequent deploys.
#
# Bash compatibility: targets bash 3.2 (macOS default) and bash 4+ (Linux).
# Avoids associative arrays; uses grep/sed to extract values.
#
# Exit codes:
#   0  At least one provider is complete; proceed with the deploy.
#   1  No complete provider; print issues and abort the deploy.
#   2  Cannot read the .env file (missing or unreadable). Treat as a
#      deploy error, not a configuration error.
set -euo pipefail

ENV_FILE="${PREFLIGHT_ENV_FILE:-./.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Preflight: $ENV_FILE does not exist." >&2
  echo "  The app container's env_file directive requires this file." >&2
  echo "  On the VPS it must live at /opt/laratik-planner/.env (the same" >&2
  echo "  directory as docker-compose.yml)." >&2
  exit 2
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "✗ Preflight: $ENV_FILE is not readable." >&2
  exit 2
fi

# Extract a single KEY's value from the .env file. Strips surrounding
# single or double quotes. Returns empty string if the key is not present.
get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 || true)"
  if [[ -z "$line" ]]; then
    printf ''
    return 0
  fi
  local value="${line#*=}"
  # Strip surrounding quotes if both present.
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$value"
}

google_client_id="$(get_env_value GOOGLE_CLIENT_ID)"
google_client_secret="$(get_env_value GOOGLE_CLIENT_SECRET)"
smtp_host="$(get_env_value SMTP_HOST)"
smtp_user="$(get_env_value SMTP_USER)"
smtp_password="$(get_env_value SMTP_PASSWORD)"
smtp_from="$(get_env_value SMTP_FROM)"

google_complete=0
if [[ -n "$google_client_id" && -n "$google_client_secret" ]]; then
  google_complete=1
fi

smtp_complete=0
if [[ -n "$smtp_host" && -n "$smtp_user" && -n "$smtp_password" && -n "$smtp_from" ]]; then
  smtp_complete=1
fi

if [[ $google_complete -eq 0 && $smtp_complete -eq 0 ]]; then
  echo "✗ Preflight failed. Refusing to deploy." >&2
  echo >&2
  echo "  No complete authentication provider in $ENV_FILE." >&2
  echo "  Need EITHER" >&2
  echo "    (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) for Google OAuth, OR" >&2
  echo "    (SMTP_HOST + SMTP_USER + SMTP_PASSWORD + SMTP_FROM) for the magic-link fallback." >&2
  echo >&2
  echo "  After updating $ENV_FILE, restart the running container so the new" >&2
  echo "  env_file is read:" >&2
  echo "    docker compose up -d --no-deps app" >&2
  exit 1
fi

providers=""
[[ $google_complete -eq 1 ]] && providers+="Google "
[[ $smtp_complete -eq 1 ]] && providers+="SMTP "
echo "✅ Preflight OK: ${providers}provider(s) configured in $ENV_FILE."
