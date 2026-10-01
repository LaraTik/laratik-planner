CREATE TABLE "content_research_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"social_post_observation_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_research_link" ADD CONSTRAINT "content_research_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_research_link" ADD CONSTRAINT "content_research_link_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_research_link" ADD CONSTRAINT "content_research_link_social_post_observation_id_social_post_observation_id_fk" FOREIGN KEY ("social_post_observation_id") REFERENCES "public"."social_post_observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_research_link" ADD CONSTRAINT "content_research_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_research_link_item_observation_unique" ON "content_research_link" USING btree ("content_item_id","social_post_observation_id");--> statement-breakpoint
CREATE INDEX "content_research_link_workspace_created_idx" ON "content_research_link" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "content_research_link_observation_idx" ON "content_research_link" USING btree ("social_post_observation_id");