-- Canonical media catalog and explicit consuming-workspace links.
-- Additive migration: legacy storage paths remain readable during rollback.
CREATE TABLE IF NOT EXISTS "media_asset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "owner_workspace_id" uuid NOT NULL,
  "storage_object_id" uuid NOT NULL,
  "preview_storage_object_id" uuid,
  "poster_storage_object_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "alt_text" text,
  "visibility" text DEFAULT 'workspace' NOT NULL,
  "status" text DEFAULT 'processing' NOT NULL,
  "source_type" text DEFAULT 'browser_file' NOT NULL,
  "source_provider" text,
  "source_reference" text,
  "source_url" text,
  "source_modified_at" timestamp with time zone,
  "supersedes_asset_id" uuid,
  "trashed_at" timestamp with time zone,
  "delete_after" timestamp with time zone,
  "failure_code" text,
  "created_by" uuid NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_asset_title_not_empty" CHECK (length(trim("title")) BETWEEN 1 AND 160),
  CONSTRAINT "media_asset_visibility_valid" CHECK ("visibility" IN ('workspace', 'agency')),
  CONSTRAINT "media_asset_status_valid" CHECK ("status" IN ('processing', 'ready', 'failed', 'trashed', 'deleted')),
  CONSTRAINT "media_asset_source_type_valid" CHECK ("source_type" IN ('browser_file', 'external_url', 'google_drive', 'onedrive', 'legacy'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_asset_link" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "media_asset_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "client_visible" boolean DEFAULT false NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_asset_link_target_type_valid" CHECK ("target_type" IN ('content_item', 'comment', 'delivery', 'brand_asset'))
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_agency_id_agency_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_owner_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_owner_workspace_id_workspace_id_fk" FOREIGN KEY ("owner_workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_storage_object_id_storage_object_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_storage_object_id_storage_object_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_preview_storage_object_id_storage_object_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_preview_storage_object_id_storage_object_id_fk" FOREIGN KEY ("preview_storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_poster_storage_object_id_storage_object_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_poster_storage_object_id_storage_object_id_fk" FOREIGN KEY ("poster_storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_created_by_user_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_updated_by_user_id_fk') THEN
    ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_link_agency_id_agency_id_fk') THEN
    ALTER TABLE "media_asset_link" ADD CONSTRAINT "media_asset_link_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_link_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "media_asset_link" ADD CONSTRAINT "media_asset_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_link_media_asset_id_media_asset_id_fk') THEN
    ALTER TABLE "media_asset_link" ADD CONSTRAINT "media_asset_link_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_link_created_by_user_id_fk') THEN
    ALTER TABLE "media_asset_link" ADD CONSTRAINT "media_asset_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_asset_storage_object_uniq" ON "media_asset" USING btree ("storage_object_id");
CREATE INDEX IF NOT EXISTS "media_asset_agency_status_idx" ON "media_asset" USING btree ("agency_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "media_asset_workspace_status_idx" ON "media_asset" USING btree ("owner_workspace_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "media_asset_visibility_idx" ON "media_asset" USING btree ("agency_id", "visibility", "status");
CREATE INDEX IF NOT EXISTS "media_asset_source_idx" ON "media_asset" USING btree ("source_type", "source_provider");
CREATE UNIQUE INDEX IF NOT EXISTS "media_asset_link_target_uniq" ON "media_asset_link" USING btree ("media_asset_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "media_asset_link_workspace_idx" ON "media_asset_link" USING btree ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "media_asset_link_target_idx" ON "media_asset_link" USING btree ("target_type", "target_id");
