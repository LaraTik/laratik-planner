-- Migration 0039 — expose the shipped Trend Radar capability on standard plans.
--
-- Forward: append trend_radar to every non-custom plan's capability allowlist.
-- Compatibility: the update is additive and idempotent; existing agency
-- overrides remain untouched and custom plans (NULL defaults) remain gated.
-- Backup: take the normal database backup before applying the migration.
-- Rollback: restore the backup, or remove only the trend_radar array member
-- after confirming no agency has intentionally enabled it through an override.

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
