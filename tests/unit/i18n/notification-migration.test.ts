import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(root, "src/lib/db/migrations/0025_notification_message_key.sql"),
  "utf8",
);
const journal = readFileSync(join(root, "src/lib/db/migrations/meta/_journal.json"), "utf8");

describe("notification message-key migration", () => {
  it("targets the exact singular tables used by the Drizzle schema", () => {
    expect(migration).toContain('ALTER TABLE "notification"');
    expect(migration).toContain('ALTER TABLE "activity_event"');
    expect(migration).not.toContain('ALTER TABLE "notifications"');
    expect(migration).not.toContain('ALTER TABLE "activity_events"');
  });

  it("is registered in the Drizzle migration journal", () => {
    expect(journal).toContain('"tag": "0025_notification_message_key"');
  });
});
