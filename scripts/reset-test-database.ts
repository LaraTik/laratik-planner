import { Pool } from "pg";

/**
 * Reset only a disposable test database before an isolated browser run.
 *
 * The E2E seed is intentionally idempotent, but idempotence alone does not
 * remove rows created by earlier suites. A clean schema state is required for
 * deterministic visual heights, pagination, and role fixtures. The migration
 * ledger is preserved so the normal migration step remains authoritative.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;

  if (!databaseUrl || !/(test|ci)/i.test(databaseUrl)) {
    throw new Error("Refusing to reset a database URL without 'test' or 'ci'.");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset a production database.");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename
         FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '__drizzle_migrations'
        ORDER BY tablename`,
    );

    if (rows.length > 0) {
      const tableList = rows
        .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
        .join(", ");
      await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await pool.end();
  }
}

void main();
