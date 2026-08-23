import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
