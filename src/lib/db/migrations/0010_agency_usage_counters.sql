-- Migration 0010 — agency_usage_counter (M2.3)
--
-- Adds the per-agency / per-resource usage counter table that the
-- M2.3 usage-tracking service reads and writes.
--
--   agency_usage_counter
--     (agency_id, resource_key) → current_value (bigint, default 0, CHECK >= 0)
--     + last_recorded_at, last_updated_at, version
--
-- The table is the "live" counter side of the threshold-event
-- ledger introduced in M2.1 (agency_usage_threshold_event). The
-- threshold log records *crossings* (one row per level per
-- resource); this table records the *current* value. The service
-- layer in src/lib/usage/record-usage.ts UPSERTs a row on every
-- call, then checks the new value against the agency's effective
-- limit and emits a threshold event when a boundary is crossed.
--
-- Per-row locking (the design driver for the table): the
-- quota-enforcement service (M2.4) reads the counter with
-- `SELECT … FOR UPDATE` keyed by (agency_id, resource_key) so
-- two concurrent allocation calls serialize on the same row
-- instead of stomping on each other's counter. The `version`
-- column carries an optimistic-concurrency counter that lets
-- callers detect "someone else wrote since I read this"; M2.4
-- will use it for the "check then increment" gate.
--
-- Resource naming convention is a service-level contract, not a
-- DB constraint:
--   - aggregate: `workspaces`, `users`, `social_profiles`,
--     `storage_bytes`, `ai_requests`, `ai_input_tokens`,
--     `ai_output_tokens`
--   - per-platform: `social_profiles:instagram`,
--     `social_profiles:tiktok`, etc.
--   - per-user: `daily_ai_requests:<user_id>`
-- The DB has no opinion on these — the service layer enforces the
-- controlled vocabulary in src/lib/usage/types.ts (Zod-validated).
--
-- Column semantics:
--   - `current_value`     : the running count. `bigint` because
--     `storage_bytes` (terabyte-scale numbers) and AI token counts
--     (a heavy agency can easily exceed 2^31) do not fit in an
--     int. The `CHECK (current_value >= 0)` is the last line of
--     defense against an application bug that decrements past
--     zero; the service throws `InvalidUsageDeltaError` *before*
--     the SQL is issued, but a raw UPDATE that lands at -1 is
--     still rejected at the DB.
--   - `last_recorded_at`  : the time the most recent usage event
--     was recorded. Set by `recordUsage` to `now()` on every call.
--     This is conceptually distinct from `last_updated_at` —
--     a counter can be touched (e.g. by an admin "force re-read"
--     op) without a new usage event being recorded.
--   - `last_updated_at`   : the time the row was last mutated
--     (any UPSERT). Defaults to `now()` and is set explicitly by
--     the service on every write.
--   - `version`           : optimistic-concurrency counter,
--     incremented by 1 on every UPSERT. M2.4 will use it to
--     detect concurrent writes (compare-and-swap on (agency_id,
--     resource_key, version)).
--
-- FK behavior:
--
--   `agency_id` is `ON DELETE restrict` (not cascade) so the
--   admin flow that drops an agency is forced to clear counters
--   first — orphaning usage rows for a deleted agency would be a
--   silent leak. This mirrors the `agency_membership` semantic
--   (the system surfaces orphan risks rather than papering over
--   them).
--
-- Indexes:
--
--   - PRIMARY KEY (agency_id, resource_key) — the only lookup the
--     service does on the hot path (UPSERT + SELECT FOR UPDATE).
--   - agency_usage_counter_agency_idx — getUsage() reads the
--     full counter set for an agency; the small table makes the
--     extra index a no-op, but it keeps the query plan stable.
--   - agency_usage_counter_agency_resource_idx — covers the
--     "find one counter" path (M2.4's quota enforcement reads a
--     single resource per call). Mirrors the PK but is named
--     explicitly per the M2.3 spec; the planner will use the
--     smaller index when the query is selectivity-bound rather
--     than just PK-bound.
--
-- Rollback:
--
--   DROP TABLE IF EXISTS agency_usage_counter CASCADE;
--
-- Note on a pre-existing schema/DB mismatch:
--
--   Drizzle-kit's auto-diff tries to drop
--   `brand_voice_workspace_archived_idx` because the index is
--   hand-installed by migration 0006 but not declared in the
--   Drizzle schema (src/lib/db/schema/brand-kit.ts). This is the
--   same M1 issue noted in the 0009 migration comment block. The
--   DROP is removed from the generated SQL to keep this migration
--   additive — dropping the index is an unrelated destructive
--   change that belongs in a follow-up M1.10+ cleanup commit.
--   Follow-up: align the Drizzle schema with the DB (either add
--   the index to brand-kit.ts or accept the drop in a separate
--   cleanup commit).

-- ─── DDL ───────────────────────────────────────────────────────────────────
CREATE TABLE "agency_usage_counter" (
	"agency_id" uuid NOT NULL,
	"resource_key" text NOT NULL,
	"current_value" bigint DEFAULT 0 NOT NULL,
	"last_recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "agency_usage_counter_agency_id_resource_key_pk" PRIMARY KEY("agency_id","resource_key"),
	CONSTRAINT "agency_usage_counter_current_value_nonneg" CHECK ("agency_usage_counter"."current_value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agency_usage_counter" ADD CONSTRAINT "agency_usage_counter_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_usage_counter_agency_idx" ON "agency_usage_counter" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "agency_usage_counter_agency_resource_idx" ON "agency_usage_counter" USING btree ("agency_id","resource_key");
