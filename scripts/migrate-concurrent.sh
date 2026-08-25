#!/usr/bin/env bash
# scripts/migrate-concurrent.sh
#
# Apply a migration file containing CREATE INDEX CONCURRENTLY statements
# outside of a transaction.
#
# Why this exists
# ---------------
# Postgres `CREATE INDEX` (without CONCURRENTLY) takes a SHARE lock on
# the table for the duration of the build, which blocks writes on a
# busy table. `CREATE INDEX CONCURRENTLY` builds the index in the
# background, allowing reads AND writes to proceed. The trade-off is:
#
#   - It must NOT run inside a transaction block. Postgres refuses
#     with "CREATE INDEX CONCURRENTLY cannot run inside a transaction".
#   - The build takes longer (and uses more IO) than a non-concurrent
#     build. The exact multiplier is workload-dependent but typically
#     2-4x for a non-trivial index.
#   - It can fail (e.g. unique-violation in a UNIQUE index build) and
#     leave behind an INVALID index that the operator must clean up
#     before retrying. We retry the build a configurable number of
#     times; persistent failure is a hard error so the operator
#     notices.
#
# The Drizzle migrator runs every .sql file in a single transaction,
# which is correct for every other DDL (CREATE TABLE, ALTER TABLE,
# etc.) but breaks CREATE INDEX CONCURRENTLY. This script bypasses
# the Drizzle transaction by reading the SQL, splitting on Drizzle's
# `--> statement-breakpoint` delimiter, and applying each statement
# in its own auto-commit query.
#
# Usage
# -----
#   pnpm tsx scripts/migrate-concurrent.ts <path-to-migration.sql>
#   pnpm tsx scripts/migrate-concurrent.ts src/lib/db/migrations/0020_add_foo_idx.sql
#
#   # Or via the shell wrapper:
#   ./scripts/migrate-concurrent.sh src/lib/db/migrations/0020_add_foo_idx.sql
#
#   # Override the retry / wait budget:
#   CONCURRENT_MAX_RETRIES=5 CONCURRENT_WAIT_MS=10000 \
#     pnpm tsx scripts/migrate-concurrent.ts <file>
#
# Required environment
# --------------------
#   DATABASE_URL                The target DB connection string.
#                               Same env var the rest of the app uses.
#   PGHOST / PGPORT / ...       Standard libpq env vars are honored
#                               (the script uses the pg npm package
#                               which delegates to libpq for parsing).
#
# Authoring constraint (documented for migration authors)
# --------------------------------------------------------
#   - Each .sql file passed to this script must contain ONLY CREATE
#     INDEX [CONCURRENTLY] statements. Mixing in any other DDL breaks
#     the helper's split-on-statement-breakpoint contract, and the
#     non-index DDL would block writes anyway. Use the regular
#     Drizzle migrator for those.
#   - A CREATE INDEX CONCURRENTLY that fails leaves an INVALID index
#     in the catalog. The helper logs the cleanup command on
#     persistent failure:
#         DROP INDEX CONCURRENTLY IF EXISTS "<name>";
#     so the operator can re-run.
#   - The helper does NOT touch the Drizzle ledger. If the migration
#     file lives in src/lib/db/migrations/, the operator must mark
#     it applied in the Drizzle journal (or the next regular
#     migration will try to re-apply it). The convention we use:
#     the migration file lives outside src/lib/db/migrations/, in
#     scripts/migrations/ or similar, so the Drizzle migrator never
#     sees it.
#
# References
# ----------
#   https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY

set -euo pipefail

# Colors (only when stdout is a TTY)
if [ -t 1 ]; then
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; NC='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; NC=''
fi

log()  { printf '%b[migrate-concurrent]%b %s\n' "${YELLOW}" "${NC}" "$*"; }
ok()   { printf '%b[migrate-concurrent]%b %s\n' "${GREEN}" "${NC}" "$*"; }
die()  { printf '%b[migrate-concurrent]%b %s\n' "${RED}" "${NC}" "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

# ─── Argument parsing ──────────────────────────────────────────────────────
MIGRATION_FILE="${1:-}"
if [ -z "${MIGRATION_FILE}" ]; then
  die "usage: $0 <path-to-migration.sql>"
fi
if [ ! -f "${MIGRATION_FILE}" ]; then
  die "migration file not found: ${MIGRATION_FILE}"
fi

# ─── Configuration (env-driven) ───────────────────────────────────────────
MAX_RETRIES="${CONCURRENT_MAX_RETRIES:-3}"
WAIT_MS="${CONCURRENT_WAIT_MS:-5000}"

if ! [[ "${MAX_RETRIES}" =~ ^[0-9]+$ ]] || [ "${MAX_RETRIES}" -lt 1 ]; then
  die "CONCURRENT_MAX_RETRIES must be a positive integer, got: ${MAX_RETRIES}"
fi
if ! [[ "${WAIT_MS}" =~ ^[0-9]+$ ]]; then
  die "CONCURRENT_WAIT_MS must be a non-negative integer, got: ${WAIT_MS}"
fi

# ─── Sanity checks ────────────────────────────────────────────────────────
require_cmd pnpm
require_cmd node

if [ -z "${DATABASE_URL:-}" ]; then
  # Try to load .env from the project root so this script works the
  # same way `pnpm db:migrate` does. We only set the variable if it
  # isn't already in the environment — explicit overrides win.
  if [ -f .env ]; then
    log "DATABASE_URL not set; sourcing from .env"
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  die "DATABASE_URL is required (set it in .env or pass through the environment)"
fi

log "migration file: ${MIGRATION_FILE}"
log "retry budget:   ${MAX_RETRIES} (wait ${WAIT_MS}ms between attempts)"

# ─── Hand off to the TypeScript runner ────────────────────────────────────
# We use a Node script (not a pure shell pipeline) because:
#   - The pg npm package gives us proper error categorization
#     (transient vs permanent) and statement-level retry.
#   - Splitting on `--> statement-breakpoint` is what the Drizzle
#     migrator does; the TS file mirrors scripts/migration-drill.ts
#     so the convention stays consistent.
exec pnpm tsx scripts/migrate-concurrent.ts "${MIGRATION_FILE}" \
  --max-retries "${MAX_RETRIES}" \
  --wait-ms "${WAIT_MS}"
