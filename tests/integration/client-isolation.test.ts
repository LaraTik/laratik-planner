import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("client workspace isolation", () => {
  let getAccessibleWorkspace: typeof import("@/lib/workspaces/context").getAccessibleWorkspace;
  let getClientWorkspace: typeof import("@/lib/workspaces/context").getClientWorkspace;
  let getContentItem: typeof import("@/lib/content/service").getContentItem;
  let listWorkspaceContent: typeof import("@/lib/content/service").listWorkspaceContent;
  let updateWorkspaceSettings: typeof import("@/lib/workspaces/settings-service").updateWorkspaceSettings;

  let workspaceId: string;
  let agencyId: string;
  let contentItemId: string;
  let internalUserId: string;
  let clientUserId: string;

  beforeAll(async () => {
    ({ getAccessibleWorkspace, getClientWorkspace } = await import("@/lib/workspaces/context"));
    ({ getContentItem, listWorkspaceContent } = await import("@/lib/content/service"));
    ({ updateWorkspaceSettings } = await import("@/lib/workspaces/settings-service"));
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const {
      agencies,
      agencyMemberships,
      contentItems,
      users,
      workspaceMembershipRoles,
      workspaceMemberships,
      workspaces,
    } = await import("@/lib/db/schema");
    const { sql } = await import("drizzle-orm");

    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Isolation Agency", slug: "isolation-agency" })
      .returning();
    const [internalUser] = await db
      .insert(users)
      .values({
        email: "internal@isolation.test",
        displayName: "Internal Reviewer",
        emailVerified: new Date(),
      })
      .returning();
    const [clientUser] = await db
      .insert(users)
      .values({
        email: "client@isolation.test",
        displayName: "Client Reviewer",
        emailVerified: new Date(),
      })
      .returning();
    if (!agency || !internalUser || !clientUser) throw new Error("Failed to seed users");
    agencyId = agency.id;
    internalUserId = internalUser.id;
    clientUserId = clientUser.id;

    await db.insert(agencyMemberships).values([
      { agencyId: agency.id, userId: internalUserId, status: "active" },
      { agencyId: agency.id, userId: clientUserId, status: "active" },
    ]);
    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency.id,
        name: "Acme",
        slug: "acme",
        createdBy: internalUserId,
      })
      .returning();
    if (!workspace) throw new Error("Failed to seed workspace");
    workspaceId = workspace.id;

    const memberships = await db
      .insert(workspaceMemberships)
      .values([
        { workspaceId, userId: internalUserId, status: "active" },
        { workspaceId, userId: clientUserId, status: "active" },
      ])
      .returning();
    const internalMembership = memberships.find((row) => row.userId === internalUserId);
    const clientMembership = memberships.find((row) => row.userId === clientUserId);
    if (!internalMembership || !clientMembership) throw new Error("Failed to seed memberships");
    await db.insert(workspaceMembershipRoles).values([
      { workspaceMembershipId: internalMembership.id, role: "workspace_manager" },
      { workspaceMembershipId: clientMembership.id, role: "client_reviewer" },
    ]);

    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: "Internal launch brief",
        format: "static_post",
        brief: "Private internal strategy",
        plannedPublishAt: new Date(Date.now() + 86_400_000),
        contentOwnerId: internalUserId,
        createdBy: internalUserId,
      })
      .returning();
    if (!item) throw new Error("Failed to seed content");
    contentItemId = item.id;
  });

  it("allows an internal role into internal workspace and content queries", async () => {
    const actor = { id: internalUserId };
    await expect(getAccessibleWorkspace(actor, "acme", agencyId)).resolves.toMatchObject({
      id: workspaceId,
    });
    await expect(listWorkspaceContent(actor, workspaceId)).resolves.toHaveLength(1);
    await expect(getContentItem(actor, contentItemId)).resolves.toMatchObject({
      id: contentItemId,
      brief: "Private internal strategy",
    });
  });

  it("allows a client-only role only through the client workspace boundary", async () => {
    const actor = { id: clientUserId };
    await expect(getClientWorkspace(actor, "acme", agencyId)).resolves.toMatchObject({
      id: workspaceId,
    });
    await expect(getAccessibleWorkspace(actor, "acme", agencyId)).resolves.toBeNull();
    await expect(listWorkspaceContent(actor, workspaceId)).rejects.toThrow(/permission denied/i);
    await expect(getContentItem(actor, contentItemId)).rejects.toThrow(/permission denied/i);
  });

  it("lets a manager save validated defaults but rejects a client reviewer", async () => {
    const command = {
      workspaceId,
      timezone: "Europe/Vienna",
      approvalMode: "simple" as const,
      monthlyTarget: 24,
      contentApprovalLeadDays: 10,
      designCompleteLeadDays: 5,
      creativeApprovalLeadDays: 2,
      readyToPublishLeadDays: 1,
      defaultDesignerId: null,
      defaultContentReviewerId: null,
      defaultInternalCreativeReviewerId: null,
      defaultClientReviewerId: null,
    };
    await expect(updateWorkspaceSettings({ id: internalUserId }, command)).resolves.toEqual({
      ok: true,
    });
    await expect(updateWorkspaceSettings({ id: clientUserId }, command)).rejects.toThrow(
      /permission denied/i,
    );

    const { db } = await import("@/lib/db");
    const { workspaceSettings, workspaces } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    const [workspace] = await db
      .select({ timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    expect(settings).toMatchObject({ monthlyTarget: 24, approvalMode: "simple" });
    expect(workspace?.timezone).toBe("Europe/Vienna");
  });
});
