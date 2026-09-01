# Migration Drill — Results

> The latest `pnpm migration-drill` exercises five operational migration
> checks. The destructive downgrade/rollback drill remains intentionally
> separate because the project uses forward-only corrective migrations.
>
> Latest capture: 2026-09-01 on local Postgres 16
> (`127.0.0.1:5432`, database `planner_test`).
> Result: **5/5 PASS** — the historical-rewind allowlist and migration
> registration are current through migration 0025. The disposable database
> was provisioned inside the Docker Postgres container; see
> `docs/operations/runbook.md` for the idempotent setup command.

```text
1. from-zero                PASS  59 public tables; Drizzle ledger 26/26
2. skipped migration repair PASS  message columns restored; 0025 ledger rows=1
3. in-place upgrade         PASS  marker add/drop cycle
4. backup + restore         PASS  ledger 26 before / 26 after; restore verified
5. failed-migration abort   PASS  60 tables before / after; missing=0; added=0
total: 5.0s
```

The 2026-09-01 run was repeated after repairing an interrupted disposable
database reset; `planner_test` was recreated inside the Docker Postgres
container and all five drills passed again. If a drill is cancelled during
the drop/recreate phase, follow the invalid-database recovery procedure in
`docs/operations/runbook.md` before retrying.

The 2026-08-26 4/5 capture below is retained as historical evidence; it is no
longer the current status.

## 2026-08-26 re-run result

The drill was re-run on 2026-08-26 against the current `main` (21 SQL
migrations in `src/lib/db/migrations/`, ledger rows 0–20 plus the
reconciled 0012 row). Drill 1 (from-zero) and drill 4 (backup + restore)
both pass at the new ledger count of **21/21**; drills 3 and 5 are
unchanged. Drill 2 fails closed with the expected error because the
script's `historical rewind` allowlist only knows the
`0017_repair_support_access_grants` and `0018_platform_access_roles`
timestamps:

```text
1. from-zero                PASS  58 public tables; Drizzle ledger 21/21
2. skipped migration repair FAIL  | unexpected post-repair migration timestamps: 1788700000000, 1788700000001; update the historical rewind before running this drill
3. in-place upgrade         PASS  marker add/drop cycle
4. backup + restore         PASS  Drizzle ledger before=21; pg_dump → planner_test_backup_<ts>.sql; drop+recreate; psql restore OK; tables=59; rate_limit_event=present; Drizzle ledger after=21
5. failed-migration abort   PASS  59 tables before / after; missing=0; added=0
total: 3.1s
```

**Action required (out of `docs/` scope, file owner: scripts):** add
`0019_agency_social_provider_config` and `0020_app_error_event` to the
`platformRolesTimestamp` allowlist in `scripts/migration-drill.ts` (or
generalise the rewind to read the post-`0017_repair_support_access_grants`
timestamps dynamically from `drizzle.__drizzle_migrations`). Until that
edit lands, drill 2 will fail every run, but the failure is the
safety-gate working as designed — the database is healthy, the drill
script is out of date. Do not interpret the 4/5 result as a
database regression.

The full historical capture (2026-08-24 5/5 PASS, 2026-08-23 ledger-safe
4/4 PASS, 2026-08-19 baseline 4/4 PASS) is preserved below for
provenance.

## 2026-08-24 skipped-0012 recovery result

The drill now reproduces production incident reference `1145607673`: it
removes the four M3 tables and the 0012/0017 ledger rows while retaining the
later applied migrations, then invokes the real Drizzle migrator.

```text
1. from-zero                PASS  56 public tables; Drizzle ledger 18/18
2. skipped migration repair PASS  all four M3 tables restored; 0012 ledger rows=1
3. in-place upgrade         PASS  marker add/drop cycle
4. backup + restore         PASS  57 tables restored; Drizzle ledger 18 before / 18 after
5. failed-migration abort   PASS  57 tables before / after; missing=0; added=0
total: 2.5s
```

This is the regression proof for the forward repair migration. The historical
2026-08-19 baseline remains below for provenance.

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

## Historical 2026-08-19 result table

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

## 2026-08-23 M2 ledger-safe rerun

Commit `0f5b5bc` corrects an evidence weakness discovered during the independent implementation review: the original drill applied official migration SQL through its private `__drill_migrations` runner. A restored database therefore had application tables but no `drizzle.__drizzle_migrations` rows, so the production migrator tried to replay migration `0000`.

The corrected drill delegates all official migrations to `pnpm db:migrate` and reserves the custom runner for synthetic add/drop/failure files. On disposable Postgres 16 at `127.0.0.1:55432/planner_test`:

```text
1. from-zero              PASS  47 public application tables; Drizzle ledger 12/12
2. in-place upgrade       PASS  marker add/drop cycle; private drill ledger isolated
3. backup + restore       PASS  48 public tables restored; Drizzle ledger 12 before / 12 after
4. failed-migration abort PASS  48 tables before / after; missing=0; added=0
total: 1.7s
```

An immediate `DATABASE_URL=… pnpm db:migrate` after restore also passes and leaves the official ledger at 12 rows. The drill remains destructive only to a URL containing `test` or `ci`, and the restored database is now proven compatible with the actual deployment migrator.
