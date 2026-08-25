CREATE TABLE "agency_social_provider_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"app_id" text NOT NULL,
	"app_secret_ciphertext" text NOT NULL,
	"app_secret_iv" text NOT NULL,
	"app_secret_tag" text NOT NULL,
	"app_secret_key_version" smallint DEFAULT 1 NOT NULL,
	"login_config_id" text,
	"graph_api_version" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"configured_by" uuid NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_tested_ok" boolean,
	"last_tested_error_code" text,
	"last_tested_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_social_provider_config_provider_valid" CHECK ("agency_social_provider_config"."provider" IN ('meta', 'tiktok')),
	CONSTRAINT "agency_social_provider_config_key_version_range" CHECK ("agency_social_provider_config"."app_secret_key_version" BETWEEN 1 AND 32767)
);
--> statement-breakpoint
ALTER TABLE "agency_social_provider_config" ADD CONSTRAINT "agency_social_provider_config_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_social_provider_config" ADD CONSTRAINT "agency_social_provider_config_configured_by_user_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_social_provider_config_agency_provider_uniq" ON "agency_social_provider_config" USING btree ("agency_id","provider");--> statement-breakpoint
CREATE INDEX "agency_social_provider_config_agency_idx" ON "agency_social_provider_config" USING btree ("agency_id");