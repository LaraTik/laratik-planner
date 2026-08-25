import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

process.env.DATABASE_URL = TEST_DB_URL;

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

type AccessModule = typeof import("@/lib/support");
type SchemaModule = typeof import("@/lib/db/schema");

let support: AccessModule;
let schema: SchemaModule;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  support = await import("@/lib/support");
  schema = await import("@/lib/db/schema");
});

/**
 * M3.6 — Support access workflow integration tests.
 *
 * The unit tests cover the pure helpers; this file exercises
 * the full request → approval → grant → revoke lifecycle
 * against a real Postgres database. The schema is the same
 * one production runs on; the tests bring their own fixtures
 * (platform admin user, agency admin user, agency, workspace).
 */
describe("M3.6 — support access workflow (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        support_access_audit, support_access_grant, support_access_request,
        ai_daily_budget_usage,
        agency_entitlement_change, agency_entitlement, platform_audit_event,
        agency_usage_threshold_event, agency_usage_counter,
        platform_plan_template,
        agency_membership, bootstrap_lock, agency, "user"
      RESTART IDENTITY CASCADE
    `);
  });

  async function seedPlatformAdmin(
    role:
      | "platform_owner"
      | "agency_operator"
      | "platform_auditor"
      | "support_operator" = "platform_owner",
  ): Promise<{ id: string }> {
    const [u] = await db
      .insert(schema.users)
      .values({
        email: `platform-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        displayName: "Platform Admin",
        name: "Platform Admin",
      })
      .returning();
    if (!u) throw new Error("Failed to create platform admin user");
    await db.insert(schema.platformAdministrators).values({
      userId: u.id,
      grantedBy: u.id,
      role,
    });
    return { id: u.id };
  }

  async function seedAgencyAdminAndAgency(
    emailPrefix: string = "alpha",
  ): Promise<{ adminId: string; memberId: string; agencyId: string }> {
    const [admin] = await db
      .insert(schema.users)
      .values({
        email: `admin-${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        displayName: `${emailPrefix} Admin`,
        name: `${emailPrefix} Admin`,
      })
      .returning();
    const [member] = await db
      .insert(schema.users)
      .values({
        email: `member-${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        displayName: `${emailPrefix} Member`,
        name: `${emailPrefix} Member`,
      })
      .returning();
    const [agency] = await db
      .insert(schema.agencies)
      .values({
        name: `${emailPrefix} Agency`,
        slug: `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      })
      .returning();
    if (!admin || !member || !agency) throw new Error("Failed to seed agency");
    await db.insert(schema.agencyMemberships).values([
      { userId: admin.id, agencyId: agency.id, isAgencyAdmin: true, status: "active" },
      { userId: member.id, agencyId: agency.id, isAgencyAdmin: false, status: "active" },
    ]);
    return { adminId: admin.id, memberId: member.id, agencyId: agency.id };
  }

  it("creates a pending request and lets an agency admin approve it", async () => {
    const platform = await seedPlatformAdmin();
    const { adminId, agencyId } = await seedAgencyAdminAndAgency();

    const request = await support.createSupportAccessRequest(platform, {
      ticketReference: "SUP-100",
      reason: "Investigating failed deliverable upload.",
      targetAgencyId: agencyId,
      scopeMetadataOnly: false,
      downloadsRequested: false,
      requestedDurationHours: 2,
    });
    expect(request.status).toBe("pending");
    expect(request.requestedByUserId).toBe(platform.id);

    const decision = await support.decideSupportAccessRequest(
      { id: adminId },
      request.id,
      "approved",
      { reason: "Verified the incident.", grantDownloads: false },
    );
    expect(decision.request.status).toBe("approved");
    expect(decision.grant?.targetAgencyId).toBe(agencyId);
    expect(decision.grant?.downloadsAllowed).toBe(false);
  });

  it("rejects approval by a non-agency-admin", async () => {
    const platform = await seedPlatformAdmin();
    const { memberId, agencyId } = await seedAgencyAdminAndAgency();
    const request = await support.createSupportAccessRequest(platform, {
      ticketReference: "SUP-101",
      reason: "Investigating failing review queue.",
      targetAgencyId: agencyId,
      scopeMetadataOnly: false,
      downloadsRequested: false,
      requestedDurationHours: 1,
    });
    await expect(
      support.decideSupportAccessRequest({ id: memberId }, request.id, "approved", {
        reason: "Should not work.",
        grantDownloads: false,
      }),
    ).rejects.toMatchObject({ code: support.SupportAccessErrorCode.NotAgencyAdmin });
  });

  it("lets Support request while reserving third-party revoke for Owners", async () => {
    const requester = await seedPlatformAdmin("support_operator");
    const agencyOperator = await seedPlatformAdmin("agency_operator");
    const owner = await seedPlatformAdmin("platform_owner");
    const { adminId, agencyId } = await seedAgencyAdminAndAgency("role-boundary");
    const request = await support.createSupportAccessRequest(requester, {
      ticketReference: "SUP-ROLE-1",
      reason: "Investigating a role-boundary incident.",
      targetAgencyId: agencyId,
      scopeMetadataOnly: false,
      downloadsRequested: false,
      requestedDurationHours: 1,
    });

    await expect(
      support.decideSupportAccessRequest(requester, request.id, "approved", {
        reason: "Self approval must fail.",
        grantDownloads: false,
      }),
    ).rejects.toMatchObject({ code: support.SupportAccessErrorCode.NotAgencyAdmin });

    const { grant } = await support.decideSupportAccessRequest(
      { id: adminId },
      request.id,
      "approved",
      { reason: "Agency approval.", grantDownloads: false },
    );
    if (!grant) throw new Error("grant missing");

    await expect(
      support.revokeSupportAccessGrant(agencyOperator, grant.id, "Unrelated operator"),
    ).rejects.toMatchObject({ code: support.SupportAccessErrorCode.NotAgencyAdmin });
    const revoked = await support.revokeSupportAccessGrant(owner, grant.id, "Owner response");
    expect(revoked.revokedByUserId).toBe(owner.id);
  });

  it("rejects a second approval of the same request", async () => {
    const platform = await seedPlatformAdmin();
    const { adminId, agencyId } = await seedAgencyAdminAndAgency();
    const request = await support.createSupportAccessRequest(platform, {
      ticketReference: "SUP-102",
      reason: "Reviewing quota breach.",
      targetAgencyId: agencyId,
      scopeMetadataOnly: false,
      downloadsRequested: false,
      requestedDurationHours: 2,
    });
    await support.decideSupportAccessRequest({ id: adminId }, request.id, "approved", {
      reason: "First approval.",
      grantDownloads: false,
    });
    await expect(
      support.decideSupportAccessRequest({ id: adminId }, request.id, "approved", {
        reason: "Second approval.",
        grantDownloads: false,
      }),
    ).rejects.toMatchObject({ code: support.SupportAccessErrorCode.AlreadyDecided });
  });

  it("revokes an active grant and the gate denies subsequent reads", async () => {
    const platform = await seedPlatformAdmin();
    const { adminId, agencyId } = await seedAgencyAdminAndAgency();
    const request = await support.createSupportAccessRequest(platform, {
      ticketReference: "SUP-103",
      reason: "Walking the customer through settings.",
      targetAgencyId: agencyId,
      scopeMetadataOnly: false,
      downloadsRequested: false,
      requestedDurationHours: 2,
    });
    const { grant } = await support.decideSupportAccessRequest(
      { id: adminId },
      request.id,
      "approved",
      { reason: "Approving.", grantDownloads: false },
    );
    expect(grant).not.toBeNull();
    if (!grant) throw new Error("grant missing");

    const before = await support.findActiveSupportAccessGrant({
      actor: platform,
      targetAgencyId: agencyId,
    });
    expect(before?.id).toBe(grant.id);

    const revoked = await support.revokeSupportAccessGrant(platform, grant.id, "Done.");
    expect(revoked.revokedAt).not.toBeNull();

    const after = await support.findActiveSupportAccessGrant({
      actor: platform,
      targetAgencyId: agencyId,
    });
    expect(after).toBeNull();
  });

  it("denies cross-agency workspace scope at request time (IDOR defence)", async () => {
    const platform = await seedPlatformAdmin();
    const { agencyId: agencyA } = await seedAgencyAdminAndAgency("alpha");
    const { agencyId: agencyB } = await seedAgencyAdminAndAgency("beta");
    const [ws] = await db
      .insert(schema.workspaces)
      .values({
        name: "B Workspace",
        slug: `b-ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agencyId: agencyB,
        createdBy: platform.id,
      })
      .returning();
    if (!ws) throw new Error("workspace seed failed");

    await expect(
      support.createSupportAccessRequest(platform, {
        ticketReference: "SUP-104",
        reason: "IDOR test.",
        targetAgencyId: agencyA,
        scopeWorkspaceId: ws.id,
        scopeMetadataOnly: false,
        downloadsRequested: false,
        requestedDurationHours: 1,
      }),
    ).rejects.toMatchObject({ code: support.SupportAccessErrorCode.CrossAgency });
  });

  it("the audit log rejects UPDATE and DELETE (append-only)", async () => {
    const platform = await seedPlatformAdmin();
    const { agencyId } = await seedAgencyAdminAndAgency("audit");
    await support.recordSupportAccessAudit({
      actor: platform,
      grantId: null,
      targetAgencyId: agencyId,
      targetType: "agency",
      targetId: agencyId,
      action: support.SupportAccessAuditAction.CreateRequest,
      outcome: "success",
    });
    await expect(
      db.execute(sql`UPDATE support_access_audit SET action = 'tampered'`),
    ).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM support_access_audit`)).rejects.toThrow();
  });

  it("an expired grant's request flips to 'expired' on sweep", async () => {
    const platform = await seedPlatformAdmin();
    const { adminId, agencyId } = await seedAgencyAdminAndAgency("sweep");
    const request = await support.createSupportAccessRequest(platform, {
      ticketReference: "SUP-105",
      reason: "Quota review.",
      targetAgencyId: agencyId,
      scopeMetadataOnly: false,
      downloadsRequested: false,
      requestedDurationHours: 1,
    });
    await support.decideSupportAccessRequest({ id: adminId }, request.id, "approved", {
      reason: "Approved.",
      grantDownloads: false,
    });
    // Force the grant to be expired by setting both activated_at
    // and expires_at to past times. The check constraint
    // `expires_at > activated_at` requires both to move together.
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const pastExpiry = new Date(Date.now() - 1000);
    await db
      .update(schema.supportAccessGrants)
      .set({ activatedAt: past, expiresAt: pastExpiry })
      .where(eq(schema.supportAccessGrants.targetAgencyId, agencyId));

    const sweep = await support.expireStaleSupportAccessGrants();
    expect(sweep.expiredGrants).toBeGreaterThan(0);

    const [row] = await db
      .select()
      .from(schema.supportAccessRequests)
      .where(eq(schema.supportAccessRequests.id, request.id))
      .limit(1);
    expect(row?.status).toBe("expired");
  });
});
