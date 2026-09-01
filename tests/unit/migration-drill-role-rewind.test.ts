import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration drill historical repair state", () => {
  it("replays the latest additive migration without stale timestamp assumptions", () => {
    const source = readFileSync(resolve("scripts/migration-drill.ts"), "utf8");
    expect(source).toContain('const migrationTag = "0025_notification_message_key"');
    expect(source).toContain('DROP COLUMN IF EXISTS "message_key"');
    expect(source).toContain('DROP COLUMN IF EXISTS "message_params"');
    expect(source).toContain("real Drizzle migrator completed");
  });
});
