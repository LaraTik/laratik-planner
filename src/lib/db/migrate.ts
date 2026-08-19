/**
 * Run Drizzle migrations on app startup (or via `pnpm db:migrate`).
 * Goal 0: no migrations exist yet, this script just verifies the
 * connection and exits 0.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load .env from the project root before importing any modules that
// read process.env at module-evaluation time.
loadEnv({ path: resolve(process.cwd(), ".env") });

// Use dynamic require so the top-level await ESM/CJS interop stays
// portable across Node 20 (VPS) and Node 24 (local dev).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { migrate } = require("drizzle-orm/node-postgres/migrator") as typeof import("drizzle-orm/node-postgres/migrator");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db, pool } = require("./index") as typeof import("./index");

async function main() {
  console.log("[migrate] starting…");
  try {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
    console.log("[migrate] done");
  } catch (err) {
    if (err instanceof Error && err.message.includes("No migrations found")) {
      console.log("[migrate] no migrations yet (Goal 0) — nothing to apply");
    } else {
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
