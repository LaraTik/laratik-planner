CREATE TABLE "social_post_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_channel_id" uuid NOT NULL,
	"observation_date" date NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"external_provider" text NOT NULL,
	"external_post_id" text NOT NULL,
	"permalink" text,
	"published_at" timestamp with time zone,
	"media_type" text NOT NULL,
	"media_product_type" text,
	"duration_seconds" integer,
	"views" bigint,
	"reach" bigint,
	"likes" bigint,
	"comments" bigint,
	"saved" bigint,
	"shares" bigint,
	"interactions" bigint,
	"provider_api_version" text NOT NULL,
	"provider_request_id" text,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_post_observation_provider_valid" CHECK ("social_post_observation"."external_provider" IN ('meta', 'tiktok')),
	CONSTRAINT "social_post_observation_media_type_valid" CHECK ("social_post_observation"."media_type" IN ('image', 'video', 'carousel', 'reel', 'story', 'unknown')),
	CONSTRAINT "social_post_observation_counts_non_negative" CHECK (("social_post_observation"."duration_seconds" IS NULL OR "social_post_observation"."duration_seconds" >= 0)
        AND ("social_post_observation"."views" IS NULL OR "social_post_observation"."views" >= 0)
        AND ("social_post_observation"."reach" IS NULL OR "social_post_observation"."reach" >= 0)
        AND ("social_post_observation"."likes" IS NULL OR "social_post_observation"."likes" >= 0)
        AND ("social_post_observation"."comments" IS NULL OR "social_post_observation"."comments" >= 0)
        AND ("social_post_observation"."saved" IS NULL OR "social_post_observation"."saved" >= 0)
        AND ("social_post_observation"."shares" IS NULL OR "social_post_observation"."shares" >= 0)
        AND ("social_post_observation"."interactions" IS NULL OR "social_post_observation"."interactions" >= 0)),
	CONSTRAINT "social_post_observation_permalink_https" CHECK ("social_post_observation"."permalink" IS NULL OR "social_post_observation"."permalink" ~* '^https://')
);
--> statement-breakpoint
ALTER TABLE "social_post_observation" ADD CONSTRAINT "social_post_observation_social_channel_id_social_channel_id_fk" FOREIGN KEY ("social_channel_id") REFERENCES "public"."social_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_observation_daily_unique" ON "social_post_observation" USING btree ("social_channel_id","external_provider","external_post_id","observation_date");--> statement-breakpoint
CREATE INDEX "social_post_observation_channel_published_idx" ON "social_post_observation" USING btree ("social_channel_id","published_at");--> statement-breakpoint
CREATE INDEX "social_post_observation_channel_observed_idx" ON "social_post_observation" USING btree ("social_channel_id","observed_at");