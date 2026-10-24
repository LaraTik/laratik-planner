CREATE TABLE "workspace_assistant_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"expected_revision" integer NOT NULL,
	"field" text NOT NULL,
	"title" text NOT NULL,
	"before_value" text NOT NULL,
	"after_value" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_proposal_field_valid" CHECK ("workspace_assistant_proposal"."field" IN ('title', 'brief')),
	CONSTRAINT "workspace_assistant_proposal_status_valid" CHECK ("workspace_assistant_proposal"."status" IN ('proposed', 'applied', 'rejected', 'stale', 'expired')),
	CONSTRAINT "workspace_assistant_proposal_revision_valid" CHECK ("workspace_assistant_proposal"."expected_revision" >= 0),
	CONSTRAINT "workspace_assistant_proposal_title_valid" CHECK (length(trim("workspace_assistant_proposal"."title")) BETWEEN 1 AND 180),
	CONSTRAINT "workspace_assistant_proposal_values_valid" CHECK (length("workspace_assistant_proposal"."before_value") <= 2000 AND length("workspace_assistant_proposal"."after_value") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "workspace_assistant_proposal" ADD CONSTRAINT "workspace_assistant_proposal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_proposal" ADD CONSTRAINT "workspace_assistant_proposal_conversation_id_workspace_assistant_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."workspace_assistant_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_proposal" ADD CONSTRAINT "workspace_assistant_proposal_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_proposal" ADD CONSTRAINT "workspace_assistant_proposal_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_assistant_proposal_owner_idx" ON "workspace_assistant_proposal" USING btree ("workspace_id","owner_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_assistant_proposal_conversation_idx" ON "workspace_assistant_proposal" USING btree ("conversation_id","created_at");