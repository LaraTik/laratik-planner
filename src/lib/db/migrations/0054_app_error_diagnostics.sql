-- 0054_app_error_diagnostics
--
-- Closes the error-capture gaps found in the OBS-002 review:
--
--   1. `app_error_group` — one row per *class* of failure, keyed by a
--      stable fingerprint. Without it every occurrence was its own row
--      and "this broke 47 times since the 14:02 deploy" was
--      unanswerable. The unique index on `fingerprint` is the conflict
--      target of the `INSERT … ON CONFLICT DO UPDATE` upsert in
--      `captureAppError`, which is what makes concurrent increments
--      safe without a read-modify-write race.
--   2. `app_error_event.group_id` — the roll-up pointer.
--   3. `app_error_event.context` — allowlisted structured context,
--      including the request's recent error/warn lines from the
--      `request-context` ring buffer. This is what lets an operator (or
--      the diagnostics MCP) see what the request was doing at the
--      moment it broke, because the raw lines only live in Docker's
--      json-file driver at 10m x 5 (~50 MB) and are gone within hours.
--   4. `app_error_event.user_agent_hash` — a SHA-256 of the user agent.
--      The raw UA is deliberately NOT stored: it is a stable
--      cross-session fingerprint.
--   5. `app_error_event.route_type` / `route_path` — the Next.js
--      `onRequestError` context, so a server failure records whether it
--      came from a render, a route handler, a server action, or the
--      proxy.
--
-- Retention is now enforced by /api/cron/error-retention (30 days for
-- events, 90 days for resolved groups).
--
-- Rollback:
--   DROP TABLE app_error_group;  -- cascades the FK below
--   ALTER TABLE app_error_event
--     DROP COLUMN IF EXISTS group_id,
--     DROP COLUMN IF EXISTS context,
--     DROP COLUMN IF EXISTS user_agent_hash,
--     DROP COLUMN IF EXISTS route_type,
--     DROP COLUMN IF EXISTS route_path;
-- Every pre-existing column is untouched, so the error boundaries and
-- the platform console keep working throughout.

CREATE TABLE IF NOT EXISTS "app_error_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"error_name" text,
	"sample_message" text NOT NULL,
	"route" text NOT NULL,
	"source" text NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"triage_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_error_group_occurrence_count_positive" CHECK ("occurrence_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_error_group_fingerprint_key" ON "app_error_group" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_error_group_last_seen_at_idx" ON "app_error_group" USING btree ("last_seen_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_error_group_open_idx" ON "app_error_group" USING btree ("resolved_at","last_seen_at" DESC);--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "group_id" uuid;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "context" jsonb;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "user_agent_hash" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "route_type" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN IF NOT EXISTS "route_path" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_error_event_group_id_app_error_group_id_fk'
  ) THEN
    ALTER TABLE "app_error_event"
      ADD CONSTRAINT "app_error_event_group_id_app_error_group_id_fk"
      FOREIGN KEY ("group_id") REFERENCES "public"."app_error_group"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_error_event_group_id_idx" ON "app_error_event" USING btree ("group_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_error_event_source_idx" ON "app_error_event" USING btree ("source","created_at" DESC);
