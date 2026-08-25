# Backup and recovery (RPO / RTO)

> Backs up the
> [`runbook.md`](./runbook.md) § Backup / Restore procedure with the
> contractual numbers an owner signs off on: cadence, retention, RPO,
> RTO, drill cadence, and the offsite status.
>
> Offsite backup (restic) is **not yet wired** —
> [`../production-readiness/EXTERNAL_SERVICES_UAT.md`](../production-readiness/EXTERNAL_SERVICES_UAT.md)
> § "Encrypted offsite backup" row 1 is `STUBBED` (the restic block in
> `scripts/vps/backup.sh` lines 30-37 is commented out pending
> `/root/.config/restic/env` and an offsite repo URL) and row 2
> (timed disposable restore) is `MISSING`.

## 1. Backup cadence and retention

| Surface              | Cadence  | Window (UTC) | Local retention | Offsite retention | Source                                                             |
| -------------------- | -------- | ------------ | --------------- | ----------------- | ------------------------------------------------------------------ |
| Postgres (full dump) | Daily    | 03:30        | 14 days         | **NOT YET WIRED** | `scripts/vps/backup.sh` (local pg_dump + sha256 + 14-day prune)    |
| Private storage      | Daily    | 03:30        | 14 days         | **NOT YET WIRED** | Same cron, bundled with the pg_dump job                            |
| App image (Docker)   | Per push | n/a          | Until pruned    | GHCR (immutable)  | CI pushes per `head_sha`; old tags pruned via `docker image prune` |
| Source code (Git)    | Per push | n/a          | Forever         | `origin/main`     | GitHub `LaraTik/laratik-planner`                                   |
| Migration ledger     | n/a      | n/a          | n/a             | With DB           | `drizzle.__drizzle_migrations` lives inside the Postgres backup    |

Offsite wiring plan: enable the restic block in
`scripts/vps/backup.sh` (lines 30-37) and provision
`/root/.config/restic/env` with `RESTIC_REPOSITORY` and
`RESTIC_PASSWORD` against the operator's chosen provider (Backblaze
B2, Hetzner Storage Box, or S3). Until that is done, the only
backup is the local 14-day window on the same VPS — a single-disk
failure takes the backup with it.

## 2. RPO and RTO

These numbers are **placeholders** until the project owner signs them
off. The audit
([`GAP-FULL-REVIEW-2026-08-25`](../production-readiness/FULL_REVIEW_2026-08-25.md) / DOC-03) explicitly flagged the missing agreement;
the owner must confirm before this section is moved out of
`placeholder` state.

| Metric                | Current placeholder | Notes                                                                                                                                                                                                                                                     |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPO**               | `<RPO_TBD>`         | The maximum acceptable data loss in time. Drives the backup cadence. The 03:30 UTC daily job means the worst-case RPO is 24 h. If the owner wants 1 h RPO, the deployment needs a hot WAL archive or PITR.                                                |
| **RTO**               | `<RTO_TBD>`         | The maximum acceptable time to restore from a verified backup. The current local-only path is `~30 min` for a 1 GB database (download backup, gunzip, psql, app restart). The offsite path is unmeasured because the offsite repo is not yet provisioned. |
| RPO target on signing | **TODO** (operator) | _Confirm the target ceiling and replace the placeholder above._                                                                                                                                                                                           |
| RTO target on signing | **TODO** (operator) | _Confirm the target ceiling and replace the placeholder above._                                                                                                                                                                                           |

**To finalize:** the owner edits this file, replacing `<RPO_TBD>` and
`<RTO_TBD>` with the agreed numbers, commits the change, and references
this commit from the
[`PRODUCTION_READINESS_TRACKER.md`](../production-readiness/PRODUCTION_READINESS_TRACKER.md)
DOC-001 row. Until that commit lands, the production handoff remains
incomplete on this axis.

## 3. Restore drill cadence

| Drill                                  | Cadence       | Owner   | Evidence target                                                                              |
| -------------------------------------- | ------------- | ------- | -------------------------------------------------------------------------------------------- |
| Local pg_dump → drop → psql round-trip | **Monthly**   | on-call | `pnpm migration-drill` drill 3 PASS, SHA-256 of the produced backup appended to the run log  |
| Offsite disposable restore             | **Quarterly** | on-call | New drill — blocked on offsite wiring (row 2 of the offsite section below).                  |
| Full forward-fix migration simulation  | **Quarterly** | on-call | `pnpm migration-drill` drill 4 PASS (already covered monthly by the migration-drill script). |
| Offsite disposable restore (restic)    | **Quarterly** | on-call | Blocked — see section 5 below.                                                               |

The migration-drill script lives at `scripts/migration-drill.ts`; the
local backup path is exercised at lines 345-396. The offsite path is
not yet covered (see `EXTERNAL_SERVICES_UAT.md` row 2 of the offsite
section: `MISSING`).

## 4. Last successful drill

| Drill                                 | Date (UTC) | Result                                                | Backup SHA-256 | Operator |
| ------------------------------------- | ---------- | ----------------------------------------------------- | -------------- | -------- |
| Local pg_dump → drop → psql (drill 3) | **TODO**   | **TODO** — record the next drill run's date + SHA-256 | **TODO**       | on-call  |
| Full forward-fix migration simulation | **TODO**   | **TODO** — record the next drill run's date + SHA-256 | **TODO**       | on-call  |
| Offsite disposable restore (restic)   | **n/a**    | **Blocked** — see section 5                           | n/a            | n/a      |

The 2026-08-19 migration-drill run is the latest published evidence
and is captured in
[`MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) §
Status. After every successful drill, the operator updates this table
in the same commit that closes the drill work item.

## 5. Offsite backup status

**NOT YET WIRED.** The offsite path is the single biggest gap in the
production readiness posture.

- **Code path:** `STUBBED`. The restic `backup` + `forget` block in `scripts/vps/backup.sh` lines 30-37 is present but commented out. `EXTERNAL_SERVICES_UAT.md` row 1 of the offsite section marks this `STUBBED`.
- **Disposable restore:** `MISSING`. No code path performs a timed disposable restore from the offsite repo. `EXTERNAL_SERVICES_UAT.md` row 2 marks this `MISSING`. The local `scripts/migration-drill.ts` covers the pg_dump ↔ psql round-trip but not restic ↔ Postgres.
- **Credential:** `/root/.config/restic/env` is not provisioned. Needs `RESTIC_REPOSITORY` (e.g. `b2:bucket-name:/laratik-planner`) and `RESTIC_PASSWORD`.
- **Wiring steps (when unblocked):**
  1. Choose a provider (Backblaze B2 is the default for v1 — cheap, S3-compatible, EU residency available).
  2. Provision the bucket, generate a restic-compatible access key.
  3. Write `/root/.config/restic/env` with the three required vars; chmod 600.
  4. Uncomment the restic block in `scripts/vps/backup.sh`; test with `./scripts/vps/backup.sh --dry-run` (or the first real run in a controlled window).
  5. Add the timed disposable-restore drill to the monthly schedule (see section 3) and a UAT row in `EXTERNAL_SERVICES_UAT.md` row 2 with the measured RTO.
  6. Replace the placeholders in section 2 with the measured RPO / RTO.

Until these six steps are done, the production handoff is incomplete
on the data-loss axis. The
[`incident-response.md`](./incident-response.md) § "Data-loss
sub-flow" must be the first action of any suspected data-loss event,
because the only available restore point is the local 14-day window.

## 6. References

- [`runbook.md`](./runbook.md) § Backup / Restore — the day-2 procedure.
- [`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) § "2026-08-24 incident" — worked example of a migration-time data-safety event.
- [`../production-readiness/EXTERNAL_SERVICES_UAT.md`](../production-readiness/EXTERNAL_SERVICES_UAT.md) § "Encrypted offsite backup" — owner-supplied UAT rows (rows 1-2).
- [`../production-readiness/FULL_REVIEW_2026-08-25.md`](../production-readiness/FULL_REVIEW_2026-08-25.md) § DOC-03 — the audit finding that produced this doc.
- [`incident-response.md`](./incident-response.md) — the escalation path when a restore is needed urgently.
