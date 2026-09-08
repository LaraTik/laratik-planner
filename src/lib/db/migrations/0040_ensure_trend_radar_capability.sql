-- Migration 0040 — ensure seeded standard plans expose Trend Radar.
--
-- Forward: append trend_radar to every non-custom plan's capability allowlist.
-- Compatibility: idempotent and additive; agency overrides are untouched.
-- Backup: take the normal database backup before applying the migration.
-- Rollback: restore the backup, or remove only the trend_radar array member
-- after confirming no agency has intentionally enabled it through an override.
--
-- This follow-up is required because isolated test resets preserve the
-- migration-seeded plan reference rows while truncating tenant data. It also
-- repairs any environment where 0039 was recorded before plan rows existed.

UPDATE "platform_plan_template"
SET "default_limits" = jsonb_set(
  "default_limits",
  '{enabled_capabilities}',
  COALESCE("default_limits"->'enabled_capabilities', '[]'::jsonb)
    || '["trend_radar"]'::jsonb,
  true
)
WHERE "default_limits" IS NOT NULL
  AND NOT COALESCE("default_limits"->'enabled_capabilities', '[]'::jsonb)
    @> '["trend_radar"]'::jsonb;
