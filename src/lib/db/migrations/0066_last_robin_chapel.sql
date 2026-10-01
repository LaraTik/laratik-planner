CREATE TABLE "research_collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"share_scope" text DEFAULT 'me' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_collection_share_scope_valid" CHECK ("research_collection"."share_scope" IN ('me', 'workspace'))
);
--> statement-breakpoint
ALTER TABLE "research_bookmark" ADD COLUMN "collection_id" uuid;--> statement-breakpoint
ALTER TABLE "research_teardown" ADD COLUMN "collection_id" uuid;--> statement-breakpoint
ALTER TABLE "research_collection" ADD CONSTRAINT "research_collection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_collection" ADD CONSTRAINT "research_collection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "research_collection_workspace_owner_name_unique" ON "research_collection" USING btree ("workspace_id","created_by","name");--> statement-breakpoint
CREATE INDEX "research_collection_workspace_created_idx" ON "research_collection" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "research_bookmark" ADD CONSTRAINT "research_bookmark_collection_id_research_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."research_collection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_teardown" ADD CONSTRAINT "research_teardown_collection_id_research_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."research_collection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_bookmark_collection_idx" ON "research_bookmark" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "research_teardown_collection_idx" ON "research_teardown" USING btree ("collection_id");