#!/usr/bin/env bash
# scripts/vps/shell.sh — VPS-side. Open an interactive shell in the prod app.
set -euo pipefail
cd /opt/laratik-planner
exec docker compose exec "${1:-app}" sh
