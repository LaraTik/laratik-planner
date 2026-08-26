-- Migration 0022 — Richer error context in `app_error_event` (2026-08-27)
--
-- The error boundary redesign surfaces the root cause directly in the
-- UI. The DB row is the in-app mirror that the platform-errors page
-- reads from, so it needs the same fields. New columns (all nullable
-- so historical rows remain readable):
--
--   - `error_name`     — Error.name (e.g. "PostgresError", "TypeError")
--   - `cause_message`  — message of the chained cause (Error.cause), one
--                        level deep, when present
--   - `component_stack`— React's component stack on client boundaries
--                        (truncated to 4 KB; full payload still in Sentry)
--   - `request_id` is already there from migration 0020
--   - `build_version` is already there from migration 0020
--
-- Idempotent. Re-running the migrate is safe.

ALTER TABLE "app_error_event"
  ADD COLUMN IF NOT EXISTS "error_name" text;

ALTER TABLE "app_error_event"
  ADD COLUMN IF NOT EXISTS "cause_message" text;

ALTER TABLE "app_error_event"
  ADD COLUMN IF NOT EXISTS "component_stack" text;