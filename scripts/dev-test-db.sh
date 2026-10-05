#!/usr/bin/env bash
# Local iteration helper: boot `next dev` against the disposable test DB.
#
# The seeded E2E content item is written into planner_test, so the dev
# server must point at the same database or the detail page 500s on a
# missing relation. Never run this with DATABASE_URL=planner.
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test}"
export AUTH_SECRET="laratik-e2e-auth-secret-not-for-production-2026"
export AGENCY_COOKIE_SECRET="laratik-e2e-agency-cookie-secret-not-for-production-2026"
export AUTH_TRUST_HOST="true"
export AUTH_URL="http://localhost:3000"
export NEXTAUTH_URL="http://localhost:3000"
exec pnpm dev
