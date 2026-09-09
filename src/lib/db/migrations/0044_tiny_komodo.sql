DROP INDEX IF EXISTS "media_folder_workspace_name_active_uniq";--> statement-breakpoint
DROP INDEX IF EXISTS "media_folder_workspace_idx";--> statement-breakpoint
ALTER TABLE "media_folder" ADD COLUMN IF NOT EXISTS "parent_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_parent_id_media_folder_id_fk'
  ) THEN
    ALTER TABLE "media_folder"
      ADD CONSTRAINT "media_folder_parent_id_media_folder_id_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."media_folder"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_folder_workspace_parent_name_active_uniq" ON "media_folder" USING btree ("workspace_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name")) WHERE "media_folder"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_folder_workspace_idx" ON "media_folder" USING btree ("workspace_id","parent_id","sort_order","created_at");
