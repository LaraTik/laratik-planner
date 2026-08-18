#!/usr/bin/env bash
# scripts/vps/migrate.sh — VPS-side. Run Drizzle migrations.
set -euo pipefail
cd /opt/laratik-planner
docker compose exec -T app pnpm db:migrate
