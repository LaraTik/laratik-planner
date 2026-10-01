CREATE TABLE "research_bookmark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_post_observation_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_bookmark" ADD CONSTRAINT "research_bookmark_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_bookmark" ADD CONSTRAINT "research_bookmark_social_post_observation_id_social_post_observation_id_fk" FOREIGN KEY ("social_post_observation_id") REFERENCES "public"."social_post_observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_bookmark" ADD CONSTRAINT "research_bookmark_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "research_bookmark_workspace_observation_unique" ON "research_bookmark" USING btree ("workspace_id","social_post_observation_id");--> statement-breakpoint
CREATE INDEX "research_bookmark_workspace_created_idx" ON "research_bookmark" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "research_bookmark_observation_idx" ON "research_bookmark" USING btree ("social_post_observation_id");