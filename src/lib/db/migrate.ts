/**
 * Run Drizzle migrations on app startup (or via `pnpm db:migrate`).
 * Goal 0: no migrations exist yet, this script just verifies the
 * connection and exits 0.
 */
import { config as loadEnv } from "dotenv";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Load .env from the project root before importing any modules that
// read process.env at module-evaluation time. ESM hoists imports above
// any other code, so we have to use a dynamic import() below — the
// static imports happen first and would read process.env before dotenv
// populates it.
loadEnv({ path: resolve(process.cwd(), ".env") });

/**
 * Where the migrator writes its structured log. The Docker
 * `migrator` image has stdout scraped by the host log collector;
 * this file is a defense-in-depth mirror so a crashed collector
 * still leaves evidence on disk. Set `MIGRATE_LOG_FILE=/dev/null`
 * to disable the file sink (the default leaves it on).
 */
const MIGRATE_LOG_FILE = process.env["MIGRATE_LOG_FILE"];

/**
 * Tiny structured logger for the migrator container. Always emits
 * to stdout (so the host log collector / Uptime Kuma see it);
 * optionally mirrors the same JSON line to a file when
 * `MIGRATE_LOG_FILE` is set. Using `console.log` / `console.error`
 * would mix the migrator output with Next.js' own stdout, which is
 * fine for a single container but a pain to grep on a busy VPS.
 */
function logMigrate(level: "info" | "error", event: string, ctx: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...ctx,
  });
  // Best-effort: stdout always; file sink when configured.
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
  if (MIGRATE_LOG_FILE) {
    try {
      mkdirSync(resolve(MIGRATE_LOG_FILE, ".."), { recursive: true });
      appendFileSync(MIGRATE_LOG_FILE, line + "\n");
    } catch {
      // Don't fail a migration because the log sink is broken.
    }
  }
}

async function main() {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db, pool } = await import("./index");

  logMigrate("info", "migrate.start");
  try {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
    logMigrate("info", "migrate.done");
  } catch (err) {
    if (err instanceof Error && err.message.includes("No migrations found")) {
      logMigrate("info", "migrate.no_migrations");
    } else {
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logMigrate("error", "migrate.failed", {
    err: err instanceof Error ? { name: err.name, message: err.message } : { value: String(err) },
  });
  process.exit(1);
});

