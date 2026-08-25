import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @regression-guard  — REGRESSION GUARD, not a behaviour test.
 *
 * TEST-13 (GAP-FULL-REVIEW-2026-08-25): the assertions below read
 * `scripts/migration-drill.ts` as a string and match specific
 * tokens. This is intentionally a brittle source-shape guard.
 *
 * Background: the migration drill (run via
 * `pnpm migration-drill` in CI) was originally happy-path only —
 * it applied migrations, dumped the database, restored it, and
 * assumed everything was fine. A regression in late 2024 silently
 * made the restore skip the `__drizzle_migrations` ledger table,
 * so a restored DB looked healthy but the next `db:migrate` would
 * either re-apply every migration (ledger-empty) or fail outright
 * (ledger-rewound). The two `it` blocks below lock the source
 * shape: the drill must shell out to the real `pnpm db:migrate`
 * (not a mocked Drizzle migrator) and must compare the ledger
 * row count before/after the round-trip.
 *
 * If you are refactoring `scripts/migration-drill.ts` and this
 * test fails: update BOTH the script AND the assertions below.
 * The test is the contract; the source must follow. Do not
 * "fix" the test by loosening the regex — that erases the
 * regression guard.
 */
describe("migration drill ledger safety", () => {
  const source = readFileSync(join(process.cwd(), "scripts", "migration-drill.ts"), "utf8");

  it("applies official migrations through the real Drizzle migrator", () => {
    expect(source).toMatch(/runShell\(\s*"pnpm",\s*\["db:migrate"\]/);
  });

  it("checks that backup and restore preserve the Drizzle migration ledger", () => {
    expect(source).toContain("drizzle.__drizzle_migrations");
    expect(source).toContain("ledgerBefore");
    expect(source).toContain("ledgerAfter");
    expect(source).toMatch(/ledgerAfter\s*===\s*ledgerBefore/);
  });
});
