import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * FEAT-AUDIT-R7 — workspace-only notification path. The refactor
 * dropped the duplicate preference check in `fanOutSingleRecipient`'s
 * `else` branch and routed everything through `maybeNotify`. The
 * single dispatch path is now:
 *
 *   1. dispatcher reads the outbox payload
 *   2. fanOutSingleRecipient calls maybeNotify regardless of
 *      whether contentItemId is present
 *   3. maybeNotify checks the preference, then calls
 *      createInAppNotification with the actionUrl fallback
 *
 * This test pins (1)+(2)+(3) for a payload that omits
 * contentItemId. Without R7, a payload like this would fall
 * through to the `else` branch, which has a separate
 * preference check that could drift.
 */

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for R7 test");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("R7 — workspace-only notification path through maybeNotify", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    const {
      users,
      workspaces,
      workspaceMemberships,
      workspaceMembershipRoles,
      agencies,
      agencyMemberships,
    } = await import("@/lib/db/schema");
    const { sql } = await import("drizzle-orm");

    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);

    const stamp = Date.now();
    const [actor] = await db
      .insert(users)
      .values({
        email: `r7-actor-${stamp}@laratik.local`,
        name: "R7 Actor",
        displayName: "R7Actor",
        role: "agency_admin",
        emailVerified: new Date(),
      })
      .returning();
    if (!actor) throw new Error("actor seed failed");

    const [agency] = await db
      .insert(agencies)
      .values({ name: "R7 Agency", slug: `r7-agency-${stamp}` })
      .returning();
    if (!agency) throw new Error("agency seed failed");
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: actor.id,
      status: "active",
      isAgencyAdmin: true,
    });

    const [ws] = await db
      .insert(workspaces)
      .values({
        agencyId: agency.id,
        slug: `r7-ws-${stamp}`,
        name: "R7 WS",
        createdBy: actor.id,
      })
      .returning();
    if (!ws) throw new Error("workspace seed failed");
    workspaceId = ws.id;
    const [m] = await db
      .insert(workspaceMemberships)
      .values({ workspaceId: ws.id, userId: actor.id, status: "active" })
      .returning();
    if (!m) throw new Error("membership seed failed");
    await db.insert(workspaceMembershipRoles).values({
      workspaceMembershipId: m.id,
      role: "internal_reviewer",
    });
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      TRUNCATE outbox_event, notification, notification_preference
      RESTART IDENTITY CASCADE
    `);
  });

  it("writes a notification row for a workspace-scoped outbox event without contentItemId", async () => {
    const { db } = await import("@/lib/db");
    const { outboxEvents, users } = await import("@/lib/db/schema");

    const [user] = await db.select({ id: users.id }).from(users).limit(1);
    if (!user) throw new Error("user seed failed");

    // Insert an outbox event with no `contentItemId` field. This
    // is the workspace-only case the R7 refactor needs to handle.
    await db.insert(outboxEvents).values({
      eventType: "comment_created",
      aggregateType: "comment",
      aggregateId: user.id,
      payload: {
        userId: user.id,
        workspaceId,
        title: "Workspace-scoped test",
        body: "no contentItemId",
        // Intentionally no `contentItemId` here.
      },
    });

    const { dispatchOutboxOnce } = await import("@/lib/notifications/service");
    await dispatchOutboxOnce();

    // Without R7, the else branch would write the row directly.
    // With R7, the row still lands via maybeNotify (just routed
    // through the single dispatch path). Either way, the row
    // exists; the assertion is that the workspaceId is set
    // (workspace-scoped → row's workspaceId column is filled) and
    // the contentItemId column is null.
    const { notifications } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [notif] = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(notif).toBeDefined();
    expect(notif?.contentItemId).toBeNull();
    expect(notif?.workspaceId).not.toBeNull();
  });

  it("respects the inAppEnabled preference for a workspace-only event", async () => {
    // The same dispatch path goes through maybeNotify which
    // consults `notification_preferences.inAppEnabled`. A
    // workspace-only event with inAppEnabled = false must not
    // produce a row.
    const { db } = await import("@/lib/db");
    const { outboxEvents, users, notificationPreferences } = await import("@/lib/db/schema");

    const [user] = await db.select({ id: users.id }).from(users).limit(1);
    if (!user) throw new Error("user seed failed");

    await db.insert(notificationPreferences).values({
      userId: user.id,
      kind: "mention",
      inAppEnabled: false,
    });

    await db.insert(outboxEvents).values({
      eventType: "comment_created",
      aggregateType: "comment",
      aggregateId: user.id,
      payload: {
        userId: user.id,
        workspaceId,
        title: "should be suppressed",
        body: "no row should land",
        messageKey: "notifications.kind.mention",
        // No contentItemId again.
      },
    });

    const { dispatchOutboxOnce } = await import("@/lib/notifications/service");
    await dispatchOutboxOnce();

    const { notifications } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(rows.length).toBe(0);
  });

  it("preserves the event kind for workspace-only non-comment events", async () => {
    const { db } = await import("@/lib/db");
    const { outboxEvents, users, notifications } = await import("@/lib/db/schema");

    const [user] = await db.select({ id: users.id }).from(users).limit(1);
    if (!user) throw new Error("user seed failed");

    await db.insert(outboxEvents).values({
      eventType: "assignment",
      aggregateType: "workspace",
      aggregateId: workspaceId,
      payload: {
        userId: user.id,
        workspaceId,
        title: "Workspace assignment",
        body: "A workspace-level assignment is waiting.",
      },
    });

    const { dispatchOutboxOnce } = await import("@/lib/notifications/service");
    await dispatchOutboxOnce();

    const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("assignment");
    expect(rows[0]?.contentItemId).toBeNull();
    expect(rows[0]?.workspaceId).toBe(workspaceId);
  });
});
