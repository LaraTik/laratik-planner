CREATE TABLE "workspace_assistant_skill_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_skill_revision_number_valid" CHECK ("workspace_assistant_skill_revision"."revision" > 0),
	CONSTRAINT "workspace_assistant_skill_revision_state_valid" CHECK ("workspace_assistant_skill_revision"."state" IN ('draft', 'pending_review', 'approved', 'rejected')),
	CONSTRAINT "workspace_assistant_skill_revision_reviewer_valid" CHECK ("workspace_assistant_skill_revision"."state" NOT IN ('approved', 'rejected') OR ("workspace_assistant_skill_revision"."reviewed_by" IS NOT NULL AND "workspace_assistant_skill_revision"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "workspace_assistant_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"latest_revision" integer DEFAULT 1 NOT NULL,
	"active_revision" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_skill_slug_valid" CHECK ("workspace_assistant_skill"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "workspace_assistant_skill_status_valid" CHECK ("workspace_assistant_skill"."status" IN ('draft', 'pending_review', 'active', 'archived')),
	CONSTRAINT "workspace_assistant_skill_revision_valid" CHECK ("workspace_assistant_skill"."latest_revision" > 0),
	CONSTRAINT "workspace_assistant_skill_active_revision_valid" CHECK ("workspace_assistant_skill"."active_revision" IS NULL OR "workspace_assistant_skill"."active_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_assistant_skill_revision" ADD CONSTRAINT "workspace_assistant_skill_revision_skill_id_workspace_assistant_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."workspace_assistant_skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_skill_revision" ADD CONSTRAINT "workspace_assistant_skill_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_skill_revision" ADD CONSTRAINT "workspace_assistant_skill_revision_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_skill" ADD CONSTRAINT "workspace_assistant_skill_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_skill" ADD CONSTRAINT "workspace_assistant_skill_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_assistant_skill_revision_identity_idx" ON "workspace_assistant_skill_revision" USING btree ("skill_id","revision");--> statement-breakpoint
CREATE INDEX "workspace_assistant_skill_revision_state_idx" ON "workspace_assistant_skill_revision" USING btree ("skill_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_assistant_skill_agency_slug_idx" ON "workspace_assistant_skill" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "workspace_assistant_skill_agency_status_idx" ON "workspace_assistant_skill" USING btree ("agency_id","status");