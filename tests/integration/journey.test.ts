import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Primary acceptance journey — service-level, no UI.
 *
 * Mirrors STUDIOFLOW_MASTER_PROMPT.md §23. Each `it` block maps to one or
 * more steps in §23 so that a regression points back to a specific journey
 * step.
 *
 * The UI-level journey is covered by tests/e2e/* and tests/e2e/role-
 * authorization.spec.ts; this file is the service-level companion that
 * asserts the workflow state machine, the role-based authorization, and
 * the publishing aggregate behave correctly when called directly.
 */
describe("primary acceptance journey (§23, service-level)", () => {
  let content: typeof import("@/lib/content/service");
  let workflow: typeof import("@/lib/content/workflow");

  let agencyId: string;
  let workspaceId: string;
  let maya: { id: string; email: string };
  let omar: { id: string; email: string };
  let elena: { id: string; email: string };
  let jon: { id: string; email: string };
  let sophie: { id: string; email: string };
  let daniel: { id: string; email: string };

  let channelIds: string[];

  beforeAll(async () => {
    content = await import("@/lib/content/service");
    workflow = await import("@/lib/content/workflow");
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);

    const { agencies, agencyMemberships, users, workspaces, socialChannels, workspaceSettings } =
      await import("@/lib/db/schema");

    const all = await db
      .insert(users)
      .values([
        { email: "maya@journey.test", displayName: "Maya", emailVerified: new Date(), role: "agency_admin" },
        { email: "omar@journey.test", displayName: "Omar", emailVerified: new Date(), role: "user" },
        { email: "elena@journey.test", displayName: "Elena", emailVerified: new Date(), role: "user" },
        { email: "jon@journey.test", displayName: "Jon", emailVerified: new Date(), role: "user" },
        { email: "sophie@journey.test", displayName: "Sophie", emailVerified: new Date(), role: "user" },
        { email: "daniel@journey.test", displayName: "Daniel", emailVerified: new Date(), role: "user" },
      ])
      .returning();
    maya = { id: all[0]!.id, email: all[0]!.email };
    omar = { id: all[1]!.id, email: all[1]!.email };
    elena = { id: all[2]!.id, email: all[2]!.email };
    jon = { id: all[3]!.id, email: all[3]!.email };
    sophie = { id: all[4]!.id, email: all[4]!.email };
    daniel = { id: all[5]!.id, email: all[5]!.email };

    const [agency] = await db
      .insert(agencies)
      .values({ name: "Northstar Coffee", slug: "northstar" })
      .returning();
    agencyId = agency!.id;

    await db.insert(agencyMemberships).values({
      agencyId,
      userId: maya.id,
      status: "active",
      isAgencyAdmin: true,
    });

    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId,
        name: "Northstar Coffee",
        slug: "northstar",
        timezone: "Europe/Vienna",
        createdBy: maya.id,
      })
      .returning();
    workspaceId = workspace!.id;

    await db.insert(workspaceSettings).values({
      workspaceId,
      approvalMode: "internal_then_client",
      defaultContentReviewerId: jon.id,
      defaultInternalCreativeReviewerId: jon.id,
      defaultClientReviewerId: sophie.id,
      defaultDesignerId: elena.id,
      monthlyTarget: 24,
    });

    // Each non-admin actor needs a workspace_membership_role. Maya is
    // agency_admin so she bypasses the role check entirely.
    const { workspaceMemberships, workspaceMembershipRoles } = await import("@/lib/db/schema");
    const roleForUser: Record<string, "content_planner" | "designer" | "internal_reviewer" | "client_reviewer" | "publisher"> = {
      omar: "content_planner",
      elena: "designer",
      jon: "internal_reviewer",
      sophie: "client_reviewer",
      daniel: "publisher",
    };
    for (const [key, role] of Object.entries(roleForUser)) {
      const user = { omar, elena, jon, sophie, daniel }[key as "omar" | "elena" | "jon" | "sophie" | "daniel"]!;
      const [wm] = await db
        .insert(workspaceMemberships)
        .values({ workspaceId, userId: user.id, status: "active" })
        .returning();
      await db.insert(workspaceMembershipRoles).values({
        workspaceMembershipId: wm!.id,
        role,
      });
    }

    channelIds = [];
    for (const [platform, accountName] of [
      ["instagram", "Northstar IG"],
      ["tiktok", "Northstar TikTok"],
      ["facebook", "Northstar FB"],
      ["youtube", "Northstar YT"],
    ] as const) {
      const [ch] = await db
        .insert(socialChannels)
        .values({
          workspaceId,
          platform,
          accountName,
          handle: `@northstar_${platform}`,
          isActive: true,
        })
        .returning();
      channelIds.push(ch!.id);
    }
  });

  it("§23 step 7: client_reviewer cannot read internal content (canAccessInternalWorkspace)", async () => {
    const itemId = await content.quickCreateContentItem(
      { id: omar.id },
      {
        workspaceId,
        title: "Internal draft",
        format: "static_post",
        brief: "Internal-only brief.",
        plannedPublishAt: new Date(),
        channelIds,
      },
    );

    // Sophie is a client_reviewer — must NOT be able to read the internal detail.
    await expect(content.getContentItem({ id: sophie.id }, itemId)).rejects.toThrow();

    // Jon (internal_reviewer) and Maya (agency_admin) can read the internal detail.
    await expect(content.getContentItem({ id: jon.id }, itemId)).resolves.toBeTruthy();
    await expect(content.getContentItem({ id: maya.id }, itemId)).resolves.toBeTruthy();
  });

  it("§23 step 11: Quick Create applies workspace settings defaults (designer, reviewers)", async () => {
    const itemId = await content.quickCreateContentItem(
      { id: omar.id },
      {
        workspaceId,
        title: "Autumn Recipe in 30 Seconds",
        format: "short_form_video",
        brief: "Hook viewers with a cinnamon-pour opening.",
        plannedPublishAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        channelIds,
      },
    );
    const detail = await content.getContentItem({ id: omar.id }, itemId);
    expect(detail).toBeTruthy();
    // The detail shape is flat per the content service return type.
    const row = (detail as unknown as { designerId?: string | null }).designerId;
    const reviewer = (detail as unknown as { contentReviewerId?: string | null }).contentReviewerId;
    expect(row).toBe(elena.id);
    expect(reviewer).toBe(jon.id);
  });

  it("§23 step 7/13/15: workflow rules table covers the documented transitions (regression guard)", () => {
    const rules = workflow.WORKFLOW_RULES;
    expect(Object.keys(rules)).toEqual(
      expect.arrayContaining([
        "submit_content_review",
        "approve_content",
        "request_content_changes",
        "resubmit_content",
        "submit_delivery",
        "approve_internal_creative",
        "request_creative_changes",
        "approve_client_creative",
        "record_published",
      ]),
    );
  });

  it("§23 step 7: workflow state-machine resolver denies out-of-table transitions", () => {
    // submit_content_review is allowed from "draft" for content_planner/workspace_manager.
    expect(
      workflow.resolveWorkflowTransition({
        action: "submit_content_review",
        currentStatus: "draft",
        actorRoles: ["content_planner"],
      }),
    ).toBeTruthy();
    // submit_content_review from "ready_to_publish" must be denied (no rule matches).
    expect(() =>
      workflow.resolveWorkflowTransition({
        action: "submit_content_review",
        currentStatus: "ready_to_publish",
        actorRoles: ["content_planner"],
      }),
    ).toThrow();
  });
});
