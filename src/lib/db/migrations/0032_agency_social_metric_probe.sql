-- Migration 0032 — sanitized agency-admin analytics probe results.
-- No token, secret, or raw provider response is stored here.

CREATE TABLE IF NOT EXISTS "agency_social_metric_probe" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
  "social_channel_id" uuid NOT NULL REFERENCES "social_channel"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "platform" text NOT NULL,
  "metric" text NOT NULL,
  "status" text NOT NULL,
  "provider_error_code" text,
  "provider_request_id" text,
  "retryable" boolean NOT NULL DEFAULT false,
  "tested_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agency_social_metric_probe_provider_valid" CHECK ("provider" IN ('meta', 'tiktok')),
  CONSTRAINT "agency_social_metric_probe_platform_valid" CHECK ("platform" IN ('facebook', 'instagram', 'tiktok')),
  CONSTRAINT "agency_social_metric_probe_status_valid" CHECK ("status" IN ('available', 'unsupported', 'error', 'no_data'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agency_social_metric_probe_channel_metric_uniq"
  ON "agency_social_metric_probe" USING btree ("social_channel_id", "metric");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_social_metric_probe_agency_idx"
  ON "agency_social_metric_probe" USING btree ("agency_id", "tested_at");
