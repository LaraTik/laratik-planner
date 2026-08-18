#!/usr/bin/env bash
# scripts/vps/logs.sh — VPS-side. Tail the prod app logs.
set -euo pipefail
cd /opt/laratik-planner
exec docker compose logs -f --tail=200 "${1:-app}"
