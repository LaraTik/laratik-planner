CREATE TABLE "research_teardown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_reference" text,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_teardown_source_kind_valid" CHECK ("research_teardown"."source_kind" IN ('provider_media', 'owned_asset', 'planner_notes'))
);
--> statement-breakpoint
ALTER TABLE "research_teardown" ADD CONSTRAINT "research_teardown_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_teardown" ADD CONSTRAINT "research_teardown_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_teardown_workspace_created_idx" ON "research_teardown" USING btree ("workspace_id","created_at");