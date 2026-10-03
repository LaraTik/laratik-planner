DROP INDEX "social_post_observation_daily_unique";--> statement-breakpoint
ALTER TABLE "social_post_observation" ALTER COLUMN "social_channel_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social_post_observation" ADD COLUMN "research_watchlist_account_id" uuid;--> statement-breakpoint
ALTER TABLE "social_post_observation" ADD COLUMN "source_kind" text DEFAULT 'connected_channel' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_post_observation" ADD CONSTRAINT "social_post_observation_research_watchlist_account_id_research_watchlist_account_id_fk" FOREIGN KEY ("research_watchlist_account_id") REFERENCES "public"."research_watchlist_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_observation_channel_daily_unique" ON "social_post_observation" USING btree ("social_channel_id","external_provider","external_post_id","observation_date");--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_observation_research_account_daily_unique" ON "social_post_observation" USING btree ("research_watchlist_account_id","external_provider","external_post_id","observation_date");--> statement-breakpoint
CREATE INDEX "social_post_observation_research_account_published_idx" ON "social_post_observation" USING btree ("research_watchlist_account_id","published_at");--> statement-breakpoint
CREATE INDEX "social_post_observation_research_account_observed_idx" ON "social_post_observation" USING btree ("research_watchlist_account_id","observed_at");--> statement-breakpoint
ALTER TABLE "social_post_observation" ADD CONSTRAINT "social_post_observation_source_valid" CHECK ((
        "social_post_observation"."source_kind" = 'connected_channel'
        AND "social_post_observation"."social_channel_id" IS NOT NULL
        AND "social_post_observation"."research_watchlist_account_id" IS NULL
      ) OR (
        "social_post_observation"."source_kind" = 'research_account'
        AND "social_post_observation"."social_channel_id" IS NULL
        AND "social_post_observation"."research_watchlist_account_id" IS NOT NULL
      ));