#!/usr/bin/env bash
# Copy a sanitized, local-only snapshot from the production Postgres database.
# The production side is read only; restore/run always target planner_snapshot.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SNAPSHOT_DIR="$ROOT/tmp/local-prod-snapshot"
SNAPSHOT_FILE="$SNAPSHOT_DIR/latest.dump"
MARKER_FILE="$SNAPSHOT_DIR/latest.marker"
SNAPSHOT_DB="planner_snapshot"
SNAPSHOT_PG_PORT="${LOCAL_SNAPSHOT_PG_PORT:-5434}"
LOCAL_DATABASE_URL="${LOCAL_SNAPSHOT_DATABASE_URL:-postgresql://planner:planner_dev_only@127.0.0.1:${SNAPSHOT_PG_PORT}/planner_snapshot}"
SSH_TARGET="${LARATIK_VPS_SSH_TARGET:-laratik-vps}"
PG_CONTAINER="laratik-planner-pg-snapshot"
PG_VOLUME="laratik-planner-snapshot-pgdata"
APP_DIR="${LOCAL_PLANNER_APP_DIR:-$ROOT}"
APP_PORT="${LOCAL_PLANNER_PORT:-3000}"
WORK_DIR=""
STAGE_CONTAINER=""

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/local-prod-snapshot.sh capture  # read production once, sanitize, save, and restore locally
  ./scripts/local-prod-snapshot.sh restore  # restore the saved local snapshot again
  ./scripts/local-prod-snapshot.sh run      # restore the saved snapshot and start pnpm dev

Set LARATIK_VPS_SSH_TARGET to override the SSH host alias, or
LOCAL_SNAPSHOT_PG_PORT to change the dedicated snapshot Postgres port
(default 5434), LOCAL_SNAPSHOT_DATABASE_URL for a custom loopback URL, or
LOCAL_PLANNER_APP_DIR to run a separate local Planner checkout, or
LOCAL_PLANNER_PORT to change the local app port (default 3000).
USAGE
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

ensure_local_target() {
  node - "$LOCAL_DATABASE_URL" "$SNAPSHOT_PG_PORT" <<'NODE'
const value = process.argv[2];
const expectedPort = Number(process.argv[3]);
let url;
try {
  url = new URL(value);
} catch {
  console.error("LOCAL_SNAPSHOT_DATABASE_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}
const host = url.hostname.replace(/^\[|\]$/g, "");
if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
  console.error("Snapshot target must use PostgreSQL.");
  process.exit(1);
}
if (url.search || url.hash) {
  console.error("Snapshot URL must not include query parameters or a fragment.");
  process.exit(1);
}
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error("Snapshot target must be loopback; refusing a remote database.");
  process.exit(1);
}
if (!Number.isInteger(expectedPort) || expectedPort < 1 || expectedPort > 65535) {
  console.error("LOCAL_SNAPSHOT_PG_PORT must be a valid TCP port.");
  process.exit(1);
}
if (Number(url.port || 5432) !== expectedPort) {
  console.error("Snapshot URL port must match LOCAL_SNAPSHOT_PG_PORT.");
  process.exit(1);
}
if (url.pathname !== '/planner_snapshot') {
  console.error("Snapshot target database must be exactly planner_snapshot.");
  process.exit(1);
}
NODE
}

ensure_local_postgres() {
  if ! docker container inspect "$PG_CONTAINER" >/dev/null 2>&1; then
    docker run --detach --name "$PG_CONTAINER" --restart unless-stopped \
      --publish "127.0.0.1:${SNAPSHOT_PG_PORT}:5432" \
      --volume "$PG_VOLUME:/var/lib/postgresql/data" \
      --env POSTGRES_USER=planner \
      --env POSTGRES_PASSWORD=planner_dev_only \
      --env POSTGRES_DB=planner \
      postgres:16-alpine >/dev/null
  else
    docker start "$PG_CONTAINER" >/dev/null
  fi
  local port_mapping
  port_mapping="$(docker port "$PG_CONTAINER" 5432/tcp 2>/dev/null || true)"
  [[ "$port_mapping" == "127.0.0.1:${SNAPSHOT_PG_PORT}" ]] \
    || die "Snapshot Postgres must be published only on 127.0.0.1:${SNAPSHOT_PG_PORT}. Remove the snapshot container to recreate it safely."
  local database_ready=false
  for attempt in {1..30}; do
    if docker exec "$PG_CONTAINER" pg_isready -U planner -d postgres >/dev/null 2>&1; then
      database_ready=true
      break
    fi
    sleep 1
  done
  [[ "$database_ready" == true ]] || die "Local Postgres did not become ready."
}

drop_database() {
  local database="$1"
  # The caller supplies only the fixed target name or a generated stage name.
  docker exec "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U planner -d postgres \
    -c "DROP DATABASE IF EXISTS \"$database\" WITH (FORCE)" >/dev/null
}

create_database() {
  local database="$1"
  docker exec "$PG_CONTAINER" createdb -U planner "$database"
}

cleanup() {
  local exit_code=$?
  if [[ -n "$STAGE_CONTAINER" ]]; then
    docker rm -f "$STAGE_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
  exit "$exit_code"
}

verify_snapshot_marker() {
  local expected_marker="$1"
  node - "$LOCAL_DATABASE_URL" "$expected_marker" "$SNAPSHOT_DB" <<'NODE'
const { Client } = require("pg");
const [connectionString, expectedMarker, expectedDatabase] = process.argv.slice(2);
const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
(async () => {
  try {
    await client.connect();
    const result = await client.query(
      "SELECT current_database() AS database_name, marker FROM local_snapshot_marker LIMIT 1",
    );
    const row = result.rows[0];
    if (!row || row.database_name !== expectedDatabase || row.marker !== expectedMarker) {
      throw new Error("The local URL did not reach the expected snapshot database.");
    }
  } finally {
    await client.end().catch(() => undefined);
  }
})().catch((error) => {
  console.error(error.message || "Could not verify the local snapshot database.");
  process.exit(1);
});
NODE
}

restore_snapshot() {
  local app_dir="${1:-$ROOT}"
  [[ -s "$SNAPSHOT_FILE" ]] || die "No saved snapshot found. Run ./scripts/local-prod-snapshot.sh capture first."
  [[ -s "$MARKER_FILE" ]] || die "Snapshot marker is missing; capture a fresh snapshot."
  [[ -f "$app_dir/package.json" ]] || die "Planner app directory does not contain package.json."

  local marker
  marker="$(<"$MARKER_FILE")"
  ensure_local_target
  ensure_local_postgres
  printf 'Restoring the saved snapshot into local database %s…\n' "$SNAPSHOT_DB"
  drop_database "$SNAPSHOT_DB"
  create_database "$SNAPSHOT_DB"
  docker exec -i "$PG_CONTAINER" pg_restore -U planner -d "$SNAPSHOT_DB" \
    --no-owner --no-privileges < "$SNAPSHOT_FILE"
  verify_snapshot_marker "$marker"
  printf 'Applying this checkout’s migrations to the local snapshot…\n'
  (cd "$app_dir" && DATABASE_URL="$LOCAL_DATABASE_URL" NODE_ENV=development pnpm db:migrate)
  printf 'Local snapshot is ready. Production was not modified.\n'
}

capture_snapshot() {
  command -v ssh >/dev/null || die "ssh is required."
  command -v openssl >/dev/null || die "openssl is required."
  [[ "$SSH_TARGET" =~ ^[A-Za-z0-9_.@:-]+$ ]] || die "SSH target contains unsupported characters."

  ensure_local_target
  ensure_local_postgres
  mkdir -p "$SNAPSHOT_DIR"
  chmod 700 "$SNAPSHOT_DIR"
  WORK_DIR="$(mktemp -d "$SNAPSHOT_DIR/.capture.XXXXXXXX")"
  chmod 700 "$WORK_DIR"
  STAGE_CONTAINER="laratik-planner-snapshot-stage-$$"
  local stage_password
  stage_password="$(openssl rand -hex 20)"
  local staged_dump="$WORK_DIR/sanitized.dump"
  local marker
  marker="$(openssl rand -hex 32)"

  printf 'Reading production Postgres through SSH (%s)…\n' "$SSH_TARGET"
  local remote_command
  remote_command="$(cat <<'REMOTE'
cd /opt/laratik-planner
docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "${POSTGRES_USER:-planner}" -d "${POSTGRES_DB:-planner}" --format=custom --no-owner --no-privileges'
REMOTE
)"
  docker run --detach --rm --name "$STAGE_CONTAINER" --network none \
    --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=4g \
    --env POSTGRES_USER=planner \
    --env "POSTGRES_PASSWORD=$stage_password" \
    --env POSTGRES_DB=planner \
    postgres:16-alpine >/dev/null
  local stage_ready=false
  for attempt in {1..30}; do
    if docker exec "$STAGE_CONTAINER" pg_isready -U planner -d planner >/dev/null 2>&1; then
      stage_ready=true
      break
    fi
    sleep 1
  done
  [[ "$stage_ready" == true ]] || die "Temporary in-memory Postgres did not become ready."

  if ! ssh -T "$SSH_TARGET" "$remote_command" \
    | docker exec -i "$STAGE_CONTAINER" pg_restore -U planner -d planner \
        --no-owner --no-privileges 2>"$WORK_DIR/restore.err"; then
    die "Production dump could not be restored into temporary local Postgres; production was not modified."
  fi
  if ! docker exec -i "$STAGE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=terse \
    -U planner -d planner < "$ROOT/scripts/local-prod-snapshot-sanitize.sql" \
    >/dev/null 2>"$WORK_DIR/sanitize.err"; then
    sed -E 's/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/<uuid>/g' \
      "$WORK_DIR/sanitize.err" >&2
    die "Local snapshot sanitization failed; no reusable snapshot was saved."
  fi
  docker exec "$STAGE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U planner -d planner -c \
    "CREATE TABLE public.local_snapshot_marker (marker text PRIMARY KEY, captured_at timestamptz NOT NULL DEFAULT now()); INSERT INTO public.local_snapshot_marker (marker) VALUES ('$marker')" \
    >/dev/null
  docker exec "$STAGE_CONTAINER" pg_dump -U planner -d planner \
    --format=custom --no-owner --no-privileges > "$staged_dump"
  [[ -s "$staged_dump" ]] || die "Sanitized snapshot was empty."
  docker exec -i "$PG_CONTAINER" pg_restore --list < "$staged_dump" >/dev/null

  chmod 600 "$staged_dump"
  mv -f "$staged_dump" "$SNAPSHOT_FILE"
  printf '%s\n' "$marker" > "$MARKER_FILE"
  chmod 600 "$MARKER_FILE"
  docker stop "$STAGE_CONTAINER" >/dev/null
  STAGE_CONTAINER=""
  rm -rf "$WORK_DIR"
  WORK_DIR=""

  printf 'Saved a credential-scrubbed snapshot under %s.\n' "$SNAPSHOT_DIR"
  restore_snapshot
}

run_local() {
  command -v openssl >/dev/null || die "openssl is required."
  node - "$APP_PORT" <<'NODE'
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("LOCAL_PLANNER_PORT must be a valid TCP port.");
  process.exit(1);
}
NODE
  [[ -d "$APP_DIR/node_modules" ]] || die "Run pnpm install in the selected Planner app directory first."
  restore_snapshot "$APP_DIR"

  export NODE_ENV=development
  export DATABASE_URL="$LOCAL_DATABASE_URL"
  export PORT="$APP_PORT"
  export NEXT_PUBLIC_APP_URL="http://localhost:${APP_PORT}"
  export AUTH_URL="$NEXT_PUBLIC_APP_URL"
  export AUTH_TRUST_HOST=true
  export POSTGRES_USER=planner
  export POSTGRES_PASSWORD=planner_dev_only
  export POSTGRES_DB=planner_snapshot
  export AUTH_SECRET="$(openssl rand -base64 32)"
  export AGENCY_COOKIE_SECRET="$(openssl rand -base64 32)"
  export UPLOAD_TOKEN_SECRET="$(openssl rand -hex 32)"
  export UPLOADS_DIR="$ROOT/tmp/local-snapshot-uploads"
  export LARATIK_DATA_DIR="$ROOT/tmp/local-snapshot-data"
  export SMTP_HOST=127.0.0.1
  export SMTP_PORT=1025
  export SMTP_USER=local-preview
  export SMTP_PASSWORD=local-preview
  export SMTP_FROM='LaraTik Planner Local <local-preview@example.invalid>'
  export SUPPORT_EMAIL=local-support@example.invalid
  export NEXT_PUBLIC_SUPPORT_EMAIL=local-support@example.invalid
  export GOOGLE_CLIENT_ID=
  export GOOGLE_CLIENT_SECRET=
  export MINIMAX_API_KEY=
  export MINIMAX_BASE_URL=http://127.0.0.1:9
  export AI_SECRET_ENCRYPTION_KEY=
  export SOCIAL_TOKEN_ENCRYPTION_KEY=
  export TRENDS_SERVICE_SECRET=
  export TRENDS_SERVICE_SECRET_PREVIOUS=
  export TRENDS_SERVICE_AUTH_REQUIRED=true
  export CRON_SECRET=
  export SOCIAL_SYNC_ENABLED=false
  export ADVERTISING_SYNC_ENABLED=false
  export ADVERTISING_REPORTING_ENABLED=false
  export META_PUBLISHING_ENABLED=false
  export SENTRY_DSN=
  export NEXT_PUBLIC_SENTRY_DSN=
  export SENTRY_AUTH_TOKEN=
  export SENTRY_ORG=
  export SENTRY_PROJECT=
  export SENTRY_PROBE_TOKEN=
  export BOOTSTRAP_SETUP_TOKEN=
  mkdir -p "$UPLOADS_DIR" "$LARATIK_DATA_DIR"
  chmod 700 "$UPLOADS_DIR" "$LARATIK_DATA_DIR"
  printf 'Starting local Planner at http://localhost:3000 using %s.\n' "$SNAPSHOT_DB"
  printf 'Use /dev/signin and local-preview@example.invalid for the sanitized admin account.\n'
  cd "$APP_DIR"
  exec pnpm dev
}

command="${1:-help}"
case "$command" in
  capture)
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    capture_snapshot
    ;;
  restore)
    restore_snapshot
    ;;
  run)
    run_local
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    usage >&2
    die "Unknown command: $command"
    ;;
esac
