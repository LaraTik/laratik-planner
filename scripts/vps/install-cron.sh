#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/vps/install-cron.sh — first-time install of laratik-planner crons.
#
# Usage:
#   sudo ./scripts/vps/install-cron.sh              # install (idempotent)
#   sudo ./scripts/vps/install-cron.sh --dry-run    # show what would change
#   sudo ./scripts/vps/install-cron.sh --uninstall  # remove the cron file
#
# Idempotent: re-running the script is a no-op once the entries are present.
# The cron file lives at /etc/cron.d/laratik-planner and is owned by root with
# mode 0640 (root:crontab). The runbook documents both entries; this script
# is the canonical install.
#
# Cron entries installed:
#   1. Daily 03:30 UTC — Postgres pg_dump backup (see scripts/vps/backup.sh)
#   2. Daily 07:30 UTC — SMTP cert-expiry probe (see scripts/vps/check-smtp-cert.sh)
#      Exits 0/1 = silent; exit 2/3 = mail root (cron emails any non-zero exit).
#   3. Every 15 minutes — Social metrics sync (see scripts/vps/social-metrics-sync.sh)
#      Calls /api/cron/social-metrics. Returns the standard cron shape
#      { claimed, succeeded, failed, needsReauth, retention } on stdout.
#
# Why a single cron file: cron on Debian/Ubuntu reads /etc/cron.d/* owned by
# root. Putting both entries in one file makes the deploy chain surface-able
# (one file to inspect, one file to remove) and matches the runbook's
# `/etc/cron.d/laratik-planner-backup` recommendation.
#
# Why not crontab: a crontab entry is harder to audit, harder to install
# idempotently, and lives in /var/spool/cron/crontabs/ which is
# per-user, not the standard admin location.
#
# Bash compatibility: bash 3.2+ (macOS + Linux). No associative arrays.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CRON_FILE="${CRON_FILE:-/etc/cron.d/laratik-planner}"
PROJECT_DIR="${PROJECT_DIR:-/opt/laratik-planner}"
BACKUP_SCHEDULE="30 3 * * *"
CERT_SCHEDULE="30 7 * * *"
SOCIAL_SCHEDULE="*/15 * * * *"
BACKUP_CMD="${PROJECT_DIR}/scripts/vps/backup.sh"
CERT_CMD="${PROJECT_DIR}/scripts/vps/check-smtp-cert.sh"
SOCIAL_CMD="${PROJECT_DIR}/scripts/vps/social-metrics-sync.sh"

DRY_RUN=0
UNINSTALL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=1; shift ;;
    --uninstall)  UNINSTALL=1; shift ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ "$UNINSTALL" == "1" ]]; then
  if [[ ! -f "$CRON_FILE" ]]; then
    echo "[install-cron] $CRON_FILE does not exist; nothing to do."
    exit 0
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[install-cron] [DRY-RUN] would remove $CRON_FILE"
    exit 0
  fi
  rm -f "$CRON_FILE"
  echo "[install-cron] ✅ Removed $CRON_FILE"
  exit 0
fi

# Build the cron body. Each line:
#   m h dom mon dow user command
# - 30 3 * * * root /opt/.../backup.sh >> /var/log/...backup.log 2>&1
# - 30 7 * * * root /opt/.../check-smtp-cert.sh >/dev/null
#
# The backup cmd pipes stdout+stderr into /var/log/laratik-planner-backup.log
# (the runbook documents this; logrotate is the vps-ops /etc/logrotate.d rule).
#
# The cert probe writes a single JSON line to stdout and exits with the
# documented 0/1/2/3 code. cron only emails root on non-zero exit, so
# exit 1 (warn, 14-30d remaining) DOES email root and exit 0 (healthy) does
# not — that matches the runbook's "30/14/7 days before expiry" alert tiers.
CRON_BODY="# laratik-planner crons — installed by scripts/vps/install-cron.sh
# Do not edit by hand; re-run the installer to make changes idempotently.
# Backup: 03:30 UTC daily. Cert probe: 07:30 UTC daily. Social sync: every 15m.
${BACKUP_SCHEDULE} root ${BACKUP_CMD} >> /var/log/laratik-planner-backup.log 2>&1
${CERT_SCHEDULE} root ${CERT_CMD} >/dev/null
${SOCIAL_SCHEDULE} root ${SOCIAL_CMD} >/var/log/laratik-planner-social-sync.log 2>&1
"

# Verify the target scripts exist (and are executable) before installing the
# cron. A cron that points at a missing script fails silently — the runbook
# already calls this out as the failure mode install-cron.sh prevents.
for cmd in "$BACKUP_CMD" "$CERT_CMD" "$SOCIAL_CMD"; do
  if [[ ! -x "$cmd" ]]; then
    echo "✗ install-cron: $cmd is missing or not executable." >&2
    echo "  Run: chmod +x $cmd" >&2
    exit 3
  fi
done

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[install-cron] [DRY-RUN] would write $CRON_FILE with:"
  echo "----"
  echo "$CRON_BODY"
  echo "----"
  exit 0
fi

# Idempotency: if the file already exists with the same body, do nothing.
if [[ -f "$CRON_FILE" ]] && diff -q <(printf '%s' "$CRON_BODY") "$CRON_FILE" >/dev/null 2>&1; then
  echo "[install-cron] $CRON_FILE is already up to date; nothing to do."
  exit 0
fi

# Install: write to a temp file in the same dir, then atomically move
# (cron re-reads on SIGHUP; an in-place rewrite is the safe path).
TMP="$(mktemp "${CRON_FILE}.tmp.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
printf '%s' "$CRON_BODY" > "$TMP"
chmod 0640 "$TMP"
chown root:crontab "$TMP" 2>/dev/null || chown root:root "$TMP"
mv -f "$TMP" "$CRON_FILE"
trap - EXIT

echo "[install-cron] ✅ Installed $CRON_FILE"
echo "  - 03:30 UTC: $BACKUP_CMD (writes /var/log/laratik-planner-backup.log)"
echo "  - 07:30 UTC: $CERT_CMD (emails root on exit 1/2/3)"
echo
echo "  Verify with:  cat $CRON_FILE"
echo "  Test backup:  sudo -u root ${BACKUP_CMD}"
echo "  Test cert:    sudo -u root ${CERT_CMD}; echo exit=\$?"
