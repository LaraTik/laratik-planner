CREATE TABLE "workspace_assistant_prompt_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_prompt_revision_valid" CHECK ("workspace_assistant_prompt_revision"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_assistant_prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid,
	"owner_id" uuid NOT NULL,
	"scope" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"goal" text NOT NULL,
	"instructions" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_contract" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_prompt_scope_valid" CHECK ("workspace_assistant_prompt"."scope" IN ('private', 'workspace', 'agency')),
	CONSTRAINT "workspace_assistant_prompt_status_valid" CHECK ("workspace_assistant_prompt"."status" IN ('draft', 'pending_approval', 'published', 'archived')),
	CONSTRAINT "workspace_assistant_prompt_scope_workspace_valid" CHECK (("workspace_assistant_prompt"."scope" = 'agency' AND "workspace_assistant_prompt"."workspace_id" IS NULL) OR ("workspace_assistant_prompt"."scope" IN ('private', 'workspace') AND "workspace_assistant_prompt"."workspace_id" IS NOT NULL)),
	CONSTRAINT "workspace_assistant_prompt_name_valid" CHECK (length(trim("workspace_assistant_prompt"."name")) BETWEEN 2 AND 120),
	CONSTRAINT "workspace_assistant_prompt_purpose_valid" CHECK (length(trim("workspace_assistant_prompt"."purpose")) BETWEEN 1 AND 500),
	CONSTRAINT "workspace_assistant_prompt_goal_valid" CHECK (length(trim("workspace_assistant_prompt"."goal")) BETWEEN 1 AND 1000),
	CONSTRAINT "workspace_assistant_prompt_instructions_valid" CHECK (length(trim("workspace_assistant_prompt"."instructions")) BETWEEN 1 AND 12000)
);
--> statement-breakpoint
ALTER TABLE "workspace_assistant_prompt_revision" ADD CONSTRAINT "workspace_assistant_prompt_revision_prompt_id_workspace_assistant_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."workspace_assistant_prompt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_prompt_revision" ADD CONSTRAINT "workspace_assistant_prompt_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_prompt" ADD CONSTRAINT "workspace_assistant_prompt_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_prompt" ADD CONSTRAINT "workspace_assistant_prompt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_prompt" ADD CONSTRAINT "workspace_assistant_prompt_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_prompt" ADD CONSTRAINT "workspace_assistant_prompt_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_assistant_prompt_revision_prompt_idx" ON "workspace_assistant_prompt_revision" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_assistant_prompt_agency_idx" ON "workspace_assistant_prompt" USING btree ("agency_id","scope","status");--> statement-breakpoint
CREATE INDEX "workspace_assistant_prompt_workspace_idx" ON "workspace_assistant_prompt" USING btree ("workspace_id","scope","status");--> statement-breakpoint
CREATE INDEX "workspace_assistant_prompt_owner_idx" ON "workspace_assistant_prompt" USING btree ("owner_id","workspace_id","updated_at");