import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FEAT-AUDIT-R6 — DLQ guard. The email dispatcher must stop
 * retrying after 5 failed attempts and mark the row poisoned so
 * the cron doesn't spin forever on a permanently broken
 * recipient. This test mocks `@/lib/email` to force `sendEmail`
 * to always throw, runs `dispatchEmailOnce` five times, and
 * asserts the email delivery is marked processed with a
 * `[poisoned]` prefix without touching in-app delivery state.
 */

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for DLQ test");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const sendEmailMock = vi.fn(async () => {
  throw new Error("simulated SMTP failure");
});
vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

describe("R6 — dispatchEmailOnce DLQ guard", () => {
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
        email: `dlq-actor-${stamp}@laratik.local`,
        name: "DLQ Actor",
        displayName: "DLQActor",
        role: "agency_admin",
        emailVerified: new Date(),
      })
      .returning();
    if (!actor) throw new Error("actor seed failed");

    const [agency] = await db
      .insert(agencies)
      .values({ name: "DLQ Agency", slug: `dlq-agency-${stamp}` })
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
        slug: `dlq-ws-${stamp}`,
        name: "DLQ WS",
        createdBy: actor.id,
      })
      .returning();
    if (!ws) throw new Error("workspace seed failed");

    // Membership: needed so the workspace-scoped test machinery
    // resolves the user correctly.
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
    sendEmailMock.mockClear();
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE outbox_event, notification RESTART IDENTITY CASCADE`);
  });

  it("marks a row poisoned after 5 failed send attempts", async () => {
    // The dispatcher reads users.email + users.locale inside the
    // same select (R5), so the user's email + locale must be on
    // the row. We need an outbox event that survives the user's
    // `emailEnabled` preference check (or the row is skipped before
    // sendEmail is even called). Insert a `mention` outbox event
    // and pre-flip the preference to opt the user in.
    const { db } = await import("@/lib/db");
    const { outboxEvents, notificationPreferences, users } = await import("@/lib/db/schema");
    const { eq, sql } = await import("drizzle-orm");

    const [user] = await db.select({ id: users.id }).from(users).limit(1);
    if (!user) throw new Error("user seed failed");

    await db.insert(notificationPreferences).values({
      userId: user.id,
      kind: "assignment",
      emailEnabled: true,
    });

    const [outbox] = await db
      .insert(outboxEvents)
      .values({
        eventType: "assignment",
        aggregateType: "content_item",
        aggregateId: user.id,
        payload: {
          userId: user.id,
          title: "DLQ test",
          body: "poison the row",
          messageKey: "notifications.kind.assignment",
        },
      })
      .returning();
    if (!outbox) throw new Error("outbox seed failed");

    // First four ticks: the email delivery stays unprocessed,
    // emailAttemptCount climbs, and in-app state remains independent.
    for (let i = 1; i <= 4; i++) {
      const { dispatchEmailOnce } = await import("@/lib/notifications/service");
      await dispatchEmailOnce();
      const [row] = await db
        .select({
          processedAt: outboxEvents.processedAt,
          emailProcessedAt: outboxEvents.emailProcessedAt,
          attempt: outboxEvents.emailAttemptCount,
        })
        .from(outboxEvents)
        .where(eq(outboxEvents.id, outbox.id));
      expect(row?.processedAt).toBeNull();
      expect(row?.emailProcessedAt).toBeNull();
      expect(row?.attempt).toBe(i);
    }

    // Fifth tick: the per-recipient attempt count reaches 5 and the
    // delivery is marked processed with [poisoned].
    const { dispatchEmailOnce } = await import("@/lib/notifications/service");
    await dispatchEmailOnce();
    const [poisoned] = await db
      .select({
        processedAt: outboxEvents.processedAt,
        emailProcessedAt: outboxEvents.emailProcessedAt,
        attempt: outboxEvents.emailAttemptCount,
        lastError: outboxEvents.emailLastError,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, outbox.id));
    expect(poisoned?.processedAt).toBeNull();
    expect(poisoned?.emailProcessedAt).not.toBeNull();
    expect(poisoned?.attempt).toBe(5);
    expect(poisoned?.lastError).toMatch(/^\[poisoned\] simulated SMTP failure$/);

    // Sixth tick: dispatcher skips the row entirely (no attempt
    // bump, no extra sendEmail call).
    const before = sendEmailMock.mock.calls.length;
    await dispatchEmailOnce();
    const after = sendEmailMock.mock.calls.length;
    expect(after).toBe(before);
    void sql;
  });
});
