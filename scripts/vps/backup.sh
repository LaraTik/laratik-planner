#!/usr/bin/env bash
# scripts/vps/backup.sh — VPS-side. pg_dump to /var/backups + offsite (restic).
# Intended for cron: see /etc/cron.d/laratik-planner-backup.
set -euo pipefail

BACKUP_DIR="/var/backups/laratik-planner"
TS="$(date -u +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/planner-${TS}.sql.gz"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Dumping Postgres → $FILE"
cd /opt/laratik-planner
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-planner}" -d "${POSTGRES_DB:-planner}" \
  | gzip > "$FILE"

gzip -t "$FILE"
if [ ! -s "$FILE" ]; then
  echo "Backup is empty" >&2
  exit 1
fi
sha256sum "$FILE" > "${FILE}.sha256"

echo "[$(date -Iseconds)] $(du -h "$FILE" | cut -f1) written"

# Prune old local backups
find "$BACKUP_DIR" -type f -mtime "+${KEEP_DAYS}" \( -name "*.sql.gz" -o -name "*.sql.gz.sha256" \) -delete

# Optional: restic offsite (uncomment + configure when repo is set up)
# if command -v restic >/dev/null 2>&1 && [ -f /root/.config/restic/env ]; then
#   # shellcheck disable=SC1091
#   source /root/.config/restic/env
#   restic backup "$FILE" --tag laratik-planner
#   restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --tag laratik-planner
# fi

echo "[$(date -Iseconds)] ✅ Done"
