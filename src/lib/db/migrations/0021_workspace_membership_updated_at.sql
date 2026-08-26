-- Migration 0021 — Add `updated_at` to `workspace_membership`
-- (2026-08-26, hotfix for Sentry 347888499 et al.)
--
-- Migration 0004 installed a `touch_updated_at` BEFORE UPDATE trigger
-- on `workspace_membership` (and four other tables). The trigger
-- function unconditionally does `NEW.updated_at = now()` — but the
-- `workspace_membership` table was originally created without that
-- column. Every membership mutation since 0004 has therefore raised
-- `record "new" has no field "updated_at"` (SQLSTATE 42703) inside
-- the surrounding transaction, which is why the
-- `updateMemberRolesAction` server action has been failing in
-- production. The error surfaces to the user as the
-- "We hit a snag / React error #441" error boundary because the
-- action's thrown error is re-rendered through the global
-- error boundary.
--
-- This migration is idempotent and safe to re-run.
ALTER TABLE "workspace_membership"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone
    NOT NULL DEFAULT now();