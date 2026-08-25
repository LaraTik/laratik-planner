import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import migrationJournal from "@/lib/db/migrations/meta/_journal.json";

const TAG = "0018_platform_access_roles";
const migrationPath = join(process.cwd(), "src", "lib", "db", "migrations", `${TAG}.sql`);

describe("platform access role migration", () => {
  it("is the newest strictly monotonic migration", () => {
    const entry = migrationJournal.entries.at(-1);
    expect(entry?.tag).toBe(TAG);
    expect(entry!.when).toBeGreaterThan(migrationJournal.entries.at(-2)!.when);
  });

  it("backfills existing rows to Owner with a closed database constraint", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migrationSql = readFileSync(migrationPath, "utf8");
    expect(migrationSql).toContain('ADD COLUMN "role" text');
    expect(migrationSql).toContain("DEFAULT 'platform_owner'");
    expect(migrationSql).toContain("platform_administrator_role_check");
    for (const role of [
      "platform_owner",
      "agency_operator",
      "platform_auditor",
      "support_operator",
    ]) {
      expect(migrationSql).toContain(`'${role}'`);
    }
  });

  it("keeps the migration additive for old application images", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migrationSql = readFileSync(migrationPath, "utf8");
    expect(migrationSql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(migrationSql).toContain('ADD COLUMN "updated_at"');
    expect(migrationSql).toContain("platform_administrator_active_role_idx");
  });
});
