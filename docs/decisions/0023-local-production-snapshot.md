# ADR 0023 — Reusable local production-data snapshot

## Status

Accepted — 2026-10-25

## Context

The owner wants to review the local Planner UI against representative live
workspace data, then restore the same dataset locally without querying
production again. The app uses Drizzle directly against Postgres; the
production database is private to the VPS Docker network.

## Decision

- Provide an explicit `capture` command that streams `pg_dump` over the
  existing `laratik-vps` SSH access into a temporary local Postgres container
  using RAM-only storage and no network. The remote operation is read only and
  never applies migrations or writes application records to production.
- Scrub user identities and authentication/integration credentials before
  saving the snapshot. Keep workspace and content rows so the local UI has
  realistic shapes and relationships. Do not copy object-storage files.
- Save the scrubbed dump under git-ignored `tmp/` with owner-only file and
  directory permissions. `restore` and `run` target only the fixed
  `planner_snapshot` database in a dedicated local Postgres container/volume,
  published to loopback on port 5434 by default.
- Run the local app with local-only auth/signing secrets and external email,
  AI, Sentry, social sync, ad sync/reporting, publishing, and cron credentials
  disabled.
- The owner authorized the initial snapshot workflow on 2026-10-25. A new
  production read occurs only when the operator explicitly runs `capture`.

## Consequences and data handling

- The production app and database are unchanged. The local snapshot contains
  production business content, so it remains confidential even after account
  identities and credentials are scrubbed. Keep the host disk encrypted; do
  not share the dump or use it in screenshots, fixtures, commits, or PR text.
- Local sign-in uses the anonymized agency-admin record
  `local-preview@example.invalid`; restoring the saved archive discards only
  changes made to `planner_snapshot` since the previous restore.
- Object records remain, but file bytes are not copied. Media requiring remote
  storage may not render in the local preview.

## Approval requirement

Capturing production data requires an explicit `capture` invocation. Restoring
the already-scrubbed archive is local-only and does not require another
production access.
