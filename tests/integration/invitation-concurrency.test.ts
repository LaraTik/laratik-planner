import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("invitation acceptance concurrency", () => {
  let acceptInvitation: typeof import("@/lib/auth/invitations").acceptInvitation;

  beforeAll(async () => {
    ({ acceptInvitation } = await import("@/lib/auth/invitations"));
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
  });

  it("applies one effective grant and audit event when the same token is submitted twice", async () => {
    const { db } = await import("@/lib/db");
    const {
      agencies,
      agencyMemberships,
      invitations,
      invitationWorkspaceRoles,
      securityAuditEvents,
      users,
      workspaceMembershipRoles,
      workspaceMemberships,
      workspaces,
    } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");

    const [issuer, invitee] = await db
      .insert(users)
      .values([
        {
          email: "issuer@invite.test",
          displayName: "Issuer",
          emailVerified: new Date(),
          role: "agency_admin",
        },
        {
          email: "invitee@invite.test",
          displayName: "Invitee",
          emailVerified: new Date(),
        },
      ])
      .returning();
    if (!issuer || !invitee) throw new Error("Failed to seed users");
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Invite Agency", slug: "invite-agency" })
      .returning();
    if (!agency) throw new Error("Failed to seed agency");
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: issuer.id,
      status: "active",
      isAgencyAdmin: true,
    });
    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency.id,
        name: "Invite Workspace",
        slug: "invite-workspace",
        createdBy: issuer.id,
      })
      .returning();
    if (!workspace) throw new Error("Failed to seed workspace");

    const rawToken = "concurrent-invitation-token";
    const [invitation] = await db
      .insert(invitations)
      .values({
        agencyId: agency.id,
        email: invitee.email,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedBy: issuer.id,
      })
      .returning();
    if (!invitation) throw new Error("Failed to seed invitation");
    await db.insert(invitationWorkspaceRoles).values({
      invitationId: invitation.id,
      workspaceId: workspace.id,
      role: "designer",
    });

    const outcomes = await Promise.all([
      acceptInvitation({ rawToken, userId: invitee.id }),
      acceptInvitation({ rawToken, userId: invitee.id }),
    ]);
    expect(outcomes).toEqual([
      { status: "accepted", workspaceIds: [workspace.id] },
      { status: "accepted", workspaceIds: [workspace.id] },
    ]);

    const memberships = await db
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspace.id),
          eq(workspaceMemberships.userId, invitee.id),
        ),
      );
    expect(memberships).toHaveLength(1);
    const roles = await db
      .select()
      .from(workspaceMembershipRoles)
      .where(eq(workspaceMembershipRoles.workspaceMembershipId, memberships[0]!.id));
    expect(roles).toHaveLength(1);
    const audits = await db
      .select()
      .from(securityAuditEvents)
      .where(
        and(
          eq(securityAuditEvents.action, "invitation_accept"),
          eq(securityAuditEvents.targetId, invitation.id),
        ),
      );
    expect(audits).toHaveLength(1);
  });
});
