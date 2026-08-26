# App errors (OBS-002)

## What this is

The `app_error_event` table is the **in-app mirror** of every error caught
by the Next.js app-router error boundaries:

- `src/app/(app)/error.tsx` — the (app)-group boundary
- `src/app/global-error.tsx` — the root-layout boundary (used when the
  app shell itself throws)

The platform admin console at `/app/platform/errors` reads from this
table. Sentry remains the long-term archive and the alert source; the
mirror is for "what just hit production" without leaving the app.

## Schema

```text
app_error_event
  id              uuid PK
  digest          text     — Next.js error digest; NULL for client-only
  route           text NOT NULL  — URL path the user was on
  method          text     — HTTP verb; NULL for client-boundary rows
  source          text NOT NULL  — app.error | global.error | server_action
  message         text NOT NULL  — sanitized; first 2 KB
  stack           text     — truncated to 4 KB
  request_id      text     — AsyncLocalStorage request id
  actor_id        uuid FK → user(id) ON DELETE SET NULL
  build_version   text     — short Git SHA at capture time
  created_at      timestamptz NOT NULL DEFAULT now()
```

Indexes: `created_at DESC`, `digest`, `route`, `(actor_id, created_at DESC)`.

## How a row is written

1. The boundary receives a thrown `Error` and a `digest` (server-side
   boundaries always have one; client-side boundaries may not).
2. On mount, the boundary calls
   `recordErrorBoundaryAction` in `src/app/(app)/error-actions.ts` with
   a sanitized payload (route, method, source, message, stack).
3. The server action:
   - calls `captureAppError(...)` in `src/lib/observability/app-errors.ts`,
     which writes the row;
   - resolves the digest to the matching row id so the deep-link in the
     boundary can target the exact row;
   - returns `{ canViewPlatformErrors, matchedId, recordedDigest }` so
     the boundary can conditionally render the "Open in platform
     errors" link (only platform admins see it).
4. The `recordErrorBoundaryAction` is **fail-silent** on the write path:
   a DB error does not bubble up and does not break the user-facing
   page. The structured log line + Sentry still have the event.

## Operational notes

- The action reads the live request `route` and `method` from
  `headers()`, not from `window.location` — this matters when the
  boundary fires after a router push, where `window.location` can lag
  one render.
- The boundary does NOT call the action from the server-side render;
  it is a `useEffect` call from the client component, fired once per
  boundary mount. Reloading the page after an error writes a second
  row with the same digest — `findLatestAppErrorByDigest` returns the
  most recent.
- The `message` field is truncated to 2 KB and the `stack` to 4 KB. The
  full payload is in Sentry. The boundary is in a state where secrets
  may be in scope, so the helper takes only the fields it needs as
  named arguments; the boundary cannot accidentally pass more.

## Retention

A 30-day prune is **not implemented yet** — the table grows linearly
with traffic. When we add it, it should be a single `DELETE FROM
app_error_event WHERE created_at < now() - interval '30 days'`
invoked from a daily cron.

## Re-running a migration that already applied

The Drizzle migrator dedupes by `(created_at)` of the last applied
migration, not by hash. If the journal `when` for a migration
disagrees with the `created_at` of its row in `__drizzle_migrations`
(because the row was inserted by hand after `ALTER TABLE` ran
directly, for instance), the migrator will try to re-apply and
fail. Fix: `UPDATE drizzle.__drizzle_migrations SET created_at =
<journal when> WHERE hash = '<migration sha256>';` then re-run.
