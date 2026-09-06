-- Database-configured, agency-scoped R2 storage.
-- Forward-only additive migration. Existing local-volume paths remain valid
-- during the migration/rollback window; no existing media is deleted here.
CREATE TABLE IF NOT EXISTS "platform_storage_provider_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text DEFAULT 'r2' NOT NULL,
  "account_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "bucket" text NOT NULL,
  "access_key_ciphertext" text NOT NULL,
  "access_key_last_four" text NOT NULL,
  "access_key_key_version" smallint DEFAULT 1 NOT NULL,
  "secret_access_key_ciphertext" text NOT NULL,
  "secret_access_key_last_four" text NOT NULL,
  "secret_access_key_key_version" smallint DEFAULT 1 NOT NULL,
  "storage_class" text DEFAULT 'standard' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'not_tested' NOT NULL,
  "last_tested_at" timestamp with time zone,
  "last_tested_ok" boolean,
  "last_error_code" text,
  "configured_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_storage_provider_config_provider_valid" CHECK ("provider" = 'r2'),
  CONSTRAINT "platform_storage_provider_config_storage_class_valid" CHECK ("storage_class" = 'standard'),
  CONSTRAINT "platform_storage_provider_config_status_valid" CHECK ("status" IN ('not_tested', 'healthy', 'unhealthy', 'disabled')),
  CONSTRAINT "platform_storage_provider_config_key_versions_valid" CHECK ("access_key_key_version" BETWEEN 1 AND 32767 AND "secret_access_key_key_version" BETWEEN 1 AND 32767)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agency_storage_config" (
  "agency_id" uuid PRIMARY KEY NOT NULL,
  "mode" text DEFAULT 'managed' NOT NULL,
  "provider" text DEFAULT 'r2' NOT NULL,
  "key_prefix" text NOT NULL,
  "bucket_override" text,
  "endpoint_override" text,
  "access_key_ciphertext" text,
  "access_key_last_four" text,
  "access_key_key_version" smallint,
  "secret_access_key_ciphertext" text,
  "secret_access_key_last_four" text,
  "secret_access_key_key_version" smallint,
  "enabled" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_health_check_at" timestamp with time zone,
  "last_health_check_ok" boolean,
  "last_error_code" text,
  "configured_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agency_storage_config_mode_valid" CHECK ("mode" IN ('managed', 'agency_owned')),
  CONSTRAINT "agency_storage_config_provider_valid" CHECK ("provider" = 'r2'),
  CONSTRAINT "agency_storage_config_status_valid" CHECK ("status" IN ('pending', 'healthy', 'unhealthy', 'disabled')),
  CONSTRAINT "agency_storage_config_key_versions_valid" CHECK (("access_key_key_version" IS NULL OR "access_key_key_version" BETWEEN 1 AND 32767) AND ("secret_access_key_key_version" IS NULL OR "secret_access_key_key_version" BETWEEN 1 AND 32767))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storage_object" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "provider" text DEFAULT 'r2' NOT NULL,
  "bucket" text NOT NULL,
  "object_key" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "kind" text NOT NULL,
  "original_name" text,
  "mime_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "checksum_sha256" text,
  "width" integer,
  "height" integer,
  "duration_ms" bigint,
  "created_by" uuid NOT NULL,
  "deleted_at" timestamp with time zone,
  "delete_after" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storage_object_provider_valid" CHECK ("provider" = 'r2'),
  CONSTRAINT "storage_object_status_valid" CHECK ("status" IN ('pending', 'active', 'soft_deleted', 'deleted')),
  CONSTRAINT "storage_object_byte_size_positive" CHECK ("byte_size" > 0),
  CONSTRAINT "storage_object_dimensions_nonnegative" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0) AND ("duration_ms" IS NULL OR "duration_ms" >= 0))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storage_upload_intent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "object_id" uuid,
  "provider" text DEFAULT 'r2' NOT NULL,
  "bucket" text NOT NULL,
  "object_key" text NOT NULL,
  "kind" text NOT NULL,
  "extension" text NOT NULL,
  "content_type" text NOT NULL,
  "expected_byte_size" bigint NOT NULL,
  "reserved_byte_size" bigint NOT NULL,
  "checksum_sha256" text,
  "status" text DEFAULT 'reserved' NOT NULL,
  "upload_expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "error_code" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storage_upload_intent_provider_valid" CHECK ("provider" = 'r2'),
  CONSTRAINT "storage_upload_intent_status_valid" CHECK ("status" IN ('reserved', 'uploaded', 'completed', 'failed', 'expired', 'aborted')),
  CONSTRAINT "storage_upload_intent_expected_size_positive" CHECK ("expected_byte_size" > 0),
  CONSTRAINT "storage_upload_intent_reserved_size_positive" CHECK ("reserved_byte_size" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_storage_provider_config_configured_by_user_id_fk') THEN
    ALTER TABLE "platform_storage_provider_config" ADD CONSTRAINT "platform_storage_provider_config_configured_by_user_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_storage_config_agency_id_agency_id_fk') THEN
    ALTER TABLE "agency_storage_config" ADD CONSTRAINT "agency_storage_config_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_storage_config_configured_by_user_id_fk') THEN
    ALTER TABLE "agency_storage_config" ADD CONSTRAINT "agency_storage_config_configured_by_user_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_object_agency_id_agency_id_fk') THEN
    ALTER TABLE "storage_object" ADD CONSTRAINT "storage_object_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_object_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "storage_object" ADD CONSTRAINT "storage_object_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_object_created_by_user_id_fk') THEN
    ALTER TABLE "storage_object" ADD CONSTRAINT "storage_object_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_upload_intent_agency_id_agency_id_fk') THEN
    ALTER TABLE "storage_upload_intent" ADD CONSTRAINT "storage_upload_intent_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_upload_intent_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "storage_upload_intent" ADD CONSTRAINT "storage_upload_intent_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_upload_intent_object_id_storage_object_id_fk') THEN
    ALTER TABLE "storage_upload_intent" ADD CONSTRAINT "storage_upload_intent_object_id_storage_object_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."storage_object"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_upload_intent_created_by_user_id_fk') THEN
    ALTER TABLE "storage_upload_intent" ADD CONSTRAINT "storage_upload_intent_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_storage_provider_config_provider_uniq" ON "platform_storage_provider_config" USING btree ("provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_storage_config_status_idx" ON "agency_storage_config" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storage_object_agency_key_uniq" ON "storage_object" USING btree ("agency_id", "object_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_object_workspace_idx" ON "storage_object" USING btree ("workspace_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_object_checksum_idx" ON "storage_object" USING btree ("agency_id", "checksum_sha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_upload_intent_agency_status_idx" ON "storage_upload_intent" USING btree ("agency_id", "status", "upload_expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_upload_intent_workspace_idx" ON "storage_upload_intent" USING btree ("workspace_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storage_upload_intent_object_key_uniq" ON "storage_upload_intent" USING btree ("object_key");
--> statement-breakpoint
INSERT INTO "agency_storage_config" ("agency_id", "key_prefix")
SELECT "id", 'agencies/' || "id" FROM "agency"
ON CONFLICT ("agency_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "brand_asset" ADD COLUMN IF NOT EXISTS "storage_object_id" uuid;
--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN IF NOT EXISTS "storage_object_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_asset_storage_object_id_storage_object_id_fk') THEN
    ALTER TABLE "brand_asset" ADD CONSTRAINT "brand_asset_storage_object_id_storage_object_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachment_storage_object_id_storage_object_id_fk') THEN
    ALTER TABLE "attachment" ADD CONSTRAINT "attachment_storage_object_id_storage_object_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_asset_storage_object_idx" ON "brand_asset" USING btree ("storage_object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_storage_object_idx" ON "attachment" USING btree ("storage_object_id");
