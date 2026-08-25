import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import migrationJournal from "@/lib/db/migrations/meta/_journal.json";

const KNOWN_OUT_OF_ORDER_TAG = "0012_support_access_grants";
const REPAIR_TAG = "0017_repair_support_access_grants";

describe("Drizzle migration journal ordering", () => {
  it("keeps snapshot ancestry linear so drizzle-kit can generate the next migration", () => {
    const metaDir = join(process.cwd(), "src", "lib", "db", "migrations", "meta");
    const snapshots = readdirSync(metaDir)
      .filter((name) => name.endsWith("_snapshot.json"))
      .map(
        (name) =>
          JSON.parse(readFileSync(join(metaDir, name), "utf8")) as {
            id: string;
            prevId: string;
          },
      );
    const childrenByParent = new Map<string, number>();
    for (const snapshot of snapshots) {
      childrenByParent.set(snapshot.prevId, (childrenByParent.get(snapshot.prevId) ?? 0) + 1);
    }
    expect([...childrenByParent.entries()].filter(([, count]) => count > 1)).toEqual([]);
  });

  it("contains no timestamp inversion except the known 0012 incident", () => {
    let latestSeen = Number.NEGATIVE_INFINITY;
    const inversions: string[] = [];

    for (const entry of migrationJournal.entries) {
      if (entry.when <= latestSeen) inversions.push(entry.tag);
      latestSeen = Math.max(latestSeen, entry.when);
    }

    expect(inversions).toEqual([KNOWN_OUT_OF_ORDER_TAG]);
  });

  it("has a newer forward repair for the skipped 0012 migration", () => {
    const repairIndex = migrationJournal.entries.findIndex((entry) => entry.tag === REPAIR_TAG);
    expect(repairIndex).toBeGreaterThan(-1);
    if (repairIndex < 0) return;

    const repairEntry = migrationJournal.entries[repairIndex]!;
    const newestPriorTimestamp = Math.max(
      ...migrationJournal.entries.slice(0, repairIndex).map((entry) => entry.when),
    );
    expect(repairEntry.when).toBeGreaterThan(newestPriorTimestamp);

    const repairPath = join(process.cwd(), "src", "lib", "db", "migrations", `${REPAIR_TAG}.sql`);
    expect(existsSync(repairPath)).toBe(true);
    if (!existsSync(repairPath)) return;

    const repairSql = readFileSync(repairPath, "utf8");
    expect(repairSql).toContain('CREATE TABLE IF NOT EXISTS "support_access_request"');
    expect(repairSql).toContain('CREATE TABLE IF NOT EXISTS "support_access_grant"');
    expect(repairSql).toContain('CREATE TABLE IF NOT EXISTS "support_access_audit"');
    expect(repairSql).toContain('CREATE TABLE IF NOT EXISTS "ai_daily_budget_usage"');
  });

  it("keeps every migration after the repair strictly monotonic", () => {
    const repairIndex = migrationJournal.entries.findIndex((entry) => entry.tag === REPAIR_TAG);
    expect(repairIndex).toBeGreaterThan(-1);
    if (repairIndex < 0) return;

    const entries = migrationJournal.entries.slice(repairIndex);
    for (let index = 1; index < entries.length; index += 1) {
      expect(entries[index]!.when).toBeGreaterThan(entries[index - 1]!.when);
    }
  });
});
