CREATE TABLE IF NOT EXISTS "media_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_folder_name_not_empty" CHECK (length(trim("name")) BETWEEN 1 AND 80),
	CONSTRAINT "media_folder_sort_order_valid" CHECK ("sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN IF NOT EXISTS "folder_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_share_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_folder_agency_id_agency_id_fk') THEN
    ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_folder_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_folder_archived_by_user_id_fk') THEN
    ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_folder_created_by_user_id_fk') THEN
    ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_folder_id_media_folder_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_folder_id_media_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folder"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_share_link_media_asset_id_media_asset_id_fk') THEN
    ALTER TABLE "media_share_link" ADD CONSTRAINT "media_share_link_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_share_link_created_by_user_id_fk') THEN
    ALTER TABLE "media_share_link" ADD CONSTRAINT "media_share_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_folder_workspace_idx" ON "media_folder" USING btree ("workspace_id","sort_order","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_folder_workspace_name_active_uniq" ON "media_folder" USING btree ("workspace_id",lower("name")) WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_asset_folder_idx" ON "media_asset" USING btree ("owner_workspace_id","folder_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_share_link_token_hash_uniq" ON "media_share_link" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_share_link_active_asset_uniq" ON "media_share_link" USING btree ("media_asset_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_share_link_asset_idx" ON "media_share_link" USING btree ("media_asset_id","expires_at");
