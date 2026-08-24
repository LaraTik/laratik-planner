-- Migration 0017 — repair the skipped M3 support-access migration.
--
-- Root cause:
--
--   Migration 0012 was authored on a parallel branch and merged after
--   migrations 0007-0011. Its Drizzle journal timestamp
--   (1787544999872) is older than 0011 (1788000000000). Drizzle compares
--   every candidate to the latest applied timestamp, so an incremental
--   production deploy skipped 0012 while later migrations still applied.
--
-- Forward behaviour:
--
--   Recreate the four additive M3 tables and their indexes with
--   IF NOT EXISTS guards, then reconcile the missing 0012 ledger row.
--   Fresh databases already have the objects and ledger row from 0012,
--   so this migration is idempotent there.
--
-- Compatibility and rollback:
--
--   No existing application row or identifier is changed. Older images
--   ignore these additive tables, so application rollback leaves them in
--   place. Destructive schema rollback requires the verified pre-deploy
--   backup because support-access audit rows are production evidence.

CREATE TABLE IF NOT EXISTS "support_access_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_reference" text NOT NULL,
  "reason" text NOT NULL,
  "target_agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "scope_workspace_id" uuid REFERENCES "workspace"("id") ON DELETE CASCADE,
  "scope_metadata_only" boolean NOT NULL DEFAULT false,
  "requested_duration_hours" integer NOT NULL,
  "downloads_requested" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending',
  "requested_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "approved_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_access_request_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  CONSTRAINT "support_access_request_duration_positive"
    CHECK ("requested_duration_hours" > 0 AND "requested_duration_hours" <= 168)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "support_access_grant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL UNIQUE REFERENCES "support_access_request"("id") ON DELETE CASCADE,
  "target_agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "scope_workspace_id" uuid REFERENCES "workspace"("id") ON DELETE CASCADE,
  "scope_metadata_only" boolean NOT NULL DEFAULT false,
  "downloads_allowed" boolean NOT NULL DEFAULT false,
  "approved_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "granted_to_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "activated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "revoked_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_access_grant_expires_after_activated"
    CHECK ("expires_at" > "activated_at")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "support_access_audit" (
  "id" bigserial PRIMARY KEY,
  "grant_id" uuid REFERENCES "support_access_grant"("id") ON DELETE SET NULL,
  "actor_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "target_agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "target_type" text NOT NULL,
  "target_id" text,
  "action" text NOT NULL,
  "outcome" text NOT NULL,
  "ip" inet,
  "user_agent" text,
  "request_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_access_audit_outcome_check"
    CHECK ("outcome" IN ('success', 'denied', 'failed'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_daily_budget_usage" (
  "agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "request_count" integer NOT NULL DEFAULT 0,
  "last_request_id" text,
  "last_recorded_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("agency_id", "user_id", "usage_date"),
  CONSTRAINT "ai_daily_budget_usage_request_count_nonneg" CHECK ("request_count" >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_daily_budget_usage_agency_date_idx"
  ON "ai_daily_budget_usage" ("agency_id", "usage_date" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_access_audit_actor_idx"
  ON "support_access_audit" ("actor_user_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_access_audit_target_idx"
  ON "support_access_audit" ("target_agency_id", "target_type", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_access_audit_grant_idx"
  ON "support_access_audit" ("grant_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_access_grant_target_idx"
  ON "support_access_grant" ("target_agency_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_access_grant_active_idx"
  ON "support_access_grant" ("granted_to_user_id", "expires_at")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "support_access_request_ticket_idx"
  ON "support_access_request" ("ticket_reference");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_access_request_target_idx"
  ON "support_access_request" ("target_agency_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_access_request_status_idx"
  ON "support_access_request" ("status", "created_at" DESC);
--> statement-breakpoint

DROP TRIGGER IF EXISTS "support_access_audit_no_update" ON "support_access_audit";
--> statement-breakpoint
CREATE TRIGGER "support_access_audit_no_update"
  BEFORE UPDATE OR DELETE ON "support_access_audit"
  FOR EACH ROW EXECUTE FUNCTION "forbid_modify_audit_log"();
--> statement-breakpoint

COMMENT ON TABLE "support_access_request" IS
  'M3 — Ticketed, approved, time-limited support access. One row per platform admin request. Status transitions: pending → approved | rejected | cancelled | expired.';
--> statement-breakpoint
COMMENT ON TABLE "support_access_grant" IS
  'M3 — The grant that unlocks tenant content for a specific platform admin. Active when revoked_at IS NULL AND expires_at > now(). One grant per request (UNIQUE).';
--> statement-breakpoint
COMMENT ON TABLE "support_access_audit" IS
  'M3 — Append-only audit of every tenant object viewed through an active support grant. UPDATE / DELETE forbidden by trigger.';
--> statement-breakpoint
COMMENT ON TABLE "ai_daily_budget_usage" IS
  'M3 — Per-(agency, user, day) AI request counter. The /api/ai/generate route reserves capacity here in the same transaction as the monthly reservation.';
--> statement-breakpoint

-- Record the original migration as applied after this migration has
-- restored its complete schema. The hash is SHA-256 of the unmodified
-- 0012 SQL file, matching Drizzle's ledger format.
INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
SELECT
  '882d9fe62082cb5779281564ad3f25475e312827b75540256a3039c402e77d42',
  1787544999872
WHERE NOT EXISTS (
  SELECT 1
  FROM drizzle.__drizzle_migrations
  WHERE "created_at" = 1787544999872
);
