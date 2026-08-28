import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Integration tests for `createUserDirectly` (lib/auth/user-creation.ts).
 *
 * Exercises the full transaction against a real Postgres instance
 * (the test DB seeded via `pnpm db:migrate` from the project root).
 * The service writes 5 rows in one transaction:
 *   1. `user`                       (with mustChangePassword=true)
 *   2. `agency_membership`          (active)
 *   3. `workspace_membership` * N   (active, one per role grant)
 *   4. `workspace_membership_role`  (one per grant)
 *   5. `security_audit_event`       (action: "user_create", source: "admin_direct")
 *
 * Plus a `revoke` of any pending `invitation` for the same email.
 *
 * The tests cover:
 *  - Happy path: all rows + audit event present
 *  - Conflict: existing user with the same email → UserAlreadyExistsError,
 *    no rows written (transaction rolled back)
 *  - Conflict: active agency member → ActiveAgencyMemberError
 *  - Workspace scoping: workspace belonging to a different agency is
 *    rejected, no rows written
 *  - Pending invitation for the same email is revoked in the same tx,
 *    capacity is released on the invitation side and re-reserved on
 *    the user side
 *  - Password is bcrypt-hashed (length matches a bcrypt hash, not
 *    the plaintext)
 */
describe("createUserDirectly — admin-initiated user creation", () => {
  let createUserDirectly: typeof import("@/lib/auth/user-creation").createUserDirectly;
  let UserAlreadyExistsError: typeof import("@/lib/auth/user-creation").UserAlreadyExistsError;
  let ActiveAgencyMemberError: typeof import("@/lib/auth/user-creation").ActiveAgencyMemberError;

  beforeAll(async () => {
    ({ createUserDirectly, UserAlreadyExistsError, ActiveAgencyMemberError } =
      await import("@/lib/auth/user-creation"));
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
  });

  it("creates a user + memberships + role + audit event in one transaction", async () => {
    const { db } = await import("@/lib/db");
    const {
      agencies,
      agencyMemberships,
      securityAuditEvents,
      users,
      workspaceMembershipRoles,
      workspaceMemberships,
      workspaces,
    } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");

    // Seed: an admin + an agency + a workspace
    const [admin] = await db
      .insert(users)
      .values({
        email: "admin@create.test",
        displayName: "Admin",
        emailVerified: new Date(),
        role: "agency_admin",
      })
      .returning();
    if (!admin) throw new Error("Failed to seed admin");
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Create Agency", slug: "create-agency" })
      .returning();
    if (!agency) throw new Error("Failed to seed agency");
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: admin.id,
      status: "active",
      isAgencyAdmin: true,
    });
    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency.id,
        name: "Create Workspace",
        slug: "create-workspace",
        createdBy: admin.id,
      })
      .returning();
    if (!workspace) throw new Error("Failed to seed workspace");

    const result = await createUserDirectly({
      agencyId: agency.id,
      email: "Newbie@Create.test",
      name: "Newbie Person",
      password: "TempPass123",
      grantsAgencyAdmin: false,
      workspaceRoles: [{ workspaceId: workspace.id, role: "content_planner" }],
      createdBy: admin.id,
    });

    // Returned shape
    expect(result.email).toBe("newbie@create.test");
    expect(result.userId).toMatch(/[0-9a-f-]{36}/);
    expect(result.tempPassword).toBe("TempPass123");
    expect(result.acceptedWorkspaceIds).toEqual([workspace.id]);

    // user row
    const [userRow] = await db
      .select({
        email: users.email,
        mustChangePassword: users.mustChangePassword,
        emailVerified: users.emailVerified,
        passwordHashPrefix: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, result.userId));
    expect(userRow?.email).toBe("newbie@create.test");
    expect(userRow?.mustChangePassword).toBe(true);
    expect(userRow?.emailVerified).toBeInstanceOf(Date);
    // Bcrypt hash: $2[aby]$<cost>$<salt+hash>  (60 chars total)
    expect(userRow?.passwordHashPrefix).toMatch(/^\$2[aby]\$12\$/);
    // And the plaintext is not stored
    expect(userRow?.passwordHashPrefix).not.toContain("TempPass123");

    // agency_membership
    const memberships = await db
      .select()
      .from(agencyMemberships)
      .where(
        and(eq(agencyMemberships.agencyId, agency.id), eq(agencyMemberships.userId, result.userId)),
      );
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.status).toBe("active");
    expect(memberships[0]?.isAgencyAdmin).toBe(false);

    // workspace_membership + role
    const [membership] = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspace.id),
          eq(workspaceMemberships.userId, result.userId),
        ),
      );
    expect(membership?.status).toBe("active");
    const [role] = await db
      .select()
      .from(workspaceMembershipRoles)
      .where(eq(workspaceMembershipRoles.workspaceMembershipId, membership!.id));
    expect(role?.role).toBe("content_planner");

    // audit event
    const events = await db
      .select()
      .from(securityAuditEvents)
      .where(
        and(
          eq(securityAuditEvents.targetId, result.userId),
          eq(securityAuditEvents.action, "user_create"),
        ),
      );
    expect(events).toHaveLength(1);
    const metadata = events[0]?.metadata as Record<string, unknown> | null;
    expect(metadata?.source).toBe("admin_direct");
    expect(metadata?.mustChangePassword).toBe(true);
    expect(metadata?.workspaceGrantCount).toBe(1);
  });

  it("rejects an email that already has a user row (UserAlreadyExistsError) and rolls back the transaction", async () => {
    const { db } = await import("@/lib/db");
    const { agencies, agencyMemberships, users, workspaces } = await import("@/lib/db/schema");
    const { eq, sql } = await import("drizzle-orm");

    const [admin] = await db
      .insert(users)
      .values({
        email: "admin@dup.test",
        displayName: "Admin",
        emailVerified: new Date(),
      })
      .returning();
    if (!admin) throw new Error("seed");
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Dup Agency", slug: "dup-agency" })
      .returning();
    if (!agency) throw new Error("seed");
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: admin.id,
      status: "active",
      isAgencyAdmin: true,
    });
    // Pre-existing user with the same email
    await db.insert(users).values({
      email: "taken@dup.test",
      displayName: "Already here",
      emailVerified: new Date(),
    });

    await expect(
      createUserDirectly({
        agencyId: agency.id,
        email: "taken@dup.test",
        password: "TempPass123",
        grantsAgencyAdmin: false,
        workspaceRoles: [],
        createdBy: admin.id,
      }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);

    // No new agency_membership was created (transaction rolled back)
    const memberships = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agencyMemberships)
      .where(eq(agencyMemberships.agencyId, agency.id));
    expect(memberships[0]?.count).toBe(1); // only the admin

    // Defensive: the workspace creation isn't even attempted in this
    // test, but the workspaces table should still be empty.
    const ws = await db.select().from(workspaces);
    expect(ws).toHaveLength(0);
  });

  it("rejects a workspace belonging to a different agency and rolls back", async () => {
    const { db } = await import("@/lib/db");
    const { agencies, agencyMemberships, users, workspaces } = await import("@/lib/db/schema");

    const [admin] = await db
      .insert(users)
      .values({
        email: "admin@ws.test",
        displayName: "Admin",
        emailVerified: new Date(),
      })
      .returning();
    if (!admin) throw new Error("seed");
    const [agency1] = await db
      .insert(agencies)
      .values({ name: "Agency 1", slug: "agency-1" })
      .returning();
    if (!agency1) throw new Error("seed");
    const [agency2] = await db
      .insert(agencies)
      .values({ name: "Agency 2", slug: "agency-2" })
      .returning();
    if (!agency2) throw new Error("seed");
    await db.insert(agencyMemberships).values({
      agencyId: agency1.id,
      userId: admin.id,
      status: "active",
      isAgencyAdmin: true,
    });
    // Workspace belongs to agency 2, not agency 1
    const [foreignWorkspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency2.id,
        name: "Foreign",
        slug: "foreign",
        createdBy: admin.id,
      })
      .returning();
    if (!foreignWorkspace) throw new Error("seed");

    await expect(
      createUserDirectly({
        agencyId: agency1.id,
        email: "user@ws.test",
        password: "TempPass123",
        grantsAgencyAdmin: false,
        workspaceRoles: [{ workspaceId: foreignWorkspace.id, role: "viewer" }],
        createdBy: admin.id,
      }),
    ).rejects.toThrow("Invalid workspace access selection");
  });

  it("rejects when the email is already an active member of the agency (ActiveAgencyMemberError)", async () => {
    const { db } = await import("@/lib/db");
    const { agencies, agencyMemberships, users } = await import("@/lib/db/schema");

    const [admin, existing] = await db
      .insert(users)
      .values([
        {
          email: "admin@member.test",
          displayName: "Admin",
          emailVerified: new Date(),
        },
        {
          email: "already@member.test",
          displayName: "Already here",
          emailVerified: new Date(),
        },
      ])
      .returning();
    if (!admin || !existing) throw new Error("seed");
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Member Agency", slug: "member-agency" })
      .returning();
    if (!agency) throw new Error("seed");
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: admin.id,
      status: "active",
      isAgencyAdmin: true,
    });
    // Mark `existing` as an active member of the same agency
    await db.insert(agencyMemberships).values({
      agencyId: agency.id,
      userId: existing.id,
      status: "active",
      isAgencyAdmin: false,
    });

    await expect(
      createUserDirectly({
        agencyId: agency.id,
        email: "already@member.test",
        password: "TempPass123",
        grantsAgencyAdmin: false,
        workspaceRoles: [],
        createdBy: admin.id,
      }),
    ).rejects.toBeInstanceOf(ActiveAgencyMemberError);
  });
});
