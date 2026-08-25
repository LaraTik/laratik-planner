/**
 * Apply a migration file containing only CREATE INDEX [CONCURRENTLY]
 * statements. Runs each statement outside a transaction (the
 * non-negotiable constraint of CREATE INDEX CONCURRENTLY) and retries
 * on transient failures.
 *
 * See scripts/migrate-concurrent.sh for the full rationale. This
 * file is the Node-side runtime; the .sh wrapper is a thin
 * argument-parsing front-end.
 *
 * Why a dedicated runner (not a Drizzle migration)
 * -------------------------------------------------
 * Drizzle's migrator wraps every .sql file in a transaction. Postgres
 * refuses to run CREATE INDEX CONCURRENTLY inside a transaction, so
 * the only way to apply a CONCURRENTLY index through the same
 * pipeline is to bypass the transaction. The cleanest way to do that
 * without forking the migrator is a sibling script that uses the
 * same `--> statement-breakpoint` convention.
 *
 * Authoring contract
 * ------------------
 *  - The .sql file must contain ONLY CREATE INDEX statements. Other
 *    DDL inside the same file breaks the contract; the runner does
 *    not enforce this (so an operator can mix in a comment), but
 *    the practical effect is that non-index DDL will be applied
 *    auto-commit, which is normally what you want anyway.
 *  - Each statement is its own query; we deliberately do NOT wrap
 *    multiple statements in a single multi-statement query because
 *    a single failure should not abort the whole batch.
 *  - On persistent failure, the operator cleans up the INVALID
 *    index (the runner prints the DROP INDEX CONCURRENTLY
 *    command) and re-runs.
 *
 * CLI
 * ---
 *   pnpm tsx scripts/migrate-concurrent.ts <path> [--max-retries N] [--wait-ms N]
 *
 * Exit codes
 * ----------
 *   0  every statement applied successfully (possibly after retries)
 *   1  unrecoverable failure; manual intervention required
 *   2  usage / configuration error
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

// Load .env so DATABASE_URL is populated the same way `pnpm db:migrate`
// gets it. Only effective when the variable isn't already in the
// environment (an explicit override wins).
loadEnv({ path: resolve(process.cwd(), ".env") });

type Args = {
  file: string;
  maxRetries: number;
  waitMs: number;
};

function parseArgs(argv: ReadonlyArray<string>): Args {
  let file = "";
  let maxRetries = 3;
  let waitMs = 5000;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--max-retries") {
      const v = argv[++i];
      if (!v || !/^[0-9]+$/.test(v)) {
        console.error("--max-retries requires a non-negative integer");
        process.exit(2);
      }
      maxRetries = Number(v);
    } else if (arg === "--wait-ms") {
      const v = argv[++i];
      if (!v || !/^[0-9]+$/.test(v)) {
        console.error("--wait-ms requires a non-negative integer");
        process.exit(2);
      }
      waitMs = Number(v);
    } else if (arg === "--help" || arg === "-h") {
      console.log("usage: migrate-concurrent.ts <file> [--max-retries N] [--wait-ms N]");
      process.exit(0);
    } else if (arg.startsWith("--")) {
      console.error(`unknown flag: ${arg}`);
      process.exit(2);
    } else if (!file) {
      file = arg;
    } else {
      console.error(`unexpected positional argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!file) {
    console.error("usage: migrate-concurrent.ts <file> [--max-retries N] [--wait-ms N]");
    process.exit(2);
  }
  return { file, maxRetries, waitMs };
}

const args = parseArgs(process.argv);
const filePath = resolve(process.cwd(), args.file);
const sqlText = readFileSync(filePath, "utf8");

if (!process.env["DATABASE_URL"]) {
  console.error("DATABASE_URL is not set (and .env did not provide one)");
  process.exit(2);
}

/**
 * Parse the SQL into individual statements, mirroring Drizzle's
 * `--> statement-breakpoint` split. Empty / whitespace-only
 * statements are dropped; comments inside a statement block stay
 * with their statement.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Surface the index name from a `CREATE INDEX [CONCURRENTLY]`
 * statement so the failure path can print a DROP INDEX CONCURRENTLY
 * cleanup command. Best-effort: handles the common shapes and falls
 * back to a heuristic for weird ones.
 */
function extractIndexName(statement: string): string | null {
  // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] <name> ON ...
  const m = statement.match(
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/i,
  );
  return m?.[4] ?? null;
}

const statements = splitStatements(sqlText);
if (statements.length === 0) {
  console.error(`no statements found in ${filePath} (after statement-breakpoint split)`);
  process.exit(2);
}

console.log(`[migrate-concurrent] parsed ${statements.length} statement(s) from ${filePath}`);

const client = new Client({ connectionString: process.env["DATABASE_URL"] });

type RunResult = { ok: true } | { ok: false; permanent: boolean; error: Error };

async function runWithRetry(statement: string): Promise<RunResult> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= args.maxRetries; attempt++) {
    try {
      await client.query(statement);
      return { ok: true };
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message;
      // "CREATE INDEX CONCURRENTLY cannot run inside a transaction" —
      // we never wrap in a tx, but if a future refactor adds one this
      // surfaces the misconfiguration immediately.
      if (/cannot run inside a transaction/i.test(msg)) {
        return { ok: false, permanent: true, error: lastError };
      }
      // "tuple concurrently updated" / "deadlock detected" /
      // "serialization failure" — these are transient on a busy DB.
      const transient =
        /tuple concurrently updated/i.test(msg) ||
        /deadlock detected/i.test(msg) ||
        /could not serialize access/i.test(msg);
      if (!transient) {
        return { ok: false, permanent: true, error: lastError };
      }
      console.warn(
        `[migrate-concurrent] attempt ${attempt}/${args.maxRetries} failed (transient): ${msg}`,
      );
      if (attempt < args.maxRetries) {
        await new Promise((r) => setTimeout(r, args.waitMs));
      }
    }
  }
  return {
    ok: false,
    permanent: false,
    error: lastError ?? new Error("retry budget exhausted (no error captured)"),
  };
}

async function main() {
  await client.connect();
  try {
    for (const [i, statement] of statements.entries()) {
      const indexName = extractIndexName(statement);
      console.log(
        `[migrate-concurrent] (${i + 1}/${statements.length}) applying${
          indexName ? ` ${indexName}` : ""
        }`,
      );
      const result = await runWithRetry(statement);
      if (!result.ok) {
        console.error(
          `[migrate-concurrent] (${i + 1}/${statements.length}) FAILED: ${result.error.message}`,
        );
        if (indexName) {
          console.error(
            `[migrate-concurrent] cleanup: DROP INDEX CONCURRENTLY IF EXISTS "${indexName}";`,
          );
        }
        process.exit(1);
      }
    }
    console.log(`[migrate-concurrent] applied ${statements.length} statement(s) successfully`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[migrate-concurrent] unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
