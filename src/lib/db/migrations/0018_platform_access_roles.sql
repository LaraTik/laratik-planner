-- Migration 0018 — explicit platform access roles.
--
-- Forward behavior:
--   Add a closed role vocabulary to the existing soft-revocable
--   platform_administrator record. Existing active and revoked rows become
--   platform_owner, preserving their pre-deploy authority and preventing an
--   administrator lockout. updated_at supports assignment review and audit UI.
--
-- Compatibility:
--   Both columns are additive and have defaults, so the previous application
--   image continues to read and write the table during a rolling deployment.
--   New application code writes role explicitly; the default exists for the
--   compatibility window and emergency SQL only.
--
-- Backup and rollback:
--   Take and verify a database backup before applying this migration. Do not
--   drop these columns during an application rollback. Before starting an old
--   binary image, snapshot assignments and soft-revoke active non-Owner rows;
--   the old binary treats every active row as a full administrator. Restore
--   those assignments only after returning to the role-aware image.

ALTER TABLE "platform_administrator"
  ADD COLUMN "role" text DEFAULT 'platform_owner' NOT NULL;
--> statement-breakpoint

ALTER TABLE "platform_administrator"
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

ALTER TABLE "platform_administrator"
  ADD CONSTRAINT "platform_administrator_role_check"
  CHECK (
    "role" IN (
      'platform_owner',
      'agency_operator',
      'platform_auditor',
      'support_operator'
    )
  );
--> statement-breakpoint

CREATE INDEX "platform_administrator_active_role_idx"
  ON "platform_administrator" ("role", "updated_at")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint

COMMENT ON COLUMN "platform_administrator"."role" IS
  'Global platform role. Separate from agency membership and tenant-content access.';
