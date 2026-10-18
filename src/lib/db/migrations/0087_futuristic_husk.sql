DROP INDEX IF EXISTS "community_sync_state_connection_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "community_sync_state_workspace_idx";--> statement-breakpoint
ALTER TABLE "community_sync_state" ADD COLUMN IF NOT EXISTS "sync_kind" text DEFAULT 'comments' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_sync_state_connection_kind_unique" ON "community_sync_state" USING btree ("social_connection_id","sync_kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_sync_state_workspace_idx" ON "community_sync_state" USING btree ("workspace_id","status","sync_kind");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_sync_state_kind_valid'
  ) THEN
    ALTER TABLE "community_sync_state"
      ADD CONSTRAINT "community_sync_state_kind_valid"
      CHECK ("sync_kind" IN ('comments', 'private_messages'));
  END IF;
END $$;
