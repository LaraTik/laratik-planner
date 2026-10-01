-- Per-user appearance preference. Existing users keep the system default.
-- The guarded form keeps the additive migration safe if a deployment ledger
-- ever needs to be repaired while the schema already contains the column.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "theme_preference" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_theme_preference_valid'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT "user_theme_preference_valid"
      CHECK ("theme_preference" IN ('system', 'light', 'dark'));
  END IF;
END $$;
