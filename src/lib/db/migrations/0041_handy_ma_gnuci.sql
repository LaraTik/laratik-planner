-- Migration 0041 — monthly planning foundation.
--
-- Forward: add versioned planning context, instruction packs, monthly
-- sessions, messages, and typed proposal storage. Existing content remains
-- untouched; creative detail continues to live in format_payload JSONB.
-- Compatibility: all new rows have safe defaults and existing batch imports
-- remain valid. Backup before applying; rollback by restoring the backup.

CREATE TABLE IF NOT EXISTS "brand_profile" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_planning_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_planning_message_role_valid" CHECK ("monthly_planning_message"."role" IN ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_planning_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'discovery' NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_revision" text DEFAULT 'v1' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_planning_session_status_valid" CHECK ("monthly_planning_session"."status" IN ('discovery', 'strategy', 'execution', 'review', 'applied', 'archived')),
	CONSTRAINT "monthly_planning_session_month_valid" CHECK ("monthly_planning_session"."month" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planning_instruction_pack" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid,
	"name" text NOT NULL,
	"source_markdown" text NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_instruction_pack_status_valid" CHECK ("planning_instruction_pack"."status" IN ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planning_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_revision" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_proposal_status_valid" CHECK ("planning_proposal"."status" IN ('draft', 'approved', 'applied', 'stale', 'rejected'))
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_profile_workspace_id_workspace_id_fk') THEN ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_profile_updated_by_user_id_fk') THEN ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_planning_message_session_id_monthly_planning_session_id_fk') THEN ALTER TABLE "monthly_planning_message" ADD CONSTRAINT "monthly_planning_message_session_id_monthly_planning_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."monthly_planning_session"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_planning_message_created_by_user_id_fk') THEN ALTER TABLE "monthly_planning_message" ADD CONSTRAINT "monthly_planning_message_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_planning_session_workspace_id_workspace_id_fk') THEN ALTER TABLE "monthly_planning_session" ADD CONSTRAINT "monthly_planning_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_planning_session_created_by_user_id_fk') THEN ALTER TABLE "monthly_planning_session" ADD CONSTRAINT "monthly_planning_session_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_instruction_pack_agency_id_agency_id_fk') THEN ALTER TABLE "planning_instruction_pack" ADD CONSTRAINT "planning_instruction_pack_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_instruction_pack_workspace_id_workspace_id_fk') THEN ALTER TABLE "planning_instruction_pack" ADD CONSTRAINT "planning_instruction_pack_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_instruction_pack_created_by_user_id_fk') THEN ALTER TABLE "planning_instruction_pack" ADD CONSTRAINT "planning_instruction_pack_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_proposal_session_id_monthly_planning_session_id_fk') THEN ALTER TABLE "planning_proposal" ADD CONSTRAINT "planning_proposal_session_id_monthly_planning_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."monthly_planning_session"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_proposal_applied_by_user_id_fk') THEN ALTER TABLE "planning_proposal" ADD CONSTRAINT "planning_proposal_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_proposal_created_by_user_id_fk') THEN ALTER TABLE "planning_proposal" ADD CONSTRAINT "planning_proposal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_planning_message_session_idx" ON "monthly_planning_message" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_planning_session_workspace_month_idx" ON "monthly_planning_session" USING btree ("workspace_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_planning_session_workspace_updated_idx" ON "monthly_planning_session" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planning_instruction_pack_agency_idx" ON "planning_instruction_pack" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planning_instruction_pack_workspace_idx" ON "planning_instruction_pack" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "planning_proposal_session_revision_idx" ON "planning_proposal" USING btree ("session_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "planning_proposal_idempotency_idx" ON "planning_proposal" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planning_proposal_session_status_idx" ON "planning_proposal" USING btree ("session_id","status");
--> statement-breakpoint
-- Entitlement availability is separate from agency activation. This makes
-- the new capability visible to eligible plans while keeping it disabled
-- until an agency administrator explicitly enables it.
UPDATE "platform_plan_template"
SET "default_limits" = jsonb_set(
  "default_limits",
  '{enabled_capabilities}',
  COALESCE("default_limits"->'enabled_capabilities', '[]'::jsonb)
    || '["monthly_planning_copilot"]'::jsonb,
  true
)
WHERE "default_limits" IS NOT NULL
  AND NOT COALESCE("default_limits"->'enabled_capabilities', '[]'::jsonb)
    @> '["monthly_planning_copilot"]'::jsonb;
