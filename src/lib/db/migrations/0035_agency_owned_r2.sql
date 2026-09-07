-- Enable the agency-owned Cloudflare R2 mode that was reserved by 0033.
-- Additive and backward-compatible: existing managed agencies retain their
-- current rows and credentials; no objects or identifiers are rewritten.
ALTER TABLE "agency_storage_config"
  ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_storage_config_owned_fields_valid'
  ) THEN
    ALTER TABLE "agency_storage_config"
      ADD CONSTRAINT "agency_storage_config_owned_fields_valid"
      CHECK (
        "mode" <> 'agency_owned'
        OR (
          "account_id" IS NOT NULL
          AND length(trim("account_id")) BETWEEN 1 AND 128
          AND "bucket_override" IS NOT NULL
          AND length(trim("bucket_override")) BETWEEN 1 AND 63
          AND "endpoint_override" IS NOT NULL
          AND "access_key_ciphertext" IS NOT NULL
          AND "access_key_last_four" IS NOT NULL
          AND "access_key_key_version" IS NOT NULL
          AND "secret_access_key_ciphertext" IS NOT NULL
          AND "secret_access_key_last_four" IS NOT NULL
          AND "secret_access_key_key_version" IS NOT NULL
        )
      );
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_storage_config_mode_idx"
  ON "agency_storage_config" USING btree ("mode");
