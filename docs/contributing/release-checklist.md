# Release checklist

> Keyed to the master prompt §24 "Definition of done and release gates" and to `docs/production-readiness/README.md`. The release gate is the per-deploy evidence the operator attaches to the deploy record; the release verdict is the long-lived state in `PRODUCTION_READINESS_TRACKER.md` and `docs/production-readiness/UAT_RELEASE.md`.

## 1. Per-deploy gate (the deploy record)

A deploy is a single `Deploy` workflow run. The gate is the evidence the operator attaches to the run:

| Gate                                                           | Source                                                                                     |       Required?        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | :--------------------: |
| `CI` workflow green on the exact `head_sha`                    | `.github/workflows/ci.yml` (deploy-gate)                                                   |           ✅           |
| No skipped required tests                                      | `pnpm test:unit` + `pnpm test:integration` outputs                                         |           ✅           |
| Zero critical / high production-dependency advisories          | `pnpm audit --prod` output                                                                 |           ✅           |
| Migration drill PASS at the merged SHA                         | `pnpm migration-drill` (1–5) on disposable Postgres 16                                     |           ✅           |
| `pnpm verify` green at the merged SHA                          | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build`         |           ✅           |
| Docker image builds cleanly (app + migrator)                   | `docker build` output (no `RUN warnings`)                                                  |           ✅           |
| Pre-deploy `pg_dump` taken and verified                        | `scripts/vps/backup.sh` exit code 0; backup on `/opt/laratik-planner/backups/` and offsite |           ✅           |
| `/api/health` returns the new SHA + `db: up` + `schema: ready` | `curl https://planner.laratik.com/api/health`                                              |           ✅           |
| Critical browser + visual smoke                                | `pnpm test:e2e:critical` on the live URL                                                   |           ✅           |
| Release-candidate full 5-browser + visual matrix               | `pnpm test:e2e:isolated` + `pnpm test:visual` (local/manual)                               | ✅ for `READY` verdict |
| `pg_dump` post-deploy captures the new SHA's schema            | `pg_dump --schema-only` includes the migration set                                         |           ✅           |

A deploy with any required gate failing is rolled back. The rollback procedure is in `docs/production-readiness/MIGRATION_DEPLOYMENT.md:102` and `docs/operations/READY_TO_DEPLOY.md` §"First-deploy rollback". The deploy record (the workflow run URL, the SHA, the operator, the date) is the artifact that ties the deploy to the evidence.

## 2. Pre-release verdict (the long-lived state)

A `READY FOR INDEPENDENT REVIEW` → `READY` verdict transition is gated by the long-lived evidence. The reviewer confirms every box below before flipping the verdict in `PRODUCTION_READINESS_TRACKER.md` and `docs/production-readiness/UAT_RELEASE.md`:

| Item                                                                                | Evidence path                                                               | Confirmed |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | :-------: |
| The 30-step §23 journey PASS for every step                                         | `docs/production-readiness/UAT_RELEASE.md` (one row per step)               |     ☐     |
| The `EXTERNAL_SERVICES_UAT.md` rows are signed by the owner                         | `docs/production-readiness/EXTERNAL_SERVICES_UAT.md` (owner column)         |     ☐     |
| Sentry DSN + alert rules live (`OBS-001` closure)                                   | Sentry project + 4 alert rules per `docs/operations/observability.md:73-78` |     ☐     |
| Manual a11y sign-off (`QA-005` closure)                                             | `docs/production-readiness/ACCESSIBILITY_CHECKLIST.md` (operator + date)    |     ☐     |
| Visual baselines on the stable UI (`QA-004` closure)                                | `coverage/visual/` artifacts (per-viewport)                                 |     ☐     |
| Migration drill at the current HEAD matches the production DB ledger                | `pnpm migration-drill` 5/5 + `drizzle.__drizzle_migrations` SELECT          |     ☐     |
| Encrypted offsite backup + restore drill (`OPS-001` closure)                        | `docs/operations/backup-recovery.md` (last drill date + SHA)                |     ☐     |
| Independent reviewer (not the author) has signed the `pr-review-checklist.md` boxes | PR comment + tracker row `Verified`                                         |     ☐     |

A single unchecked box is a verdict-blocker. The `READY` verdict is the operator-facing promise that every box is checked; the `READY FOR INDEPENDENT REVIEW` verdict is the intermediate state during the closure process.

## 3. Per-feature UAT (the day-to-day evidence)

Each feature that ships between two `READY` flips lands its own UAT row in `docs/production-readiness/UAT_RELEASE.md`. The row uses the `PASS / PARTIAL / OUT OF SCOPE` convention from `docs/testing/conventions.md:4` and references:

- The §23 step ID(s) the feature exercises.
- The M-tag and the goal number.
- The UAT evidence path (the screenshot, the workflow run, the operator log).
- The operator + date.
- The dependency that closes a `PARTIAL` row, named.

A `PARTIAL` row is not a verdict-blocker per se, but an unnamed `PARTIAL` (no owner, no dependency) is a review-blocker for the per-feature UAT sign-off. The UAT sign-off is the per-feature gate; the verdict flip is the per-release gate.

## 4. Post-release hygiene

The release is not done when the deploy is green. The follow-up hygiene is:

- **Tag the release** with an immutable annotated tag: `git tag -a v<MAJOR>.<MINOR>.<PATCH> <sha> -m "<message>"`. The tag is referenced from `PRODUCTION_READINESS_TRACKER.md` and `docs/production-readiness/CHANGELOG.md` (if present).
- **Record the deploy** in `docs/operations/READY_TO_DEPLOY.md` §"Deploy log" (or the successor surface). The record includes the SHA, the operator, the date, the workflow run URL, and the smoke evidence.
- **Monitor the release** for the first 60 minutes. The four Sentry alert rules in `docs/operations/observability.md` are the floor; the operator's eyes are the ceiling.
- **Close the loop on the UAT journey.** The 30-step §23 walk-through is re-run end-to-end on the live URL with separated accounts; the result is the `UAT_RELEASE.md` row that closes the per-release gate.
- **Archive the deploy workflow run.** The 90-day GitHub Actions retention is the floor; the `playwright-report`, `test-results`, and `coverage-report` artifacts are attached to the deploy record.

## 5. Rollback story

The release is not a one-way door. The rollback procedure is:

1. **Pin the image back to the captured previous SHA** in `docker-compose.yml` (`image:` line).
2. **`docker compose -p laratik-planner pull app && docker compose up -d --no-deps app`** on the VPS.
3. **Curl `/api/health`** — must report the previous SHA + `db: up` + `schema: ready`.
4. **If a schema change is the cause**, write a forward-fix migration (never edit applied migrations) and re-deploy.
5. **Record the rollback** in `docs/operations/runbook.md` (incident timeline + operator + date) and in `PRODUCTION_READINESS_TRACKER.md` (the deploy record). A rollback is a release-quality event, not a deploy-quality event.

The first rollback on production exercises this procedure. The `MIGRATION_DEPLOYMENT.md` §"Rollback story (forward-only)" is the procedural contract.
