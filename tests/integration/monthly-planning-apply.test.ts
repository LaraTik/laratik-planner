import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("monthly planning proposal apply transaction", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/db/schema");
  let sql: typeof import("drizzle-orm").sql;
  let eq: typeof import("drizzle-orm").eq;
  let applyMonthlyProposalAtomically: typeof import("@/features/ai/server").applyMonthlyProposalAtomically;
  let agencyId: string;
  let workspaceId: string;
  let actorId: string;
  let sessionId: string;
  let proposalId: string;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    ({ sql, eq } = await import("drizzle-orm"));
    ({ applyMonthlyProposalAtomically } = await import("@/features/ai/server"));
  });

  beforeEach(async () => {
    const {
      agencies,
      agencyMemberships,
      monthlyPlanningSessions,
      planningProposals,
      users,
      workspaceMembershipRoles,
      workspaceMemberships,
      workspaces,
    } = schema;

    await db.execute(
      sql`DROP TRIGGER IF EXISTS fail_monthly_proposal_finalize ON planning_proposal`,
    );
    await db.execute(sql`DROP FUNCTION IF EXISTS fail_monthly_proposal_finalize()`);
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);

    const [agency] = await db
      .insert(agencies)
      .values({ name: "Monthly Apply", slug: `monthly-apply-${randomUUID()}` })
      .returning({ id: agencies.id });
    const [actor] = await db
      .insert(users)
      .values({ email: `monthly-${randomUUID()}@example.test`, displayName: "Planner" })
      .returning({ id: users.id });
    if (!agency || !actor) throw new Error("Failed to seed monthly planning fixture");
    agencyId = agency.id;
    actorId = actor.id;

    await db.insert(agencyMemberships).values({ agencyId, userId: actorId, status: "active" });
    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId,
        name: "Monthly Workspace",
        slug: `monthly-${randomUUID()}`,
        createdBy: actorId,
      })
      .returning({ id: workspaces.id });
    if (!workspace) throw new Error("Failed to seed monthly planning workspace");
    workspaceId = workspace.id;

    const [membership] = await db
      .insert(workspaceMemberships)
      .values({ workspaceId, userId: actorId, status: "active" })
      .returning({ id: workspaceMemberships.id });
    if (!membership) throw new Error("Failed to seed monthly planning membership");
    await db.insert(workspaceMembershipRoles).values({
      workspaceMembershipId: membership.id,
      role: "workspace_manager",
    });

    const [session] = await db
      .insert(monthlyPlanningSessions)
      .values({ workspaceId, month: "2026-11", createdBy: actorId })
      .returning({ id: monthlyPlanningSessions.id });
    if (!session) throw new Error("Failed to seed monthly planning session");
    sessionId = session.id;

    const [proposal] = await db
      .insert(planningProposals)
      .values({
        sessionId,
        revision: 1,
        status: "approved",
        proposal: { version: 1, rows: [] },
        sourceRevision: "v1",
        idempotencyKey: `monthly-${randomUUID()}`,
        createdBy: actorId,
      })
      .returning({ id: planningProposals.id });
    if (!proposal) throw new Error("Failed to seed monthly planning proposal");
    proposalId = proposal.id;
  });

  afterAll(async () => {
    await db?.execute(
      sql`DROP TRIGGER IF EXISTS fail_monthly_proposal_finalize ON planning_proposal`,
    );
    await db?.execute(sql`DROP FUNCTION IF EXISTS fail_monthly_proposal_finalize()`);
  });

  function input() {
    return {
      actor: { id: actorId },
      workspaceId,
      sessionId,
      proposalId,
      content: {
        workspaceId,
        items: [
          {
            title: "Monthly plan post",
            format: "static_post" as const,
            brief: "A planned post",
            plannedPublishAt: new Date("2026-11-10T10:00:00.000Z"),
            channelIds: [],
          },
        ],
      },
    };
  }

  it("commits content and both applied states together", async () => {
    const createdIds = await applyMonthlyProposalAtomically(input());
    expect(createdIds).toHaveLength(1);

    const [proposal] = await db
      .select({
        status: schema.planningProposals.status,
        ids: schema.planningProposals.appliedContentIds,
      })
      .from(schema.planningProposals)
      .where(eq(schema.planningProposals.id, proposalId));
    const [session] = await db
      .select({ status: schema.monthlyPlanningSessions.status })
      .from(schema.monthlyPlanningSessions)
      .where(eq(schema.monthlyPlanningSessions.id, sessionId));
    const content = await db
      .select({ id: schema.contentItems.id })
      .from(schema.contentItems)
      .where(eq(schema.contentItems.workspaceId, workspaceId));

    expect(proposal).toMatchObject({ status: "applied", ids: createdIds });
    expect(session?.status).toBe("applied");
    expect(content.map((item) => item.id)).toEqual(createdIds);
  });

  it("rolls back content and claim when proposal finalization fails", async () => {
    await db.execute(sql`
      CREATE FUNCTION fail_monthly_proposal_finalize() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'applied' THEN
          RAISE EXCEPTION 'forced monthly proposal finalize failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await db.execute(sql`
      CREATE TRIGGER fail_monthly_proposal_finalize
      BEFORE UPDATE OF status ON planning_proposal
      FOR EACH ROW WHEN (NEW.status = 'applied')
      EXECUTE FUNCTION fail_monthly_proposal_finalize()
    `);

    await expect(applyMonthlyProposalAtomically(input())).rejects.toThrow(
      /Failed query: update "planning_proposal"/,
    );

    const [proposal] = await db
      .select({ status: schema.planningProposals.status })
      .from(schema.planningProposals)
      .where(eq(schema.planningProposals.id, proposalId));
    const [session] = await db
      .select({ status: schema.monthlyPlanningSessions.status })
      .from(schema.monthlyPlanningSessions)
      .where(eq(schema.monthlyPlanningSessions.id, sessionId));
    const content = await db
      .select({ id: schema.contentItems.id })
      .from(schema.contentItems)
      .where(eq(schema.contentItems.workspaceId, workspaceId));

    expect(proposal?.status).toBe("approved");
    expect(session?.status).toBe("discovery");
    expect(content).toEqual([]);
  });

  it("allows only one concurrent request to claim the approved proposal", async () => {
    const [first, second] = await Promise.all([
      applyMonthlyProposalAtomically(input()),
      applyMonthlyProposalAtomically(input()),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect([first, second].filter((result) => result === null)).toHaveLength(1);
    const content = await db
      .select({ id: schema.contentItems.id })
      .from(schema.contentItems)
      .where(eq(schema.contentItems.workspaceId, workspaceId));
    expect(content).toHaveLength(1);
  });

  it("rejects content scoped to a different workspace before claiming the proposal", async () => {
    const request = input();
    request.content.workspaceId = randomUUID();

    await expect(applyMonthlyProposalAtomically(request)).rejects.toThrow(
      "Monthly planning content must match the proposal workspace",
    );
    const [proposal] = await db
      .select({ status: schema.planningProposals.status })
      .from(schema.planningProposals)
      .where(eq(schema.planningProposals.id, proposalId));
    expect(proposal?.status).toBe("approved");
  });
});
