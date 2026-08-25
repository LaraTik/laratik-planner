import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import migrationJournal from "@/lib/db/migrations/meta/_journal.json";

const TAG = "0018_platform_access_roles";
const migrationPath = join(process.cwd(), "src", "lib", "db", "migrations", `${TAG}.sql`);

describe("platform access role migration", () => {
  it("is the newest migration at the time it was authored (subsequent migrations are allowed to follow)", () => {
    // M4.6 (hard cutover) added `0019_agency_social_provider_config`
    // after this test was written. The migration must still be
    // present and the test must still validate the same invariants
    // (closed CHECK, additive for old app images, etc.), but it
    // is no longer the *most recent* migration. We pin the
    // `0018_platform_access_roles` row in the journal, then assert
    // its timestamp is greater than its predecessor and that the
    // entries after it (if any) are strictly monotonic.
    const idx = migrationJournal.entries.findIndex((entry) => entry.tag === TAG);
    expect(idx).toBeGreaterThan(-1);
    if (idx < 0) return;
    const entry = migrationJournal.entries[idx]!;
    expect(entry.when).toBeGreaterThan(migrationJournal.entries[idx - 1]!.when);
    for (let i = idx + 1; i < migrationJournal.entries.length; i += 1) {
      expect(migrationJournal.entries[i]!.when).toBeGreaterThan(entry.when);
    }
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
