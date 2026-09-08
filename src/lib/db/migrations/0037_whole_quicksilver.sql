CREATE TABLE IF NOT EXISTS "saved_filter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"filters" jsonb NOT NULL,
	"share_scope" text DEFAULT 'me' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"template_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_filter_share_scope_valid" CHECK ("saved_filter"."share_scope" IN ('me', 'workspace', 'agency'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_board_item" (
	"board_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"feedback" text,
	"notes" text,
	CONSTRAINT "trend_board_item_board_id_signal_id_pk" PRIMARY KEY("board_id","signal_id"),
	CONSTRAINT "trend_board_item_feedback_valid" CHECK ("trend_board_item"."feedback" IS NULL OR "trend_board_item"."feedback" IN ('positive', 'negative'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_board" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"share_scope" text DEFAULT 'me' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_board_share_scope_valid" CHECK ("trend_board"."share_scope" IN ('me', 'workspace', 'agency'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_brief" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"signal_id" uuid,
	"workspace_id" uuid NOT NULL,
	"velocity_at_schedule" real,
	"velocity_at_publish" real,
	"reach_multiplier" real,
	"agency_feedback" text,
	"feedback_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_brief_agency_feedback_valid" CHECK ("trend_brief"."agency_feedback" IS NULL OR "trend_brief"."agency_feedback" IN ('would_ride_again', 'would_not_ride'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"feedback_type" text NOT NULL,
	"weight_delta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_feedback_feedback_type_valid" CHECK ("trend_feedback"."feedback_type" IN ('use_in_brief', 'save', 'dismiss', 'would_ride_again', 'would_not_ride'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_fetch_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"status" text NOT NULL,
	"signals_added" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"error_message" text,
	"fallback_used" text,
	"cached_fallback" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_fetch_job_status_valid" CHECK ("trend_fetch_job"."status" IN ('queued', 'running', 'success', 'error', 'degraded'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"region" text DEFAULT 'XX' NOT NULL,
	"score" real NOT NULL,
	"raw_score" real,
	"raw_payload" jsonb NOT NULL,
	"velocity" real DEFAULT 0 NOT NULL,
	"lifecycle" text DEFAULT 'stable' NOT NULL,
	"sentiment" real DEFAULT 0 NOT NULL,
	"toxicity" real DEFAULT 0 NOT NULL,
	"safe_to_amplify" boolean DEFAULT true NOT NULL,
	"vertical" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" jsonb,
	"source_url" text,
	"source_id" text NOT NULL,
	"source_key" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trend_signal_platform_valid" CHECK ("trend_signal"."platform" IN ('x', 'instagram', 'tiktok', 'youtube', 'reddit', 'linkedin', 'threads', 'facebook', 'pinterest', 'google_trends', 'spotify')),
	CONSTRAINT "trend_signal_type_valid" CHECK ("trend_signal"."type" IN ('hashtag', 'sound', 'creator', 'topic', 'format', 'aesthetic', 'news', 'event', 'product')),
	CONSTRAINT "trend_signal_lifecycle_valid" CHECK ("trend_signal"."lifecycle" IN ('emerging', 'peaking', 'declining', 'stable'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_source_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_source_activity_event_type_valid" CHECK ("trend_source_activity"."event_type" IN ('sync_completed', 'sync_failed', 'enabled', 'disabled', 'configured', 'rate_limited', 'fallback_engaged'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_source_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_source_audit_action_valid" CHECK ("trend_source_audit"."action" IN ('enable', 'disable', 'configure', 'test', 'break', 'recover')),
	CONSTRAINT "trend_source_audit_result_valid" CHECK ("trend_source_audit"."result" IN ('success', 'failure'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_source_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"status" text NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" jsonb,
	"success_rate_24h" real,
	"avg_latency_ms" integer,
	"signals_last_24h" integer,
	"rate_limit_used" real,
	"rate_limit_quota" real,
	"rate_limit_resets_at" timestamp with time zone,
	"cost_cents_last_24h" integer,
	"circuit_state" text,
	"circuit_opened_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_source_health_agency_source_unique" UNIQUE("agency_id","source_key"),
	CONSTRAINT "trend_source_health_status_valid" CHECK ("trend_source_health"."status" IN ('healthy', 'degraded', 'down', 'disabled', 'rate_limited', 'quota_exhausted')),
	CONSTRAINT "trend_source_health_circuit_state_valid" CHECK ("trend_source_health"."circuit_state" IS NULL OR "trend_source_health"."circuit_state" IN ('closed', 'open', 'half_open'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"tier" text NOT NULL,
	"tos_class" text NOT NULL,
	"region" text DEFAULT 'XX' NOT NULL,
	"language_filter" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cadence_override" text,
	"max_signals_per_cycle" integer DEFAULT 200 NOT NULL,
	"api_key_ref" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tos_acknowledged_by" uuid,
	"tos_acknowledged_at" timestamp with time zone,
	"enabled_by" uuid,
	"enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_source_agency_source_unique" UNIQUE("agency_id","source_key"),
	CONSTRAINT "trend_source_tier_valid" CHECK ("trend_source"."tier" IN ('free', 'paid', 'experimental')),
	CONSTRAINT "trend_source_tos_class_valid" CHECK ("trend_source"."tos_class" IN ('clean', 'grey', 'review_required'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_source_optout" (
	"workspace_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"opted_out_by" uuid,
	"opted_out_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	CONSTRAINT "workspace_source_optout_workspace_id_source_key_pk" PRIMARY KEY("workspace_id","source_key")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_filter_workspace_id_workspace_id_fk') THEN ALTER TABLE "saved_filter" ADD CONSTRAINT "saved_filter_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_filter_user_id_user_id_fk') THEN ALTER TABLE "saved_filter" ADD CONSTRAINT "saved_filter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_board_item_board_id_trend_board_id_fk') THEN ALTER TABLE "trend_board_item" ADD CONSTRAINT "trend_board_item_board_id_trend_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."trend_board"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_board_item_signal_id_trend_signal_id_fk') THEN ALTER TABLE "trend_board_item" ADD CONSTRAINT "trend_board_item_signal_id_trend_signal_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."trend_signal"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_board_workspace_id_workspace_id_fk') THEN ALTER TABLE "trend_board" ADD CONSTRAINT "trend_board_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_board_user_id_user_id_fk') THEN ALTER TABLE "trend_board" ADD CONSTRAINT "trend_board_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_brief_content_item_id_content_item_id_fk') THEN ALTER TABLE "trend_brief" ADD CONSTRAINT "trend_brief_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_brief_signal_id_trend_signal_id_fk') THEN ALTER TABLE "trend_brief" ADD CONSTRAINT "trend_brief_signal_id_trend_signal_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."trend_signal"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_brief_workspace_id_workspace_id_fk') THEN ALTER TABLE "trend_brief" ADD CONSTRAINT "trend_brief_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_feedback_workspace_id_workspace_id_fk') THEN ALTER TABLE "trend_feedback" ADD CONSTRAINT "trend_feedback_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_feedback_user_id_user_id_fk') THEN ALTER TABLE "trend_feedback" ADD CONSTRAINT "trend_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_feedback_signal_id_trend_signal_id_fk') THEN ALTER TABLE "trend_feedback" ADD CONSTRAINT "trend_feedback_signal_id_trend_signal_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."trend_signal"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_fetch_job_workspace_id_workspace_id_fk') THEN ALTER TABLE "trend_fetch_job" ADD CONSTRAINT "trend_fetch_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_signal_workspace_id_workspace_id_fk') THEN ALTER TABLE "trend_signal" ADD CONSTRAINT "trend_signal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_source_activity_agency_id_agency_id_fk') THEN ALTER TABLE "trend_source_activity" ADD CONSTRAINT "trend_source_activity_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_source_audit_agency_id_agency_id_fk') THEN ALTER TABLE "trend_source_audit" ADD CONSTRAINT "trend_source_audit_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_source_audit_actor_user_id_user_id_fk') THEN ALTER TABLE "trend_source_audit" ADD CONSTRAINT "trend_source_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_source_health_agency_id_agency_id_fk') THEN ALTER TABLE "trend_source_health" ADD CONSTRAINT "trend_source_health_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_source_agency_id_agency_id_fk') THEN ALTER TABLE "trend_source" ADD CONSTRAINT "trend_source_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_source_tos_acknowledged_by_user_id_fk') THEN ALTER TABLE "trend_source" ADD CONSTRAINT "trend_source_tos_acknowledged_by_user_id_fk" FOREIGN KEY ("tos_acknowledged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trend_source_enabled_by_user_id_fk') THEN ALTER TABLE "trend_source" ADD CONSTRAINT "trend_source_enabled_by_user_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_source_optout_workspace_id_workspace_id_fk') THEN ALTER TABLE "workspace_source_optout" ADD CONSTRAINT "workspace_source_optout_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_source_optout_opted_out_by_user_id_fk') THEN ALTER TABLE "workspace_source_optout" ADD CONSTRAINT "workspace_source_optout_opted_out_by_user_id_fk" FOREIGN KEY ("opted_out_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_filter_workspace_user_idx" ON "saved_filter" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_filter_share_scope_idx" ON "saved_filter" USING btree ("share_scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_board_item_signal_idx" ON "trend_board_item" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_board_workspace_user_idx" ON "trend_board" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_brief_workspace_created_idx" ON "trend_brief" USING btree ("workspace_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_brief_signal_idx" ON "trend_brief" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_feedback_workspace_user_created_idx" ON "trend_feedback" USING btree ("workspace_id","user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_feedback_signal_idx" ON "trend_feedback" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_fetch_job_workspace_source_created_idx" ON "trend_fetch_job" USING btree ("workspace_id","source_key","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_fetch_job_status_created_idx" ON "trend_fetch_job" USING btree ("status","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_signal_workspace_platform_fetched_idx" ON "trend_signal" USING btree ("workspace_id","platform","fetched_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_signal_workspace_label_platform_idx" ON "trend_signal" USING btree ("workspace_id","normalized_label","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_signal_source_dedup_idx" ON "trend_signal" USING btree ("source_key","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_signal_workspace_lifecycle_score_idx" ON "trend_signal" USING btree ("workspace_id","lifecycle","score" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_source_activity_agency_source_created_idx" ON "trend_source_activity" USING btree ("agency_id","source_key","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_source_audit_agency_source_created_idx" ON "trend_source_audit" USING btree ("agency_id","source_key","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_source_audit_actor_created_idx" ON "trend_source_audit" USING btree ("actor_user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_source_health_agency_status_idx" ON "trend_source_health" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_source_agency_enabled_idx" ON "trend_source" USING btree ("agency_id","enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_source_optout_source_idx" ON "workspace_source_optout" USING btree ("source_key");--> statement-breakpoint
