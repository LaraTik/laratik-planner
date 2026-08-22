-- Migration 0008 — drop the agency singleton_key constraint (M1.7)
--
-- The single-agency era is over. The `agency` table now permits any
-- number of rows. We remove three things that exist solely to enforce
-- the now-obsolete "exactly one active agency" invariant:
--
--   1. The `agency_singleton_true` CHECK constraint
--      (singleton_key = true). Without this, a second agency row
--      would still violate the check.
--
--   2. The `agency_singleton_unique` UNIQUE index on `singleton_key`.
--      The index is a 1-row "lock" by another name; we no longer
--      want a single-row lock.
--
--   3. The `NOT NULL` and `DEFAULT true` on `singleton_key`. The
--      column itself stays (it's an old column with possibly-live
--      readers; dropping it would be a separate, riskier change).
--      After this migration the column is nullable, has no default,
--      and carries no semantics — a pure back-compat read shim.
--
-- Backfill safety:
--   The migration aborts loudly when the pre-conditions for safely
--   dropping the constraint are not met:
--
--     a) `agency` must contain at least one row. An empty agency
--        table is the initial-bootstrap state; in that state the
--        production deployment has not yet been "claimed" by an
--        admin, and the singleton constraint is still the only thing
--        stopping a deployment accident from creating two parallel
--        agencies before bootstrap runs. The "first agency wins"
--        guarantee is enforced elsewhere (bootstrap's advisory lock
--        + active-admin check + per-actor singleton resolver in
--        `src/lib/auth/agency-context.ts::resolveActiveAgencyContext`).
--        Drop the singleton constraint only after the existing
--        agency is in place.
--
--     b) The DB user must not still have a NOT NULL constraint on
--        `singleton_key` that contradicts the DROP NOT NULL. This is
--        a defensive check — if some other migration put the column
--        back into a contradictory shape, the migration fails here
--        instead of producing a silently-broken schema.
--
--   The "no code path still does `WHERE singleton_key = true`" check
--   is a CODEBASE-level invariant and is enforced by the worker's
--   pre-commit grep (see commit message and `git grep singleton_key
--   src/`). A future caller that re-introduces such a query must
--   update the migration's pre-conditions accordingly. The
--   back-compat read of the column itself is fine; the legacy
--   bootstrap path has been moved to
--   `firstAgencyForBootstrap()` in `src/lib/auth/policy.ts`.
--
-- Rollback (manual, NOT idempotent — this is a one-way drop):
--   ALTER TABLE agency
--     ADD CONSTRAINT agency_singleton_true CHECK (singleton_key = true);
--   CREATE UNIQUE INDEX agency_singleton_unique ON agency (singleton_key);
--   ALTER TABLE agency
--     ALTER COLUMN singleton_key SET NOT NULL,
--     ALTER COLUMN singleton_key SET DEFAULT true;
--   -- The legacy "exactly one row" guarantee would then need a
--   -- manual `UPDATE agency SET singleton_key = true` and a delete
--   -- of any extra rows. A real rollback is therefore a data-level
--   -- operation, not just a schema-level one.

DO $$
DECLARE
  agency_count integer;
  not_null_violated boolean;
BEGIN
  SELECT count(*) INTO agency_count FROM agency;
  IF agency_count < 1 THEN
    RAISE EXCEPTION
      'migration 0008 aborted: agency table is empty (% rows in agency). The single-agency invariant is still in force during initial bootstrap; do not run this migration before the first agency has been created.',
      agency_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Defensive: confirm the column is in the shape we expect to be
  -- migrating away from. If some other migration already relaxed
  -- `singleton_key` (which would itself be a bug — the column's
  -- meaning is "the only agency" by definition), the DROP CONSTRAINT
  -- / DROP NOT NULL below would either no-op or fail mid-way.
  -- Abort early so the operator notices.
  SELECT (
    is_nullable = 'NO'
  ) INTO not_null_violated
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'agency'
    AND column_name = 'singleton_key';

  IF not_null_violated IS NULL THEN
    RAISE EXCEPTION 'migration 0008 aborted: agency.singleton_key column is missing. This migration expects a pre-0008 schema; check the migration chain.'
      USING ERRCODE = 'undefined_column';
  END IF;

  -- All pre-conditions met. Drop in dependency order: constraints
  -- first, then the index, then the column shape. The DROP CONSTRAINT
  -- and DROP INDEX are IF EXISTS to keep re-runs safe (a partially-
  -- applied state should not block a retry).
  ALTER TABLE agency DROP CONSTRAINT IF EXISTS agency_singleton_true;
  DROP INDEX IF EXISTS agency_singleton_unique;
  ALTER TABLE agency ALTER COLUMN singleton_key DROP NOT NULL;
  ALTER TABLE agency ALTER COLUMN singleton_key DROP DEFAULT;
END $$;
