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
