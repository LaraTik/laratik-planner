import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for outbox dispatch tests");

process.env.DATABASE_URL = TEST_DB_URL;

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

type Schema = typeof import("@/lib/db/schema");
type Notifications = typeof import("@/lib/notifications/service");

let schema: Schema;
let notifications: Notifications;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  schema = await import("@/lib/db/schema");
  notifications = await import("@/lib/notifications/service");
});

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE
      notification_email_delivery, activity_event, outbox_event, notification,
      notification_preference, content_item, workspace_membership_role,
      workspace_membership, workspace_settings, workspace, agency_membership,
      agency, "user"
    RESTART IDENTITY CASCADE
  `);
});

async function seedWorkspaceNotification() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `outbox-${suffix}@example.com`,
      displayName: "Outbox recipient",
      name: "Outbox recipient",
    })
    .returning();
  if (!user) throw new Error("user seed failed");

  const [agency] = await db
    .insert(schema.agencies)
    .values({ name: "Outbox test agency", slug: `outbox-${suffix}` })
    .returning();
  if (!agency) throw new Error("agency seed failed");

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      agencyId: agency.id,
      name: "Outbox test workspace",
      slug: `outbox-${suffix}`,
      createdBy: user.id,
    })
    .returning();
  if (!workspace) throw new Error("workspace seed failed");

  const [event] = await db
    .insert(schema.outboxEvents)
    .values({
      eventType: "assignment",
      aggregateType: "workspace",
      aggregateId: workspace.id,
      payload: {
        userId: user.id,
        workspaceId: workspace.id,
        title: "Assignment ready",
        body: "A workspace assignment is ready.",
      },
    })
    .returning();
  if (!event) throw new Error("outbox event seed failed");

  return { user, workspace, event };
}

describe("notification outbox dispatch concurrency", () => {
  it("fans out a pending event once when two worker ticks overlap", async () => {
    const { user, event } = await seedWorkspaceNotification();

    // Hold both dispatch transactions inside the fan-out long enough to make
    // the candidate reads overlap. Without row claiming they both insert a
    // notification before either commits processed_at.
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION test_delay_notification_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.2);
        RETURN NEW;
      END;
      $$
    `);
    await db.execute(sql`
      CREATE TRIGGER test_delay_notification_insert
      BEFORE INSERT ON notification
      FOR EACH ROW EXECUTE FUNCTION test_delay_notification_insert()
    `);

    try {
      const results = await Promise.all([
        notifications.dispatchOutboxOnce(),
        notifications.dispatchOutboxOnce(),
      ]);

      expect(results.reduce((total, result) => total + result.processed, 0)).toBe(1);
      const notificationRows = await db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(sql`${schema.notifications.userId} = ${user.id}`);
      expect(notificationRows).toHaveLength(1);

      const [storedEvent] = await db
        .select({ processedAt: schema.outboxEvents.processedAt })
        .from(schema.outboxEvents)
        .where(sql`${schema.outboxEvents.id} = ${event.id}`);
      expect(storedEvent?.processedAt).toBeInstanceOf(Date);
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS test_delay_notification_insert ON notification`);
      await db.execute(sql`DROP FUNCTION IF EXISTS test_delay_notification_insert()`);
    }
  });
});

describe("notification preference transaction boundary", () => {
  it("rolls back earlier preference rows if one kind write fails", async () => {
    const { user } = await seedWorkspaceNotification();
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION test_fail_notification_preference_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.kind::text = 'mention' THEN
          RAISE EXCEPTION 'forced preference write failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await db.execute(sql`
      CREATE TRIGGER test_fail_notification_preference_insert
      BEFORE INSERT ON notification_preference
      FOR EACH ROW EXECUTE FUNCTION test_fail_notification_preference_insert()
    `);

    try {
      await expect(
        notifications.setNotificationPreferencesForUser(user.id, {
          prefs: {
            assignment: { inAppEnabled: true, emailEnabled: false },
            mention: { inAppEnabled: false, emailEnabled: true },
          },
          dailyDigest: false,
        }),
      ).rejects.toThrow(/mention/);

      const savedRows = await db
        .select({ kind: schema.notificationPreferences.kind })
        .from(schema.notificationPreferences)
        .where(sql`${schema.notificationPreferences.userId} = ${user.id}`);
      expect(savedRows).toEqual([]);
    } finally {
      await db.execute(
        sql`DROP TRIGGER IF EXISTS test_fail_notification_preference_insert ON notification_preference`,
      );
      await db.execute(sql`DROP FUNCTION IF EXISTS test_fail_notification_preference_insert()`);
    }
  });
});
