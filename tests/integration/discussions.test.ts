import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env") });

// Skip the entire suite if no test database is configured.
const HAS_DB = !!process.env.DATABASE_URL;

(HAS_DB ? describe : describe.skip)("discussions service", () => {
  let createComment: typeof import("@/lib/discussions/service").createComment;
  let listCommentsForItem: typeof import("@/lib/discussions/service").listCommentsForItem;
  let resolveComment: typeof import("@/lib/discussions/service").resolveComment;
  let countOpenCommentsForItem: typeof import("@/lib/discussions/service").countOpenCommentsForItem;

  let actor: { id: string };
  let workspaceId: string;
  let contentItemId: string;
  let secondUserId: string;

  beforeAll(async () => {
    const ds = await import("@/lib/discussions/service");
    createComment = ds.createComment;
    listCommentsForItem = ds.listCommentsForItem;
    resolveComment = ds.resolveComment;
    countOpenCommentsForItem = ds.countOpenCommentsForItem;

    const { db } = await import("@/lib/db");
    const { users, workspaces, workspaceMemberships, workspaceMembershipRoles } =
      await import("@/lib/db/schema");
    const { sql, eq } = await import("drizzle-orm");

    // Use the singleton agency from dev/seed
    const agencyRows = await db
      .select({ id: workspaces.agencyId })
      .from(workspaces)
      .where(sql`true`)
      .limit(1);
    if (!agencyRows[0]) throw new Error("No agency found — run /api/dev/seed first");

    // Use the seeded "acme" workspace
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, "acme")).limit(1);
    if (!ws) throw new Error("No 'acme' workspace found — run /api/dev/seed first");
    workspaceId = ws.id;

    // Use the seeded test@laratik.local user
    const [actorRow] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = 'test@laratik.local'`)
      .limit(1);
    if (!actorRow) throw new Error("No test user found — run /api/dev/seed first");
    actor = { id: actorRow.id };

    // Create a second user + add them to the workspace so we can test @mentions
    const secondEmail = `e2e-mention-${Date.now()}@laratik.local`;
    const [second] = await db
      .insert(users)
      .values({
        email: secondEmail,
        name: "Mention Target",
        displayName: "MentionTarget",
        role: "user",
        emailVerified: new Date(),
      })
      .returning();
    if (!second) throw new Error("Failed to create second user");
    secondUserId = second.id;

    const [m] = await db
      .insert(workspaceMemberships)
      .values({ workspaceId, userId: secondUserId, status: "active" })
      .returning();
    await db.insert(workspaceMembershipRoles).values({
      workspaceMembershipId: m!.id,
      role: "internal_reviewer",
    });
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { contentItems } = await import("@/lib/db/schema");
    // Create a fresh content item per test
    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: `E2E Discussion Test ${Date.now()}`,
        format: "static_post",
        brief: "",
        plannedPublishAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        contentOwnerId: actor!.id,
        createdBy: actor!.id,
      })
      .returning();
    if (!item) throw new Error("Failed to create content item");
    contentItemId = item.id;
  });

  it("creates a top-level comment with a mention and resolves to in-app mention notification", async () => {
    const created = await createComment(actor, {
      contentItemId,
      body: `Hey @MentionTarget — please review this draft.`,
      visibility: "internal",
    });
    expect(created.id).toBeTruthy();
    expect(created.mentionedUserIds).toContain(secondUserId);

    // Outbox row should exist for this comment
    const { db } = await import("@/lib/db");
    const { outboxEvents, notifications } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const events = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, "comment_created"),
          eq(outboxEvents.aggregateId, created.id),
        ),
      );
    expect(events.length).toBe(1);

    // Run the dispatcher — should create a notification for the second user
    const { dispatchOutboxOnce } = await import("@/lib/notifications/service");
    await dispatchOutboxOnce();

    const note = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, secondUserId), eq(notifications.kind, "mention")));
    expect(note.length).toBeGreaterThan(0);
  });

  it("blocks a reply to an internal comment from being client-visible", async () => {
    const parent = await createComment(actor, {
      contentItemId,
      body: "Internal thread root.",
      visibility: "internal",
    });
    await expect(
      createComment(actor, {
        contentItemId,
        parentCommentId: parent.id,
        body: "Client-visible reply to internal — should fail.",
        visibility: "client",
      }),
    ).rejects.toThrow(/internal/i);
  });

  it("resolves a comment (and un-resolves it)", async () => {
    const created = await createComment(actor, {
      contentItemId,
      body: "Will be resolved.",
      visibility: "internal",
    });
    await resolveComment(actor, { commentId: created.id, resolved: true });
    const list = await listCommentsForItem(actor, contentItemId);
    expect(list[0]?.resolvedAt).toBeTruthy();
    const n1 = await countOpenCommentsForItem(actor, contentItemId);
    expect(n1).toBe(0);

    await resolveComment(actor, { commentId: created.id, resolved: false });
    const n2 = await countOpenCommentsForItem(actor, contentItemId);
    expect(n2).toBe(1);
  });

  it("a client-only role cannot post an internal comment", async () => {
    // Promote secondUser to client_reviewer only (and demote any internal role)
    const { db } = await import("@/lib/db");
    const { workspaceMemberships, workspaceMembershipRoles } = await import("@/lib/db/schema");
    const { and, eq, inArray } = await import("drizzle-orm");

    const memberships = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, secondUserId),
        ),
      );
    for (const m of memberships) {
      await db
        .delete(workspaceMembershipRoles)
        .where(
          and(
            eq(workspaceMembershipRoles.workspaceMembershipId, m.id),
            inArray(workspaceMembershipRoles.role, [
              "internal_reviewer",
              "workspace_manager",
              "content_planner",
              "designer",
              "publisher",
            ]),
          ),
        );
      await db.insert(workspaceMembershipRoles).values({
        workspaceMembershipId: m.id,
        role: "client_reviewer",
      });
    }

    await expect(
      createComment(
        { id: secondUserId },
        {
          contentItemId,
          body: "Trying to post internal from a client-only role.",
          visibility: "internal",
        },
      ),
    ).rejects.toThrow(/client-visible/i);
  });
});
