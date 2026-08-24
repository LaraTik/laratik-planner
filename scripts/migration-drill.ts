/**
 * Migration drill — exercises the production migration pipeline,
 * including recovery from the historical out-of-order 0012 journal
 * entry. The destructive schema rollback drill remains separate.
 *
 * Usage:  pnpm migration-drill            (defaults to planner_test)
 *         TEST_DATABASE_URL=... pnpm migration-drill
 *         NODE_ENV=test pnpm migration-drill
 *
 * Safety: refuses to run unless the target database is a disposable
 * one. Acceptance signal: NODE_ENV contains 'test' or DATABASE_URL
 * contains "test" / "ci" (case-insensitive). Exits non-zero on any
 * failure.
 *
 * Drills:
 *   1. from-zero         — drop + recreate DB, run the real Drizzle
 *                          migrator, and assert its ledger + schema
 *   2. skipped repair    — reproduce production's skipped 0012 ledger
 *                          state, rerun the real migrator, and assert
 *                          all M3 tables + ledger rows are restored
 *   3. in-place upgrade  — add a drill migration in scripts/.drill-tmp/,
 *                          apply via custom runner, assert column added;
 *                          then a 5th (drop) migration, assert column gone
 *   4. backup + restore  — pg_dump, drop+recreate, psql restore, assert
 *                          application tables and Drizzle ledger survive
 *   5. failed-migration  — broken 5th migration, assert runner throws and
 *                          that all original tables are still present
 *                          (no partial apply)
 *
 * The custom runner is a thin sql-file applier keyed off a tiny
 * `__drill_migrations` table. It's not a replacement for Drizzle's
 * migrator — it exists so we can inject drill-only files into the
 * pipeline without polluting src/lib/db/migrations/.
 */
import { spawnSync, SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

// Load .env from the project root before any pg Client is constructed.
loadEnv({ path: resolve(process.cwd(), ".env") });

// ─── Safety gate ────────────────────────────────────────────────────────────
// Hardcoded default points at planner_test (per the task). TEST_DATABASE_URL
// overrides it. DATABASE_URL is honored only if it already contains
// "test" or "ci" — otherwise we'd silently target a production DB.
// The gate below also requires NODE_ENV=test or a "test"/"ci" substring
// in the resolved URL.
const DEFAULT_TEST_DB_URL = "postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test";

const TEST_DB_URL = (() => {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL && /(test|ci)/i.test(process.env.DATABASE_URL)) {
    return process.env.DATABASE_URL;
  }
  return DEFAULT_TEST_DB_URL;
})();

const NODE_ENV = process.env.NODE_ENV ?? "";
const isTestish =
  NODE_ENV === "test" || NODE_ENV.includes("test") || /(test|ci)/i.test(TEST_DB_URL);

if (!isTestish) {
  console.error(
    "Refusing to run migration drill — NODE_ENV must contain 'test' or DATABASE_URL must contain 'test'/'ci'.",
  );
  console.error(`  NODE_ENV     = ${NODE_ENV}`);
  console.error(`  DATABASE_URL = ${redactUrl(TEST_DB_URL)}`);
  process.exit(1);
}

// Parse the test DB URL into a base connection (we'll connect to
// `postgres` for the drop/create DATABASE dance).
const ADMIN_URL = TEST_DB_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
const dbName = parseDbName(TEST_DB_URL);

const MIGRATIONS_DIR = resolve(process.cwd(), "src/lib/db/migrations");
const DRILL_TMP_DIR = resolve(process.cwd(), "scripts/.drill-tmp");

// ─── Result table state ─────────────────────────────────────────────────────
type Row = { drill: string; result: "PASS" | "FAIL"; detail: string };
const results: Row[] = [];
let totalStart = Date.now();

function record(drill: string, ok: boolean, detail: string) {
  results.push({ drill, result: ok ? "PASS" : "FAIL", detail });
}

function redactUrl(url: string): string {
  return url.replace(/:[^:@/]+@/, ":***@");
}

function parseDbName(url: string): string {
  const m = url.match(/\/([^/?]+)(?:\?|$)/);
  return m?.[1] ?? "planner_test";
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ─── Connection helpers ─────────────────────────────────────────────────────
async function withClient<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function dbReachable(): Promise<boolean> {
  try {
    await withClient(TEST_DB_URL, async (c) => {
      await c.query("SELECT 1");
    });
    return true;
  } catch (err) {
    console.error(`Cannot reach ${redactUrl(TEST_DB_URL)}: ${(err as Error).message}`);
    return false;
  }
}

async function countTables(client: Client): Promise<number> {
  const r = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'",
  );
  return Number(r.rows[0]?.count ?? "0");
}

async function listTables(client: Client): Promise<string[]> {
  const r = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  return r.rows.map((row) => row.table_name);
}

async function tableHasColumn(
  client: Client,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const r = await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
    [tableName, columnName],
  );
  return r.rowCount !== null && r.rowCount > 0;
}

// ─── DB lifecycle helpers ───────────────────────────────────────────────────
async function dropAndRecreateDb(dbToRecreate: string): Promise<void> {
  // Force-disconnect any stragglers, drop, then create from scratch.
  // We connect to `postgres` (the admin DB) to run the DDL.
  await withClient(ADMIN_URL, async (c) => {
    // pg_terminate_backend closes any other open connections to the target DB
    // so the DROP DATABASE doesn't block waiting for them to close.
    await c.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [dbToRecreate],
    );
    await c.query(`DROP DATABASE IF EXISTS "${dbToRecreate}"`);
    await c.query(`CREATE DATABASE "${dbToRecreate}"`);
  });
}

function runShell(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number } = {},
): SpawnSyncReturns<Buffer> {
  return spawnSync(cmd, args, {
    env: { ...process.env, ...(opts.env ?? {}) },
    input: opts.input,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: opts.timeoutMs ?? 60_000,
  });
}

function shellStderr(r: SpawnSyncReturns<Buffer>): string {
  const b = r.stderr;
  return typeof b === "string" ? b : (b?.toString("utf8") ?? "");
}

function shellStdout(r: SpawnSyncReturns<Buffer>): string {
  const b = r.stdout;
  return typeof b === "string" ? b : (b?.toString("utf8") ?? "");
}

async function countDrizzleMigrations(client: Client): Promise<number> {
  const result = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
  );
  return Number(result.rows[0]?.count ?? "0");
}

function runOfficialMigrations(): void {
  const migration = runShell("pnpm", ["db:migrate"], {
    env: {
      DATABASE_URL: TEST_DB_URL,
      NODE_ENV: "test",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "migration-drill-only-auth-secret-32-bytes",
      AGENCY_COOKIE_SECRET:
        process.env.AGENCY_COOKIE_SECRET ?? "migration-drill-only-agency-cookie-secret-32-bytes",
    },
    timeoutMs: 120_000,
  });
  if (migration.status !== 0) {
    throw new Error(
      `real Drizzle migrator failed (exit ${migration.status}): ${(
        shellStderr(migration) || shellStdout(migration)
      ).slice(-500)}`,
    );
  }
}

// ─── Custom migration runner ────────────────────────────────────────────────
/**
 * Apply SQL files in lexicographic order, tracked in a tiny
 * `__drill_migrations` table. Files in `extraDirs` are appended after
 * the base migrations. SQL is split on Drizzle's `--> statement-breakpoint`
 * delimiter, then each statement is sent in a single multi-statement
 * query (Postgres treats it as one transaction).
 *
 * `maxTag` (optional): only apply files whose tag is <= maxTag in
 * lexicographic order. Used by drill 2 to apply migrations
 * incrementally (add 0003 first, then 0004).
 */
async function applyMigrations(
  client: Client,
  baseDir: string,
  extraDirs: string[] = [],
  maxTag?: string,
): Promise<{ applied: string[]; skipped: string[] }> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS __drill_migrations (
      id          SERIAL PRIMARY KEY,
      tag         TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set<string>(
    (await client.query<{ tag: string }>("SELECT tag FROM __drill_migrations")).rows.map(
      (r) => r.tag,
    ),
  );

  // Collect files in deterministic order
  const files: { tag: string; path: string }[] = [];
  for (const dir of [baseDir, ...extraDirs]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".sql")) continue;
      files.push({ tag: name, path: resolve(dir, name) });
    }
  }
  // Deduplicate by tag (extra files would shadow same-named base files)
  const seen = new Set<string>();
  const uniqueFiles = files.filter((f) => (seen.has(f.tag) ? false : (seen.add(f.tag), true)));
  // Apply maxTag cutoff (lexicographic, inclusive)
  const filtered = maxTag ? uniqueFiles.filter((f) => f.tag <= maxTag) : uniqueFiles;

  const justApplied: string[] = [];
  const justSkipped: string[] = [];
  for (const file of filtered) {
    if (applied.has(file.tag)) {
      justSkipped.push(file.tag);
      continue;
    }
    const sql = readFileSync(file.path, "utf8");
    // statement-breakpoint is a Drizzle marker; split so each batch is
    // visibly separate. We send them as one query string with multiple
    // statements which Postgres executes atomically.
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(";\n");
    try {
      await client.query(statements);
      await client.query("INSERT INTO __drill_migrations (tag) VALUES ($1)", [file.tag]);
      justApplied.push(file.tag);
    } catch (err) {
      throw new Error(
        `Migration ${file.tag} failed: ${(err as Error).message}\n` +
          `First 200 chars of SQL: ${statements.slice(0, 200)}…`,
      );
    }
  }
  return { applied: justApplied, skipped: justSkipped };
}

// ─── Drills ─────────────────────────────────────────────────────────────────
async function drillFromZero(): Promise<void> {
  const start = Date.now();
  const detail: string[] = [];
  try {
    await dropAndRecreateDb(dbName);
    detail.push(`drop+recreate ${dbName}`);
    runOfficialMigrations();
    detail.push("real Drizzle migrator completed");
    await withClient(TEST_DB_URL, async (c) => {
      const count = await countTables(c);
      const tables = await listTables(c);
      const ledgerCount = await countDrizzleMigrations(c);
      const expectedLedgerCount = readdirSync(MIGRATIONS_DIR).filter((name) =>
        name.endsWith(".sql"),
      ).length;
      const required = ["rate_limit_event", "security_audit_event"];
      const missing = required.filter((t) => !tables.includes(t));
      const ok = count >= 25 && missing.length === 0 && ledgerCount === expectedLedgerCount;
      detail.push(`tables=${count} (≥25 ${count >= 25 ? "✓" : "✗"})`);
      detail.push(`Drizzle ledger=${ledgerCount}/${expectedLedgerCount}`);
      if (missing.length) detail.push(`missing: ${missing.join(", ")}`);
      else detail.push(`contains: ${required.join(", ")}`);
      record("1. from-zero", ok, `${detail.join("; ")} (${fmtMs(Date.now() - start)})`);
    });
  } catch (err) {
    record("1. from-zero", false, `${detail.join("; ")} | ERROR: ${(err as Error).message}`);
  }
}

async function drillSkippedMigrationRepair(): Promise<void> {
  const start = Date.now();
  const detail: string[] = [];
  const skippedTimestamp = 1787544999872;
  const repairTimestamp = 1788500000000;
  const required = [
    "support_access_request",
    "support_access_grant",
    "support_access_audit",
    "ai_daily_budget_usage",
  ];

  try {
    await withClient(TEST_DB_URL, async (c) => {
      await c.query('DROP TABLE IF EXISTS "support_access_audit" CASCADE');
      await c.query('DROP TABLE IF EXISTS "support_access_grant" CASCADE');
      await c.query('DROP TABLE IF EXISTS "support_access_request" CASCADE');
      await c.query('DROP TABLE IF EXISTS "ai_daily_budget_usage" CASCADE');
      await c.query(
        "DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ANY($1::bigint[])",
        [[skippedTimestamp, repairTimestamp]],
      );
    });
    detail.push("reproduced missing 0012 tables + ledger row");

    runOfficialMigrations();
    detail.push("real Drizzle migrator completed");

    await withClient(TEST_DB_URL, async (c) => {
      const tables = await listTables(c);
      const missing = required.filter((table) => !tables.includes(table));
      const ledgerResult = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations WHERE created_at = $1",
        [skippedTimestamp],
      );
      const repairedLedgerRows = Number(ledgerResult.rows[0]?.count ?? "0");
      const ok = missing.length === 0 && repairedLedgerRows === 1;
      detail.push(missing.length ? `missing: ${missing.join(", ")}` : "all M3 tables restored");
      detail.push(`0012 ledger rows=${repairedLedgerRows}`);
      record(
        "2. skipped migration repair",
        ok,
        `${detail.join("; ")} (${fmtMs(Date.now() - start)})`,
      );
    });
  } catch (err) {
    record(
      "2. skipped migration repair",
      false,
      `${detail.join("; ")} | ERROR: ${(err as Error).message}`,
    );
  }
}

async function drillInPlace(): Promise<void> {
  const start = Date.now();
  const detail: string[] = [];
  try {
    // Clean + recreate the temp directory so prior drill runs don't leak files.
    if (existsSync(DRILL_TMP_DIR)) rmSync(DRILL_TMP_DIR, { recursive: true, force: true });
    mkdirSync(DRILL_TMP_DIR, { recursive: true });

    // The 4th migration: add drill_marker to workspace
    const addCol = `ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "drill_marker" TEXT DEFAULT 'drill-applied';--> statement-breakpoint\n`;
    writeFileSync(resolve(DRILL_TMP_DIR, "0003_drill_add_marker.sql"), addCol);

    // The 5th migration: drop drill_marker from workspace
    const dropCol = `ALTER TABLE "workspace" DROP COLUMN IF EXISTS "drill_marker";--> statement-breakpoint\n`;
    writeFileSync(resolve(DRILL_TMP_DIR, "0004_drill_drop_marker.sql"), dropCol);

    await withClient(TEST_DB_URL, async (c) => {
      const before = await tableHasColumn(c, "workspace", "drill_marker");
      detail.push(`before: column=${before ? "EXISTS" : "absent"}`);

      // Pass 1: apply up to and including 0003 (add column)
      const r1 = await applyMigrations(c, DRILL_TMP_DIR, [], "0003_drill_add_marker.sql");
      detail.push(`add applied: [${r1.applied.join(", ")}]`);
      const afterAdd = await tableHasColumn(c, "workspace", "drill_marker");
      detail.push(`after-add: column=${afterAdd ? "EXISTS" : "absent"}`);

      // Pass 2: apply up to and including 0004 (drop column)
      const r2 = await applyMigrations(c, DRILL_TMP_DIR, [], "0004_drill_drop_marker.sql");
      detail.push(`drop applied: [${r2.applied.join(", ")}]`);
      const afterDrop = await tableHasColumn(c, "workspace", "drill_marker");
      detail.push(`after-drop: column=${afterDrop ? "EXISTS" : "absent"}`);

      const ok = before === false && afterAdd === true && afterDrop === false;
      record("3. in-place upgrade", ok, `${detail.join("; ")} (${fmtMs(Date.now() - start)})`);
    });
  } catch (err) {
    record("3. in-place upgrade", false, `${detail.join("; ")} | ERROR: ${(err as Error).message}`);
  }
}

async function drillBackupRestore(): Promise<void> {
  const start = Date.now();
  const detail: string[] = [];
  let dumpFile = "";
  try {
    // pg_dump defaults to plain SQL — restored with psql. Custom format
    // would be pg_restore. We stick with plain for transparency.
    if (!existsSync(DRILL_TMP_DIR)) mkdirSync(DRILL_TMP_DIR, { recursive: true });
    dumpFile = resolve(DRILL_TMP_DIR, `planner_test_backup_${Date.now()}.sql`);
    const parsedTarget = new URL(TEST_DB_URL);
    const pgEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PGHOST: parsedTarget.hostname,
      PGPORT: parsedTarget.port || "5432",
      PGDATABASE: dbName,
      ...(parsedTarget.username ? { PGUSER: decodeURIComponent(parsedTarget.username) } : {}),
      ...(parsedTarget.password ? { PGPASSWORD: decodeURIComponent(parsedTarget.password) } : {}),
    };
    const ledgerBefore = await withClient(TEST_DB_URL, countDrizzleMigrations);
    detail.push(`Drizzle ledger before=${ledgerBefore}`);

    const dump = runShell(
      "pg_dump",
      ["--no-owner", "--no-privileges", "--clean", "--if-exists", "-f", dumpFile],
      { env: pgEnv },
    );
    if (dump.status !== 0) {
      record(
        "4. backup + restore",
        false,
        `pg_dump failed (exit ${dump.status}): ${shellStderr(dump).slice(0, 300)}`,
      );
      return;
    }
    // PostgreSQL 17's pg_dump emits this session setting even when
    // connected to a PostgreSQL 16 server. PostgreSQL 16 correctly
    // rejects the unknown parameter during restore. It has no effect
    // on schema or data, so remove only this exact compatibility line.
    const dumpSql = readFileSync(dumpFile, "utf8");
    const compatibleDumpSql = dumpSql.replace(/^SET transaction_timeout = 0;\r?\n/m, "");
    if (compatibleDumpSql !== dumpSql) {
      writeFileSync(dumpFile, compatibleDumpSql);
      detail.push("normalized pg_dump 17 session setting for PostgreSQL 16");
    }
    detail.push(`pg_dump → ${dumpFile.split("/").pop()}`);

    await dropAndRecreateDb(dbName);
    detail.push(`drop+recreate ${dbName}`);

    const restore = runShell("psql", ["-v", "ON_ERROR_STOP=1", "-f", dumpFile], { env: pgEnv });
    if (restore.status !== 0) {
      const stderr = shellStderr(restore).slice(-400);
      record("4. backup + restore", false, `psql restore failed: ${stderr}`);
      return;
    }
    detail.push(`psql restore OK`);

    await withClient(TEST_DB_URL, async (c) => {
      const tables = await listTables(c);
      const has = tables.includes("rate_limit_event");
      const count = tables.length;
      const ledgerAfter = await countDrizzleMigrations(c);
      detail.push(`tables=${count}`);
      detail.push(`rate_limit_event=${has ? "present" : "MISSING"}`);
      detail.push(`Drizzle ledger after=${ledgerAfter}`);
      const ok = has && ledgerBefore > 0 && ledgerAfter === ledgerBefore;
      record("4. backup + restore", ok, `${detail.join("; ")} (${fmtMs(Date.now() - start)})`);
    });
  } catch (err) {
    record("4. backup + restore", false, `${detail.join("; ")} | ERROR: ${(err as Error).message}`);
  } finally {
    // Best-effort cleanup of dump file when all drills pass
    if (dumpFile && existsSync(dumpFile) && results.every((r) => r.result === "PASS")) {
      try {
        rmSync(dumpFile, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

async function drillFailedMigration(): Promise<void> {
  const start = Date.now();
  const detail: string[] = [];
  try {
    // Snapshot original tables first (from all official migrations).
    const originalTables = await withClient(TEST_DB_URL, listTables);
    detail.push(`snapshot: ${originalTables.length} tables`);

    // Write a deliberately broken migration to a NEW filename (we re-use
    // 0005_drill_broken.sql across runs but track it in __drill_migrations
    // to mark it as "known broken" so re-runs don't trip on it again).
    if (!existsSync(DRILL_TMP_DIR)) mkdirSync(DRILL_TMP_DIR, { recursive: true });
    const broken = `ALTER TABLE nonexistent_table_for_drill ADD COLUMN x INTEGER;--> statement-breakpoint\n`;
    const brokenFile = resolve(DRILL_TMP_DIR, "0005_drill_broken.sql");
    writeFileSync(brokenFile, broken);

    // Run the broken migration via the custom runner, expect a throw.
    let caught: unknown = null;
    await withClient(TEST_DB_URL, async (c) => {
      try {
        await applyMigrations(c, DRILL_TMP_DIR);
      } catch (err) {
        caught = err;
      }
    });

    if (!(caught instanceof Error)) {
      record(
        "5. failed-migration abort",
        false,
        `${detail.join("; ")} | ERROR: expected throw, got none`,
      );
      return;
    }
    detail.push(`runner threw as expected: ${caught.message.slice(0, 60)}…`);

    // Verify all original tables still present (no partial apply).
    const afterTables = await withClient(TEST_DB_URL, listTables);
    const missing = originalTables.filter((t) => !afterTables.includes(t));
    const added = afterTables.filter((t) => !originalTables.includes(t));
    detail.push(
      `after: ${afterTables.length} tables (missing=${missing.length}, added=${added.length})`,
    );

    if (missing.length) detail.push(`MISSING: ${missing.join(", ")}`);
    if (added.length) detail.push(`UNEXPECTED ADDED: ${added.join(", ")}`);
    const ok = missing.length === 0 && added.length === 0;
    record("5. failed-migration abort", ok, `${detail.join("; ")} (${fmtMs(Date.now() - start)})`);

    // Mark the broken migration as "applied" so subsequent runs of the
    // drill script don't try to re-apply it (which would also fail, but
    // for the wrong reason — it would mask whether the runner handled
    // the error cleanly). We do this via raw SQL, NOT via the runner.
    await withClient(TEST_DB_URL, async (c) => {
      await c.query(
        "INSERT INTO __drill_migrations (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING",
        ["0005_drill_broken.sql"],
      );
    });
  } catch (err) {
    record(
      "5. failed-migration abort",
      false,
      `${detail.join("; ")} | ERROR: ${(err as Error).message}`,
    );
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  totalStart = Date.now();
  console.log(`[drill] target: ${redactUrl(TEST_DB_URL)} (db=${dbName})`);
  console.log(`[drill] NODE_ENV=${NODE_ENV || "(unset)"}`);

  if (!(await dbReachable())) {
    console.error("[drill] Database unreachable. Refusing to continue.");
    process.exit(1);
  }

  // Run the drills in order. Each is independent in spirit but the
  // failed-migration drill asserts state from the earlier drills.
  await drillFromZero();
  await drillSkippedMigrationRepair();
  await drillInPlace();
  await drillBackupRestore();
  await drillFailedMigration();

  // Print the results table
  const drillWidth = Math.max(...results.map((r) => r.drill.length), 28);
  const resultWidth = 4;
  const sep = "─".repeat(drillWidth + resultWidth + 4);
  console.log("");
  console.log("┌" + sep + "┐");
  console.log("│ " + "Drill".padEnd(drillWidth) + " │ " + "PASS".padEnd(resultWidth) + " │ Detail");
  console.log("├" + sep + "┤");
  for (const r of results) {
    const mark = r.result === "PASS" ? "✓" : "✗";
    console.log(
      "│ " +
        r.drill.padEnd(drillWidth) +
        " │ " +
        r.result.padEnd(resultWidth) +
        ` │ ${mark} ${r.detail}`,
    );
  }
  console.log("└" + sep + "┘");
  console.log(`[drill] total: ${fmtMs(Date.now() - totalStart)}`);

  // Clean up drill-tmp at the end
  if (existsSync(DRILL_TMP_DIR)) {
    try {
      rmSync(DRILL_TMP_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const allPass = results.every((r) => r.result === "PASS");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("[drill] fatal:", err);
  process.exit(1);
});
