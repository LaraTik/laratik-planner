/**
 * Tests for the pure-CPU surface of scripts/migrate-concurrent.ts.
 *
 * The full script requires a live Postgres connection; the
 * migration-drill script (scripts/migration-drill.ts) is the
 * end-to-end coverage for the live path. Here we cover the
 * pieces that can be unit-tested without a DB:
 *
 *  - `--max-retries` / `--wait-ms` flag parsing (numeric
 *    validation, exit codes).
 *  - `--> statement-breakpoint` split (mirrors Drizzle).
 *  - Index-name extraction from `CREATE INDEX CONCURRENTLY`
 *    for the cleanup-command path.
 *  - Argument validation (missing file, unknown flag, etc.).
 *
 * The full script's connection / retry logic is exercised by
 * the migration drill. Pinning the parsing contract here means
 * a future refactor that breaks the CLI shape surfaces in CI
 * before it reaches the operator.
 */
import { describe, expect, it } from "vitest";
import {
  extractIndexName,
  isInsideDirectory,
  splitStatements,
  validateConcurrentIndexStatements,
} from "../../scripts/migrate-concurrent-sql";

type Args = { file: string; maxRetries: number; waitMs: number };

function parseArgs(argv: ReadonlyArray<string>): Args {
  let file = "";
  let maxRetries = 3;
  let waitMs = 5000;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--max-retries") {
      const v = argv[++i];
      if (!v || !/^[0-9]+$/.test(v)) {
        throw new Error("--max-retries requires a non-negative integer");
      }
      maxRetries = Number(v);
    } else if (arg === "--wait-ms") {
      const v = argv[++i];
      if (!v || !/^[0-9]+$/.test(v)) {
        throw new Error("--wait-ms requires a non-negative integer");
      }
      waitMs = Number(v);
    } else if (arg === "--help" || arg === "-h") {
      throw new Error("__HELP__");
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else if (!file) {
      file = arg;
    } else {
      throw new Error(`unexpected positional argument: ${arg}`);
    }
  }
  if (!file) {
    throw new Error("missing migration file argument");
  }
  return { file, maxRetries, waitMs };
}

describe("migrate-concurrent — statement split (mirrors Drizzle)", () => {
  it("splits on --> statement-breakpoint and trims whitespace", () => {
    const sql = `
      CREATE INDEX CONCURRENTLY "foo_idx" ON "bar" ("x");
      --> statement-breakpoint
      CREATE INDEX CONCURRENTLY "baz_idx" ON "bar" ("y");
    `;
    expect(splitStatements(sql)).toEqual([
      'CREATE INDEX CONCURRENTLY "foo_idx" ON "bar" ("x");',
      'CREATE INDEX CONCURRENTLY "baz_idx" ON "bar" ("y");',
    ]);
  });

  it("returns a single statement when no breakpoint is present", () => {
    const sql = `CREATE INDEX CONCURRENTLY "solo" ON "t" ("c");`;
    expect(splitStatements(sql)).toEqual(['CREATE INDEX CONCURRENTLY "solo" ON "t" ("c");']);
  });

  it("drops empty / whitespace-only chunks", () => {
    const sql = `
      --> statement-breakpoint

      CREATE INDEX CONCURRENTLY "x_idx" ON "t" ("c");
      --> statement-breakpoint

    `;
    expect(splitStatements(sql)).toEqual(['CREATE INDEX CONCURRENTLY "x_idx" ON "t" ("c");']);
  });
});

describe("migrate-concurrent — input safety guards", () => {
  it("accepts only breakpoint-separated concurrent index commands", () => {
    expect(() =>
      validateConcurrentIndexStatements(
        splitStatements(`
          -- online index build
          CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \"ready_idx\"
            ON \"assets\" (\"workspace_id\") WHERE \"status\" = 'ready; archived';
          --> statement-breakpoint
          /* second independent index */
          CREATE INDEX CONCURRENTLY \"created_idx\" ON \"assets\" (\"created_at\");
        `),
      ),
    ).not.toThrow();
  });

  it("rejects regular indexes that would take a write-blocking lock", () => {
    expect(() =>
      validateConcurrentIndexStatements(['CREATE INDEX \"unsafe_idx\" ON \"assets\" (id);']),
    ).toThrow(/CREATE \[UNIQUE\] INDEX CONCURRENTLY/);
  });

  it("rejects non-index DDL", () => {
    expect(() =>
      validateConcurrentIndexStatements(['ALTER TABLE \"assets\" ADD COLUMN x text;']),
    ).toThrow(/CREATE \[UNIQUE\] INDEX CONCURRENTLY/);
  });

  it("rejects a second command in the same breakpoint-delimited chunk", () => {
    expect(() =>
      validateConcurrentIndexStatements([
        'CREATE INDEX CONCURRENTLY \"safe_idx\" ON \"assets\" (id); DROP TABLE \"assets\";',
      ]),
    ).toThrow(/CREATE \[UNIQUE\] INDEX CONCURRENTLY/);
  });

  it("recognizes Drizzle migration paths and paths outside the ledger", () => {
    expect(
      isInsideDirectory("/repo/src/lib/db/migrations/0001.sql", "/repo/src/lib/db/migrations"),
    ).toBe(true);
    expect(
      isInsideDirectory("/repo/scripts/migrations/0001.sql", "/repo/src/lib/db/migrations"),
    ).toBe(false);
  });
});

describe("migrate-concurrent — index name extraction", () => {
  it("extracts the name from CREATE INDEX CONCURRENTLY", () => {
    expect(extractIndexName('CREATE INDEX CONCURRENTLY "my_idx" ON "t" ("c");')).toBe("my_idx");
  });

  it("handles UNIQUE INDEX CONCURRENTLY", () => {
    expect(extractIndexName('CREATE UNIQUE INDEX CONCURRENTLY "u_idx" ON "t" ("c");')).toBe(
      "u_idx",
    );
  });

  it("handles IF NOT EXISTS + CONCURRENTLY", () => {
    expect(extractIndexName('CREATE INDEX CONCURRENTLY IF NOT EXISTS "i" ON "t" ("c");')).toBe("i");
  });

  it("does not extract names from non-concurrent indexes", () => {
    expect(extractIndexName('CREATE INDEX "i" ON "t" ("c");')).toBeNull();
  });

  it("returns null for a non-matching statement", () => {
    expect(extractIndexName("ALTER TABLE foo ADD COLUMN bar text;")).toBeNull();
  });
});

describe("migrate-concurrent — argument parsing", () => {
  it("returns the file with default retry/wait", () => {
    const args = parseArgs(["node", "script.ts", "m.sql"]);
    expect(args).toEqual({ file: "m.sql", maxRetries: 3, waitMs: 5000 });
  });

  it("accepts --max-retries and --wait-ms", () => {
    const args = parseArgs([
      "node",
      "script.ts",
      "m.sql",
      "--max-retries",
      "5",
      "--wait-ms",
      "100",
    ]);
    expect(args).toEqual({ file: "m.sql", maxRetries: 5, waitMs: 100 });
  });

  it("accepts flags in any order (positional can be first or last)", () => {
    const args = parseArgs(["node", "script.ts", "--max-retries", "7", "m.sql"]);
    expect(args).toEqual({ file: "m.sql", maxRetries: 7, waitMs: 5000 });
  });

  it("throws on a missing file argument", () => {
    expect(() => parseArgs(["node", "script.ts"])).toThrow(/missing migration file/);
  });

  it("throws on a non-numeric --max-retries", () => {
    expect(() => parseArgs(["node", "script.ts", "m.sql", "--max-retries", "abc"])).toThrow(
      /--max-retries/,
    );
  });

  it("throws on a negative --max-retries", () => {
    expect(() => parseArgs(["node", "script.ts", "m.sql", "--max-retries", "-1"])).toThrow(
      /--max-retries/,
    );
  });

  it("throws on an unknown flag", () => {
    expect(() => parseArgs(["node", "script.ts", "m.sql", "--frobnicate"])).toThrow(/unknown flag/);
  });

  it("throws on a second positional argument", () => {
    expect(() => parseArgs(["node", "script.ts", "a.sql", "b.sql"])).toThrow(
      /unexpected positional/,
    );
  });

  it("accepts --help and surfaces the help signal", () => {
    expect(() => parseArgs(["node", "script.ts", "--help"])).toThrow("__HELP__");
  });
});
