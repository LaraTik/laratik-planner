-- Migration 0004 — Postgres audit follow-ups (2026-08-20)
--
-- Three small structural improvements that emerged from the Supabase
-- Postgres best-practices audit. All idempotent; re-runs are safe.
--
-- 1. touch_updated_at() — BEFORE UPDATE trigger that sets
--    `updated_at = now()` for the high-traffic tables. The app code
--    also sets updated_at on every UPDATE today, but a forgotten
--    SET in a future service would silently leave the column stale.
--    The trigger is the single source of truth.
--
--    Applied to: agency_membership, workspace_membership,
--    workspace_settings, invitation, content_item.
--
-- 2. outbox_failed_idx — partial index for "find me outbox events that
--    failed > 3 times and are still unprocessed" without a seq scan.
--    Used by the future failed-event alerting query (Goal 19).
--
-- 3. CREATE OR REPLACE for the trigger function so the migration is
--    re-runnable on a partially-applied state.

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agency_membership',
    'workspace_membership',
    'workspace_settings',
    'invitation',
    'content_item'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t
    );
  END LOOP;
END $$;--> statement-breakpoint

CREATE INDEX "outbox_failed_idx" ON "outbox_event" ("last_error") WHERE attempt_count > 3 AND processed_at IS NULL;
