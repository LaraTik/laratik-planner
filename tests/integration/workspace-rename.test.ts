import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Workspace rename — authorization + persistence against the real
 * schema.
 *
 * The unit suite proves the service's shape with a mocked driver. This
 * file exists for the three things a mock cannot show:
 *   1. the `workspace_rename` audit row actually lands in
 *      `security_audit_event` with the from/to pair;
 *   2. a client reviewer is denied at the policy layer, and a
 *      manager in a *different* agency is denied too — the rename path
 *      must not become a cross-tenant write;
 *   3. renaming does not disturb `slug`, so the workspace keeps
 *      resolving under its original URL.
 */
describe("rename workspace", () => {
  let renameWorkspace: typeof import("@/lib/workspaces/rename-service").renameWorkspace;
  let getAccessibleWorkspace: typeof import("@/lib/workspaces/context").getAccessibleWorkspace;
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/db/schema");
  let drizzle: typeof import("drizzle-orm");

  let workspaceId: string;
  let agencyId: string;
  let otherAgencyId: string;
  let managerUserId: string;
  let clientUserId: string;
  let otherAgencyManagerId: string;

  beforeAll(async () => {
    ({ renameWorkspace } = await import("@/lib/workspaces/rename-service"));
    ({ getAccessibleWorkspace } = await import("@/lib/workspaces/context"));
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    drizzle = await import("drizzle-orm");
  });

  beforeEach(async () => {
    const {
      agencies,
      agencyMemberships,
      users,
      workspaceMembershipRoles,
      workspaceMemberships,
      workspaces,
    } = schema;
    const { sql } = drizzle;

    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);

    const [agency] = await db
      .insert(agencies)
      .values({ name: "Rename Agency", slug: "rename-agency" })
      .returning();
    const [otherAgency] = await db
      .insert(agencies)
      .values({ name: "Other Agency", slug: "other-agency" })
      .returning();
    if (!agency || !otherAgency) throw new Error("Failed to seed agencies");
    agencyId = agency.id;
    otherAgencyId = otherAgency.id;

    const [manager, client, otherManager] = await db
      .insert(users)
      .values([
        {
          email: "manager@rename.test",
          displayName: "Workspace Manager",
          emailVerified: new Date(),
        },
        { email: "client@rename.test", displayName: "Client Reviewer", emailVerified: new Date() },
        {
          email: "other@rename.test",
          displayName: "Other Agency Manager",
          emailVerified: new Date(),
        },
      ])
      .returning();
    if (!manager || !client || !otherManager) throw new Error("Failed to seed users");
    managerUserId = manager.id;
    clientUserId = client.id;
    otherAgencyManagerId = otherManager.id;

    await db.insert(agencyMemberships).values([
      { agencyId, userId: managerUserId, status: "active" },
      { agencyId, userId: clientUserId, status: "active" },
      { agencyId: otherAgencyId, userId: otherAgencyManagerId, status: "active" },
    ]);

    const [workspace] = await db
      .insert(workspaces)
      .values({ agencyId, name: "Acme", slug: "acme", createdBy: managerUserId })
      .returning();
    if (!workspace) throw new Error("Failed to seed workspace");
    workspaceId = workspace.id;

    const memberships = await db
      .insert(workspaceMemberships)
      .values([
        { workspaceId, userId: managerUserId, status: "active" },
        { workspaceId, userId: clientUserId, status: "active" },
      ])
      .returning();
    const managerMembership = memberships.find((row) => row.userId === managerUserId);
    const clientMembership = memberships.find((row) => row.userId === clientUserId);
    if (!managerMembership || !clientMembership) throw new Error("Failed to seed memberships");
    await db.insert(workspaceMembershipRoles).values([
      { workspaceMembershipId: managerMembership.id, role: "workspace_manager" },
      { workspaceMembershipId: clientMembership.id, role: "client_reviewer" },
    ]);
  });

  it("renames for a workspace manager and records one audit row", async () => {
    const result = await renameWorkspace(
      { id: managerUserId },
      { workspaceId, name: "  Lara   Tik " },
    );
    expect(result).toEqual({ ok: true, changed: true, name: "Lara Tik" });

    const [row] = await db
      .select({ name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(drizzle.eq(schema.workspaces.id, workspaceId));
    expect(row?.name).toBe("Lara Tik");

    const auditRows = await db
      .select()
      .from(schema.securityAuditEvents)
      .where(
        drizzle.and(
          drizzle.eq(schema.securityAuditEvents.action, "workspace_rename"),
          drizzle.eq(schema.securityAuditEvents.targetId, workspaceId),
        ),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      actorId: managerUserId,
      targetType: "workspace",
      outcome: "success",
    });
    expect(auditRows[0]?.metadata).toMatchObject({ from: "Acme", to: "Lara Tik" });
  });

  it("is idempotent — a second identical rename writes no second audit row", async () => {
    await renameWorkspace({ id: managerUserId }, { workspaceId, name: "Lara Tik" });
    const second = await renameWorkspace({ id: managerUserId }, { workspaceId, name: "Lara Tik" });
    expect(second).toEqual({ ok: true, changed: false, name: "Lara Tik" });

    const auditRows = await db
      .select({ id: schema.securityAuditEvents.id })
      .from(schema.securityAuditEvents)
      .where(
        drizzle.and(
          drizzle.eq(schema.securityAuditEvents.action, "workspace_rename"),
          drizzle.eq(schema.securityAuditEvents.targetId, workspaceId),
        ),
      );
    expect(auditRows).toHaveLength(1);
  });

  it("leaves the slug and the workspace URL untouched", async () => {
    await renameWorkspace({ id: managerUserId }, { workspaceId, name: "Lara Tik" });

    const [row] = await db
      .select({ slug: schema.workspaces.slug, name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(drizzle.eq(schema.workspaces.id, workspaceId));
    expect(row).toMatchObject({ slug: "acme", name: "Lara Tik" });

    // The old URL still resolves to the renamed workspace.
    await expect(
      getAccessibleWorkspace({ id: managerUserId }, "acme", agencyId),
    ).resolves.toMatchObject({ id: workspaceId, name: "Lara Tik" });
  });

  it("rejects a client reviewer", async () => {
    await expect(
      renameWorkspace({ id: clientUserId }, { workspaceId, name: "Hijacked" }),
    ).rejects.toThrow(/permission denied/i);

    const [row] = await db
      .select({ name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(drizzle.eq(schema.workspaces.id, workspaceId));
    expect(row?.name).toBe("Acme");
  });

  it("rejects a manager who belongs to a different agency", async () => {
    await expect(
      renameWorkspace({ id: otherAgencyManagerId }, { workspaceId, name: "Hijacked" }),
    ).rejects.toThrow(/permission denied/i);

    const [row] = await db
      .select({ name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(drizzle.eq(schema.workspaces.id, workspaceId));
    expect(row?.name).toBe("Acme");
  });

  it("rejects an out-of-range name without writing anything", async () => {
    await expect(
      renameWorkspace({ id: managerUserId }, { workspaceId, name: "a".repeat(81) }),
    ).rejects.toThrow();
    await expect(
      renameWorkspace({ id: managerUserId }, { workspaceId, name: "   " }),
    ).rejects.toThrow();

    const [row] = await db
      .select({ name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(drizzle.eq(schema.workspaces.id, workspaceId));
    expect(row?.name).toBe("Acme");
  });
});
