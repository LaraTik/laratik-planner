#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/vps/renew-smtp-cert.sh
#
# Force-renew the production SMTP TLS cert (mail.laratik.com) and bounce
# the Mailcow containers that serve SMTP/HTTPS so they reload the new
# certificate. Run on laratik-vps when:
#
#   - `scripts/vps/check-smtp-cert.sh` reports < 14 days remaining
#     (the CI job `check-smtp-cert` will already be failing by then)
#   - the daily VPS cron reports a renewal failure
#   - you've just changed the DNS-01 / HTTP-01 challenge configuration
#
# Auto-detects which ACME client the Mailcow install uses. Two layouts
# are common in the field:
#
#   1. acme-companion (https://github.com/nginx-proxy/acme-companion) —
#      a sidecar that watches the mailcow-net network for labels and
#      handles renewals via certbot.
#   2. Mailcow's bundled acme.sh — invoked via `docker exec mailcow ...`.
#
# The script tries the bundled acme.sh first (more recent Mailcow
# versions), then falls back to acme-companion. Restart targets are
# always `postfix-mailcow` and `nginx-mailcow` — both are present in
# every standard Mailcow 2024+ install.
#
# Pre-conditions:
#   - SSH'd into laratik-vps as a user that can run `docker` (root or
#     a user in the `docker` group).
#   - Outbound HTTPS to acme-v02.api.letsencrypt.org is reachable.
#   - DNS for mail.laratik.com is pointed at the VPS (HTTP-01) OR the
#     DNS-01 API token is configured inside the ACME container.
#
# Usage:
#   ./scripts/vps/renew-smtp-cert.sh
#   ./scripts/vps/renew-smtp-cert.sh --dry-run     # show what would run
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${SMTP_HOST:-mail.laratik.com}"
DRY_RUN=0
MAILCOW_CONTAINER="${MAILCOW_CONTAINER:-mailcowdockerized-mailcow-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

log() { printf '[renew-smtp-cert] %s\n' "$*"; }
run_or_print() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [DRY-RUN] %s\n' "$*"
  else
    "$@"
  fi
}

# ── Pre-flight ────────────────────────────────────────────────────────────────
log "Domain: $DOMAIN"
log "Mailcow container: $MAILCOW_CONTAINER"

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker not found on PATH. Are you on laratik-vps?"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${MAILCOW_CONTAINER}\$"; then
  log "WARN: $MAILCOW_CONTAINER is not running. Trying to discover it..."
  # Try to find any container that looks like a Mailcow master container.
  CANDIDATE="$(docker ps --format '{{.Names}}' \
    | grep -iE 'mailcow(.*-mailcow-1)?$' \
    | head -1 || true)"
  if [[ -n "$CANDIDATE" ]]; then
    log "Auto-discovered Mailcow container: $CANDIDATE"
    MAILCOW_CONTAINER="$CANDIDATE"
  else
    log "ERROR: Could not find a running Mailcow container."
    log "Pass --container=<name> or set MAILCOW_CONTAINER."
    exit 1
  fi
fi

# ── Renewal ───────────────────────────────────────────────────────────────────
# 1) Try Mailcow's bundled acme.sh first (newer Mailcow).
log "Attempting renewal via Mailcow bundled acme.sh…"
if docker exec "$MAILCOW_CONTAINER" which acme.sh >/dev/null 2>&1; then
  run_or_print docker exec "$MAILCOW_CONTAINER" acme.sh --renew -d "$DOMAIN" --force
else
  log "  Mailcow bundled acme.sh not present; trying acme-companion…"
  ACME_CONTAINER="$(docker ps --format '{{.Names}}' \
    | grep -iE 'acme(-companion)?$' \
    | head -1 || true)"
  if [[ -z "$ACME_CONTAINER" ]]; then
    log "ERROR: No ACME container (acme-companion / mailcow acme.sh) is running."
    log "Investigate manually: docker ps --filter name=acme"
    log "Mailcow logs:   docker logs --tail 200 $MAILCOW_CONTAINER | grep -i acme"
    exit 1
  fi
  log "Using ACME container: $ACME_CONTAINER"
  # Most acme-companion images expose `/app/force_renew` as a helper.
  if docker exec "$ACME_CONTAINER" test -x /app/force_renew 2>/dev/null; then
    run_or_print docker exec "$ACME_CONTAINER" /app/force_renew
  elif docker exec "$ACME_CONTAINER" which certbot >/dev/null 2>&1; then
    # Fallback: invoke certbot directly inside the container.
    run_or_print docker exec "$ACME_CONTAINER" certbot renew --force-renewal --cert-name "$DOMAIN"
  else
    log "ERROR: $ACME_CONTAINER has neither /app/force_renew nor certbot."
    log "Inspect it: docker exec -it $ACME_CONTAINER sh"
    exit 1
  fi
fi

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY-RUN: skipping postfix/nginx restart + verification."
  exit 0
fi

# ── Restart Mailcow SMTP + HTTP frontends so they pick up the new cert ─────
log "Restarting postfix-mailcow + nginx-mailcow to reload the cert…"
run_or_print docker restart postfix-mailcow
run_or_print docker restart nginx-mailcow

# Give the services a moment to bind.
sleep 3

# ── Verify ────────────────────────────────────────────────────────────────────
log "Verifying the new cert via SMTP TLS handshake…"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Reuse the cert-check script. Pass --warn 60 --critical 30 so the
# renewal's "verify" pass uses generous thresholds (any notAfter past
# today is acceptable immediately after renewal; tighter thresholds
# re-engage after this).
SMTP_HOST="$DOMAIN" SMTP_PORT=465 "$SCRIPT_DIR/check-smtp-cert.sh" --warn 60 --critical 30
VERIFY_EXIT=$?

case "$VERIFY_EXIT" in
  0) log "✅ Cert verified — > 60 days remaining, SMTP is healthy." ;;
  1) log "⚠ Cert verified but only 30-60 days remaining. ACME may have failed to extend fully; investigate." ;;
  2) log "✗ Cert still < 30 days remaining after renewal. Renewal did not take effect." ;;
  *) log "✗ Cert verification FAILED (exit $VERIFY_EXIT). TLS handshake error — check postfix-mailcow logs." ;;
esac

exit "$VERIFY_EXIT"
