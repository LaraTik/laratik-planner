# Migration and deployment evidence

> Authoritative work list: `PRODUCTION_READINESS_TRACKER.md` (rows DEP-001 / DEP-002 / OPS-001).
> Drill results: [`MIGRATION_DRILL_RESULTS.md`](./MIGRATION_DRILL_RESULTS.md).

## Status (current evidence: 2026-09-01)

| Item                                | Current status                               |
| ----------------------------------- | -------------------------------------------- |
| From-zero migration                 | **PASS** (drill 1/5, 2026-09-01)             |
| Skipped-migration repair            | **PASS** (drill 2/5, 2026-09-01)             |
| In-place upgrade                    | **PASS** (drill 3/5, 2026-09-01)             |
| Backup verification + restore       | **PASS** (drill 4/5, 2026-09-01)             |
| Failed-migration abort              | **PASS** (drill 5/5, 2026-09-01)             |
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

This 2026-08-24 capture is historical. The current 2026-09-01 run, after the
0025 notification-message migration was registered and the disposable database
was recreated, passes all five checks with a 26/26 Drizzle ledger; the exact
output is maintained in [`MIGRATION_DRILL_RESULTS.md`](./MIGRATION_DRILL_RESULTS.md).

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
- ~~`scripts/deploy.sh` explicitly continues when migration fails.~~ **Fixed** — `scripts/deploy.sh` aborts on any migration failure (no more swallowed exit). Backed by the current drill 5/5 PASS (failed-migration abort preserves the schema).
- ~~Production health reports version `0.0.0` and checks database reachability rather than schema readiness.~~ **Fixed** — `src/app/api/health/route.ts` reports the real release SHA at container runtime; `scripts/deploy.sh` hits `/api/health` and rolls back on non-200.

## Required deployment sequence (current, M3a)

1. CI quality, database, browser, security and image jobs pass (`pnpm verify` + `pnpm test:integration` + `pnpm test:e2e` + `pnpm audit --prod` + `docker build`).
2. Build and publish an immutable SHA-tagged app image and matching migrator (`ghcr.io/laratik/laratik-planner:<sha>` + `ghcr.io/laratik/laratik-planner-migrator:<sha>`, plus `:latest`).
3. Verify disk space and run the local Postgres backup (`scripts/vps/backup.sh`).
4. Run the migrator with the captured previous image retained for rollback; **abort on any migration failure** (the current drill 5/5 proves the migrator surfaces the error and leaves the schema unchanged).
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

## Migration 0012 — Support access grants + AI budget tracking (M3)

**Filename:** `src/lib/db/migrations/0012_support_access_grants.sql`
**SHA-256:** `882d9fe62082cb5779281564ad3f25475e312827b75540256a3039c402e77d42`
**Journal tag:** `0012_support_access_grants` (journal `when`: `1787544999872` — see §"2026-08-24 incident" above for the inversion)

### Forward behavior

Additive only. Four new tables are created:

- `support_access_request` — ticketed platform-admin request to view tenant content. Status transitions: `pending → approved | rejected | cancelled | expired`. Duration is bounded (1–168 h) by `support_access_request_duration_positive`.
- `support_access_grant` — the approved, time-limited grant that unlocks a specific scope. UNIQUE on `request_id` (one grant per request). Active when `revoked_at IS NULL AND expires_at > now()`. Downloads off by default.
- `support_access_audit` — append-only audit of every viewed object. UPDATE / DELETE forbidden by the same `forbid_modify_audit_log()` trigger function that M2.1 attached to `agency_entitlement_change` and `platform_audit_event`.
- `ai_daily_budget_usage` — per-(agency, user, day) request counter. Composite PK on `(agency_id, user_id, usage_date)`. The `/api/ai/generate` route reserves capacity here in the same transaction as the monthly reservation, so concurrent users cannot exceed `daily_ai_requests_per_user`.

No existing table, column, index, check, or foreign key is modified. Total table count after migration: 47 (adds four to the M2 43-table baseline).

### Compatibility statement

Pre-migration application images remain compatible because all four tables are additive: no service query references them yet, so an older binary running against the post-migration schema behaves identically. The journal timestamp inversion is the documented exception — see §"2026-08-24 incident" above. The 0017 repair is the reconciliation path for production databases whose ledger skipped 0012.

### Backup + rollback procedure

Because the system is forward-only (no down-migrations):

1. **Normal app rollback** — pin `image:` in `docker-compose.yml` back to the captured previous SHA. The previous binary never writes to any of the four new tables, so it is safe to leave them in place.
2. **Schema rollback (if the new tables must be removed)** — restore the pre-migration `pg_dump` taken by `scripts/vps/backup.sh` immediately before the deploy. The four tables are dropped with the restore. Do NOT edit the applied migration file.
3. **Destructive rollback** is approval-gated because `support_access_audit` rows are production evidence and `ai_daily_budget_usage` counters are operator-facing observability data.

### Tests

- `tests/integration/support-access.test.ts` — covers the four-table invariants: a `support_access_request` cannot be approved without an agency FK; the grant is UNIQUE per request; the audit log is append-only (UPDATE / DELETE raise via the trigger); `ai_daily_budget_usage` PK rejects duplicate `(agency, user, day)` writes.
- `tests/integration/ai-governance.test.ts` — proves the daily budget reservation in `ai_daily_budget_usage` runs in the same transaction as the monthly reservation; concurrent requests cannot exceed the cap.
- `tests/unit/migration-journal-order.test.ts` — the regression guard for the 0012 inversion. Allows only the documented 0012 inversion, requires the 0017 repair, and enforces strict monotonicity after it.
- `pnpm migration-drill` drill 5 (skipped-0012 repair) — restores all four M3 tables and exactly one 0012 ledger row, passes on disposable Postgres 16 (2026-08-24).

## Migration 0013 — ai_provider_secret (M3.4 — AI in-DB secret)

**Filename:** `src/lib/db/migrations/0013_ai_provider_secret.sql`
**SHA-256:** `036e4699974e54ff8f4ecc008e656c027c5ed2cfde890126eef4ddc71d807007`
**Journal tag:** `0013_ai_provider_secret` (journal `when`: `1788100000000`)

### Forward behavior

Additive only. One new table:

- `ai_provider_secret` — 1:1 with `agency` via `agency_id` PK. Holds the AES-256-GCM-sealed provider key (ciphertext, `iv(12) || authTag(16) || encrypted`), the `key_version` (1 today; rotation seam), the `last_four` mirrored to `ai_feature_setting.masked_key_suffix` for the UI badge, and the `rotated_by_user_id` audit context.

Two CHECK constraints are added in the same migration:

- `ai_provider_secret_last_four_len` — `char_length(last_four) = 4` (the masked-suffix contract).
- `ai_provider_secret_key_version_range` — `key_version BETWEEN 1 AND 32767` (16-bit seam).

The ciphertext column is `bytea` (not `text`) so an accidental `console.log(row)` will not produce readable output and a query builder that defaults to casting `bytea` to text will surface a build hazard. The encryption helper + service that write / read this table land in a follow-up commit (M3.4 service layer); until then, every existing read path is unaffected.

### Compatibility statement

Pre-migration application images remain compatible because the table is additive and the application code is unchanged by this migration. No existing row is modified. A subsequent service-layer commit introduces the read / write helper; before that, the table is written-but-unread by the application.

### Backup + rollback procedure

Because the system is forward-only:

1. **Normal app rollback** — pin `image:` to the captured previous SHA. The previous binary never reads `ai_provider_secret`, so it is safe to leave the new table in place.
2. **Schema rollback (destructive)** — `DROP TABLE ai_provider_secret`. Must be paired with a verified pre-migration `pg_dump` because the ciphertext is the only recoverable copy of the API key (rotation is not in scope for this milestone; the destructive path is only safe before any agency has stored a secret).

### Tests

- `tests/integration/ai-governance.test.ts` — covers the `ai_feature_setting` + `ai_provider_secret` split (config row + ciphertext row), the masked-suffix mirror invariant, and the key-version seam.
- `tests/unit/ai-provider-secret-repository.test.ts` — the read / write round-trip for the encryption helper (M3.4 service layer).
- `pnpm migration-drill` drill 1 (from-zero) and drill 3 (backup / restore) — both PASS with the new table included on disposable Postgres 16 (2026-08-23).

## Migration 0014 — agency locale / timezone as top-level columns

**Filename:** `src/lib/db/migrations/0014_agency_locale_timezone.sql`
**SHA-256:** `fdfe3da633eccd741aa73a57c232f443c56c37a5dc6f546975b8f1f78d8fd800`
**Journal tag:** `0014_agency_locale_timezone` (journal `when`: `1788200000000`)

### Forward behavior

Two new top-level columns on `agency`:

- `locale text NOT NULL DEFAULT 'en'`
- `timezone text NOT NULL DEFAULT 'UTC'`

Followed by a single conditional `UPDATE` that backfills from the legacy `agency.settings ->> 'locale' / settings ->> 'timezone'` jsonb path when the new columns are still at their defaults. Two CHECK constraints are then added:

- `agency_locale_len` — `char_length(locale) BETWEEN 2 AND 20`
- `agency_timezone_len` — `char_length(timezone) BETWEEN 2 AND 80`

The legacy `settings` jsonb column is left in place for any future free-form fields. The follow-up commit updates the application read path to the new columns; before that, the columns are written-but-unread by the application.

### Compatibility statement

Additive for the schema (two new columns + two new CHECK constraints). The backfill is read-mostly: the `UPDATE` is a `SELECT`-only read followed by a conditional `UPDATE` that only writes when the jsonb path is present and the new columns are still at their defaults. No existing row loses data. The M2-era `createAgency` server action writes the two fields to BOTH the new columns and the jsonb path, so the backfill never picks up a value that was missing in the new columns.

### Backup + rollback procedure

Because the system is forward-only:

1. **Normal app rollback** — pin `image:` to the captured previous SHA. The previous binary reads `agency.settings.locale / settings.timezone` and ignores the new top-level columns, so it is safe to leave them in place.
2. **Schema rollback (destructive)** — `ALTER TABLE agency DROP COLUMN timezone; ALTER TABLE agency DROP COLUMN locale;` The backfill is idempotent on re-run (only writes when the jsonb path is present and the new columns are still at their defaults), so a re-attempt after a fresh from-zero migration is safe.

### Tests

- `tests/integration/agency-singleton-constraint.test.ts` and the agency / agency_settings integration tests — cover the new top-level columns and the backfill.
- `tests/unit/agency-repository.test.ts` — the read-path helper that switches from `settings.locale / settings.timezone` to the top-level columns.
- `pnpm migration-drill` drill 1 (from-zero) — PASS with the new columns included on disposable Postgres 16 (2026-08-23).

## Migration 0015 — Social profile analytics (M4)

**Filename:** `src/lib/db/migrations/0015_social_profile_analytics.sql`
**SHA-256:** `b39fb8a840278efeae38405bdfbd68a75d9b78da60f892d5a0228f589f4ddd51`
**Journal tag:** `0015_social_profile_analytics` (journal `when`: `1788300000000`)

### Forward behavior

Additive only. Three new tables plus additive columns on `social_channel`:

- `social_connection` — one row per (workspace, provider, provider_subject_id). Holds the AES-256-GCM-sealed credential envelope (`credentials_ciphertext`, `credentials_iv`, `credentials_tag`, `credentials_key_version`), the lifecycle status, the OAuth scopes, and the access / refresh token expiry. CHECK `social_connection_provider_valid` constrains `provider` to `('meta', 'tiktok')`. Partial UNIQUE on `(workspace_id, provider, provider_subject_id) WHERE revoked_at IS NULL` so a revoked connection does not block a fresh connect for the same subject.
- `social_oauth_state` — short-lived CSRF bag. The start route inserts one row; the callback route consumes it exactly once inside a single transaction. The `state_digest` stores `sha256(state)` — the raw state is never persisted. CHECK `social_oauth_state_return_path_safe` pins the return path to `^/app/w/[a-z0-9-]+/channels$`.
- `social_profile_daily_metric` — one row per (channel, calendar day in workspace timezone). Stores the normalized observed totals, the `response_hash`, the `provider_api_version`, and a small typed `source_metadata` bag. No raw provider payload is retained. CHECK `social_profile_metric_counts_non_negative` rejects negative counts on every numeric column.

`social_channel` is extended additively with `social_connection_id`, `external_account_id`, `avatar_url`, `connection_status` (default `'manual'`), `last_synced_at`, `next_sync_at`, `sync_lease_until`, `sync_failure_count`, `last_sync_error_code`, `last_sync_error_at`. CHECK `social_channel_connection_status_valid` constrains the status. A partial UNIQUE on `(workspace_id, platform, external_account_id) WHERE external_account_id IS NOT NULL AND archived_at IS NULL` keeps manual and connected channels distinct. A partial index on `next_sync_at` keeps the cron worker scan cheap.

No existing table has column drops. No existing index, check, or foreign key is modified. Existing manual channels pass the new `connection_status` check because the default is `'manual'`, which is in the allowed set.

### Compatibility statement

Pre-migration application images remain compatible because all three new tables are additive and every new `social_channel` column is nullable (or has a `'manual'` default). The M3 binary does not read `social_connection`, `social_oauth_state`, or `social_profile_daily_metric`, so it is safe to leave the new tables in place during a normal app rollback.

### Backup + rollback procedure

Because the system is forward-only:

1. **Normal app rollback** — pin `image:` to the captured previous SHA. The previous binary never writes to any of the three new tables or the new `social_channel` columns, so it is safe to leave them in place. The new nullable columns remain valid even if the application does not read them.
2. **Schema rollback (destructive)** — restore the pre-migration `pg_dump`. The three new tables are dropped with the restore; the new `social_channel` columns are dropped via a one-off `ALTER TABLE ... DROP COLUMN` if you want to keep forward-only and skip the restore. Do NOT edit the applied migration file.

### Tests

- `tests/integration/social-analytics.test.ts` — the three-table invariants: the partial UNIQUE on `social_connection` allows a re-connect after a revoke; the OAuth state row is consumed exactly once; `social_profile_daily_metric` rejects negative counts via the CHECK.
- `tests/integration/social-repository.test.ts` — covers the `social_channel` additive columns, the `connection_status` default, and the partial UNIQUE on `external_account_id`.
- `pnpm migration-drill` drills 1–4 — PASS with the new tables included on disposable Postgres 16 (2026-08-24).

## Migration 0016 — per-agency social DEK (M4.5)

**Filename:** `src/lib/db/migrations/0016_per_agency_social_dek.sql`
**SHA-256:** `aeff866f432263be987a7b8461c189dff6f27734d8d7406755874b0e223f2171`
**Journal tag:** `0016_per_agency_social_dek` (journal `when`: `1788400000000`)

### Forward behavior

Additive only. One new table:

- `agency_social_dek` — 1:1 with `agency` via `agency_id` PK. Holds the wrapped DEK envelope (`dek_ciphertext bytea`, `dek_iv bytea` (12 bytes), `dek_tag bytea` (16 bytes), `dek_key_version smallint`) plus the `enabled_at` / `enabled_by`, `last_rotated_at` / `last_rotated_by`, and `rotation_reason` audit context. The DEK is generated on first enable, wrapped with the platform KEK, and stored here; the plaintext DEK is shown to the agency admin exactly once and is never persisted.

Five CHECK constraints are added:

- `agency_social_dek_key_version_range` — `dek_key_version BETWEEN 1 AND 32767` (mirrors `ai_provider_secret.key_version`).
- `agency_social_dek_rotation_reason_valid` — `NULL` or one of `('manual', 'recovery_reset')`.
- `agency_social_dek_ciphertext_min_length` — `octet_length(dek_ciphertext) >= 32`.
- `agency_social_dek_iv_length` — `octet_length(dek_iv) = 12`.
- `agency_social_dek_tag_length` — `octet_length(dek_tag) = 16`.

One index is added: `agency_social_dek_kv_idx` on `dek_key_version` to support the KEK-rotation script (find every row sealed with the old KEK in one scan).

The wrapped DEK columns are `bytea` (not `text`) so an accidental `console.log(row)` will not produce readable output, and a query builder that defaults to casting `bytea` to text will surface a build hazard.

### Compatibility statement

Pre-migration application images remain compatible because the table is additive. The application-side env contract changes in the same milestone (M4.5.4 — lazy KEK). Until that lands, the existing `SOCIAL_TOKEN_ENCRYPTION_KEY` env var is still read by the repository to seal / open existing `social_connection` rows. The new env var is not required at boot; the application refuses to seal a new `social_connection` if the row is missing AND the platform KEK is unset, with a clear 503 surface (no boot crash).

### Backup + rollback procedure

Because the system is forward-only:

1. **Normal app rollback** — pin `image:` to the captured previous SHA. The previous binary never reads `agency_social_dek`, so it is safe to leave the new table in place.
2. **Schema rollback (destructive)** — `DROP TABLE agency_social_dek`. Must be paired with a verified pre-migration `pg_dump` of any wrapped DEKs (which is the only way to re-derive the per-connection social tokens). In practice, rollback is only safe before any agency has enabled social.

### Tests

- `tests/integration/social-dek-repository.test.ts` — covers the wrap / unwrap round-trip, the `dek_key_version` seam, the `rotation_reason` enum, and the partial-unique invariant on `enabled_at`.
- `tests/integration/social-analytics.test.ts` — proves that the existing `social_connection` row continues to seal / open with the platform `SOCIAL_TOKEN_ENCRYPTION_KEY` while the new `agency_social_dek` row is written for the per-agency path.
- `pnpm migration-drill` drills 1–4 — PASS with the new table included on disposable Postgres 16 (2026-08-24).

## Migration 0017 — repair the skipped M3 support-access migration

**Filename:** `src/lib/db/migrations/0017_repair_support_access_grants.sql`
**SHA-256:** `726532d5fa902e702e07206e1f34be72fe0e548a9eb152db77884b11ac65cc63`
**Journal tag:** `0017_repair_support_access_grants` (journal `when`: `1788500000000`)

### Forward behavior

Additive repair, idempotent. Recreates the four 0012 tables and their indexes with `IF NOT EXISTS` guards, then reconciles the missing 0012 ledger row. Specifically:

- `CREATE TABLE IF NOT EXISTS support_access_request / support_access_grant / support_access_audit / ai_daily_budget_usage` — same DDL as 0012.
- `CREATE INDEX IF NOT EXISTS ...` — same index set as 0012.
- `DROP TRIGGER IF EXISTS support_access_audit_no_update ON support_access_audit; CREATE TRIGGER support_access_audit_no_update ...` — re-attaches the append-only enforcement that 0012 added.
- `COMMENT ON TABLE ...` — the same documentation comments 0012 added.
- `INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") SELECT '882d9fe62082cb5779281564ad3f25475e312827b75540256a3039c402e77d42', 1787544999872 WHERE NOT EXISTS (...)` — records the original 0012 ledger row.

On a fresh database, 0012 already created the same objects and ledger row, so this migration is idempotent. On a production database that skipped 0012, this migration recreates the missing objects and inserts the missing ledger row.

### Compatibility statement

No existing application row or identifier is changed. Older images ignore these additive tables, so application rollback leaves them in place. The 0012 journal timestamp (`1787544999872`) is older than 0011 (`1788000000000`); this inversion is the documented exception that the §"2026-08-24 incident" addresses and that `tests/unit/migration-journal-order.test.ts` guards.

### Backup + rollback procedure

Because the system is forward-only:

1. **Normal app rollback** — pin `image:` to the captured previous SHA. The previous binary ignores the four additive tables, so it is safe to leave them in place.
2. **Schema rollback (destructive)** — restore the pre-migration `pg_dump` taken before the 0017 deploy. The four tables are dropped with the restore. Do NOT edit the applied migration file. A destructive rollback requires approval because `support_access_audit` rows are production evidence and the repair itself is the only path to re-insert the original 0012 ledger row.

### Tests

- `pnpm migration-drill` drill 5 (skipped-0012 repair) — the canonical proof. Deletes the four M3 tables plus the 0012 / 0017 ledger rows while retaining later migrations, reruns the real Drizzle migrator, and proves all four tables plus exactly one 0012 ledger row return. PASS on disposable Postgres 16 (2026-08-24).
- `tests/unit/migration-journal-order.test.ts` — the regression guard. Allows only the documented 0012 inversion, requires the 0017 repair, and enforces strict monotonicity after it.
- `tests/integration/support-access.test.ts` — re-verifies the four-table invariants after the repair lands.

## Migration 0029 — Independent email delivery state

**Filename:** `src/lib/db/migrations/0029_notification_email_delivery_state.sql`

### Forward behavior

Additive only. `outbox_event` gains email-specific completion and retry
columns (`email_processed_at`, `email_attempt_count`, and
`email_last_error`) plus an index for due email work. The new
`notification_email_delivery` table tracks `(outbox_event_id, user_id)` so
multi-recipient events can retry one failed address without resending
successful deliveries. Existing `processed_at`, `attempt_count`, and
`last_error` remain the in-app delivery state.

Existing processed outbox rows are backfilled as email-processed during the
upgrade. This prevents the first email cron run after deployment from sending
historical notifications that the old shared flag had already completed.

### Compatibility and rollback

The change is additive and older application images continue to use the
existing in-app columns. Before deployment, take the standard verified
`pg_dump` backup. Normal application rollback pins the previous image while
leaving the additive columns/table in place. Schema rollback is forward-only;
restore the pre-migration backup only with explicit approval because it removes
email delivery history. From-zero and upgrade-drill evidence is **pending**
until a disposable PostgreSQL service is available.
