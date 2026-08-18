#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/deploy.sh — LOCAL side. SSHes to laratik-vps, pulls the new image,
# recreates the app container, runs migrations, and health-checks.
#
# Usage:
#   ./scripts/deploy.sh                       # pulls :latest
#   ./scripts/deploy.sh <sha-or-tag>          # pulls specific image
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VPS_HOST="${VPS_HOST:-laratik-vps}"
REMOTE_DIR="/opt/laratik-planner"
IMAGE_TAG="${1:-latest}"
IMAGE="ghcr.io/laratik/laratik-planner:${IMAGE_TAG}"

echo "→ Deploying ${IMAGE} to ${VPS_HOST}:${REMOTE_DIR}"

ssh "${VPS_HOST}" "REMOTE_DIR=${REMOTE_DIR} IMAGE_TAG=${IMAGE_TAG} bash -s" <<'REMOTE'
set -euo pipefail
cd "${REMOTE_DIR}"

echo "→ Pulling ${IMAGE}…"
docker compose pull app

echo "→ Recreating app container…"
docker compose up -d --no-deps app

echo "→ Running migrations…"
docker compose exec -T app pnpm db:migrate || echo "  (migrations step skipped or no-op)"

echo "→ Health check…"
./scripts/health-check.sh
REMOTE

echo "✅ Deploy complete. Image: ${IMAGE}"
