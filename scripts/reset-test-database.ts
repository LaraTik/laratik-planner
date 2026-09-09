import { Pool } from "pg";

/**
 * Reset only a disposable test database before an isolated browser run.
 *
 * The E2E seed is intentionally idempotent, but idempotence alone does not
 * remove rows created by earlier suites. A clean schema state is required for
 * deterministic visual heights, pagination, and role fixtures. The runner
 * applies migrations before calling this script, so a pristine CI database
 * has the reference tables this reset needs before it truncates any rows.
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
          AND tablename NOT IN ('__drizzle_migrations', 'platform_plan_template')
        ORDER BY tablename`,
    );

    // `platform_plan_template` is migration-seeded reference data. Keep it
    // intact so an isolated reset does not leave newly seeded agencies
    // without the entitlement plan required by every agency detail route.
    if (rows.length > 0) {
      const tableList = rows
        .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
        .join(", ");
      await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }

    // Some integration fixtures recreate the migration-seeded plan rows
    // after the migration ledger has already recorded 0040. Restore the
    // shipped Trend Radar capability in the disposable reference data so
    // later isolated browser specs do not depend on test ordering.
    await pool.query(`
      UPDATE "platform_plan_template"
         SET "default_limits" = jsonb_set(
           "default_limits",
           '{enabled_capabilities}',
           COALESCE("default_limits"->'enabled_capabilities', '[]'::jsonb)
             || '["trend_radar"]'::jsonb,
           true
         )
       WHERE "default_limits" IS NOT NULL
         AND NOT COALESCE("default_limits"->'enabled_capabilities', '[]'::jsonb)
           @> '["trend_radar"]'::jsonb
    `);
  } finally {
    await pool.end();
  }
}

void main();
