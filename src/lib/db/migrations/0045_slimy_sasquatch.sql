CREATE TABLE IF NOT EXISTS "media_share_collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_share_collection_source_type_valid" CHECK ("source_type" IN ('delivery_version', 'library_selection')),
	CONSTRAINT "media_share_collection_source_id_valid" CHECK ("source_type" = 'library_selection' OR "source_id" IS NOT NULL),
	CONSTRAINT "media_share_collection_title_not_empty" CHECK (length(trim("title")) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_share_collection_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_share_collection_item_sort_order_valid" CHECK ("sort_order" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_share_collection_agency_id_agency_id_fk') THEN
		ALTER TABLE "media_share_collection" ADD CONSTRAINT "media_share_collection_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_share_collection_workspace_id_workspace_id_fk') THEN
		ALTER TABLE "media_share_collection" ADD CONSTRAINT "media_share_collection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_share_collection_created_by_user_id_fk') THEN
		ALTER TABLE "media_share_collection" ADD CONSTRAINT "media_share_collection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_share_collection_item_collection_id_media_share_collection_id_fk') THEN
		ALTER TABLE "media_share_collection_item" ADD CONSTRAINT "media_share_collection_item_collection_id_media_share_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."media_share_collection"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_share_collection_item_media_asset_id_media_asset_id_fk') THEN
		ALTER TABLE "media_share_collection_item" ADD CONSTRAINT "media_share_collection_item_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_share_collection_item_asset_uniq" ON "media_share_collection_item" USING btree ("collection_id","media_asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_share_collection_item_order_idx" ON "media_share_collection_item" USING btree ("collection_id","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_share_collection_token_hash_uniq" ON "media_share_collection" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_share_collection_agency_idx" ON "media_share_collection" USING btree ("agency_id","expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_share_collection_source_idx" ON "media_share_collection" USING btree ("source_type","source_id");
