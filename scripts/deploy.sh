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
# Capture the previous app image for rollback. Normalize to a fully-qualified
# ghcr.io/... name; if the prior container was built under a different naming
# scheme (e.g. a stale `laratik-planner:latest` from before M3a), skip the
# rollback rather than try to pull a tag that no longer exists.
PREVIOUS_IMAGE_RAW="$(docker inspect --format '{{.Config.Image}}' laratik-planner-app-1 2>/dev/null || true)"
if [[ "$PREVIOUS_IMAGE_RAW" == ghcr.io/* ]]; then
  PREVIOUS_IMAGE="$PREVIOUS_IMAGE_RAW"
else
  PREVIOUS_IMAGE=""
fi
# Normalize: docker inspect returns the short form `laratik-planner:latest` if
# the previous container was started with the short name (e.g. an early
# pre-M3a deploy, or a manual `docker run`). Without the registry prefix,
# `docker compose pull` will 403 on a private image. Prefix it so the
# rollback path is always able to pull the previous image.
if [[ -n "$PREVIOUS_IMAGE" && "$PREVIOUS_IMAGE" != *"/"* ]]; then
  PREVIOUS_IMAGE="ghcr.io/laratik/${PREVIOUS_IMAGE}"
fi

echo "→ Deploying ${APP_IMAGE}"

# The `ghcr.io/laratik/laratik-planner{-migrator}` images are private, so
# the VPS-side docker daemon needs to be logged in to GHCR before pulling.
# The deploy workflow passes GHCR_PAT (a fine-grained PAT with
# read:packages on the LaraTik org) + GHCR_USER (any user in the org,
# the PAT carries the actual auth) via env. Skip silently if neither is
# set (e.g. local testing) — `docker pull` will then fail with a clear
# "unauthorized" error which surfaces in the deploy log.
if [[ -n "${GHCR_PAT:-}" && -n "${GHCR_USER:-}" ]]; then
  echo "→ Logging in to GHCR as ${GHCR_USER}…"
  echo "${GHCR_PAT}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin >/dev/null
  GHCR_LOGGED_IN=1
  trap '[[ "${GHCR_LOGGED_IN:-0}" == "1" ]] && docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
else
  echo "→ GHCR_PAT / GHCR_USER not set; assuming GHCR images are public or already logged in"
fi

echo "→ Preflight: verifying authentication providers are configured…"
./scripts/vps/preflight.sh

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
  else
    echo "→ No prior image to roll back to (first deploy or previous image is unresolvable). Leaving new release in place; investigate manually."
  fi
  exit 1
fi

echo "✅ Deploy complete. Image: ${APP_IMAGE}"
