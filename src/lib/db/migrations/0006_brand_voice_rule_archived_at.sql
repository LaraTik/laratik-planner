-- Migration 0006 — brand_voice_rule.archived_at column
--
-- Round 4 (Brand Kit polish) introduces undoable archive across all
-- brand-kit tables so the destructive archive action can offer a 5s
-- "Undo" toast. Every other brand-kit table already had `archived_at`
-- (added in 0000/0005); this migration brings `brand_voice_rule` in
-- line so voice rules share the same soft-delete + restore lifecycle.
--
-- Forward compatibility: the column is nullable, so a pre-migration
-- image of the application continues to work — the page just falls
-- back to hard-deleting rules. Compatibility is removed in the next
-- release when the page component ships alongside the migration.
--
-- Rollback: ALTER TABLE "brand_voice_rule" DROP COLUMN "archived_at";
--
-- Idempotency: guarded by IF NOT EXISTS so the migration is safe to
-- re-run after a partial failure.
ALTER TABLE "brand_voice_rule" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_voice_workspace_archived_idx"
  ON "brand_voice_rule" USING btree ("workspace_id", "archived_at");
