CREATE TABLE IF NOT EXISTS "agency_module_setting" (
	"agency_id" uuid NOT NULL,
	"module" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_automation_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_automation_rule_mode_valid" CHECK ("community_automation_rule"."mode" IN ('manual', 'ai_assist', 'controlled_auto')),
	CONSTRAINT "community_automation_rule_status_valid" CHECK ("community_automation_rule"."status" IN ('draft', 'tested', 'published', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_capability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_connection_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"state" text DEFAULT 'unknown' NOT NULL,
	"provider_version" text,
	"checked_at" timestamp with time zone,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_capability_state_valid" CHECK ("community_capability"."state" IN ('available', 'unavailable', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_channel_id" uuid,
	"provider" text DEFAULT 'meta' NOT NULL,
	"channel_type" text NOT NULL,
	"external_conversation_id" text NOT NULL,
	"external_root_id" text,
	"external_post_id" text,
	"state" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_to" uuid,
	"snoozed_until" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_conversation_state_valid" CHECK ("community_conversation"."state" IN ('new', 'open', 'assigned', 'waiting_customer', 'waiting_approval', 'resolved', 'reopened', 'spam')),
	CONSTRAINT "community_conversation_priority_valid" CHECK ("community_conversation"."priority" IN ('low', 'normal', 'high', 'urgent'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"body" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_draft_state_valid" CHECK ("community_draft"."state" IN ('draft', 'queued', 'approved', 'rejected', 'sent'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"detail" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"provider" text DEFAULT 'meta' NOT NULL,
	"external_message_id" text NOT NULL,
	"direction" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"body" text NOT NULL,
	"author_name" text,
	"author_external_id" text,
	"external_parent_id" text,
	"delivery_state" text DEFAULT 'received' NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_message_direction_valid" CHECK ("community_message"."direction" IN ('incoming', 'outgoing', 'note')),
	CONSTRAINT "community_message_visibility_valid" CHECK ("community_message"."visibility" IN ('public', 'private', 'internal')),
	CONSTRAINT "community_message_delivery_state_valid" CHECK ("community_message"."delivery_state" IN ('received', 'draft', 'queued', 'sending', 'sent', 'failed', 'unknown', 'reconciled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_playbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_playbook_status_valid" CHECK ("community_playbook"."status" IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_routing_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_send_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"draft_id" uuid,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"provider_request_id" text,
	"error_code" text,
	"error_detail" text,
	"attempted_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_send_attempt_state_valid" CHECK ("community_send_attempt"."state" IN ('queued', 'sending', 'sent', 'failed', 'unknown', 'reconciled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_connection_id" uuid NOT NULL,
	"cursor" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_sync_state_status_valid" CHECK ("community_sync_state"."status" IN ('idle', 'running', 'failed', 'paused'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_test_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_passed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "community_inbox_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "community_inbox_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "community_inbox_auto_send_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "community_inbox_emergency_stop" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "community_inbox_retention_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_module_setting_agency_id_agency_id_fk') THEN ALTER TABLE "agency_module_setting" ADD CONSTRAINT "agency_module_setting_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_module_setting_updated_by_user_id_fk') THEN ALTER TABLE "agency_module_setting" ADD CONSTRAINT "agency_module_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_automation_rule_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_automation_rule" ADD CONSTRAINT "community_automation_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_capability_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_capability" ADD CONSTRAINT "community_capability_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_capability_social_connection_id_social_connection_id_fk') THEN ALTER TABLE "community_capability" ADD CONSTRAINT "community_capability_social_connection_id_social_connection_id_fk" FOREIGN KEY ("social_connection_id") REFERENCES "public"."social_connection"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_conversation_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_conversation" ADD CONSTRAINT "community_conversation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_conversation_social_channel_id_social_channel_id_fk') THEN ALTER TABLE "community_conversation" ADD CONSTRAINT "community_conversation_social_channel_id_social_channel_id_fk" FOREIGN KEY ("social_channel_id") REFERENCES "public"."social_channel"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_conversation_assigned_to_user_id_fk') THEN ALTER TABLE "community_conversation" ADD CONSTRAINT "community_conversation_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_draft_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_draft" ADD CONSTRAINT "community_draft_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_draft_conversation_id_community_conversation_id_fk') THEN ALTER TABLE "community_draft" ADD CONSTRAINT "community_draft_conversation_id_community_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."community_conversation"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_draft_created_by_user_id_fk') THEN ALTER TABLE "community_draft" ADD CONSTRAINT "community_draft_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_event_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_event" ADD CONSTRAINT "community_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_event_conversation_id_community_conversation_id_fk') THEN ALTER TABLE "community_event" ADD CONSTRAINT "community_event_conversation_id_community_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."community_conversation"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_event_actor_id_user_id_fk') THEN ALTER TABLE "community_event" ADD CONSTRAINT "community_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_message_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_message" ADD CONSTRAINT "community_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_message_conversation_id_community_conversation_id_fk') THEN ALTER TABLE "community_message" ADD CONSTRAINT "community_message_conversation_id_community_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."community_conversation"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_playbook_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_playbook" ADD CONSTRAINT "community_playbook_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_playbook_owner_id_user_id_fk') THEN ALTER TABLE "community_playbook" ADD CONSTRAINT "community_playbook_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_routing_rule_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_routing_rule" ADD CONSTRAINT "community_routing_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_send_attempt_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_send_attempt" ADD CONSTRAINT "community_send_attempt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_send_attempt_conversation_id_community_conversation_id_fk') THEN ALTER TABLE "community_send_attempt" ADD CONSTRAINT "community_send_attempt_conversation_id_community_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."community_conversation"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_send_attempt_draft_id_community_draft_id_fk') THEN ALTER TABLE "community_send_attempt" ADD CONSTRAINT "community_send_attempt_draft_id_community_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."community_draft"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_sync_state_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_sync_state" ADD CONSTRAINT "community_sync_state_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_sync_state_social_connection_id_social_connection_id_fk') THEN ALTER TABLE "community_sync_state" ADD CONSTRAINT "community_sync_state_social_connection_id_social_connection_id_fk" FOREIGN KEY ("social_connection_id") REFERENCES "public"."social_connection"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_test_case_workspace_id_workspace_id_fk') THEN ALTER TABLE "community_test_case" ADD CONSTRAINT "community_test_case_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agency_module_setting_unique" ON "agency_module_setting" USING btree ("agency_id","module");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_module_setting_module_idx" ON "agency_module_setting" USING btree ("module","enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_automation_rule_workspace_status_idx" ON "community_automation_rule" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_capability_connection_operation_unique" ON "community_capability" USING btree ("social_connection_id","operation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_capability_workspace_idx" ON "community_capability" USING btree ("workspace_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_conversation_provider_external_unique" ON "community_conversation" USING btree ("workspace_id","provider","external_conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_conversation_workspace_state_idx" ON "community_conversation" USING btree ("workspace_id","state","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_conversation_workspace_last_message_idx" ON "community_conversation" USING btree ("workspace_id","last_message_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_draft_conversation_idx" ON "community_draft" USING btree ("conversation_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_event_workspace_created_idx" ON "community_event" USING btree ("workspace_id","created_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_message_provider_external_unique" ON "community_message" USING btree ("workspace_id","provider","external_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_message_conversation_posted_idx" ON "community_message" USING btree ("conversation_id","posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_playbook_workspace_status_idx" ON "community_playbook" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_routing_rule_workspace_priority_idx" ON "community_routing_rule" USING btree ("workspace_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_send_attempt_idempotency_unique" ON "community_send_attempt" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_send_attempt_workspace_state_idx" ON "community_send_attempt" USING btree ("workspace_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_sync_state_connection_unique" ON "community_sync_state" USING btree ("social_connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_sync_state_workspace_idx" ON "community_sync_state" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_test_case_workspace_idx" ON "community_test_case" USING btree ("workspace_id","updated_at");--> statement-breakpoint
-- Community & Inbox is plan-entitled but remains agency-disabled until an
-- administrator opts in. Enterprise is the first plan that can expose it;
-- existing agencies therefore stay safely off after this migration.
UPDATE "platform_plan_template"
SET "default_limits" = jsonb_set(
  COALESCE("default_limits", '{}'::jsonb),
  '{enabled_modules}',
  '["community_inbox"]'::jsonb,
  true
)
WHERE "slug" = 'enterprise'
  AND "archived_at" IS NULL;
