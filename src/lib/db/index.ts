import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { serverEnv } from "@/lib/validation/env";

/**
 * Drizzle client (singleton, hot-reload safe).
 *
 * Goal 0: stub schema is empty. Goal 1 introduces profiles, agencies,
 * workspaces, memberships, invitations, channels, brand_assets, etc.
 *
 * Connection pool defaults: max 10 connections, 30s idle timeout, 5s
 * connection timeout. These are tuned for a single VPS; bump max if
 * the app is ever scaled horizontally.
 *
 * `application_name` shows up in `pg_stat_activity` so a DBA can tell
 * which app is holding a given connection.
 *
 * `statement_timeout` and `idle_in_transaction_session_timeout` are
 * set on every new connection via the `connectionTimeoutMillis`-style
 * init query path. The transaction timeout is a defense against app
 * bugs that start a tx and forget to commit/rollback — it lets
 * Postgres kill the orphan after 60s instead of holding the
 * connection forever.
 */
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
    application_name: "laratik-planner",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Run once per new physical connection from this pool.
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgPool = pool;
}

export const db = drizzle(pool);
export { pool };
