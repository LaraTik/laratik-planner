-- Durable Trend Radar execution state.
-- This migration is intentionally replay-safe because the production repair
-- path can replay later migrations after restoring a skipped ledger entry.

CREATE TABLE IF NOT EXISTS "trend_job_execution" (
  "id" uuid PRIMARY KEY NOT NULL,
  "job_kind" text DEFAULT 'trend_sync' NOT NULL,
  "agency_id" uuid NOT NULL,
  "workspace_id" uuid,
  "source_key" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" text,
  "lease_token" uuid,
  "lease_expires_at" timestamp with time zone,
  "last_error_code" text,
  "last_error_message" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_job_execution_status_valid') THEN
    ALTER TABLE "trend_job_execution"
      ADD CONSTRAINT "trend_job_execution_status_valid"
      CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_job_execution_attempts_valid') THEN
    ALTER TABLE "trend_job_execution"
      ADD CONSTRAINT "trend_job_execution_attempts_valid"
      CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_job_execution_id_trend_fetch_job_id_fk') THEN
    ALTER TABLE "trend_job_execution"
      ADD CONSTRAINT "trend_job_execution_id_trend_fetch_job_id_fk"
      FOREIGN KEY ("id") REFERENCES "public"."trend_fetch_job"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_job_execution_agency_id_agency_id_fk') THEN
    ALTER TABLE "trend_job_execution"
      ADD CONSTRAINT "trend_job_execution_agency_id_agency_id_fk"
      FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_job_execution_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "trend_job_execution"
      ADD CONSTRAINT "trend_job_execution_workspace_id_workspace_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_job_execution_claim_idx"
  ON "trend_job_execution" USING btree ("status", "available_at", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_job_execution_scope_idx"
  ON "trend_job_execution" USING btree ("agency_id", "workspace_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trend_job_execution_dedupe_active_unique"
  ON "trend_job_execution" USING btree ("dedupe_key")
  WHERE "trend_job_execution"."status" IN ('queued', 'running');
