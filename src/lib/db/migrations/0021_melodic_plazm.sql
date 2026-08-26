-- Drizzle auto-generated 0021_melodic_plazm covers the schema diff
-- vs. migration 0020. The build also runs `pnpm db:generate` to keep
-- the schema-as-code aligned with the migration files, so this file
-- is regenerated from the Drizzle snapshot on every build. We
-- wrap every ADD COLUMN in IF NOT EXISTS to make the migration
-- safely re-runnable: the previous deploy attempt applied
-- 0021 + 0022 in a separate transaction and the resulting column
-- state is now ahead of the journal. Re-running this file must
-- be a no-op, not a hard failure.

ALTER TABLE "workspace_membership" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "error_name" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "cause_message" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "component_stack" text;