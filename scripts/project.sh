#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/project.sh — local daily ops wrapper
# Mirrors the mavis-trader.sh / evolution.sh / erp.sh pattern in vps-ops.
# Runs against the local Docker stack (docker-compose.dev.yml).
#
# Usage:
#   ./scripts/project.sh status              # container states + health
#   ./scripts/project.sh logs [app|postgres] # tail logs
#   ./scripts/project.sh restart [app]       # bounce container
#   ./scripts/project.sh shell [app|postgres] # bash into container
#   ./scripts/project.sh health              # app + db reachability
#   ./scripts/project.sh migrate             # pnpm db:migrate
#   ./scripts/project.sh backup              # pg_dump → ./tmp/backups
#   ./scripts/project.sh rollback <sha>      # roll to previous image tag
#   ./scripts/project.sh env                 # show .env with secrets masked
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.dev.yml"

cmd="${1:-help}"
shift || true

mask_secret() {
  sed -E 's/=.*/=<REDACTED>/' "$ROOT/.env" 2>/dev/null || echo "  (no .env file)"
}

case "$cmd" in
  status)
    $COMPOSE ps
    ;;

  logs)
    svc="${1:-app}"
    $COMPOSE logs -f --tail=200 "$svc"
    ;;

  restart)
    svc="${1:-app}"
    $COMPOSE restart "$svc"
    ;;

  shell)
    svc="${1:-app}"
    $COMPOSE exec "$svc" sh
    ;;

  health)
    echo "→ Postgres:"
    $COMPOSE exec -T postgres pg_isready -U planner -d planner || echo "  ✗ Postgres not ready"
    echo "→ App:"
    curl -sS http://localhost:3000/api/health | head -c 500 || echo "  ✗ App not responding"
    echo ""
    ;;

  migrate)
    pnpm db:migrate
    ;;

  backup)
    mkdir -p tmp/backups
    ts="$(date -u +%Y%m%d-%H%M%S)"
    out="tmp/backups/planner-${ts}.sql.gz"
    echo "→ Dumping Postgres to $out…"
    $COMPOSE exec -T postgres pg_dump -U planner -d planner | gzip > "$out"
    echo "✅ $out ($(du -h "$out" | cut -f1))"
    ;;

  rollback)
    tag="${1:?usage: $0 rollback <sha-or-tag>}"
    echo "→ Rolling back to ${tag}…"
    sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=${tag}/" .env 2>/dev/null || true
    $COMPOSE pull app
    $COMPOSE up -d --no-deps app
    echo "✅ Rolled back to ${tag}"
    ;;

  env)
    echo "→ .env (secrets masked):"
    mask_secret
    ;;

  help|--help|-h|"")
    sed -n '3,17p' "$0" | sed 's/^# //'
    ;;

  *)
    echo "Unknown command: $cmd" >&2
    exit 1
    ;;
esac
