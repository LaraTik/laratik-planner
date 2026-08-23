-- Migration 0011 — entitlement rollout compatibility and lifecycle hardening.
--
-- Forward: adds typed agency lifecycle columns and a quota-event cycle key,
-- backfills every existing agency onto the Enterprise compatibility plan,
-- and reconciles counters that already exist in tenant data. No tenant row is
-- deleted or made inaccessible by this migration.
--
-- Compatibility: existing agencies receive the least restrictive seeded plan
-- so deploying quotas never blocks resources that pre-date entitlement rows.
-- Operators can explicitly select another plan after reviewing current usage.
--
-- Rollback: restore the pre-migration backup, or (before app deployment) drop
-- the new index/columns. Do not delete backfilled entitlements/counters after
-- the application starts recording usage because they become live state.

ALTER TABLE "agency" ADD COLUMN "suspended_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "agency" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "agency_usage_threshold_event"
  ADD COLUMN "cycle_key" text DEFAULT (CURRENT_DATE::text) NOT NULL;
--> statement-breakpoint
DROP INDEX "agency_usage_threshold_event_dedupe_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "agency_usage_threshold_event_dedupe_idx"
  ON "agency_usage_threshold_event" ("agency_id", "resource", "level", "cycle_key");

--> statement-breakpoint
UPDATE "platform_plan_template"
SET "default_limits" = jsonb_set(
  "default_limits",
  '{social_profiles_by_platform}',
  jsonb_build_object(
    'instagram', "default_limits"->'social_profiles_per_platform',
    'facebook', "default_limits"->'social_profiles_per_platform',
    'tiktok', "default_limits"->'social_profiles_per_platform',
    'linkedin', "default_limits"->'social_profiles_per_platform',
    'youtube', "default_limits"->'social_profiles_per_platform',
    'pinterest', "default_limits"->'social_profiles_per_platform',
    'x', "default_limits"->'social_profiles_per_platform',
    'threads', "default_limits"->'social_profiles_per_platform',
    'snapchat', "default_limits"->'social_profiles_per_platform',
    'other', "default_limits"->'social_profiles_per_platform'
  ),
  true
)
WHERE "default_limits" IS NOT NULL;

--> statement-breakpoint
INSERT INTO "agency_entitlement" (
  "agency_id", "plan_template_id", "overrides", "hard_stop_percent",
  "grace_policy", "effective_since"
)
SELECT a."id", p."id", NULL, 100, 'block', now()
FROM "agency" a
CROSS JOIN "platform_plan_template" p
WHERE p."slug" = 'enterprise'
  AND p."archived_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "agency_entitlement" e WHERE e."agency_id" = a."id"
  );

--> statement-breakpoint
INSERT INTO "agency_usage_counter" ("agency_id", "resource_key", "current_value", "version")
SELECT a."id", 'workspaces', count(w."id"), 1
FROM "agency" a
LEFT JOIN "workspace" w ON w."agency_id" = a."id" AND w."status" = 'active'
GROUP BY a."id"
ON CONFLICT ("agency_id", "resource_key") DO UPDATE
SET "current_value" = EXCLUDED."current_value", "last_updated_at" = now(),
    "version" = "agency_usage_counter"."version" + 1;

--> statement-breakpoint
INSERT INTO "agency_usage_counter" ("agency_id", "resource_key", "current_value", "version")
SELECT a."id", 'users', count(am."user_id"), 1
FROM "agency" a
LEFT JOIN "agency_membership" am
  ON am."agency_id" = a."id" AND am."status" = 'active'
GROUP BY a."id"
ON CONFLICT ("agency_id", "resource_key") DO UPDATE
SET "current_value" = EXCLUDED."current_value", "last_updated_at" = now(),
    "version" = "agency_usage_counter"."version" + 1;

--> statement-breakpoint
INSERT INTO "agency_usage_counter" ("agency_id", "resource_key", "current_value", "version")
SELECT a."id", 'social_profiles', count(sc."id"), 1
FROM "agency" a
LEFT JOIN "workspace" w ON w."agency_id" = a."id"
LEFT JOIN "social_channel" sc
  ON sc."workspace_id" = w."id" AND sc."archived_at" IS NULL AND sc."is_active" = true
GROUP BY a."id"
ON CONFLICT ("agency_id", "resource_key") DO UPDATE
SET "current_value" = EXCLUDED."current_value", "last_updated_at" = now(),
    "version" = "agency_usage_counter"."version" + 1;

--> statement-breakpoint
INSERT INTO "agency_usage_counter" ("agency_id", "resource_key", "current_value", "version")
SELECT a."id", 'social_profiles:' || p."platform", count(sc."id"), 1
FROM "agency" a
CROSS JOIN (
  VALUES ('instagram'), ('facebook'), ('tiktok'), ('linkedin'), ('youtube'),
         ('pinterest'), ('x'), ('threads'), ('snapchat'), ('other')
) AS p("platform")
LEFT JOIN "workspace" w ON w."agency_id" = a."id"
LEFT JOIN "social_channel" sc ON sc."workspace_id" = w."id"
  AND sc."platform"::text = p."platform"
  AND sc."archived_at" IS NULL AND sc."is_active" = true
GROUP BY a."id", p."platform"
ON CONFLICT ("agency_id", "resource_key") DO UPDATE
SET "current_value" = EXCLUDED."current_value", "last_updated_at" = now(),
    "version" = "agency_usage_counter"."version" + 1;
