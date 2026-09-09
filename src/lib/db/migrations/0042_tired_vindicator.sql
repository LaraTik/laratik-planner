-- Monthly planning foundation: append-only profile and instruction-pack
-- revisions plus idempotent proposal application receipts. Additive and
-- backwards-compatible: existing content, sessions, and proposals remain
-- readable by the previous application image. Backup before production apply;
-- rollback is a forward migration that stops writing these optional records.
CREATE TABLE IF NOT EXISTS "brand_profile_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planning_instruction_pack_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"source_markdown" text NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planning_proposal" ADD COLUMN IF NOT EXISTS "applied_content_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_profile_revision_workspace_id_workspace_id_fk') THEN ALTER TABLE "brand_profile_revision" ADD CONSTRAINT "brand_profile_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_profile_revision_created_by_user_id_fk') THEN ALTER TABLE "brand_profile_revision" ADD CONSTRAINT "brand_profile_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_instruction_pack_revision_pack_id_planning_instruction_pack_id_fk') THEN ALTER TABLE "planning_instruction_pack_revision" ADD CONSTRAINT "planning_instruction_pack_revision_pack_id_planning_instruction_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."planning_instruction_pack"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_instruction_pack_revision_created_by_user_id_fk') THEN ALTER TABLE "planning_instruction_pack_revision" ADD CONSTRAINT "planning_instruction_pack_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_profile_revision_workspace_revision_idx" ON "brand_profile_revision" USING btree ("workspace_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_profile_revision_workspace_idx" ON "brand_profile_revision" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "planning_instruction_pack_revision_pack_revision_idx" ON "planning_instruction_pack_revision" USING btree ("pack_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planning_instruction_pack_revision_pack_idx" ON "planning_instruction_pack_revision" USING btree ("pack_id","created_at");
