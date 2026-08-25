# Drizzle migrations

The files in this directory are applied by the Drizzle migrator
(`pnpm db:migrate`, which runs `src/lib/db/migrate.ts`).

## Index creation: the `CONCURRENTLY` constraint

Plain `CREATE INDEX` takes a SHARE lock on the target table for the
duration of the build, which blocks writes. On a busy production
table, that lock is a downtime risk for the duration of the build.

`CREATE INDEX CONCURRENTLY` builds the index in the background,
allowing reads AND writes to proceed. The trade-off is that
CONCURRENTLY **cannot run inside a transaction block**, and
Drizzle's migrator wraps every `.sql` file in a single transaction.
A naive `CREATE INDEX CONCURRENTLY` in a migration file will fail
with `CREATE INDEX CONCURRENTLY cannot run inside a transaction
block`.

The Drizzle migrator is the right tool for every other DDL here
(`CREATE TABLE`, `ALTER TABLE`, `CREATE TYPE`, `CREATE INDEX`
without CONCURRENTLY for non-production-critical index additions).
For new production-critical indexes, use the dedicated helper:

```bash
# Authoring convention: place the .sql file in scripts/migrations/
# (NOT in this directory) so the Drizzle migrator never sees it.
./scripts/migrate-concurrent.sh scripts/migrations/0020_foo_idx.sql
```

The helper:

- Splits the file on Drizzle's `--> statement-breakpoint`
  delimiter (mirrors `migration-drill.ts`).
- Runs each statement in its own auto-commit query (no
  transaction wrapper).
- Retries on transient failures
  (`tuple concurrently updated`, `deadlock detected`,
  `could not serialize access`) up to
  `CONCURRENT_MAX_RETRIES` (default 3) with a
  `CONCURRENT_WAIT_MS` (default 5000) back-off.
- On persistent failure, prints the
  `DROP INDEX CONCURRENTLY IF EXISTS "<name>";` cleanup
  command so the operator can re-run after a manual fix.

Failure modes the operator should know about:

- A failed `CREATE INDEX CONCURRENTLY` leaves an INVALID index
  in the catalog. The helper prints the cleanup command on
  persistent failure. Re-running the helper drops the invalid
  index (`IF EXISTS` makes it idempotent) and re-builds.
- The helper does NOT touch the Drizzle ledger. Place the
  `.sql` file outside this directory so the regular migrator
  never re-applies it.

## What does NOT change

Existing migrations are unchanged. Editing a historical migration
breaks reproducibility (a fresh DB built from a stale commit will
get a different schema than a DB that has been live-migrated).
This README documents the convention for migrations going
forward; the 74 historical `CREATE INDEX` statements in this
directory continue to apply under the regular Drizzle migrator.
