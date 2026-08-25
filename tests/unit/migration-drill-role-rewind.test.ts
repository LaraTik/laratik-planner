import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration drill historical repair state", () => {
  it("rewinds post-repair 0018 before reproducing the skipped-0012 incident", () => {
    const source = readFileSync(resolve("scripts/migration-drill.ts"), "utf8");
    expect(source).toContain("platformRolesTimestamp = 1788600000000");
    expect(source).toContain('DROP CONSTRAINT IF EXISTS "platform_administrator_role_check"');
    expect(source).toContain('DROP COLUMN IF EXISTS "role"');
    expect(source).toContain('DROP COLUMN IF EXISTS "updated_at"');
    expect(source).toContain("unexpected post-repair migration timestamps");
    expect(source).toContain("0018 ledger rows=${platformRoleLedgerRows}");
  });
});
