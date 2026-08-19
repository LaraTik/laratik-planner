#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/deploy.sh — VPS-side transactional deployment entrypoint.
#
# Usage:
#   cd /opt/laratik-planner
#   ./scripts/deploy.sh <immutable-sha>
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

IMAGE_TAG="${1:-latest}"
if [[ ! "$IMAGE_TAG" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "Invalid image tag" >&2
  exit 2
fi
export IMAGE_TAG
APP_IMAGE="ghcr.io/laratik/laratik-planner:${IMAGE_TAG}"
MIGRATOR_IMAGE="ghcr.io/laratik/laratik-planner-migrator:${IMAGE_TAG}"
export APP_IMAGE MIGRATOR_IMAGE
PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' laratik-planner-app-1 2>/dev/null || true)"

echo "→ Deploying ${APP_IMAGE}"

echo "→ Pulling immutable app and migrator images…"
docker compose pull app migrate

echo "→ Creating and verifying pre-migration backup…"
./scripts/vps/backup.sh

echo "→ Running migrations…"
docker compose run --rm migrate

echo "→ Recreating app container…"
docker compose up -d --no-deps app

echo "→ Health check…"
if ! HEALTH_URL=http://127.0.0.1:3100/api/health ./scripts/vps/health-check.sh; then
  echo "✗ New release failed readiness" >&2
  if [ -n "$PREVIOUS_IMAGE" ]; then
    echo "→ Rolling application image back to ${PREVIOUS_IMAGE}"
    export APP_IMAGE="$PREVIOUS_IMAGE"
    docker compose up -d --no-deps app
    HEALTH_URL=http://127.0.0.1:3100/api/health ./scripts/vps/health-check.sh || true
  fi
  exit 1
fi

echo "✅ Deploy complete. Image: ${APP_IMAGE}"
