-- Compatibility repair: 0011 defines this unique index and the Drizzle
-- schema still requires it, but older/local databases can have the table
-- without the constraint. The usage service relies on this target for its
-- idempotent threshold-event insert.
CREATE UNIQUE INDEX IF NOT EXISTS "agency_usage_threshold_event_dedupe_idx"
  ON "agency_usage_threshold_event" ("agency_id", "resource", "level", "cycle_key");
