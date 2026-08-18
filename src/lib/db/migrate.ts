/**
 * Run Drizzle migrations on app startup (or via `pnpm db:migrate`).
 * Goal 0: no migrations exist yet, this script just verifies the
 * connection and exits 0.
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

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
