CREATE TABLE IF NOT EXISTS "advertising_local_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"label_type" text NOT NULL,
	"tag_value" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_local_tag_entity_type_valid" CHECK ("advertising_local_tag"."entity_type" IN ('campaign', 'adset', 'ad', 'creative')),
	CONSTRAINT "advertising_local_tag_label_type_valid" CHECK ("advertising_local_tag"."label_type" IN ('brand', 'platform', 'objective', 'topic', 'language', 'month')),
	CONSTRAINT "advertising_local_tag_value_valid" CHECK (length(trim("advertising_local_tag"."tag_value")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_report_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"view_config" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_local_tag_agency_id_agency_id_fk') THEN
    ALTER TABLE "advertising_local_tag" ADD CONSTRAINT "advertising_local_tag_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_local_tag_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "advertising_local_tag" ADD CONSTRAINT "advertising_local_tag_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_local_tag_account_id_advertising_account_id_fk') THEN
    ALTER TABLE "advertising_local_tag" ADD CONSTRAINT "advertising_local_tag_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_local_tag_created_by_user_id_fk') THEN
    ALTER TABLE "advertising_local_tag" ADD CONSTRAINT "advertising_local_tag_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_report_share_agency_id_agency_id_fk') THEN
    ALTER TABLE "advertising_report_share" ADD CONSTRAINT "advertising_report_share_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_report_share_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "advertising_report_share" ADD CONSTRAINT "advertising_report_share_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_report_share_account_id_advertising_account_id_fk') THEN
    ALTER TABLE "advertising_report_share" ADD CONSTRAINT "advertising_report_share_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_report_share_created_by_user_id_fk') THEN
    ALTER TABLE "advertising_report_share" ADD CONSTRAINT "advertising_report_share_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_local_tag_identity_uniq" ON "advertising_local_tag" USING btree ("workspace_id","account_id","entity_type","entity_id","label_type","tag_value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_local_tag_entity_idx" ON "advertising_local_tag" USING btree ("workspace_id","account_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_report_share_token_uniq" ON "advertising_report_share" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_report_share_scope_idx" ON "advertising_report_share" USING btree ("workspace_id","account_id","expires_at","revoked_at");
