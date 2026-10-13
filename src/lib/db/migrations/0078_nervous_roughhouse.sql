DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'advertising_sync_state' AND column_name = 'lease_owner') THEN
    ALTER TABLE "advertising_sync_state" ADD COLUMN "lease_owner" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'advertising_sync_state' AND column_name = 'lease_token') THEN
    ALTER TABLE "advertising_sync_state" ADD COLUMN "lease_token" uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'advertising_sync_state' AND column_name = 'lease_expires_at') THEN
    ALTER TABLE "advertising_sync_state" ADD COLUMN "lease_expires_at" timestamp with time zone;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'advertising_sync_state' AND column_name = 'attempt') THEN
    ALTER TABLE "advertising_sync_state" ADD COLUMN "attempt" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
