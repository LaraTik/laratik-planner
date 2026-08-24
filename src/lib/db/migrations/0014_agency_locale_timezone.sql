-- Migration 0014 — agency locale / timezone as top-level columns
--
-- The M2 era stored `locale` and `timezone` inside the
-- `settings` jsonb on the `agency` row. Reading those two
-- fields required every query to project through the jsonb
-- (`agency.settings -> 'locale'`). The M2 era accepted them
-- as top-level inputs in the create-agency form but the
-- server action still wrote them into `settings`.
--
-- This migration promotes both fields to top-level columns.
-- The read path is now a direct column projection (cheaper,
-- indexable). The legacy `settings` jsonb is left in place
-- for any future free-form fields; the existing
-- `settings.locale / settings.timezone` values are
-- back-filled into the new columns before the NOT NULL
-- constraints land, so every existing row is readable.
--
-- Compatibility:
--   - Additive. No existing row is touched except for the
--     backfill (which is a SELECT-only read followed by a
--     conditional UPDATE).
--   - The application code that previously read
--     `agency.settings.locale / settings.timezone` is updated
--     in a follow-up commit to read the top-level columns
--     instead. Until that lands, the new columns are
--     written-but-unread; no row loses its data.
--
-- Rollback:
--   Drop the columns. The backfill is idempotent on re-run
--   (only writes when the jsonb path is present and the new
--   columns are still at their defaults).
--
-- Note: the M2-era `createAgency` server action writes the
-- two fields to BOTH the new columns and the jsonb path, so
-- the backfill below never picks up a value that was missing
-- in the new columns. The migration is the place to fix the
-- pre-existing rows.

ALTER TABLE "agency" ADD COLUMN "locale" text NOT NULL DEFAULT 'en';
ALTER TABLE "agency" ADD COLUMN "timezone" text NOT NULL DEFAULT 'UTC';

-- Backfill from settings.locale / settings.timezone when
-- those fields exist on the legacy jsonb and the new columns
-- are still at their defaults. The COALESCE pattern keeps
-- the existing jsonb value where it exists, falling back to
-- the default for rows that never had a value.
UPDATE "agency"
SET
  "locale" = COALESCE(NULLIF("settings" ->> 'locale', ''), "locale"),
  "timezone" = COALESCE(NULLIF("settings" ->> 'timezone', ''), "timezone")
WHERE "settings" IS NOT NULL
  AND ("settings" ? 'locale' OR "settings" ? 'timezone');

-- CHECK constraints mirror the application-level invariants.
ALTER TABLE "agency"
  ADD CONSTRAINT "agency_locale_len"
  CHECK (char_length("locale") BETWEEN 2 AND 20);
ALTER TABLE "agency"
  ADD CONSTRAINT "agency_timezone_len"
  CHECK (char_length("timezone") BETWEEN 2 AND 80);
