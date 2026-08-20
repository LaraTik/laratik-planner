-- Migration 0003 — user.display_name BEFORE INSERT trigger
--
-- Problem: the `user.display_name` column is NOT NULL but the NextAuth
-- Drizzle adapter does not supply it on INSERT (it only knows the
-- standard OAuth/email fields: id, email, email_verified, name, image).
-- Every Google sign-in and every magic-link click tries to insert a
-- user row missing `display_name` → Postgres raises
--   23502: null value in column "display_name" violates not-null
-- NextAuth catches that and surfaces it as `Configuration` to the
-- user, so sign-in is broken on a fresh DB.
--
-- Why not SET DEFAULT? Postgres rejects column references in DEFAULT
-- expressions (`cannot use column reference in DEFAULT expression`).
-- The canonical Postgres pattern is a BEFORE INSERT trigger.
--
-- This trigger fills `display_name` from `name`, falling back to the
-- local-part of `email` when `name` is also NULL. The NOT NULL
-- constraint is satisfied for every sign-in path, and the application
-- can still update `display_name` explicitly later (the trigger only
-- fires on INSERT, not on UPDATE).
--
-- Idempotency: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS make
-- the migration safe to re-run (the migrator's wrap-in-transaction
-- behaviour makes partial failure impossible).

CREATE OR REPLACE FUNCTION set_user_display_name() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_name IS NULL THEN
    NEW.display_name := COALESCE(NEW.name, split_part(NEW.email, '@', 1));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_set_display_name ON "user";

CREATE OR REPLACE TRIGGER user_set_display_name
  BEFORE INSERT ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION set_user_display_name();
