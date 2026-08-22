-- Migration 0007 — platform_administrator table + bootstrap backfill (M1.1)
--
-- Adds a `platform_administrator` table that records platform-level
-- authority, separate from the per-agency `agency_membership.is_agency_admin`
-- flag. A platform admin can manage agencies (create, suspend, change plans)
-- without being a member of any specific agency, and must NOT acquire tenant
-- content access automatically.
--
-- Design decisions:
--   * `user_id` is the primary key — at most one live grant per user.
--   * `revoked_at` is the soft-revocation timestamp; kept forever so the
--     table doubles as an audit log of "who was ever a platform admin".
--     The `isPlatformAdmin` helper filters `revoked_at IS NULL` to compute
--     "is this user a *live* platform admin right now".
--   * `granted_by` is set to NULL on user deletion (audit trail; the row
--     itself is removed by the CASCADE on `user_id`).
--   * No `agency_id` column: platform authority is global by design
--     (see plan §1.1; the absence is intentional, not an oversight).
--   * `granted_at` is indexed (not `user_id`, since that's the PK) to keep
--     audit queries like "who was granted in the last 7 days?" cheap.
--
-- Backfill:
--   The single-agency era already has active agency admins (the bootstrap
--   owner plus any delegated admins). For the single-agency migration we
--   promote every active agency admin to a platform admin so the platform
--   surface is usable without a manual one-time grant. The backfill is
--   idempotent (`ON CONFLICT (user_id) DO NOTHING`) so re-running the
--   migration after a partial failure is safe. It only grants to users
--   who are *currently* active agency admins; it does not create new
--   grants, so deactivated agency admins are not silently resurrected.
--
-- Rollback:
--   DROP TABLE IF EXISTS "platform_administrator";

CREATE TABLE "platform_administrator" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "platform_administrator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE,
	CONSTRAINT "platform_administrator_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "platform_administrator_granted_at_idx" ON "platform_administrator" USING btree ("granted_at");
--> statement-breakpoint
-- Idempotent backfill: every currently-active agency admin becomes a
-- platform admin under the "bootstrap-backfill" reason. `granted_by` is
-- set to the same user (self-grant) since we have no audit actor for
-- the backfill. Re-runs are safe via `ON CONFLICT DO NOTHING`.
INSERT INTO "platform_administrator" ("user_id", "granted_by", "granted_at", "reason")
SELECT am.user_id, am.user_id, now(), 'bootstrap-backfill'
FROM "agency_membership" am
WHERE am.is_agency_admin = true AND am.status = 'active'
ON CONFLICT ("user_id") DO NOTHING;
