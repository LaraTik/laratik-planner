-- Migration 0030 — Meta publishing readiness foundation.
--
-- This migration is additive and deliberately does not create a live publish
-- queue. All publishing switches default to false. Existing analytics,
-- manual channels, payloads, and publication records remain compatible.

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "meta_publishing_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "agency_social_provider_config"
  ADD COLUMN IF NOT EXISTS "publishing_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "agency_social_provider_config"
  ADD COLUMN IF NOT EXISTS "app_review_status" text NOT NULL DEFAULT 'not_requested';
--> statement-breakpoint
ALTER TABLE "agency_social_provider_config"
  ADD COLUMN IF NOT EXISTS "business_verification_status" text NOT NULL DEFAULT 'not_required';
--> statement-breakpoint
ALTER TABLE "social_channel"
  ADD COLUMN IF NOT EXISTS "parent_social_channel_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_channel_parent_social_channel_id_fk'
      AND conrelid = 'social_channel'::regclass
  ) THEN
    ALTER TABLE "social_channel"
      ADD CONSTRAINT "social_channel_parent_social_channel_id_fk"
      FOREIGN KEY ("parent_social_channel_id")
      REFERENCES "social_channel"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_channel_parent_not_self'
      AND conrelid = 'social_channel'::regclass
  ) THEN
    ALTER TABLE "social_channel"
      ADD CONSTRAINT "social_channel_parent_not_self"
      CHECK ("parent_social_channel_id" IS NULL OR "parent_social_channel_id" <> "id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agency_social_provider_config_app_review_status_valid'
      AND conrelid = 'agency_social_provider_config'::regclass
  ) THEN
    ALTER TABLE "agency_social_provider_config"
      ADD CONSTRAINT "agency_social_provider_config_app_review_status_valid"
      CHECK ("app_review_status" IN ('not_requested', 'pending', 'approved', 'rejected'));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agency_social_provider_config_business_verification_status_valid'
      AND conrelid = 'agency_social_provider_config'::regclass
  ) THEN
    ALTER TABLE "agency_social_provider_config"
      ADD CONSTRAINT "agency_social_provider_config_business_verification_status_valid"
      CHECK ("business_verification_status" IN ('not_required', 'not_started', 'pending', 'verified', 'rejected'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_channel_parent_idx"
  ON "social_channel" USING btree ("parent_social_channel_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_connection_capability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "social_connection_id" uuid NOT NULL,
  "social_channel_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "status" text NOT NULL DEFAULT 'not_requested',
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_checked_at" timestamp with time zone,
  "granted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_error_code" text,
  "last_error_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "social_connection_capability_operation_valid"
    CHECK ("operation" IN ('analytics_read', 'facebook_page_publish', 'instagram_content_publish')),
  CONSTRAINT "social_connection_capability_status_valid"
    CHECK ("status" IN ('not_requested', 'pending', 'active', 'needs_reauth', 'revoked', 'unavailable', 'error'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_connection_capability_connection_fk'
      AND conrelid = 'social_connection_capability'::regclass
  ) THEN
    ALTER TABLE "social_connection_capability"
      ADD CONSTRAINT "social_connection_capability_connection_fk"
      FOREIGN KEY ("social_connection_id") REFERENCES "social_connection"("id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_connection_capability_channel_fk'
      AND conrelid = 'social_connection_capability'::regclass
  ) THEN
    ALTER TABLE "social_connection_capability"
      ADD CONSTRAINT "social_connection_capability_channel_fk"
      FOREIGN KEY ("social_channel_id") REFERENCES "social_channel"("id")
      ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_connection_capability_channel_operation_uniq"
  ON "social_connection_capability" USING btree ("social_channel_id", "operation");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_connection_capability_connection_idx"
  ON "social_connection_capability" USING btree ("social_connection_id", "status");
