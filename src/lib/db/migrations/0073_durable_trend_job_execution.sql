CREATE TABLE "trend_job_execution" (
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_job_execution_status_valid" CHECK ("trend_job_execution"."status" IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
	CONSTRAINT "trend_job_execution_attempts_valid" CHECK ("trend_job_execution"."attempt_count" >= 0 AND "trend_job_execution"."max_attempts" BETWEEN 1 AND 20)
);
--> statement-breakpoint
ALTER TABLE "social_oauth_state" DROP CONSTRAINT "social_oauth_state_return_path_safe";--> statement-breakpoint
ALTER TABLE "trend_job_execution" ADD CONSTRAINT "trend_job_execution_id_trend_fetch_job_id_fk" FOREIGN KEY ("id") REFERENCES "public"."trend_fetch_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_job_execution" ADD CONSTRAINT "trend_job_execution_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_job_execution" ADD CONSTRAINT "trend_job_execution_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trend_job_execution_claim_idx" ON "trend_job_execution" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "trend_job_execution_scope_idx" ON "trend_job_execution" USING btree ("agency_id","workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trend_job_execution_dedupe_active_unique" ON "trend_job_execution" USING btree ("dedupe_key") WHERE "trend_job_execution"."status" IN ('queued', 'running');--> statement-breakpoint
ALTER TABLE "social_oauth_state" ADD CONSTRAINT "social_oauth_state_return_path_safe" CHECK ("social_oauth_state"."return_path" ~ '^/app/a/[a-z0-9-]+/w/[a-z0-9-]+/channels$');