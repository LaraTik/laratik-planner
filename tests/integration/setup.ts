import { afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: unknown) => fn),
}));

/**
 * TEST-16 (GAP-FULL-REVIEW-2026-08-25) — afterAll teardown that
 * truncates every test table before the next integration test file
 * runs.
 *
 * The per-file `beforeEach` truncate in each test (e.g.
 * `journey.test.ts:40-43`) is the primary safety net, but a test
 * that crashes mid-execution can leave rows behind — and the
 * `beforeEach` of the *next* test only runs if the *current* test
 * file finishes, so a crashed file would carry its data into the
 * next file. The `singleFork: true` integration config serialises
 * test files, so a stale row from one file can poison the first
 * test of the next.
 *
 * The hook below truncates the full table set in a single SQL
 * statement (Postgres handles `RESTART IDENTITY CASCADE` so foreign
 * keys are not a problem). It runs as part of the `setupFiles`
 * array, so it executes once at the end of every test file —
 * Vitest's `setupFile` model guarantees the `afterAll` callback
 * fires before the next file's setup runs.
 */
afterAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    // No test DB configured (e.g. `pnpm vitest` without the
    // integration env). Skip silently so this file is harmless in
    // any other context.
    return;
  }

  // Walk the schema barrel and collect the Drizzle `pgTable` names.
  // The schema barrel re-exports every table as a Drizzle PgTable
  // instance; the actual Postgres table name is on the `_` metadata.
  // The barrel also re-exports enums (no `_.name` string) and
  // helper functions, so we filter to objects that look like
  // Drizzle tables.
  const tableNames: string[] = [];
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object") continue;
    const v = value as { _?: { name?: unknown }; getSQL?: unknown };
    if (typeof v._?.name === "string" && typeof v.getSQL === "function") {
      tableNames.push(v._.name);
    }
  }

  if (tableNames.length === 0) {
    // Schema not loaded (e.g. setupFile ran before the barrel
    // resolved). Nothing to truncate.
    return;
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  try {
    // Quote each identifier to be safe with reserved words / mixed
    // case. The `RESTART IDENTITY CASCADE` form drops sequences and
    // follows foreign keys so a parent–child graph wipes in one shot.
    const quoted = tableNames.map((n) => `"${n.replace(/"/g, '""')}"`).join(", ");
    await db.execute(sql.raw(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`));
  } finally {
    await pool.end();
  }
});
