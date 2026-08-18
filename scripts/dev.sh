#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/dev.sh — local dev one-shot
# Brings up Postgres in Docker, waits for it to be ready, runs migrations,
# and starts `pnpm dev` natively (for HMR speed).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cmd="${1:-up}"

case "$cmd" in
  up|"")
    echo "→ Starting Postgres (docker compose -f docker-compose.dev.yml up -d)…"
    docker compose -f docker-compose.dev.yml up -d postgres

    echo "→ Waiting for Postgres to be ready…"
    for i in {1..30}; do
      if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U planner -d planner >/dev/null 2>&1; then
        echo "  Postgres ready after ${i}s"
        break
      fi
      sleep 1
    done

    if [ ! -f .env ]; then
      echo "→ Creating .env from .env.example (no real secrets yet)"
      cp .env.example .env
    fi

    echo "→ Running migrations (Goal 0: no-op)…"
    pnpm db:migrate || true

    echo "→ Starting Next.js dev server (http://localhost:3000)…"
    exec pnpm dev
    ;;

  test)
    shift
    exec pnpm test "$@"
    ;;

  test:e2e)
    shift
    exec pnpm test:e2e "$@"
    ;;

  reset)
    echo "→ Dropping Postgres volume and recreating…"
    docker compose -f docker-compose.dev.yml down -v
    docker compose -f docker-compose.dev.yml up -d postgres
    echo "→ Done. Run scripts/dev.sh to start the app."
    ;;

  down)
    docker compose -f docker-compose.dev.yml down
    ;;

  *)
    echo "Usage: $0 {up|test|test:e2e|reset|down}" >&2
    exit 1
    ;;
esac
