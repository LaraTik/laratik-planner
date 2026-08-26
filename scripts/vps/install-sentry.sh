#!/usr/bin/env bash
# scripts/vps/install-sentry.sh
#
# M4 follow-up — OBS-001 (Sentry DSN + source-map upload + probe). Idempotent.
#
# What it does, in order:
#   1. Backs up /opt/laratik-planner/.env to .env.bak.<timestamp>
#   2. Writes SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN,
#      SENTRY_ORG, SENTRY_PROJECT, SENTRY_PROBE_TOKEN to .env
#      (idempotent — replaces existing values if present).
#      SENTRY_ORG + SENTRY_PROJECT are required for the build-time
#      source-map upload to actually fire in next.config.ts →
#      withSentryConfig; without them, events still flow but every
#      stack trace is minified. SENTRY_PROBE_TOKEN gates the
#      /api/sentry-probe route used in step 6.
#   3. Locks the .env to root:600
#   4. Pulls + restarts the app so the new env is read
#   5. Verifies the SDK booted by grepping the container log
#   6. Fires a real probe event via the guarded /api/sentry-probe
#      route so the operator can confirm ingest in the Sentry UI
#      before declaring the install done. (Earlier versions asked
#      the operator to trigger an error manually; that made it easy
#      to mistake "no events arrived" for "Sentry is broken".)
#   7. Prints the exact `printenv` shape for the operator to confirm.
#
# Usage (on the VPS, with the new values in your shell or 1Password):
#
#   SENTRY_DSN='https://...' \
#   NEXT_PUBLIC_SENTRY_DSN='https://...' \
#   SENTRY_AUTH_TOKEN='sntryu_...' \
#   SENTRY_ORG='laratik' \
#   SENTRY_PROJECT='laratik-planner' \
#   SENTRY_PROBE_TOKEN="$(openssl rand -hex 32)" \
#   sudo -E bash scripts/vps/install-sentry.sh
#
# Required env vars (passed by the caller, NOT stored anywhere by
# this script):
#   SENTRY_DSN              — ingest URL
#   NEXT_PUBLIC_SENTRY_DSN  — same value, exposed to the browser
#   SENTRY_AUTH_TOKEN       — source-map upload token (project:releases,
#                             project:debug-files, project:write)
#   SENTRY_ORG              — org slug from sentry.io (Settings → General)
#   SENTRY_PROJECT          — project slug from sentry.io (project page)
#   SENTRY_PROBE_TOKEN      — shared secret for /api/sentry-probe; the
#                             install script posts to that route with
#                             this token to confirm ingest. Generate
#                             with: openssl rand -hex 32
#
# The script never logs the values, never writes them to a file
# other than .env, and never includes them in error output.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "✗ must run as root (sudo -E bash scripts/vps/install-sentry.sh)" >&2
  exit 2
fi

for var in SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_PROBE_TOKEN; do
  if [[ -z "${!var:-}" ]]; then
    echo "✗ missing required env var: $var" >&2
    echo "  usage: SENTRY_DSN=... NEXT_PUBLIC_SENTRY_DSN=... SENTRY_AUTH_TOKEN=... \\" >&2
    echo "         SENTRY_ORG=... SENTRY_PROJECT=... SENTRY_PROBE_TOKEN=... \\" >&2
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

# 2. Idempotent write of the 6 vars. We use a python heredoc so we
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
    "SENTRY_ORG": os.environ["SENTRY_ORG"],
    "SENTRY_PROJECT": os.environ["SENTRY_PROJECT"],
    "SENTRY_PROBE_TOKEN": os.environ["SENTRY_PROBE_TOKEN"],
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
echo "✓ wrote 6 Sentry keys to $ENV_FILE"

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
EXPECTED=$'NEXT_PUBLIC_SENTRY_DSN\nSENTRY_AUTH_TOKEN\nSENTRY_DSN\nSENTRY_ORG\nSENTRY_PROJECT\nSENTRY_PROBE_TOKEN'
if [[ "$LOADED" == "$EXPECTED" ]]; then
  echo "✓ all 6 Sentry env vars present inside the running container"
else
  echo "✗ env mismatch — container has:"
  echo "$LOADED" | sed 's/^/    /'
  exit 5
fi

# 7. Fire a real probe event. The /api/sentry-probe route is a
#    guarded endpoint that calls Sentry.captureMessage("install-probe").
#    This is the difference between "the SDK booted" and "Sentry is
#    actually receiving events" — earlier versions left the operator
#    to trigger an error manually, which made it easy to mistake
#    "no events arrived" for "Sentry is broken".
#
#    We POST from the host (loopback) so the route sees a normal
#    request. The route itself enforces:
#      - a shared secret (set in .env as SENTRY_PROBE_TOKEN, also
#        sent in the x-sentry-probe header below)
#    so a leaked URL is not enough to spam the Sentry project.
#    SENTRY_PROBE_TOKEN is now required by the validation loop above,
#    so this step always runs.
PROBE_HTTP=$(curl -s -o /tmp/sentry-probe.out -w "%{http_code}" \
  -X POST -H "x-sentry-probe: $SENTRY_PROBE_TOKEN" \
  "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}/api/sentry-probe" \
  --max-time 10 || echo "000")
if [[ "$PROBE_HTTP" == "200" ]]; then
  echo "✓ probe event sent (HTTP 200 — confirm in Sentry UI)"
else
  echo "  probe returned HTTP $PROBE_HTTP — open /tmp/sentry-probe.out to debug"
fi

# 8. Final report. The user checks the Sentry UI to confirm the
#    probe event lands.
cat <<'OUT'

────────────────────────────────────────────────────────────
✓ Sentry wired. Next: confirm the probe event in the UI.

  1. Open https://laratik.sentry.io/issues/?environment=production
     in your browser.
  2. Within 60 seconds of this script finishing, the
     `install-probe` event should appear with the tag
     environment:production and the release SHA matching this
     deploy.
  3. If no event: re-check the DSN. The most common cause is a
     copy-paste typo. Rotate the DSN in Sentry, re-paste via
     `sudo -e`, and re-run this script.

The .env backup is at:
  BACKUP

To rotate later, edit $ENV_FILE and run:
  cd $PROJECT_DIR && docker compose up -d --no-deps app
────────────────────────────────────────────────────────────
OUT
