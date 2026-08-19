/**
 * Run Drizzle migrations on app startup (or via `pnpm db:migrate`).
 * Goal 0: no migrations exist yet, this script just verifies the
 * connection and exits 0.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load .env from the project root before importing any modules that
// read process.env at module-evaluation time. ESM hoists imports above
// any other code, so we have to use a dynamic import() below — the
// static imports happen first and would read process.env before dotenv
// populates it.
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db, pool } = await import("./index");

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
