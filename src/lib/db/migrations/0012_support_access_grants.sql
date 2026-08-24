-- Migration 0012 — Support access grants + AI budget tracking (M3)
--
-- Milestone 3 of the StudioFlow multi-agency build introduces:
--
--   1. support_access_request  — ticketed request by a platform admin
--      to view tenant content. Pending until an agency admin approves.
--   2. support_access_grant    — the approved, time-limited grant that
--      unlocks a specific scope. Default duration is short. Download
--      / export is off by default. Grants can be revoked immediately
--      and expire automatically. One open grant per request.
--   3. support_access_audit    — append-only audit of every viewed
--      object. Records who, when, what target, whether the access
--      was via an active grant, the IP and the user-agent.
--   4. ai_daily_budget_usage   — per-(agency, user, day) request
--      counter. The route reserves capacity in this table inside the
--      same transaction as the AI counter reservation, so concurrent
--      users cannot exceed `daily_ai_requests_per_user`.
--
-- Append-only enforcement:
--
--   `support_access_audit` is made append-only via the same trigger
--   pattern that M2.1 used for `agency_entitlement_change` and
--   `platform_audit_event`. The function `forbid_modify_audit_log()`
--   already exists in 0009; this migration attaches it to the new
--   table.
--
-- Compatibility:
--
--   - All four tables are additive. No existing row is modified.
--   - Existing agencies do not need a backfill — grants are created
--     on demand. A `support_access_request` for a non-existent agency
--     is rejected by the FK.
--   - `ai_daily_budget_usage` is keyed by (agency_id, user_id,
--     usage_date) and is only consulted when the agency entitlement
--     includes a non-null `daily_ai_requests_per_user` cap. The
--     pre-M3 code never read this table, so there is no behaviour
--     change for existing agencies.
--
-- Rollback:
--
--   Restore the pre-migration backup. The tables are isolated; a
--   later migration that drops them is safe once the application
--   no longer references them.

-- Create request first because grant has FK to it.
CREATE TABLE "support_access_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_reference" text NOT NULL,
  "reason" text NOT NULL,
  "target_agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "scope_workspace_id" uuid,
  "scope_metadata_only" boolean NOT NULL DEFAULT false,
  "requested_duration_hours" integer NOT NULL,
  "downloads_requested" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending',
  "requested_by_user_id" uuid,
  "approved_by_user_id" uuid,
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

ALTER TABLE "support_access_request"
  ADD CONSTRAINT "support_access_request_scope_workspace_id_fk"
  FOREIGN KEY ("scope_workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "support_access_request"
  ADD CONSTRAINT "support_access_request_requested_by_user_id_fk"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "support_access_request"
  ADD CONSTRAINT "support_access_request_approved_by_user_id_fk"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE TABLE "support_access_grant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL UNIQUE REFERENCES "support_access_request"("id") ON DELETE CASCADE,
  "target_agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "scope_workspace_id" uuid,
  "scope_metadata_only" boolean NOT NULL DEFAULT false,
  "downloads_allowed" boolean NOT NULL DEFAULT false,
  "approved_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "granted_to_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "activated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by_user_id" uuid,
  "revoked_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_access_grant_expires_after_activated"
    CHECK ("expires_at" > "activated_at")
);
--> statement-breakpoint

ALTER TABLE "support_access_grant"
  ADD CONSTRAINT "support_access_grant_scope_workspace_id_fk"
  FOREIGN KEY ("scope_workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "support_access_grant"
  ADD CONSTRAINT "support_access_grant_revoked_by_user_id_fk"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE TABLE "support_access_audit" (
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

CREATE TABLE "ai_daily_budget_usage" (
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

CREATE INDEX "ai_daily_budget_usage_agency_date_idx"
  ON "ai_daily_budget_usage" ("agency_id", "usage_date" DESC);
--> statement-breakpoint

CREATE INDEX "support_access_audit_actor_idx"
  ON "support_access_audit" ("actor_user_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "support_access_audit_target_idx"
  ON "support_access_audit" ("target_agency_id", "target_type", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "support_access_audit_grant_idx"
  ON "support_access_audit" ("grant_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "support_access_grant_target_idx"
  ON "support_access_grant" ("target_agency_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "support_access_grant_active_idx"
  ON "support_access_grant" ("granted_to_user_id", "expires_at")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "support_access_request_ticket_idx"
  ON "support_access_request" ("ticket_reference");
--> statement-breakpoint

CREATE INDEX "support_access_request_target_idx"
  ON "support_access_request" ("target_agency_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "support_access_request_status_idx"
  ON "support_access_request" ("status", "created_at" DESC);
--> statement-breakpoint

-- Append-only enforcement for the support access audit log. The
-- trigger function `forbid_modify_audit_log()` was created by
-- migration 0009 and is reused here so every audit table in the
-- system uses the same pattern.
DROP TRIGGER IF EXISTS "support_access_audit_no_update" ON "support_access_audit";
--> statement-breakpoint
CREATE TRIGGER "support_access_audit_no_update"
  BEFORE UPDATE OR DELETE ON "support_access_audit"
  FOR EACH ROW EXECUTE FUNCTION "forbid_modify_audit_log"();
--> statement-breakpoint

-- Documentation comments — these are picked up by pg_dump and
-- most DB GUIs to surface the table purpose at the schema level.
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
