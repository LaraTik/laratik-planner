# Migration and deployment evidence

> Authoritative work list: `PRODUCTION_READINESS_TRACKER.md` (rows DEP-001 / DEP-002 / OPS-001).
> Drill results: [`MIGRATION_DRILL_RESULTS.md`](./MIGRATION_DRILL_RESULTS.md).

## Status

| Item                                | Status as of 2026-08-19                      |
| ----------------------------------- | -------------------------------------------- |
| From-zero migration                 | **PASS** (drill 1/4, 2026-08-19)             |
| In-place upgrade                    | **PASS** (drill 2/4, 2026-08-19)             |
| Backup verification                 | **PASS** (drill 3/4, 2026-08-19)             |
| Disposable restore                  | **PASS** (drill 3/4, 2026-08-19)             |
| Failed-migration abort              | **PASS** (drill 4/4, 2026-08-19)             |
| Release health / version            | **PASS** (real release SHA in `/api/health`) |
| Rollback drill                      | **Deferred** (forward-only migrations)       |
| Encrypted offsite backup + rotation | **Blocked on OPS-001** (owner-supplied)      |
| VPS deploy to `laratik-vps`         | **Blocked on OPS-001** (VPS_SSH_* secrets)   |

## 2026-08-24 incident — skipped migration 0012

Production error reference `1145607673` resolved to
`relation "support_access_grant" does not exist` during the first authenticated
render for a platform administrator. The authentication flow itself succeeded;
the `(app)` layout queried active support grants for its persistent banner and
hit the missing relation.

### Root cause

`0012_support_access_grants` was authored on a parallel branch. Its Drizzle
journal timestamp (`1787544999872`) was lower than the timestamps of migrations
`0007–0011`, which were already present in the production ledger when M3 merged.
Drizzle compares candidate timestamps to the latest applied ledger row, so it
skipped 0012 and continued applying newer migrations. The former readiness
probe checked only that `drizzle.__drizzle_migrations` existed and therefore
reported a false-positive `schema: ready`.

### Forward repair and compatibility

Migration `0017_repair_support_access_grants.sql` uses guarded additive DDL to
restore `support_access_request`, `support_access_grant`,
`support_access_audit`, and `ai_daily_budget_usage`, their indexes, and the
append-only audit trigger. It then records the original 0012 hash/timestamp in
the Drizzle ledger. On a fresh database, 0012 already created the same objects
and ledger row, so 0017 is idempotent.

No existing tenant identifier or row is changed. The previous application
image ignores these additive tables, so application rollback leaves them in
place. Destructive rollback requires the verified pre-deploy backup because
support-access audit rows are production evidence. No separate product or
security approval is required for the additive forward fix; dropping or
restoring schema remains approval-gated.

### Prevention and evidence

- `/api/health/ready` now verifies the deployment-critical M3 tables and the
  complete recorded ledger suffix against the bundled migration journal. This
  permits the production database's legitimate pre-ledger baseline while
  rejecting gaps, unknown rows, and the historically reordered 0012 entry.
- `tests/unit/migration-journal-order.test.ts` allows only the documented 0012
  inversion, requires the 0017 repair, and enforces strict monotonicity after
  it.
- `tests/unit/health-endpoints.test.ts` proves a present-but-incomplete ledger
  returns 503.
- `.dockerignore` excludes nested `.DS_Store` files; the CI smoke contract test
  prevents local macOS metadata from entering the Drizzle migration context.
- `pnpm migration-drill` now deletes the four M3 tables plus the 0012/0017
  ledger rows while retaining later migrations, reruns the real Drizzle
  migrator, and proves all tables plus exactly one 0012 ledger row return.

Local result on disposable Postgres 16 (2026-08-24): 5/5 drills PASS; from-zero
ledger 18/18; skipped-migration repair restored all four tables and the 0012
ledger row; backup/restore preserved 18/18 ledger rows; failed migration left
the schema unchanged.

The first deployment of `79ff927` applied the repair successfully and created a
verified pre-migration backup, but the new app was rolled back because the
initial readiness implementation required all 18 ledger rows. Production was
legitimately baselined before the Drizzle ledger and records the contiguous
recent suffix (0011–0017, including the reconciled 0012 row). The follow-up
readiness logic models that baseline explicitly; the rollback did not undo the
additive database repair.

## Baseline findings (pre-M3a) — all resolved

The pre-M3a baseline listed four release blockers. Each is now closed:

- ~~Deployment runs independently from the CI quality workflow.~~ **Fixed** — `.github/workflows/deploy.yml` is gated on `workflow_run: workflows: [CI], types: [completed]` with `if: github.event.workflow_run.conclusion == 'success'`. CI must be green before deploy fires.
- ~~The production runner image does not provide a reliable migration runtime.~~ **Fixed** — `laratik-planner-migrator` is a separate image, built and pushed alongside the app image, and is invoked by `scripts/deploy.sh` as the migration runtime.
- ~~`scripts/deploy.sh` explicitly continues when migration fails.~~ **Fixed** — `scripts/deploy.sh` aborts on any migration failure (no more swallowed exit). Backed by drill 4/4 PASS (failed-migration abort preserves the schema).
- ~~Production health reports version `0.0.0` and checks database reachability rather than schema readiness.~~ **Fixed** — `src/app/api/health/route.ts` reports the real release SHA at container runtime; `scripts/deploy.sh` hits `/api/health` and rolls back on non-200.

## Required deployment sequence (current, M3a)

1. CI quality, database, browser, security and image jobs pass (`pnpm verify` + `pnpm test:integration` + `pnpm test:e2e` + `pnpm audit --prod` + `docker build`).
2. Build and publish an immutable SHA-tagged app image and matching migrator (`ghcr.io/laratik/laratik-planner:<sha>` + `ghcr.io/laratik/laratik-planner-migrator:<sha>`, plus `:latest`).
3. Verify disk space and run the local Postgres backup (`scripts/vps/backup.sh`).
4. Run the migrator with the captured previous image retained for rollback; **abort on any migration failure** (drill 4/4 proves the migrator surfaces the error and leaves the schema unchanged).
5. Deploy the app image (`docker compose up -d --no-deps app` after `image:` is pinned to the new SHA).
6. Check schema readiness, app health and release SHA (curl `/api/health` for the new SHA + DB up).
7. Run the authenticated smoke tests (Playwright `public.spec.ts` + `auth-gate.spec.ts` + `health.spec.ts`).
8. Monitor the release; on failure, roll the app image back to the captured previous SHA. The documented compatible database rollback procedure is the in-place forward-fix migration (no down-migrations exist; the system is forward-only).

## Evidence table

| Gate                     | Commit / image                               | Command or run                                                           | Result                                                  | Operator / date       |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------- |
| From-zero migration      | M3a `908c992` (was M2 pre-`a5ad6e0` lineage) | `pnpm migration-drill` (drill 1)                                         | **PASS** — 3 migrations applied, 39 tables present      | local dev, 2026-08-19 |
| In-place upgrade         | M3a `908c992` (was M2 pre-`a5ad6e0` lineage) | `pnpm migration-drill` (drill 2)                                         | **PASS** — add+drop marker migration cycle              | local dev, 2026-08-19 |
| Backup verification      | M3a `908c992` (was M2 pre-`a5ad6e0` lineage) | `pnpm migration-drill` (drill 3) — `pg_dump` + drop+recreate + restore   | **PASS** — schema identical, `rate_limit_event` present | local dev, 2026-08-19 |
| Disposable restore       | M3a `908c992` (was M2 pre-`a5ad6e0` lineage) | `pnpm migration-drill` (drill 3)                                         | **PASS** — same drill covers backup→restore cycle       | local dev, 2026-08-19 |
| Failed-migration abort   | M3a `908c992` (was M2 pre-`a5ad6e0` lineage) | `pnpm migration-drill` (drill 4)                                         | **PASS** — broken migration throws, schema unchanged    | local dev, 2026-08-19 |
| Release health/version   | M3a `908c992`                                | `curl https://planner.laratik.com/api/health`                            | **PASS** — `{ ok, version: "908c992", env: "prod" }`    | local dev, 2026-08-19 |
| Rollback drill           | —                                            | `scripts/migration-drill.ts` (drill 5)                                   | **Deferred** — forward-only migrations                  | —                     |
| Encrypted offsite backup | —                                            | `scripts/vps/backup.sh` + restic offsite                                 | **Pending OPS-001** — restic repo + OAuth app           | owner                 |
| VPS deploy               | M3a `908c992`                                | `workflow_run: CI success` → `appleboy/ssh-action` → `scripts/deploy.sh` | **Pending OPS-001** — VPS_SSH_* secrets                 | owner                 |

Drill mechanics (refusing to run against non-test DBs, drill 5/5 forward-only rationale, idempotency): see [`MIGRATION_DRILL_RESULTS.md`](./MIGRATION_DRILL_RESULTS.md).

## Migration 0005 — Brand Kit publishing rules and linked resources

**Filename:** `src/lib/db/migrations/0005_brand_kit_rules_resources.sql`
**SHA-256:** `a9ac811e561d602267075ef2d50ba8bca30f068014d0eaea4d82b209f49a4567`
**Journal tag:** `0005_brand_kit_rules_resources`

### Forward behavior

Additive only. Two new tables are created:

- `brand_publishing_rule` — workspace-scoped editorial guardrails
  (`rule_type` ∈ `alt_text | hashtag | compliance | channel | general`,
  CHECK `brand_publishing_rule_type_valid`).
- `brand_linked_resource` — links to external design/asset libraries
  (`provider` ∈ `google_drive | figma | canva | dropbox | other`,
  CHECK `brand_linked_resource_provider_valid`; URL must be HTTPS,
  CHECK `brand_linked_resource_url_https`).

No existing table has column changes. No existing index, check, or
foreign key is modified. Total table count after migration: 41.

### Compatibility statement

Pre-migration application images remain compatible because both new
tables are additive: no service query references them yet, so an
older binary running against the post-migration schema behaves
identically to one running against the pre-migration schema. Forward
direction verified by `pnpm migration-drill` (drill 1 — from-zero
applies all six migrations cleanly) and by the integration test
`tests/integration/brand-kit.test.ts` (3 tests pass after the
migration is applied).

### Backup + rollback procedure

Because the system is forward-only (no down-migrations), the rollback
is the documented forward-fix migration or, in the worst case,
restoring the pre-migration backup. For this migration specifically:

1. **Normal app rollback** — pin `image:` in `docker-compose.yml` back
   to the captured previous SHA and `docker compose up -d --no-deps
app`. The previous binary never writes to `brand_publishing_rule`
   or `brand_linked_resource`, so it is safe to leave the new tables
   in place.
2. **Schema rollback (if the new tables must be removed)** — restore
   the pre-migration `pg_dump` taken by `scripts/vps/backup.sh`
   immediately before the deploy. The two new tables are dropped with
   the restore (or by a one-off `DROP TABLE` if you want to keep
   forward-only and skip the restore). Do NOT edit the applied
   migration file.

### Tests

- `tests/integration/brand-kit.test.ts` — three DB-level invariants:
  (1) `brand_publishing_rule` is tenant-scoped and
  soft-archivable (`archived_at IS NULL` on insert), (2) a
  non-HTTPS `brand_linked_resource.url` is rejected by
  `brand_linked_resource_url_https`, (3) unsupported
  `brand_publishing_rule.rule_type` and `brand_linked_resource.provider`
  values are rejected by their respective CHECK constraints.
- `pnpm migration-drill` — from-zero + in-place + backup + restore +
  failed-migration abort all PASS with the new migration included
  (drill 1, 2026-08-21, local dev).

## Rollback story (forward-only)

There are no down-migrations. Rollback is the documented procedure:

1. Pin `image:` in `docker-compose.yml` back to the captured previous SHA.
2. `docker compose up -d --no-deps app`.
3. Curl `/api/health` — must report the previous SHA + `db: up`.
4. If a schema change is the cause of the rollback, write a **forward-fix migration** (never edit applied migrations) and re-deploy.
5. Record the rollback in `docs/operations/runbook.md` (incident timeline + operator + date).

The rollback drill (5/5 acceptance criterion) is intentionally deferred — it requires a forward-fix migration as the rollback action, and the first real rollback in production will exercise the procedure.

## M2 migrations 0009–0011 — entitlements, usage, and lifecycle

Captured 2026-08-23 on disposable Postgres 16.

- `0009_plans_entitlements_audit.sql` adds reusable plan templates, per-agency entitlements and immutable change history, threshold events, and platform audit events.
- `0010_usage_counters.sql` adds independently lockable usage counters and cycle keys.
- `0011_agency_lifecycle_backfill.sql` adds soft lifecycle fields and backfills every existing agency with an Enterprise-compatible entitlement plus reconciled counters.

All changes are additive. Existing tenant identifiers and content rows are preserved. An older application image can ignore the new tables and lifecycle columns; normal rollback therefore pins the previous application image while leaving the schema in place. A destructive schema rollback requires the verified pre-deploy backup and explicit approval because it removes entitlement and audit history.

The 2026-08-23 drill uses the real Drizzle migrator for official migrations. From-zero produces 47 public application tables and a 12/12 `drizzle.__drizzle_migrations` ledger. The in-place helper adds its private 48th public tracking table only for synthetic drill migrations. Backup/restore preserves both data and all 12 official ledger rows, and an immediate post-restore `pnpm db:migrate` succeeds without replaying migration `0000`. This supersedes the earlier drill mechanic that applied official SQL with only a custom ledger.

## 2026-08-25 — Migration 0018 platform access roles

Code snapshot `40d0dc8` adds `role` and `updated_at` to
`platform_administrator`, a closed four-role database constraint, and the
active-role review index. Existing rows receive `platform_owner`, preserving
the authority held by the previous binary during the rolling-deployment
compatibility window. No agency membership, tenant identifier, tenant content,
or support grant is changed.

The first disposable repair drill correctly failed because its historical
0012 incident simulation retained the newer 0018 ledger row. That meant
Drizzle could not migrate backward to the 0017 repair. Commit `aaaec09` now
rewinds the known 0018 schema and ledger as one unit and refuses to run if an
unknown post-repair migration exists. The corrected rerun passed all five
drills:

- from-zero: 56 application tables and 19/19 official ledger rows;
- skipped-0012 repair: all four M3 tables restored, exactly one 0012 row,
  exactly one 0018 row, and both role columns restored;
- in-place add/drop: marker column added and removed cleanly;
- backup/restore: `pg_dump` restore retained 19/19 ledger rows and the
  deployment-critical schema;
- failed migration: the runner aborted with 57 tables before and after, with
  no missing or partially added table.

### Compatible application rollback

Migration 0018 is forward-only and its additive columns stay in place. Before
starting an old binary, the operator must snapshot all platform assignments and
soft-revoke every active non-Owner assignment. The old binary only understands
`revoked_at IS NULL`, so this leaves exactly the Owner set active and prevents a
bounded role from being interpreted as a full administrator. After the
role-aware image returns, restore the snapshot's `role`, `revoked_at`, and
`updated_at` values.

`tests/integration/platform-access.test.ts` executes this exact sequence on
disposable Postgres: the old predicate sees two active assignments before the
rollback, only the Owner during rollback, and both original roles after restore.
The complete integration suite passed 19 files / 150 tests. A destructive
column rollback remains approval-gated and would require the verified
pre-deployment backup.
