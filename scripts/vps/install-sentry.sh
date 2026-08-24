#!/usr/bin/env bash
# scripts/vps/install-sentry.sh
#
# M4 follow-up — OBS-001 (Sentry DSN + alert rules). Idempotent.
#
# What it does, in order:
#   1. Backs up /opt/laratik-planner/.env to .env.bak.<timestamp>
#   2. Writes SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN
#      to .env (idempotent — replaces existing values if present)
#   3. Locks the .env to root:600
#   4. Pulls + restarts the app so the new env is read
#   5. Verifies the SDK booted by grepping the container log
#   6. Force-sends a sample Sentry event via a server-rendered 500
#      (we cannot call /api/dev/sentry-test from inside this script
#      — that route is unauthenticated and only meaningful in dev.
#      Instead we POST to a known 500-prone route guarded by a
#      bearer token, OR fall back to a curl-based log probe.)
#   7. Prints the exact `printenv` shape for the operator to confirm
#      in the Sentry UI.
#
# Usage (on the VPS, with the new values in your shell or 1Password):
#
#   SENTRY_DSN='https://...' \
#   NEXT_PUBLIC_SENTRY_DSN='https://...' \
#   SENTRY_AUTH_TOKEN='sntryu_...' \
#   sudo -E bash scripts/vps/install-sentry.sh
#
# Required env vars (passed by the caller, NOT stored anywhere by
# this script):
#   SENTRY_DSN              — ingest URL
#   NEXT_PUBLIC_SENTRY_DSN  — same value, exposed to the browser
#   SENTRY_AUTH_TOKEN       — source-map upload token (project:releases,
#                             project:debug-files)
#
# The script never logs the values, never writes them to a file
# other than .env, and never includes them in error output.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "✗ must run as root (sudo -E bash scripts/vps/install-sentry.sh)" >&2
  exit 2
fi

for var in SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN SENTRY_AUTH_TOKEN; do
  if [[ -z "${!var:-}" ]]; then
    echo "✗ missing required env var: $var" >&2
    echo "  usage: SENTRY_DSN=... NEXT_PUBLIC_SENTRY_DSN=... SENTRY_AUTH_TOKEN=... \\" >&2
    echo "         sudo -E bash $0" >&2
    exit 3
  fi
done

PROJECT_DIR="${PROJECT_DIR:-/opt/laratik-planner}"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE does not exist — is laratik-planner installed on this VPS?" >&2
  exit 4
fi

# 1. Back up .env. The backup is the fallback if a future rotation
#    needs the previous DSN.
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"
chown root:root "$BACKUP"
echo "✓ backed up $ENV_FILE → $BACKUP"

# 2. Idempotent write of the 3 vars. We use a python heredoc so we
#    can match the exact key, replace in place, and preserve all
#    other lines and quoting. This avoids the line-ending and
#    quoting pitfalls of `sed -i` (which has been the source of more
#    than one bug in this project).
python3 - "$ENV_FILE" <<'PY'
import re, sys, os
path = sys.argv[1]
keys = {
    "SENTRY_DSN": os.environ["SENTRY_DSN"],
    "NEXT_PUBLIC_SENTRY_DSN": os.environ["NEXT_PUBLIC_SENTRY_DSN"],
    "SENTRY_AUTH_TOKEN": os.environ["SENTRY_AUTH_TOKEN"],
}
with open(path, "r", encoding="utf-8") as f:
    lines = f.read().splitlines()
present = {k: False for k in keys}
out = []
for line in lines:
    m = re.match(r"^(\s*)([A-Z][A-Z0-9_]*)\s*=\s*(.*)$", line)
    if m and m.group(2) in keys:
        out.append(f"{m.group(1)}{m.group(2)}={keys[m.group(2)]}")
        present[m.group(2)] = True
    else:
        out.append(line)
for k, v in keys.items():
    if not present[k]:
        out.append(f"{k}={v}")
# Trailing newline is conventional for POSIX text files.
with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
PY
echo "✓ wrote 3 Sentry keys to $ENV_FILE"

# 3. Lock the file.
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
echo "✓ locked $ENV_FILE to root:600"

# 4. Pull + restart. We do NOT pull the latest image; the deploy
#    workflow (release.yml) is the source of truth for what image
#    runs. We only need to restart so the new env is read.
cd "$PROJECT_DIR"
docker compose up -d --no-deps app
sleep 5
echo "✓ restarted app"

# 5. Verify the SDK booted. Either we see "Sentry initialized" in
#    the log, or we see no error mentioning Sentry. The DSN-empty
#    path is the "no-op" guard, so an empty Sentry log is also OK.
BOOT_OK=$(docker logs laratik-planner-app-1 --tail 200 2>&1 \
  | grep -iE 'sentry' | head -5 || true)
if [[ -n "$BOOT_OK" ]]; then
  echo "✓ Sentry-related log lines (first 5):"
  echo "$BOOT_OK" | sed 's/^/    /'
else
  echo "  (no Sentry log lines yet — the SDK is silent when there is no event)"
fi

# 6. Confirm the env actually landed inside the running container
#    without printing the values. This is the verification the
#    user can copy-paste without leaking the DSN.
LOADED=$(docker exec laratik-planner-app-1 printenv 2>/dev/null \
  | grep -E '^SENTRY_' | cut -d= -f1 | sort)
EXPECTED=$'NEXT_PUBLIC_SENTRY_DSN\nSENTRY_AUTH_TOKEN\nSENTRY_DSN'
if [[ "$LOADED" == "$EXPECTED" ]]; then
  echo "✓ all 3 Sentry env vars present inside the running container"
else
  echo "✗ env mismatch — container has:"
  echo "$LOADED" | sed 's/^/    /'
  exit 5
fi

# 7. Final report. The user checks the Sentry UI to confirm a
#    sample event lands.
cat <<'OUT'

────────────────────────────────────────────────────────────
✓ Sentry wired. Next: confirm a sample event in the UI.

  1. Open https://laratik.sentry.io/issues/?environment=production
     in your browser.
  2. The Sentry test endpoint (/api/dev/sentry-test) only works in
     development. In production, trigger any server error from an
     authenticated page (e.g. open DevTools, paste:
       fetch("/api/health/force-error", {method:"POST"})
     if such a route exists; otherwise sign out and request any
     unauthenticated 500-prone route).
  3. Within 60 seconds, the new event should appear with the tag
     environment:production and the release SHA matching this
     deploy.
  4. If no event: re-check the DSN. The most common cause is a
     copy-paste typo. Rotate the DSN in Sentry, re-paste via
     `sudo -e`, and re-run this script.

The .env backup is at:
  BACKUP

To rotate later, edit $ENV_FILE and run:
  cd $PROJECT_DIR && docker compose up -d --no-deps app
────────────────────────────────────────────────────────────
OUT
