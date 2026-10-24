import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { agencies, contentItems, outboxEvents, users, workspaces } from "@/lib/db/schema";
import { dispatchDeadlineReminders } from "@/features/content/server";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
});

afterAll(async () => {
  await pool.end();
});

async function seedReminderItem(input: {
  plannedPublishAt: Date;
  status?: "draft" | "ready_to_publish";
  archived?: boolean;
  duplicateAssignees?: boolean;
}) {
  const stamp = randomUUID();
  const [agency] = await db
    .insert(agencies)
    .values({ name: "Reminder agency", slug: `reminder-${stamp}` })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({ email: `reminder-${stamp}@example.test`, displayName: "Reminder owner" })
    .returning();
  if (!agency || !owner) throw new Error("failed to create deadline reminder fixture");
  const [designer] = input.duplicateAssignees
    ? [owner]
    : await db
        .insert(users)
        .values({ email: `designer-${stamp}@example.test`, displayName: "Designer" })
        .returning();
  if (!designer) throw new Error("failed to create reminder designer fixture");
  const [workspace] = await db
    .insert(workspaces)
    .values({
      agencyId: agency.id,
      name: "Reminder workspace",
      slug: `reminder-${stamp}`,
      createdBy: owner.id,
    })
    .returning();
  if (!workspace) throw new Error("failed to create reminder workspace fixture");
  const [item] = await db
    .insert(contentItems)
    .values({
      workspaceId: workspace.id,
      title: "Upcoming post",
      format: "static_post",
      plannedPublishAt: input.plannedPublishAt,
      status: input.status ?? "draft",
      archivedAt: input.archived ? new Date() : null,
      contentOwnerId: owner.id,
      designerId: designer.id,
      createdBy: owner.id,
    })
    .returning();
  if (!item) throw new Error("failed to create reminder item fixture");
  return item;
}

describe("deadline reminders", () => {
  it("queues once for distinct assignees and deduplicates repeat runs", async () => {
    const now = new Date();
    const item = await seedReminderItem({
      plannedPublishAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      duplicateAssignees: true,
    });

    const first = await dispatchDeadlineReminders({ now, windowHours: 3 });
    const second = await dispatchDeadlineReminders({ now, windowHours: 3 });
    const events = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.eventType, "deadline"), eq(outboxEvents.aggregateId, item.id)));

    expect(first.enqueued).toBeGreaterThanOrEqual(1);
    expect(first.skipped).toBe(false);
    expect(second.enqueued).toBe(0);
    expect(second.skipped).toBe(false);
    expect(events).toHaveLength(1);
  });

  it("excludes closed, archived, and out-of-window content", async () => {
    const now = new Date();
    const closed = await seedReminderItem({
      plannedPublishAt: new Date(now.getTime() + 60 * 60 * 1000),
      status: "ready_to_publish",
    });
    const archived = await seedReminderItem({
      plannedPublishAt: new Date(now.getTime() + 60 * 60 * 1000),
      archived: true,
    });
    const future = await seedReminderItem({
      plannedPublishAt: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
    });

    await dispatchDeadlineReminders({ now });
    const events = await db
      .select()
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.eventType, "deadline"), eq(outboxEvents.aggregateType, "content_item")),
      );

    expect(events.map((event) => event.aggregateId)).not.toEqual(
      expect.arrayContaining([closed.id, archived.id, future.id]),
    );
  });

  it("keeps overlapping cron ticks from enqueueing duplicate events", async () => {
    const now = new Date();
    const item = await seedReminderItem({
      plannedPublishAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      duplicateAssignees: true,
    });

    const results = await Promise.all([
      dispatchDeadlineReminders({ now, windowHours: 3 }),
      dispatchDeadlineReminders({ now, windowHours: 3 }),
    ]);
    const events = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.eventType, "deadline"), eq(outboxEvents.aggregateId, item.id)));

    expect(results.reduce((total, result) => total + result.enqueued, 0)).toBe(1);
    expect(events).toHaveLength(1);
  });
});
