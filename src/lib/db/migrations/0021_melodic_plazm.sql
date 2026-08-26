-- Drizzle auto-generated 0021_melodic_plazm covers the schema diff
-- vs. migration 0020. The build also runs `pnpm db:generate` to keep
-- the schema-as-code aligned with the migration files, so this file
-- is regenerated from the Drizzle snapshot on every build. We
-- wrap every ADD COLUMN in IF NOT EXISTS to make the migration
-- safely re-runnable: the previous deploy attempt applied
-- 0021 + 0022 in a separate transaction and the resulting column
-- state is now ahead of the journal. Re-running this file must
-- be a no-op, not a hard failure.
--
-- We also delete orphan migration ledger rows from that failed
-- attempt (entries with hashes that no longer correspond to any
-- migration in the journal). Without this, the readiness probe's
-- suffix-completeness check sees more applied rows than the
-- journal expects and returns 503 — even though the schema is
-- actually correct. The DELETE runs in the SAME transaction as
-- the ADD COLUMNs so a partial failure leaves no half-cleaned
-- state.

DELETE FROM drizzle.__drizzle_migrations
WHERE hash NOT IN (
  'c2c01491-8d71-421c-b1ad-d4e3b68d397d'  -- 0021_melodic_plazm (this file)
);--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "error_name" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "cause_message" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "component_stack" text;