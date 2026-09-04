import { describe, it, expect, beforeAll, beforeEach } from "vitest";
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * FEAT-AUDIT-R2 — the two previously-dead enqueue helpers
 * (`enqueueReplyNotification`, `enqueueUnresolvedQuestionNotification`)
 * are now called from `createComment` and `resolveComment`. This
 * test pins the behaviour so a future refactor that drops the
 * enqueue calls is caught.
 */
describe("R2 — reply + unresolved_question enqueue wiring", () => {
  let createComment: typeof import("@/lib/discussions/service").createComment;
  let resolveComment: typeof import("@/lib/discussions/service").resolveComment;
  let dispatchOutboxOnce: typeof import("@/lib/notifications/service").dispatchOutboxOnce;

  let actorId: string;
  let secondUserId: string;
  let workspaceId: string;
  let contentItemId: string;

  beforeAll(async () => {
    const ds = await import("@/lib/discussions/service");
    createComment = ds.createComment;
    resolveComment = ds.resolveComment;
    const svc = await import("@/lib/notifications/service");
    dispatchOutboxOnce = svc.dispatchOutboxOnce;

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
        email: `r2-actor-${stamp}@laratik.local`,
        name: "R2 Actor",
        displayName: "R2Actor",
        role: "agency_admin",
        emailVerified: new Date(),
      })
      .returning();
    if (!actor) throw new Error("actor seed failed");
    actorId = actor.id;

    const [second] = await db
      .insert(users)
      .values({
        email: `r2-second-${stamp}@laratik.local`,
        name: "R2 Second",
        displayName: "R2Second",
        role: "user",
        emailVerified: new Date(),
      })
      .returning();
    if (!second) throw new Error("second seed failed");
    secondUserId = second.id;

    const [agency] = await db
      .insert(agencies)
      .values({ name: "R2 Agency", slug: `r2-agency-${stamp}` })
      .returning();
    if (!agency) throw new Error("agency seed failed");
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: actorId,
      status: "active",
      isAgencyAdmin: true,
    });
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: secondUserId,
      status: "active",
      isAgencyAdmin: false,
    });

    const [ws] = await db
      .insert(workspaces)
      .values({
        agencyId: agency.id,
        slug: `r2-ws-${stamp}`,
        name: "R2 WS",
        createdBy: actorId,
      })
      .returning();
    if (!ws) throw new Error("workspace seed failed");
    workspaceId = ws.id;

    // Add both users to the workspace so the membership check inside
    // createComment passes for both.
    for (const userId of [actorId, secondUserId]) {
      const [m] = await db
        .insert(workspaceMemberships)
        .values({ workspaceId, userId, status: "active" })
        .returning();
      if (!m) throw new Error("membership seed failed");
      await db.insert(workspaceMembershipRoles).values({
        workspaceMembershipId: m.id,
        role: "internal_reviewer",
      });
    }
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { contentItems } = await import("@/lib/db/schema");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      TRUNCATE
        notification, outbox_event,
        comment_mention, comment,
        content_item
      RESTART IDENTITY CASCADE
    `);

    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: `R2 Test ${Date.now()}`,
        format: "static_post",
        brief: "",
        plannedPublishAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        contentOwnerId: actorId,
        createdBy: actorId,
      })
      .returning();
    if (!item) throw new Error("content item seed failed");
    contentItemId = item.id;
  });

  async function flushOutbox() {
    await dispatchOutboxOnce({ now: new Date() });
  }

  it("reply comment writes a `reply` outbox event + a notification row for the parent author", async () => {
    // Parent authored by `second`.
    const parent = await createComment(
      { id: secondUserId },
      { contentItemId, body: "Original thread root", visibility: "internal" },
    );
    // Reply authored by `actor`.
    await createComment(
      { id: actorId },
      {
        contentItemId,
        body: "Replying to your thread",
        visibility: "internal",
        parentCommentId: parent.id,
      },
    );

    const { db } = await import("@/lib/db");
    const { outboxEvents, notifications } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");

    // Drain the outbox. The reply helper inserts an outbox event with
    // eventType = "reply"; the dispatcher should fan it out to a
    // `notification` row addressed to the parent author.
    await flushOutbox();

    const replyOutbox = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.eventType, "reply"), eq(outboxEvents.aggregateType, "comment")));
    expect(replyOutbox.length).toBe(1);

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, secondUserId));
    expect(notifs.length).toBe(1);
    expect(notifs[0]?.kind).toBe("reply");
    // The actionUrl should deep-link to the discussion anchor.
    expect(notifs[0]?.actionUrl).toMatch(/#discussion$/);
  });

  it("question label writes an `unresolved_question` outbox event + notification for each mentionee", async () => {
    // The second user is a member, so we can mention them.
    const second = await import("@/lib/db");
    // mention via the structured picker (no body text change)
    await createComment(
      { id: actorId },
      {
        contentItemId,
        body: "Could you clarify the caption?",
        visibility: "internal",
        label: "question",
      },
      [secondUserId],
    );

    const { db } = await import("@/lib/db");
    const { outboxEvents, notifications } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");

    await flushOutbox();

    const unresOutbox = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, "unresolved_question"),
          eq(outboxEvents.aggregateType, "comment"),
        ),
      );
    expect(unresOutbox.length).toBe(1);

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, secondUserId));
    expect(notifs.some((n) => n.kind === "unresolved_question")).toBe(true);
    void second; // satisfy linter if unused
  });

  it("re-opening a question comment re-notifies each mentionee", async () => {
    const created = await createComment(
      { id: actorId },
      {
        contentItemId,
        body: "Original question",
        visibility: "internal",
        label: "question",
      },
      [secondUserId],
    );
    // Resolve, then re-open.
    await resolveComment({ id: actorId }, { commentId: created.id, resolved: true });
    await resolveComment({ id: actorId }, { commentId: created.id, resolved: false });

    const { db } = await import("@/lib/db");
    const { outboxEvents, notifications } = await import("@/lib/db/schema");
    const { and, eq, count } = await import("drizzle-orm");

    await flushOutbox();

    // Two unresolved_question events: one from createComment, one
    // from the re-open.
    const unresOutbox = await db
      .select({ n: count() })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, "unresolved_question"),
          eq(outboxEvents.aggregateType, "comment"),
        ),
      );
    expect(unresOutbox[0]?.n).toBe(2);

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, secondUserId));
    expect(notifs.filter((n) => n.kind === "unresolved_question").length).toBe(2);
  });
});
