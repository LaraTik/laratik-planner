-- FEAT-MEDIA-LIBRARY-2026-09-16 — media_folder_reconcile_log
--
-- Audit table written by reconcileContentItemMediaFolders whenever an idea's
-- plannedPublishAt (or format) changes and one or more linked assets are
-- silently moved to the new derived folder path. Backs the sidebar's
-- "Show folder info" audit panel and lets a workspace manager answer
-- "why did this asset jump from September to October?".
CREATE TABLE IF NOT EXISTS "media_folder_reconcile_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "media_asset_id" uuid NOT NULL,
  "content_item_id" uuid NOT NULL,
  "from_folder_id" uuid,
  "to_folder_id" uuid,
  "reason" text NOT NULL,
  "actor_id" uuid NOT NULL,
  "reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_folder_reconcile_log_reason_valid"
    CHECK ("reason" IN ('planned_publish_at_changed', 'format_changed', 'bulk_move'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_reconcile_log_agency_id_agency_id_fk'
      AND conrelid = 'media_folder_reconcile_log'::regclass
  ) THEN
    ALTER TABLE "media_folder_reconcile_log"
      ADD CONSTRAINT "media_folder_reconcile_log_agency_id_agency_id_fk"
      FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_reconcile_log_workspace_id_workspace_id_fk'
      AND conrelid = 'media_folder_reconcile_log'::regclass
  ) THEN
    ALTER TABLE "media_folder_reconcile_log"
      ADD CONSTRAINT "media_folder_reconcile_log_workspace_id_workspace_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_reconcile_log_media_asset_id_media_asset_id_fk'
      AND conrelid = 'media_folder_reconcile_log'::regclass
  ) THEN
    ALTER TABLE "media_folder_reconcile_log"
      ADD CONSTRAINT "media_folder_reconcile_log_media_asset_id_media_asset_id_fk"
      FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_reconcile_log_content_item_id_content_item_id_fk'
      AND conrelid = 'media_folder_reconcile_log'::regclass
  ) THEN
    ALTER TABLE "media_folder_reconcile_log"
      ADD CONSTRAINT "media_folder_reconcile_log_content_item_id_content_item_id_fk"
      FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_reconcile_log_from_folder_id_media_folder_id_fk'
      AND conrelid = 'media_folder_reconcile_log'::regclass
  ) THEN
    ALTER TABLE "media_folder_reconcile_log"
      ADD CONSTRAINT "media_folder_reconcile_log_from_folder_id_media_folder_id_fk"
      FOREIGN KEY ("from_folder_id") REFERENCES "public"."media_folder"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_reconcile_log_to_folder_id_media_folder_id_fk'
      AND conrelid = 'media_folder_reconcile_log'::regclass
  ) THEN
    ALTER TABLE "media_folder_reconcile_log"
      ADD CONSTRAINT "media_folder_reconcile_log_to_folder_id_media_folder_id_fk"
      FOREIGN KEY ("to_folder_id") REFERENCES "public"."media_folder"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_folder_reconcile_log_actor_id_user_id_fk'
      AND conrelid = 'media_folder_reconcile_log'::regclass
  ) THEN
    ALTER TABLE "media_folder_reconcile_log"
      ADD CONSTRAINT "media_folder_reconcile_log_actor_id_user_id_fk"
      FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "media_folder_reconcile_log_workspace_idx"
  ON "media_folder_reconcile_log" USING btree ("workspace_id", "reconciled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_folder_reconcile_log_content_item_idx"
  ON "media_folder_reconcile_log" USING btree ("content_item_id", "reconciled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_folder_reconcile_log_asset_idx"
  ON "media_folder_reconcile_log" USING btree ("media_asset_id", "reconciled_at");