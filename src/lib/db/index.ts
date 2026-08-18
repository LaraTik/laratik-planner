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
 */
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgPool = pool;
}

export const db = drizzle(pool);
export { pool };
