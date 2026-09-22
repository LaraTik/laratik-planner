-- 0049_meta_external_publication_links
--
-- Additive external Meta publication metadata. Planner publication status is
-- intentionally unchanged: scheduled/unavailable/error describe the provider
-- link, while `publication_record.status` only becomes published after Meta
-- confirms the post is live.

ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_provider" text;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_post_id" text;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_status" text;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_permalink" text;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_scheduled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_last_seen_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_last_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_error_code" text;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_linked_by" uuid;
--> statement-breakpoint
ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "external_linked_at" timestamp with time zone;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_record_external_linked_by_user_id_fk'
      AND conrelid = 'publication_record'::regclass
  ) THEN
    ALTER TABLE "publication_record"
      ADD CONSTRAINT "publication_record_external_linked_by_user_id_fk"
      FOREIGN KEY ("external_linked_by") REFERENCES "public"."user"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "publication_record_external_post_unique"
  ON "publication_record" USING btree ("external_provider", "external_post_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_external_provider_valid'
      AND conrelid = 'publication_record'::regclass
  ) THEN
    ALTER TABLE "publication_record"
      ADD CONSTRAINT "publication_external_provider_valid"
      CHECK ("external_provider" IS NULL OR "external_provider" IN ('meta'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_external_status_valid'
      AND conrelid = 'publication_record'::regclass
  ) THEN
    ALTER TABLE "publication_record"
      ADD CONSTRAINT "publication_external_status_valid"
      CHECK ("external_status" IS NULL OR "external_status" IN ('scheduled', 'published', 'unavailable', 'error'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_external_identity_pair'
      AND conrelid = 'publication_record'::regclass
  ) THEN
    ALTER TABLE "publication_record"
      ADD CONSTRAINT "publication_external_identity_pair"
      CHECK (
        ("external_provider" IS NULL AND "external_post_id" IS NULL)
        OR ("external_provider" IS NOT NULL AND "external_post_id" IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_external_permalink_https'
      AND conrelid = 'publication_record'::regclass
  ) THEN
    ALTER TABLE "publication_record"
      ADD CONSTRAINT "publication_external_permalink_https"
      CHECK ("external_permalink" IS NULL OR "external_permalink" ~* '^https://');
  END IF;
END $$;
