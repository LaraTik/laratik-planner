#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/vps/audit-retention.sh
#
# Prune the security_audit_event and rate_limit_event tables so the
# two unbounded Postgres tables don't grow forever. The retention
# policy lives in code (this file) rather than in pg_partman /
# pg_cron so it is reviewable in the same PR as the data model.
#
# Retention windows (override via env):
#   SECURITY_AUDIT_RETENTION_DAYS  default 365  (1 year)
#   RATE_LIMIT_RETENTION_DAYS      default  30  (30 days)
#
# The rate-limit window matches the longest fixed-window the limiter
# uses (60 min for invitations, 24h for some other surfaces). 30 days
# is comfortably above that and bounds the table at ~7M rows at the
# current write rate.
#
# Usage:
#   ./scripts/vps/audit-retention.sh                  # run with defaults
#   SECURITY_AUDIT_RETENTION_DAYS=90 ./scripts/vps/audit-retention.sh
#
# Idempotent: `DELETE ... WHERE created_at < ...` against an empty
# candidate set is a no-op. Cron never emails (silent on success);
# the install-cron.sh entry wires this into the existing
# /etc/cron.d/laratik-planner file.
#
# Why two separate DELETEs (not a single transaction): the two
# tables have different retention windows and one failing
# shouldn't roll back the other. A failure on either DELETEs is
# logged to stderr and surfaces as a non-zero exit, which cron
# forwards to root.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SECURITY_AUDIT_RETENTION_DAYS="${SECURITY_AUDIT_RETENTION_DAYS:-365}"
RATE_LIMIT_RETENTION_DAYS="${RATE_LIMIT_RETENTION_DAYS:-30}"

PROJECT_DIR="${PROJECT_DIR:-/opt/laratik-planner}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_DIR}/docker-compose.yml}"

if ! [[ "$SECURITY_AUDIT_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$SECURITY_AUDIT_RETENTION_DAYS" -lt 1 ]; then
  echo "[audit-retention] SECURITY_AUDIT_RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi
if ! [[ "$RATE_LIMIT_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RATE_LIMIT_RETENTION_DAYS" -lt 1 ]; then
  echo "[audit-retention] RATE_LIMIT_RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi

cd "$PROJECT_DIR"

# Run the two DELETEs separately. psql returns a "DELETE <n>" line on
# stdout which we capture and report; on any error, `set -e` aborts
# with the right exit code so cron forwards to root.
SECURITY_AUDIT_RESULT="$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "${POSTGRES_USER:-planner}" -d "${POSTGRES_DB:-planner}" -t -A -c \
  "DELETE FROM security_audit_event WHERE created_at < now() - interval '${SECURITY_AUDIT_RETENTION_DAYS} days';")"

RATE_LIMIT_RESULT="$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "${POSTGRES_USER:-planner}" -d "${POSTGRES_DB:-planner}" -t -A -c \
  "DELETE FROM rate_limit_event WHERE occurred_at < now() - interval '${RATE_LIMIT_RETENTION_DAYS} days';")"

# Stable JSON line so log collectors can pick up the row counts.
# (Mirrors the SMTP-cert-probe shape: one line, easy to grep.)
printf '{"event":"audit_retention.run","timestamp":"%s","security_audit_deleted":%s,"rate_limit_deleted":%s,"security_audit_retention_days":%s,"rate_limit_retention_days":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "${SECURITY_AUDIT_RESULT:-0}" \
  "${RATE_LIMIT_RESULT:-0}" \
  "$SECURITY_AUDIT_RETENTION_DAYS" \
  "$RATE_LIMIT_RETENTION_DAYS"
