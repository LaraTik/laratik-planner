-- Migration 0013 — Social profile analytics (M4)
--
-- Milestone 4 of the StudioFlow multi-agency build introduces read-only
-- provider connections and daily analytics for the channels the agency
-- already tracks. The storage shape is:
--
--   1. social_connection            — one row per (workspace, provider,
--                                     provider_subject_id). Holds the
--                                     AES-256-GCM-sealed credential
--                                     envelope and the lifecycle status
--                                     (pending_selection → active →
--                                     needs_reauth | revoked).
--   2. social_oauth_state           — short-lived CSRF bag. The start
--                                     route inserts one row, the
--                                     callback route consumes it
--                                     exactly once inside a single
--                                     transaction.
--   3. social_profile_daily_metric  — one row per (channel, calendar
--                                     day in workspace timezone).
--                                     Stores the normalized observed
--                                     totals, the response hash, the
--                                     provider API version, and a
--                                     small typed `source_metadata`
--                                     bag (e.g. partial=true, reason).
--
-- `social_channel` is extended additively with provider linkage,
-- connection status, and sync-lease bookkeeping. Every new column is
-- nullable. Existing manual channels remain valid with
-- `connection_status='manual'` (the column default) and
-- `external_account_id` NULL.
--
-- No raw provider payloads are retained. The `response_hash` lets an
-- operator prove the snapshot body was unchanged without keeping the
-- body itself.
--
-- Compatibility:
--
--   - All three new tables are additive.
--   - The `social_channel` columns are additive and nullable.
--   - Existing manual channels pass the new `connection_status` check
--     constraint because the default is `'manual'`, which is in the
--     allowed set.
--   - The unique index on `social_connection(workspace_id, provider,
--     provider_subject_id) WHERE revoked_at IS NULL` is partial, so a
--     revoked connection does not block a fresh connect for the same
--     subject.
--
-- Rollback:
--
--   Restore the pre-migration backup. Destructive rollback (dropping
--   the new tables) is safe once the application no longer references
--   them. The new columns on `social_channel` are nullable, so the
--   pre-M4 code path remains valid even if the columns remain in
--   place.

-- ─── social_connection ────────────────────────────────────────────────────
CREATE TABLE "social_connection" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "provider_subject_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_selection',
  "scopes" text[] NOT NULL DEFAULT '{}',
  "credentials_ciphertext" text NOT NULL,
  "credentials_iv" text NOT NULL,
  "credentials_tag" text NOT NULL,
  "credentials_key_version" integer NOT NULL DEFAULT 1,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "connected_by" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "connected_at" timestamptz NOT NULL DEFAULT now(),
  "last_refreshed_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "social_connection_provider_valid"
    CHECK (provider IN ('meta', 'tiktok')),
  CONSTRAINT "social_connection_status_valid"
    CHECK (status IN ('pending_selection', 'active', 'needs_reauth', 'error', 'revoked'))
);
--> statement-breakpoint

-- The PSID is partial-unique so a revoked connection can be replaced.
CREATE UNIQUE INDEX "social_connection_active_subject_unique"
  ON "social_connection" ("workspace_id", "provider", "provider_subject_id")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint

CREATE INDEX "social_connection_workspace_idx"
  ON "social_connection" ("workspace_id", "status");
--> statement-breakpoint

-- ─── social_oauth_state ───────────────────────────────────────────────────
CREATE TABLE "social_oauth_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "state_digest" text NOT NULL UNIQUE,
  "provider" text NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "return_path" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "social_oauth_state_provider_valid"
    CHECK (provider IN ('meta', 'tiktok')),
  CONSTRAINT "social_oauth_state_return_path_safe"
    CHECK (return_path ~ '^/app/w/[a-z0-9-]+/channels$')
);
--> statement-breakpoint

CREATE INDEX "social_oauth_state_expiry_idx"
  ON "social_oauth_state" ("expires_at")
  WHERE "consumed_at" IS NULL;
--> statement-breakpoint

-- ─── social_channel additive columns ──────────────────────────────────────
ALTER TABLE "social_channel"
  ADD COLUMN "social_connection_id" uuid,
  ADD COLUMN "external_account_id" text,
  ADD COLUMN "avatar_url" text,
  ADD COLUMN "connection_status" text NOT NULL DEFAULT 'manual',
  ADD COLUMN "last_synced_at" timestamptz,
  ADD COLUMN "next_sync_at" timestamptz,
  ADD COLUMN "sync_lease_until" timestamptz,
  ADD COLUMN "sync_failure_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "last_sync_error_code" text,
  ADD COLUMN "last_sync_error_at" timestamptz;
--> statement-breakpoint

ALTER TABLE "social_channel"
  ADD CONSTRAINT "social_channel_connection_status_valid"
  CHECK (connection_status IN ('manual', 'connected', 'needs_reauth', 'sync_error', 'disconnected'));
--> statement-breakpoint

ALTER TABLE "social_channel"
  ADD CONSTRAINT "social_channel_social_connection_id_fk"
  FOREIGN KEY ("social_connection_id") REFERENCES "social_connection"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "social_channel_external_account_unique"
  ON "social_channel" ("workspace_id", "platform", "external_account_id")
  WHERE "external_account_id" IS NOT NULL AND "archived_at" IS NULL;
--> statement-breakpoint

CREATE INDEX "social_channel_sync_due_idx"
  ON "social_channel" ("next_sync_at")
  WHERE "connection_status" = 'connected' AND "archived_at" IS NULL;
--> statement-breakpoint

-- ─── social_profile_daily_metric ──────────────────────────────────────────
CREATE TABLE "social_profile_daily_metric" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "social_channel_id" uuid NOT NULL REFERENCES "social_channel"("id") ON DELETE CASCADE,
  "metric_date" date NOT NULL,
  "observed_at" timestamptz NOT NULL,
  "follower_count" bigint,
  "following_count" bigint,
  "media_count" bigint,
  "likes_count" bigint,
  "reach" bigint,
  "views" bigint,
  "engaged_accounts" bigint,
  "interactions" bigint,
  "provider_api_version" text NOT NULL,
  "provider_request_id" text,
  "response_hash" text NOT NULL,
  "source_metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "social_profile_metric_counts_non_negative" CHECK (
    follower_count >= 0
    AND (following_count IS NULL OR following_count >= 0)
    AND (media_count IS NULL OR media_count >= 0)
    AND (likes_count IS NULL OR likes_count >= 0)
    AND (reach IS NULL OR reach >= 0)
    AND (views IS NULL OR views >= 0)
    AND (engaged_accounts IS NULL OR engaged_accounts >= 0)
    AND (interactions IS NULL OR interactions >= 0)
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX "social_profile_metric_channel_date_unique"
  ON "social_profile_daily_metric" ("social_channel_id", "metric_date");
--> statement-breakpoint

CREATE INDEX "social_profile_metric_channel_observed_idx"
  ON "social_profile_daily_metric" ("social_channel_id", "observed_at" DESC);
--> statement-breakpoint

-- Documentation comments — surfaced by pg_dump and DB GUIs at the
-- schema level.
COMMENT ON TABLE "social_connection" IS
  'M4 — One row per (workspace, provider, provider_subject_id). Holds the AES-256-GCM-sealed OAuth grant envelope and the lifecycle status. Revoked connections are retained for audit; the active-subject unique index is partial on revoked_at IS NULL.';
--> statement-breakpoint
COMMENT ON TABLE "social_oauth_state" IS
  'M4 — Short-lived CSRF bag. The start route inserts one row; the callback route consumes it exactly once inside a single transaction. The state_digest stores sha256(state) — the raw state is never persisted.';
--> statement-breakpoint
COMMENT ON TABLE "social_profile_daily_metric" IS
  'M4 — One row per (channel, calendar day in workspace timezone). Stores the normalized observed totals, the response hash, the provider API version, and a small typed source_metadata bag. No raw provider payload is retained.';
