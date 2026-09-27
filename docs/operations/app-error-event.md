# App errors (OBS-002)

## What this is

The `app_error_event` table is the **in-app source of truth for "what just
broke"**. It has no SDK dependency, so a Sentry outage — or a `SENTRY_DSN` that
has never been supplied — cannot take the debugging surface down with it. Sentry
remains the optional long-term archive and the alert source.

Every failure path converges on `captureAppError` in
`src/lib/observability/app-errors.ts`:

| Origin                       | Source label       | Entry point                              |
| ---------------------------- | ------------------ | ---------------------------------------- |
| Server component render      | `server.render`    | `onRequestError` in `instrumentation.ts` |
| Route handler (all `/api/*`) | `server.route`     | `onRequestError`                         |
| Server action                | `server_action`    | `onRequestError`                         |
| Proxy                        | `server.proxy`     | `onRequestError`                         |
| Unhandled rejection / crash  | `server.unhandled` | `process.on(...)` in `register()`        |
| (app)-group boundary         | `app.error`        | `recordErrorBoundaryAction`              |
| Root-layout boundary         | `global.error`     | `recordErrorBoundaryAction`              |

`onRequestError` is the important one. It used to be
`Sentry.captureRequestError`, which is a **no-op without a DSN** — so all 84
route handlers, every server action, and every server render produced no durable
record at all, and the only trace was a container stdout line that Docker's
`10m × 5` rotation discarded within hours.

## Schema

```text
app_error_event
  id              uuid PK
  digest          text     — Next.js error digest; NULL for client-only
  route           text NOT NULL  — URL path the user was on
  method          text     — HTTP verb; NULL on client-boundary rows
  source          text NOT NULL  — see the source table above
  error_name      text     — Error.name
  message         text NOT NULL  — SCRUBBED, first 2 KB
  cause_message   text     — SCRUBBED, one level of Error.cause
  stack           text     — SCRUBBED, first 4 KB
  component_stack text     — SCRUBBED, client boundaries only, first 4 KB
  request_id      text     — x-request-id; joins to the request's log lines
  actor_id        uuid FK → user(id) ON DELETE SET NULL
  build_version   text     — short Git SHA at capture time
  group_id        uuid FK → app_error_group(id) ON DELETE SET NULL
  user_agent_hash text     — SHA-256 of the UA; the raw string is never stored
  context         jsonb    — allowlisted per-origin context + request log lines
  route_type      text     — render | route | action | proxy
  route_path      text     — filesystem route file
  created_at      timestamptz NOT NULL DEFAULT now()
```

Indexes: `created_at DESC`, `digest`, `route`, `(actor_id, created_at DESC)`,
`(group_id, created_at DESC)`, `(source, created_at DESC)`.

```text
app_error_group
  id               uuid PK
  fingerprint      text UNIQUE  — 12 hex chars; the upsert conflict target
  error_name       text
  sample_message   text NOT NULL  — SCRUBBED
  route            text NOT NULL
  source           text NOT NULL
  occurrence_count integer NOT NULL DEFAULT 1
  first_seen_at    timestamptz NOT NULL DEFAULT now()
  last_seen_at     timestamptz NOT NULL DEFAULT now()
  resolved_at      timestamptz  — set by triage
  triage_note      text
  updated_at       timestamptz NOT NULL DEFAULT now()
```

Indexes: `UNIQUE (fingerprint)`, `(last_seen_at DESC)`,
`(resolved_at, last_seen_at DESC)`.

## How a row is written

1. The failure reaches `captureAppError`, which computes a **fingerprint** over
   `(errorName, normalized message, route)`. Normalization collapses UUIDs, long
   hex runs, and bare digit runs, and collapses quoted _values_ while
   preserving quoted _identifiers_ — so two violations of different unique
   constraints stay separate groups, while the same bug with a different row id
   groups together.
2. `INSERT INTO app_error_group … ON CONFLICT (fingerprint) DO UPDATE SET
occurrence_count = occurrence_count + 1 … RETURNING id`. One statement, so two
   concurrent captures of the same error cannot lose an increment.
3. `INSERT INTO app_error_event` with the group id, the scrubbed diagnostic
   fields, and the `context` jsonb.
4. The whole thing is **fail-silent**: a write failure logs
   `app_error.capture_failed` and never propagates, because the caller is itself
   the failure path.

### A note on the client boundary payload

`recordErrorBoundaryAction` cannot hand a real `Error` to `captureAppError` — a
client component can only ship a plain serializable object across the
server-action boundary. It builds `{ name, message, stack, cause }`.

The helpers therefore read the error **structurally** rather than via
`instanceof Error`. This matters: with the old `instanceof` checks, every row
written by the client boundary stored `message = "Unknown error"` with
`error_name`, `stack`, and `cause_message` all `NULL`, because the one caller
that mattered was the one shape the checks rejected. `tests/integration/error-diagnostics.test.ts`
and `tests/unit/observability-redact.test.ts` both lock this down.

## What is scrubbed, and when

`src/lib/observability/redact.ts` scrubs **before** the write, so retention can
never hold an unsanitized value. It replaces the old behaviour where every
`Error` collapsed to `{ name, message: "[redacted]" }` — which made the mirror
and the log stream unable to say what had failed.

Scrubbed shapes: bearer tokens, JWTs, `lpm_…` MCP tokens, provider key prefixes
(`sk-`, `sk-ant-`, `ghp_`, `glpat-`, `xox*`, `AKIA`), `secret` / `password` /
`token` / `key=value` pairs, Postgres `DETAIL` values and `Failing row contains`
values, email addresses, secret query-string parameters, and high-entropy
opaque blobs. Preserved: error class names, routes, constraint and column names,
SQL fragments, file paths, and stack frames.

Fail-closed: if a rule ever throws, the value becomes `[unavailable]` rather
than the raw input.

`context` is an **allowlist**, never a denylist. Only `routeType`, `routePath`,
`renderSource`, `revalidateReason`, `renderType`, `method`, `path`, and the
_names_ of `x-request-id` / `user-agent` / `referer` / `content-type` are
recorded. Cookie and authorization values are never named, let alone stored.

## The request log ring buffer

`src/lib/observability/request-context.ts` holds a bounded 50-entry ring buffer
of the request's recent `error` / `warn` lines, oldest-first evicted. On
capture the buffer is flushed into `context.logs`.

The entries are the **same already-sanitized objects** the logger emitted, so
the buffer cannot hold a credential the console did not. Cost: zero extra
queries, zero extra writes.

This exists because the raw lines otherwise only reach Docker's `json-file`
driver at `10m × 5` (~50 MB) and are gone within hours. It is what turns "here
is a stack trace" into "here is what the request was doing when it broke".

## Burst cap

Closing the server-side gap turned a rare write path into a potentially hot one.
`captureAppError` keeps a process-local, per-fingerprint, per-minute window
(`APP_ERROR_BURST_LIMIT`, default 20). Past the cap the group's
`occurrence_count` still increments — exactly — but the individual event row is
skipped. The table stays bounded, the count stays truthful, and
`getAppErrorHealth` (and `laratik_planner_app_health`) reports
`cappedOccurrences` so a throttled system is visible rather than silently lossy.

The cap is per-process, which is exact for the single-container VPS topology in
`AGENTS.md`. A multi-replica deployment would need a shared bucket (Postgres
advisory lock or Redis).

## Retention

`GET|POST /api/cron/error-retention`, authenticated with
`Authorization: Bearer $CRON_SECRET`, invoked daily by
`scripts/vps/error-retention.sh`:

- `app_error_event` older than **30 days** → deleted.
- `app_error_group` older than **90 days** → deleted **only when `resolved_at`
  is not null**. An unresolved group is exactly what an operator still needs;
  deleting the triage queue would defeat the purpose of the table.

Idempotent: a second run in the same day deletes nothing and still exits 0. The
VPS script uses `curl --fail`, so a non-2xx surfaces as a cron alert.

Wire the vps-ops side as a daily cron entry calling
`scripts/vps/error-retention.sh` (that repo is external to this one).

## Reading it

- **In-app console** — `/app/platform/errors`. Defaults to the grouped triage
  view (one row per error class, with occurrence count, first/last seen, and
  triaged state); `?view=events` switches to the raw occurrence log. Filter with
  `?source=` and `?range=24h|7d|30d`.
- **Diagnostics MCP** — `laratik_planner_list_app_errors`,
  `laratik_planner_get_app_error`, and especially
  `laratik_planner_diagnose_app_error`, which returns a root-cause hypothesis
  with concrete fix steps. See [`docs/api/mcp.md`](../api/mcp.md).

Both surfaces require the `platform.console.read` permission.

## Re-running a migration that already applied

The Drizzle migrator dedupes by `(created_at)` of the last applied
migration, not by hash. If the journal `when` for a migration
disagrees with the `created_at` of its row in `__drizzle_migrations`
(because the row was inserted by hand after `ALTER TABLE` ran
directly, for instance), the migrator will try to re-apply and
fail. Fix: `UPDATE drizzle.__drizzle_migrations SET created_at =
<journal when> WHERE hash = '<migration sha256>';` then re-run.
