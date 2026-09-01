-- Migration 0025 — notification + activity event `message_key` + `message_params`
--
-- Purpose: structured localisation for system-generated copy. Per
-- master prompt §1 ("Stored system copy"), the bell + email + activity
-- timeline render titles and bodies that today are stored as English
-- text. The forward fix is to add nullable `message_key` (catalog
-- key) + `message_params` (JSONB interpolation parameters) columns;
-- the existing `title` / `body` columns stay as the rollback-fallback
-- text. The bell / email dispatcher render the i18n at view / send
-- time when `message_key` is set, otherwise they fall back to the
-- stored English copy.
--
-- Forward: ADD COLUMN ... NULL for `message_key` + `message_params`.
-- Both columns are nullable so existing rows survive the migration
-- without any backfill. New writers set both; the activity timeline
-- is also `summary`-based (kind + metadata) so this is mainly a
-- future-proofing column on that table.
--
-- Backwards compatibility: the new columns are nullable, so the
-- migration is non-blocking and reversible (DROP COLUMN). Existing
-- rows keep their stored title/body; the renderer falls back to the
-- stored text when `message_key` is null. No data backfill required.
-- Old application code continues to read title/body; new application
-- code reads both the new columns and the fallback columns.
--
-- Replay safety: re-running the migration is a no-op because the
-- ADD COLUMN IF NOT EXISTS is idempotent. (drizzle-kit's generated
-- migration file would normally use plain ADD COLUMN, but we add
-- the IF NOT EXISTS guard to make the migration drill role-rewind
-- test idempotent.)
--
-- ROLLBACK:
--   ALTER TABLE "notifications" DROP COLUMN IF EXISTS "message_key";
--   ALTER TABLE "notifications" DROP COLUMN IF EXISTS "message_params";
--   ALTER TABLE "activity_events" DROP COLUMN IF EXISTS "message_key";
--   ALTER TABLE "activity_events" DROP COLUMN IF EXISTS "message_params";
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "message_key" text;--> statement-breakpoint
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "message_params" jsonb;--> statement-breakpoint
ALTER TABLE "activity_events"
  ADD COLUMN IF NOT EXISTS "message_key" text;--> statement-breakpoint
ALTER TABLE "activity_events"
  ADD COLUMN IF NOT EXISTS "message_params" jsonb;
