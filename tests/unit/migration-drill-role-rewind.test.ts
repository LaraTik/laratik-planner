import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration drill historical repair state", () => {
  it("replays the latest additive migration without stale timestamp assumptions", () => {
    const source = readFileSync(resolve("scripts/migration-drill.ts"), "utf8");
    expect(source).toContain('const migrationTag = "0025_notification_message_key"');
    expect(source).toContain('DROP COLUMN IF EXISTS "message_key"');
    expect(source).toContain('DROP COLUMN IF EXISTS "message_params"');
    expect(source).toContain('DROP TABLE IF EXISTS "workspace_assistant_proposal" CASCADE');
    expect(source).toContain('DROP TABLE IF EXISTS "workspace_assistant_run_event" CASCADE');
    expect(source).toContain('DROP TABLE IF EXISTS "workspace_assistant_run" CASCADE');
    expect(source).toContain('DROP TABLE IF EXISTS "workspace_assistant_prompt_revision" CASCADE');
    expect(source).toContain('DROP TABLE IF EXISTS "workspace_assistant_skill_revision" CASCADE');
    expect(source).toContain('DROP TABLE IF EXISTS "workspace_assistant_skill" CASCADE');
    expect(source).toContain('DROP TABLE IF EXISTS "workspace_assistant_conversation" CASCADE');
    expect(source).toContain("real Drizzle migrator completed");
  });
});
