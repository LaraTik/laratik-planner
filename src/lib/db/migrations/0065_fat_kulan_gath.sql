CREATE TABLE "content_research_teardown_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"research_teardown_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_research_teardown_link" ADD CONSTRAINT "content_research_teardown_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_research_teardown_link" ADD CONSTRAINT "content_research_teardown_link_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_research_teardown_link" ADD CONSTRAINT "content_research_teardown_link_research_teardown_id_research_teardown_id_fk" FOREIGN KEY ("research_teardown_id") REFERENCES "public"."research_teardown"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_research_teardown_link" ADD CONSTRAINT "content_research_teardown_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_research_teardown_item_unique" ON "content_research_teardown_link" USING btree ("content_item_id","research_teardown_id");--> statement-breakpoint
CREATE INDEX "content_research_teardown_workspace_created_idx" ON "content_research_teardown_link" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "content_research_teardown_teardown_idx" ON "content_research_teardown_link" USING btree ("research_teardown_id");