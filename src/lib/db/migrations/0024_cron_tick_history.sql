-- Migration 0024 — `cron_tick_history`
--
-- Purpose: persist a structured row for every tick of every cron so the
-- platform operator can see the cron's heartbeat, its claimed/succeeded/
-- failed counts, and the last error without SSH-ing onto the VPS to tail
-- `/var/log/laratik-planner-*.log`. The route layer (e.g.
-- /api/cron/social-metrics/route.ts) writes one row at the end of every
-- tick — success, soft deadline, exception, or flag-off short-circuit.
--
-- Forward: CREATE TABLE + CREATE INDEX. The `outcome` column is a
-- free-form text (not a Postgres enum) on purpose: the cron surface
-- is small enough that an enum adds migration friction without
-- payoff. The CHECK constraint limits the values to the four
-- documented outcomes so a typo'd insert fails closed. The
-- `kek_status` column is text because only the social-metrics cron
-- currently writes it; the column is nullable so outbox / email /
-- audit-retention crons can write NULL without ceremony.
--
-- Backwards compatibility: this is a brand-new table; no existing
-- rows, no FKs to migrate, no data backfill. Existing cron routes
-- continue to write to their log files; the new history row is
-- additive. The route layer is the only writer.
--
-- Retention: 30d default. The `scripts/vps/audit-retention.sh` script
-- is extended in the same PR to prune this table. The index on
-- (cron_name, started_at DESC) keeps the "last 24h for cron X" query
-- O(log N + window) on a partitioned-by-time table; the table is not
-- partitioned in this migration because 30d × 96 ticks/day × 6 crons
-- = ~17k rows even at high write rate, which fits comfortably under
-- Postgres' sequential-scan cliff for a sub-second read.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS "cron_tick_history_cron_started_idx";
--   DROP TABLE IF EXISTS "cron_tick_history";
CREATE TABLE "cron_tick_history" (
  "id" bigserial PRIMARY KEY,
  "cron_name" text NOT NULL,
  "started_at" timestamptz NOT NULL,
  "finished_at" timestamptz,
  "outcome" text NOT NULL,
  "claimed" integer NOT NULL DEFAULT 0,
  "succeeded" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "needs_reauth" integer NOT NULL DEFAULT 0,
  "skipped" integer NOT NULL DEFAULT 0,
  "kek_status" text,
  "retention" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_text" text,
  "triggered_by" text NOT NULL DEFAULT 'cron',
  "request_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cron_tick_history_outcome_valid"
    CHECK ("cron_tick_history"."outcome" IN ('success', 'soft_deadline', 'error', 'skipped')),
  CONSTRAINT "cron_tick_history_kek_status_valid"
    CHECK (
      "cron_tick_history"."kek_status" IS NULL
      OR "cron_tick_history"."kek_status" IN ('ok', 'kek_missing')
    )
);--> statement-breakpoint
CREATE INDEX "cron_tick_history_cron_started_idx"
  ON "cron_tick_history" USING btree ("cron_name","started_at" DESC);--> statement-breakpoint
CREATE INDEX "cron_tick_history_started_idx"
  ON "cron_tick_history" USING btree ("started_at" DESC);
