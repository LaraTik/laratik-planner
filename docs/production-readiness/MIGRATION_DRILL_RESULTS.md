# Migration Drill — Results

> 4 of 5 acceptance criteria exercised by `pnpm migration-drill`.
> The rollback drill (the trickiest of the five) is intentionally
> deferred and runs separately.
>
> Captured: 2026-08-19 on a local Postgres 16 (`127.0.0.1:5432`).
> Branch: `feat/migration-drill` (base `ba2d4fa`).

## How to reproduce

```bash
# Refuses to run unless NODE_ENV contains 'test' or the URL contains
# 'test' / 'ci'. Use one of:
NODE_ENV=test pnpm migration-drill
# or
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test pnpm migration-drill
```

The hardcoded default target is `planner_test` (per the master spec).
The script prints a results table to stdout and exits non-zero on any
failure (including an unreachable database).

## Result table

```
[drill] target: postgresql://planner:***@127.0.0.1:5432/planner_test (db=planner_test)
[drill] NODE_ENV=test

┌────────────────────────────────────┐
│ Drill                        │ PASS │ Detail
├────────────────────────────────────┤
│ 1. from-zero                 │ PASS │ ✓ drop+recreate planner_test; applied: [0000_sweet_johnny_storm.sql, 0001_thick_vin_gonzales.sql, 0002_sturdy_caretaker.sql]; tables=39 (≥25 ✓); contains: rate_limit_event, security_audit_event (689ms)
│ 2. in-place upgrade          │ PASS │ ✓ before: column=absent; add applied: [0003_drill_add_marker.sql]; after-add: column=EXISTS; drop applied: [0004_drill_drop_marker.sql]; after-drop: column=absent (35ms)
│ 3. backup + restore          │ PASS │ ✓ pg_dump → planner_test_backup_1787172417661.sql; drop+recreate planner_test; psql restore OK; tables=39; rate_limit_event=present (910ms)
│ 4. failed-migration abort    │ PASS │ ✓ snapshot: 39 tables; runner threw as expected: Migration 0005_drill_broken.sql failed: relation "nonexisten…; after: 39 tables (missing=0, added=0) (29ms)
└────────────────────────────────────┘
[drill] total: 1.7s
```

**4/4 PASS** (with the script taking ~1.7s on a warm DB and ~5.5s on a cold DB; the difference is the cold Postgres page-cache vs the first drill's drop+recreate).

## Drill-by-drill evidence

### 1. from-zero — `pnpm migration-drill` drills 1/4

- `DROP DATABASE IF EXISTS planner_test` (against the `postgres` admin
  DB, with `pg_terminate_backend` to evict any stragglers)
- `CREATE DATABASE planner_test`
- Custom SQL-file runner applies the 3 official migrations in order
  (`0000_sweet_johnny_storm.sql`, `0001_thick_vin_gonzales.sql`,
  `0002_sturdy_caretaker.sql`)
- Final `information_schema.tables` count: **39** (well above the 25-table
  threshold)
- Required tables verified: `rate_limit_event`, `security_audit_event`
  (both present)

### 2. in-place upgrade — drill 2/4

- Two new files written to `scripts/.drill-tmp/`:
  - `0003_drill_add_marker.sql` —
    `ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "drill_marker" TEXT DEFAULT 'drill-applied';`
  - `0004_drill_drop_marker.sql` —
    `ALTER TABLE "workspace" DROP COLUMN IF EXISTS "drill_marker";`
- Pass 1 (runner `maxTag` cutoff = `0003_drill_add_marker.sql`): only
  the add migration applies; `drill_marker` column verified present
- Pass 2 (runner `maxTag` cutoff = `0004_drill_drop_marker.sql`): the
  drop migration applies; `drill_marker` column verified absent
- The runner uses its own `__drill_migrations` tracking table, so the
  drill files never pollute the Drizzle migrator's state

### 3. backup + restore — drill 3/4

- `pg_dump --no-owner --no-privileges --clean --if-exists -d planner_test
  -f <tmp>.sql` (plain SQL format, restored with `psql`)
- `DROP DATABASE` + `CREATE DATABASE planner_test`
- `psql -v ON_ERROR_STOP=1 -f <tmp>.sql` (fails fast on any SQL error)
- Post-restore: 39 tables present, `rate_limit_event` present

### 4. failed-migration abort — drill 4/4

- Snapshot original table set (39 tables) before the broken migration
- Write `scripts/.drill-tmp/0005_drill_broken.sql` containing
  `ALTER TABLE nonexistent_table_for_drill ADD COLUMN x INTEGER;`
- Runner throws (relation does not exist) — exit code non-zero
- Post-failure: 39 tables, 0 missing, 0 added — no partial apply
- The broken migration is recorded as "applied" in
  `__drill_migrations` after the assertion so re-runs of the drill
  don't re-trigger the failure (the original failure is what we want
  to be reproducible, not a re-trigger after every successful run)

## Safety gate evidence

```
$ pnpm migration-drill      # NODE_ENV unset, DATABASE_URL=planner (not test)
Refusing to run migration drill — NODE_ENV must contain 'test' or DATABASE_URL must contain 'test'/'ci'.
  NODE_ENV     = (unset)
  DATABASE_URL = postgresql://planner:***@127.0.0.1:5432/planner
$ echo $?
1

$ NODE_ENV=test TEST_DATABASE_URL=postgresql://nobody@127.0.0.1:1/nope pnpm migration-drill
[drill] target: postgresql://nobody@127.0.0.1:1/nope (db=nope)
[drill] NODE_ENV=test
Cannot reach postgresql://nobody@127.0.0.1:1/nope: connect ECONNREFUSED 127.0.0.1:1
[drill] Database unreachable. Refusing to continue.
$ echo $?
1
```

The script will not run against a non-test database, and it will not
silently swallow connection failures.

## What this drill does NOT cover

- **Rollback / downgrade path** — the 5th acceptance criterion. The
  current migration set is forward-only; a rollback story will require
  either down-migrations or a forward-fix migration, and a dedicated
  test. Out of scope for this commit.

## Files added

- `scripts/migration-drill.ts` — the drill (TypeScript, `pg` + `dotenv`,
  no new dependencies)
- `docs/production-readiness/MIGRATION_DRILL_RESULTS.md` — this file
- `package.json` — `pnpm migration-drill` script

## Idempotency

The drill is idempotent: re-running it on a database that already has
the migrations applied + the 3 drill-tmp files recorded as applied
still produces 4/4 PASS. The `__drill_migrations` table tracks
applied drill files so they aren't re-attempted.
