# Migrations — author conventions

> Companion to `docs/production-readiness/MIGRATION_DEPLOYMENT.md` (per-migration evidence) and `AGENTS.md:15` (forward, compatibility, backup, rollback evidence mandate). This file is the **recipe** for an author writing a new migration.

## 1. The additive-only rule

Migrations are **forward-only and additive** by default. The system has no down-migrations and the rollback story is the in-place forward-fix migration (or, in the worst case, restoring the pre-migration `pg_dump`).

**Allowed without an ADR:**

- `CREATE TABLE` for a new feature (1:1 with `agency` / `workspace` / `user` via FK).
- `ALTER TABLE ... ADD COLUMN` when the column is nullable or has a backfill-able default.
- `CREATE INDEX` / `CREATE UNIQUE INDEX` (partial indexes welcome).
- `ALTER TABLE ... ADD CONSTRAINT CHECK (...)` mirroring an application-level invariant.
- `COMMENT ON TABLE / COLUMN` for schema-level documentation.
- `CREATE OR REPLACE FUNCTION` for a trigger function that is **purely additive** (e.g. the `forbid_modify_audit_log()` family).

**Requires an ADR in `docs/decisions/`:**

- `ALTER TABLE ... DROP COLUMN` (any column).
- `ALTER TABLE ... ALTER COLUMN ... TYPE` (any narrowing or widening that risks truncation).
- `ALTER TABLE ... DROP CONSTRAINT` (any check, FK, or unique).
- `DROP INDEX` (any index that an existing query path may depend on).
- `DROP TABLE` (any table that an older application image could still read).
- Any change to a column's `NOT NULL` status.
- Any change to a column's default that the application relies on.

The ADR must record: (a) the destructive surface, (b) why additive is not viable, (c) the pre-deploy backup dependency, (d) the operator action required, (e) the rollback story.

## 2. The journal-order invariant

`src/lib/db/migrations/meta/_journal.json` records each migration's `when` (Unix ms). Drizzle compares every candidate timestamp to the latest applied ledger row, so a timestamp inversion causes the candidate to be skipped — see §"2026-08-24 incident" in `MIGRATION_DEPLOYMENT.md` for the only documented case.

**Rules for a new migration:**

- The `when` value must be **strictly greater** than the previous entry's `when`. Pick a value at least 1 ms after the prior entry; do not use the wall-clock at author time, because two parallel branches will collide.
- The snapshot file (`meta/<tag>_snapshot.json`) must declare `prevId` equal to the previous entry's snapshot `id`. The `migration-journal-order.test.ts` "snapshot ancestry" test enforces this.
- If a parallel branch needs to ship a fix migration, the fix gets a **new** `when` value strictly greater than the latest entry on `main` at the time the fix branch is rebased.

**The documented exception:** the 0012 timestamp (`1787544999872`) is older than 0011 (`1788000000000`). The 0017 repair (`1788500000000`) is the reconciliation. The test allows only this inversion.

## 3. Per-migration evidence template

Every new migration gets a per-migration section in `docs/production-readiness/MIGRATION_DEPLOYMENT.md` following the template used for 0005, 0009–0011, and (now) 0012–0017. The section must include:

- **Filename** — `src/lib/db/migrations/<tag>.sql`
- **SHA-256** — `shasum -a 256 src/lib/db/migrations/<tag>.sql`
- **Journal tag** — the Drizzle `tag` and the journal `when` value
- **Forward behavior** — what the migration creates / alters, with the new CHECK constraints and the additive surface explicitly listed
- **Compatibility statement** — what an older application image does, with the journal-timestamp exception called out if relevant
- **Backup + rollback procedure** — the documented forward-fix path AND the destructive-`pg_dump`-restore path, with the approval gate for destructive rollback
- **Tests** — the integration test that covers the invariants, the `migration-drill` drill (1–5) that includes this migration, and (if applicable) the `migration-journal-order.test.ts` regression guard

## 4. When a destructive change requires an ADR

The list in §1 is the trigger. A destructive change is one that **removes, narrows, or repaints** a surface the application reads. The ADR template (see `docs/decisions/0005-platform-role-permissions.md` for a worked example) must include:

- **Decision** — what is changing and what is the additive alternative that was rejected
- **Context** — what forces the change (a M-tag, an audit finding, a security finding)
- **Consequences** — what older application images will do, what the rollback story is, and which `pg_dump` instance is the recovery target
- **Pre-deploy gate** — the `pnpm migration-drill` drill that proves the destructive path; the smoke contract that proves the application is healthy after the change

The ADR is reviewed by an independent reviewer before the migration is merged. The `Verified` transition in `PRODUCTION_READINESS_TRACKER.md` references the ADR by number.

## 5. Recipe — `pnpm migration-drill`

```bash
# Default: run the full 5-drill suite on disposable Postgres 16
pnpm migration-drill

# Run a single drill (1=from-zero, 2=in-place, 3=backup/restore,
# 4=failed-migration abort, 5=skipped-0012 repair)
pnpm migration-drill -- --drill=1

# Restrict the suffix for the 0012-repair drill (uses the
# migration-journal-order.test.ts invariants)
pnpm migration-drill -- --drill=5
```

The drill runner:

1. Refuses to run against any non-test database (it asserts `TEST_DATABASE_URL` matches the expected pattern).
2. Spins up disposable Postgres 16 in a container, applies the real Drizzle migrator, and exercises the drill.
3. For drill 5, deletes the four M3 tables plus the 0012 / 0017 ledger rows while retaining later migrations, reruns the real Drizzle migrator, and proves all four tables plus exactly one 0012 ledger row return.
4. Writes the result to `docs/production-readiness/MIGRATION_DRILL_RESULTS.md` with the date, the operator, and the migration set exercised.

The drill result is the **evidence** the operator attaches to the per-migration section in §3. If a drill fails, the migration is not merged; the failure is the signal that the additive surface or the destructive surface is not what the author intended.

## 6. Author checklist

Before opening the PR for a new migration:

- [ ] `pnpm db:generate` produced a single `<NNN>_<topic>.sql` file with a single `meta/<NNN>_snapshot.json` and a strictly-increasing `_journal.json` entry.
- [ ] The SQL is additive per §1, or the destructive change has an ADR per §1 / §4.
- [ ] The integration test for the new surface lives in `tests/integration/<topic>.test.ts` and runs against disposable Postgres via `TEST_DATABASE_URL`.
- [ ] `tests/unit/migration-journal-order.test.ts` passes locally (proves the journal-order invariant).
- [ ] `pnpm migration-drill` passes drills 1–5 on disposable Postgres 16.
- [ ] The per-migration section in `MIGRATION_DEPLOYMENT.md` follows the §3 template, with the SHA-256, the journal tag, the forward behavior, the compatibility statement, the backup + rollback procedure, and the test pointers.
- [ ] The PR title references the M-tag and the gap audit ID (e.g. `M3.4 — ai_provider_secret (DOC-09, GAP-FULL-REVIEW-2026-08-25)`).
- [ ] The commit message follows `docs(<scope>): <description>` (scopes: `db`, `docs`, `architecture`).

## 7. Common hazards

- **Timestamp collision across parallel branches** — see §2. Use a manually-chosen `when` value at least 1 ms after the prior entry; do not rely on `Date.now()`.
- **Destructive ALTER without ADR** — see §1. The 2026-08-24 incident was a symptom of a parallel-branch merge; the destructive-ALTER path is the next-largest risk surface.
- **Drill-runner against the production database** — the runner asserts `TEST_DATABASE_URL` matches the expected disposable pattern. Do not override the assertion in a real database.
- **Snapshot ancestry** — the `migration-journal-order.test.ts` "snapshot ancestry" test fails if any `prevId` has more than one child. Always generate the snapshot against the latest `_journal.json` from `main`.
- **Forgetting the journal timestamp inversion guard** — the 0012 / 0017 exception is **hard-coded** in the test. A new inversion is rejected unless an explicit repair is added in the same PR.
