-- Task attachments can now be stored as either provider files or HTTPS links.
-- Existing provider-backed rows remain unchanged.
ALTER TABLE "task_attachment" ALTER COLUMN "bucket" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_attachment" ALTER COLUMN "object_key" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_attachment" ADD COLUMN IF NOT EXISTS "external_url" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_attachment_source_valid'
  ) THEN
    ALTER TABLE "task_attachment"
      ADD CONSTRAINT "task_attachment_source_valid"
      CHECK (("external_url" IS NULL AND "bucket" IS NOT NULL AND "object_key" IS NOT NULL)
        OR ("external_url" IS NOT NULL AND "bucket" IS NULL AND "object_key" IS NULL));
  END IF;
END $$;
