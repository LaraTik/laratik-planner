CREATE TABLE "workspace_assistant_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid,
	"owner_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_knowledge_scope_valid" CHECK ("workspace_assistant_knowledge"."scope" IN ('agency', 'workspace')),
	CONSTRAINT "workspace_assistant_knowledge_scope_workspace_valid" CHECK (("workspace_assistant_knowledge"."scope" = 'agency' AND "workspace_assistant_knowledge"."workspace_id" IS NULL) OR ("workspace_assistant_knowledge"."scope" = 'workspace' AND "workspace_assistant_knowledge"."workspace_id" IS NOT NULL)),
	CONSTRAINT "workspace_assistant_knowledge_category_valid" CHECK ("workspace_assistant_knowledge"."category" IN ('brand', 'audience', 'strategy', 'operations', 'performance', 'reference')),
	CONSTRAINT "workspace_assistant_knowledge_verification_valid" CHECK ("workspace_assistant_knowledge"."verification_status" IN ('unverified', 'verified', 'outdated')),
	CONSTRAINT "workspace_assistant_knowledge_title_valid" CHECK (length(trim("workspace_assistant_knowledge"."title")) BETWEEN 2 AND 160),
	CONSTRAINT "workspace_assistant_knowledge_content_valid" CHECK (length(trim("workspace_assistant_knowledge"."content")) BETWEEN 1 AND 8000),
	CONSTRAINT "workspace_assistant_knowledge_revision_valid" CHECK ("workspace_assistant_knowledge"."revision" > 0),
	CONSTRAINT "workspace_assistant_knowledge_url_valid" CHECK ("workspace_assistant_knowledge"."source_url" IS NULL OR "workspace_assistant_knowledge"."source_url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "workspace_assistant_knowledge_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_knowledge_revision_valid" CHECK ("workspace_assistant_knowledge_revision"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_assistant_knowledge" ADD CONSTRAINT "workspace_assistant_knowledge_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_knowledge" ADD CONSTRAINT "workspace_assistant_knowledge_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_knowledge" ADD CONSTRAINT "workspace_assistant_knowledge_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_knowledge_revision" ADD CONSTRAINT "workspace_assistant_knowledge_revision_knowledge_id_workspace_assistant_knowledge_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."workspace_assistant_knowledge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_knowledge_revision" ADD CONSTRAINT "workspace_assistant_knowledge_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_assistant_knowledge_agency_scope_idx" ON "workspace_assistant_knowledge" USING btree ("agency_id","scope","verification_status","updated_at");--> statement-breakpoint
CREATE INDEX "workspace_assistant_knowledge_workspace_idx" ON "workspace_assistant_knowledge" USING btree ("workspace_id","verification_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_assistant_knowledge_revision_identity_idx" ON "workspace_assistant_knowledge_revision" USING btree ("knowledge_id","revision");--> statement-breakpoint
CREATE INDEX "workspace_assistant_knowledge_revision_created_idx" ON "workspace_assistant_knowledge_revision" USING btree ("knowledge_id","created_at");