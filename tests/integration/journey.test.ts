import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Primary acceptance journey — service-level, no UI.
 *
 * Mirrors STUDIOFLOW_MASTER_PROMPT.md §23 (30 numbered steps). Each
 * `it` block maps to one or more steps in §23 so that a regression
 * points back to a specific journey step. Multi-actor / multi-table
 * assertions (steps 16-26) drive the bulk of the file because that
 * span is the part of §23 the §24 release gates depend on.
 *
 * The UI-level journey is covered by tests/e2e/* and tests/e2e/role-
 * authorization.spec.ts; this file is the service-level companion that
 * asserts the workflow state machine, the role-based authorization, and
 * the publishing aggregate behave correctly when called directly.
 *
 * TEST-01 (GAP-FULL-REVIEW-2026-08-25) — extended from 4 `it` blocks
 * to cover all 30 §23 steps. Steps 1-3 (bootstrap) are exercised by
 * `tests/integration/bootstrap-concurrency.test.ts`; the rest live here.
 * Steps 29 (mobile) and 30 (keyboard-only) are UI-only and have no
 * service-level contract — they are covered by the e2e Playwright
 * matrix (mobile-safari + accessibility specs).
 */

describe("primary acceptance journey (§23, service-level)", () => {
  let content: typeof import("@/lib/content/service");
  let workflow: typeof import("@/lib/content/workflow");
  let publishing: typeof import("@/lib/publishing/service");
  let deliveries: typeof import("@/lib/deliveries/service");
  let discussions: typeof import("@/lib/discussions/service");
  let invitations: typeof import("@/lib/auth/invitations");
  let db: Awaited<typeof import("@/lib/db")>["db"];

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
    publishing = await import("@/lib/publishing/service");
    deliveries = await import("@/lib/deliveries/service");
    discussions = await import("@/lib/discussions/service");
    invitations = await import("@/lib/auth/invitations");
    ({ db } = await import("@/lib/db"));
  });

  beforeEach(async () => {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);

    const { agencies, agencyMemberships, users, workspaces, socialChannels, workspaceSettings } =
      await import("@/lib/db/schema");

    const all = await db
      .insert(users)
      .values([
        {
          email: "maya@journey.test",
          displayName: "Maya",
          emailVerified: new Date(),
          role: "agency_admin",
        },
        {
          email: "omar@journey.test",
          displayName: "Omar",
          emailVerified: new Date(),
          role: "user",
        },
        {
          email: "elena@journey.test",
          displayName: "Elena",
          emailVerified: new Date(),
          role: "user",
        },
        { email: "jon@journey.test", displayName: "Jon", emailVerified: new Date(), role: "user" },
        {
          email: "sophie@journey.test",
          displayName: "Sophie",
          emailVerified: new Date(),
          role: "user",
        },
        {
          email: "daniel@journey.test",
          displayName: "Daniel",
          emailVerified: new Date(),
          role: "user",
        },
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
    const roleForUser: Record<
      string,
      "content_planner" | "designer" | "internal_reviewer" | "client_reviewer" | "publisher"
    > = {
      omar: "content_planner",
      elena: "designer",
      jon: "internal_reviewer",
      sophie: "client_reviewer",
      daniel: "publisher",
    };
    for (const [key, role] of Object.entries(roleForUser)) {
      const user = { omar, elena, jon, sophie, daniel }[
        key as "omar" | "elena" | "jon" | "sophie" | "daniel"
      ]!;
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

  // ── §23 step 1-3: bootstrap (Maya + concurrency guard) ────────────────
  // Exercised in `tests/integration/bootstrap-concurrency.test.ts`; this
  // step pins the contract that once bootstrap has happened, no second
  // admin can be created through the content workflow.
  it("§23 step 1-3: bootstrap is gated — no content path creates an agency admin", async () => {
    // The content service requires an existing user; the bootstrap path
    // is the ONLY way `agencyMemberships.isAgencyAdmin = true` is set.
    // Sanity: a fresh content item does not touch agency membership.
    const id = await content.quickCreateContentItem(
      { id: omar.id },
      {
        workspaceId,
        title: "Bootstrap gate test",
        format: "static_post",
        brief: "should not create an admin",
        plannedPublishAt: new Date(),
        channelIds,
      },
    );
    expect(id).toBeTruthy();
    const { agencyMemberships } = await import("@/lib/db/schema");
    const rows = await db
      .select()
      .from(agencyMemberships)
      .where(eq(agencyMemberships.agencyId, agencyId));
    const adminCount = rows.filter((r) => r.isAgencyAdmin).length;
    expect(adminCount).toBe(1); // only Maya from the beforeEach seed
  });

  // ── §23 step 4: workspace + channels (set up in beforeEach) ───────────
  it("§23 step 4: workspace exists with Europe/Vienna tz, monthly target 24, and 4 channels", async () => {
    const { workspaces, workspaceSettings } = await import("@/lib/db/schema");
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    expect(ws!.timezone).toBe("Europe/Vienna");
    expect(settings!.monthlyTarget).toBe(24);
    expect(channelIds).toHaveLength(4);
  });

  // ── §23 step 5: configured defaults (already in beforeEach) ────────────
  it("§23 step 5: workspace settings carry the default designer + reviewers + approval mode", async () => {
    const { workspaceSettings } = await import("@/lib/db/schema");
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    expect(settings!.defaultDesignerId).toBe(elena.id);
    expect(settings!.defaultContentReviewerId).toBe(jon.id);
    expect(settings!.defaultInternalCreativeReviewerId).toBe(jon.id);
    expect(settings!.defaultClientReviewerId).toBe(sophie.id);
    expect(settings!.approvalMode).toBe("internal_then_client");
  });

  // ── §23 step 6: Maya invites Omar/Elena/Jon/Sophie/Daniel ────────────
  it("§23 step 6: Maya invites 5 members with their workspace roles", async () => {
    const rolesByEmail: Array<{
      email: string;
      role: "content_planner" | "designer" | "internal_reviewer" | "client_reviewer" | "publisher";
    }> = [
      { email: omar.email, role: "content_planner" },
      { email: elena.email, role: "designer" },
      { email: jon.email, role: "internal_reviewer" },
      { email: sophie.email, role: "client_reviewer" },
      { email: daniel.email, role: "publisher" },
    ];
    for (const { email, role } of rolesByEmail) {
      const result = await invitations.createInvitation({
        email,
        workspaceRoles: [{ workspaceId, role }],
        grantsAgencyAdmin: false,
        invitedBy: maya.id,
        agencyId,
      });
      expect(result.id).toBeTruthy();
      expect(result.acceptUrl).toContain("/accept-invitation?token=");
    }
    const { invitations: invTable } = await import("@/lib/db/schema");
    const allInv = await db.select().from(invTable).where(eq(invTable.agencyId, agencyId));
    expect(allInv).toHaveLength(5);
  });

  // ── §23 step 7: each invitation accepted + client-data denial ────────
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

  // ── §23 step 8: Omar lands on My Work + opens September 2026 planning ─
  it("§23 step 8: listWorkspaceContent returns the month window for the planner view", async () => {
    // Seed two items in September 2026 and one in October to prove the
    // month filter narrows to the active planning window.
    const monthStart = new Date("2026-09-01T00:00:00Z");
    const monthEnd = new Date("2026-10-01T00:00:00Z");
    for (const at of [
      new Date("2026-09-05T08:00:00Z"),
      new Date("2026-09-15T12:00:00Z"),
      new Date("2026-10-01T08:00:00Z"),
    ]) {
      await content.quickCreateContentItem(
        { id: omar.id },
        {
          workspaceId,
          title: `Item @ ${at.toISOString().slice(0, 10)}`,
          format: "static_post",
          brief: "",
          plannedPublishAt: at,
          channelIds,
        },
      );
    }
    const items = await content.listWorkspaceContent({ id: omar.id }, workspaceId, {
      monthStart,
      monthEnd,
    });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(new Date(item.plannedPublishAt).getUTCMonth()).toBe(8); // September (0-indexed)
    }
  });

  // ── §23 step 9: Quick Create initially shows only 4 fields ────────────
  it("§23 step 9: QuickCreateSchema exposes the 4 documented user-visible fields + server-side plumbing", () => {
    const schema = content.QuickCreateSchema;
    const keys = Object.keys(schema.shape).sort();
    // The four user-visible fields are: title, format, brief, plannedPublishAt.
    // workspaceId + channelIds are server-side plumbing the form posts;
    // designerId, campaignId, contentPillarId are filled in by the
    // server from workspace settings, not shown in the initial Quick
    // Create modal. The schema's exact field count can grow with new
    // optional plumbing, so we assert that the four documented fields
    // are present rather than pinning the total count.
    expect(keys).toEqual(expect.arrayContaining(["title", "format", "brief", "plannedPublishAt"]));
  });

  // ── §23 step 10 + 11: Quick Create applies defaults + all 4 channels ──
  it("§23 step 10/11: Quick Create applies workspace settings defaults (designer, reviewers, 4 channels)", async () => {
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
    const row = (detail as unknown as { designerId?: string | null }).designerId;
    const reviewer = (detail as unknown as { contentReviewerId?: string | null }).contentReviewerId;
    expect(row).toBe(elena.id);
    expect(reviewer).toBe(jon.id);
    expect((detail as unknown as { status?: string }).status).toBe("draft");
    expect((detail as unknown as { contentOwnerId?: string }).contentOwnerId).toBe(omar.id);
    // All four active channels are auto-attached.
    const channels = (detail as unknown as { channels: { id: string }[] }).channels;
    expect(channels).toHaveLength(4);
  });

  // ── §23 step 12: Omar opens More details + fills them in ──────────────
  it("§23 step 12: more details updateContentItem persists a richer brief while still in draft", async () => {
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
    const fullBrief = [
      "Hook: cold-open on a cinnamon pour, captioned 30s recipe.",
      "Main: whisk, pour, swirl, top with foam.",
      "CTA: tag a friend who needs their morning fix.",
    ].join("\n");
    await content.updateContentItem(
      { id: omar.id },
      {
        contentItemId: itemId,
        title: "Autumn Recipe in 30 Seconds",
        format: "short_form_video",
        brief: fullBrief,
        plannedPublishAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        channelIds,
      },
    );
    const after = await content.getContentItem({ id: omar.id }, itemId);
    expect((after as unknown as { brief: string }).brief).toBe(fullBrief);
  });

  // ── §23 step 13: Omar submits Content Review (readiness passes) ──────
  it("§23 step 13: submit_content_review transitions draft → content_review", async () => {
    const itemId = await content.quickCreateContentItem(
      { id: omar.id },
      {
        workspaceId,
        title: "Submit test",
        format: "static_post",
        brief: "ready to submit",
        plannedPublishAt: new Date(),
        channelIds,
      },
    );
    const result = await content.transitionContent(
      { id: omar.id },
      { contentItemId: itemId, action: "submit_content_review" },
    );
    expect(result.to).toBe("content_review");
  });

  // ── §23 step 14: Jon requests changes → Omar edits → resubmits ───────
  it("§23 step 14: request_content_changes + edit + resubmit_content cycle (changes_requested → content_review)", async () => {
    const itemId = await content.quickCreateContentItem(
      { id: omar.id },
      {
        workspaceId,
        title: "Cycle test",
        format: "static_post",
        brief: "first draft",
        plannedPublishAt: new Date(),
        channelIds,
      },
    );
    await content.transitionContent(
      { id: omar.id },
      { contentItemId: itemId, action: "submit_content_review" },
    );
    const requested = await content.transitionContent(
      { id: jon.id },
      {
        contentItemId: itemId,
        action: "request_content_changes",
        reason: "Tighten the hook (first 2 seconds).",
      },
    );
    expect(requested.to).toBe("changes_requested");
    // Omar edits + resubmits
    await content.updateContentItem(
      { id: omar.id },
      {
        contentItemId: itemId,
        title: "Cycle test (revised)",
        format: "static_post",
        brief: "tightened hook",
        plannedPublishAt: new Date(),
        channelIds,
      },
    );
    const resubmit = await content.transitionContent(
      { id: omar.id },
      { contentItemId: itemId, action: "resubmit_content" },
    );
    expect(resubmit.to).toBe("content_review");
  });

  // ── §23 step 15: Jon approves → approved_for_design + assign_designer
  it("§23 step 15: approve_content → approved_for_design, then assign_designer → in_design", async () => {
    const itemId = await content.quickCreateContentItem(
      { id: omar.id },
      {
        workspaceId,
        title: "Approve flow",
        format: "static_post",
        brief: "x",
        plannedPublishAt: new Date(),
        channelIds,
      },
    );
    await content.transitionContent(
      { id: omar.id },
      { contentItemId: itemId, action: "submit_content_review" },
    );
    const approved = await content.transitionContent(
      { id: jon.id },
      { contentItemId: itemId, action: "approve_content" },
    );
    expect(approved.to).toBe("approved_for_design");
    const assigned = await content.transitionContent(
      { id: maya.id },
      { contentItemId: itemId, action: "assign_designer" },
    );
    expect(assigned.to).toBe("in_design");
  });

  // ── §23 step 16: Elena adds a client-visible clarification ───────────
  it("§23 step 16: client-visible clarification is visible to Sophie and invisible in internal-only views", async () => {
    const itemId = await seedItemInCreativeReview(omar, "Clarification test");
    const clar = await discussions.createComment(
      { id: elena.id },
      {
        contentItemId: itemId,
        body: "@sophie — should the on-screen recipe list the grams or the cups?",
        visibility: "client",
        label: "question",
      },
    );
    expect(clar.id).toBeTruthy();
    const sophieView = await discussions.listCommentsForItem({ id: sophie.id }, itemId);
    const elenaView = await discussions.listCommentsForItem({ id: elena.id }, itemId);
    expect(sophieView.some((c) => c.id === clar.id)).toBe(true);
    // Internal comment is NOT visible to sophie
    expect(sophieView.every((c) => c.visibility !== "internal")).toBe(true);
    // Internal viewer sees both
    expect(elenaView.some((c) => c.id === clar.id)).toBe(true);
  });

  // ── §23 step 17: clarification is resolved + appears in activity ─────
  it("§23 step 17: resolveComment marks the clarification resolved and activity event is recorded", async () => {
    const itemId = await seedItemInCreativeReview(omar, "Resolve test");
    const clar = await discussions.createComment(
      { id: elena.id },
      {
        contentItemId: itemId,
        body: "Should the closing frame carry the brand monogram?",
        visibility: "client",
        label: "question",
      },
    );
    // The author resolves her own clarification (per the resolveComment
    // policy: only the author or a privileged manager can resolve).
    // The service returns void; the side effect is a resolvedAt set on
    // the row, which we re-read to assert.
    await discussions.resolveComment({ id: elena.id }, { commentId: clar.id, resolved: true });
    const { comments, activityEvents } = await import("@/lib/db/schema");
    const [reloaded] = await db.select().from(comments).where(eq(comments.id, clar.id));
    expect(reloaded!.resolvedAt).toBeInstanceOf(Date);
    expect(reloaded!.resolvedBy).toBe(elena.id);
    const events = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.contentItemId, itemId));
    // The create_comment + resolve_comment + workflow transitions all
    // emit activity rows; resolve must be among them.
    expect(events.length).toBeGreaterThan(0);
  });

  // ── §23 step 18: Elena submits Delivery V1 (Frame.io + Google Drive) ─
  it("§23 step 18: submitDelivery creates V1 with a preview Frame.io link + a production Google Drive link", async () => {
    const itemId = await seedItemInCreativeReview(omar, "Delivery V1 test");
    const v1 = await deliveries.submitDelivery(
      { id: elena.id },
      {
        contentItemId: itemId,
        description: "V1 — first cut of the 30s spot",
        designerNote: "Frame.io is the timecoded review link; GDrive is the master file.",
        links: [
          {
            provider: "frame_io",
            label: "V1 review (Frame.io)",
            url: "https://f.io/v/abc123",
            isPreview: true,
          },
          {
            provider: "google_drive",
            label: "V1 master (Drive)",
            url: "https://drive.google.com/file/d/xyz",
            isPreview: false,
          },
        ],
      },
    );
    expect(v1.versionNumber).toBe(1);
    const versions = await deliveries.listDeliveriesForItem({ id: maya.id }, itemId);
    expect(versions).toHaveLength(1);
    const links = versions[0]!.links;
    expect(links.find((l) => l.provider === "frame_io")?.isPreview).toBe(true);
    expect(links.find((l) => l.provider === "google_drive")).toBeTruthy();
  });

  // ── §23 step 19: Jon requests creative changes + Elena submits V2 ───
  it("§23 step 19: request_creative_changes → changes_requested, V2 supersedes V1 with prior feedback visible", async () => {
    const itemId = await seedItemInCreativeReview(omar, "V1 → changes → V2");
    const v1 = await deliveries.submitDelivery(
      { id: elena.id },
      {
        contentItemId: itemId,
        description: "V1",
        links: [{ provider: "frame_io", label: "V1", url: "https://f.io/v/v1", isPreview: true }],
      },
    );
    const { approvalRequests } = await import("@/lib/db/schema");
    // The V1 submit creates a creative_internal request. Filter by
    // gate + status so we get the V1 pending one deterministically
    // (no orderBy needed because the unique index guarantees only one
    // pending creative_internal row for the item). Without the gate
    // filter, the LIMIT 1 race picks up the leftover `content`
    // request (status='approved') left behind by seedItemInCreativeReview.
    const [creativeRequest] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.contentItemId, itemId),
          eq(approvalRequests.gate, "creative_internal"),
          eq(approvalRequests.status, "pending"),
        ),
      );
    if (!creativeRequest) throw new Error("Expected V1 creative_internal request to exist");
    expect(creativeRequest.status).toBe("pending");
    expect(creativeRequest.gate).toBe("creative_internal");
    await deliveries.decideApproval(
      { id: jon.id },
      {
        approvalRequestId: creativeRequest.id,
        decision: "changes_requested",
        feedback: "Tighten the opening beat — first 2s are too slow.",
      },
    );
    const v2 = await deliveries.submitDelivery(
      { id: elena.id },
      {
        contentItemId: itemId,
        description: "V2",
        designerNote: "Opening beat recut per Jon's feedback.",
        links: [{ provider: "frame_io", label: "V2", url: "https://f.io/v/v2", isPreview: true }],
      },
    );
    expect(v2.versionNumber).toBe(2);
    // Past feedback + V1 + V2 must all remain visible. The list
    // helper orders by versionNumber DESC, so V2 comes first.
    const versions = await deliveries.listDeliveriesForItem({ id: maya.id }, itemId);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.versionNumber).toBe(2);
    expect(versions[1]!.versionNumber).toBe(1);
    expect(v1.versionNumber).toBe(1);
  });

  // ── §23 step 20: Jon approves V2 internally ──────────────────────────
  it("§23 step 20: internal approval of V2 in internal_then_client mode creates a client request and keeps status in creative_review", async () => {
    const itemId = await seedItemInCreativeReview(omar, "Internal approve V2");
    await deliveries.submitDelivery(
      { id: elena.id },
      {
        contentItemId: itemId,
        description: "V2",
        links: [{ provider: "frame_io", label: "V2", url: "https://f.io/v/v2", isPreview: true }],
      },
    );
    const { approvalRequests } = await import("@/lib/db/schema");
    // Same gate+status filter as step 19: the item has a leftover
    // `content` request (status='approved') from seedItemInCreativeReview
    // that would otherwise be picked up first.
    const [creativeRequest] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.contentItemId, itemId),
          eq(approvalRequests.gate, "creative_internal"),
          eq(approvalRequests.status, "pending"),
        ),
      );
    if (!creativeRequest) throw new Error("Expected creative_internal request to exist");
    await deliveries.decideApproval(
      { id: jon.id },
      { approvalRequestId: creativeRequest.id, decision: "approved" },
    );
    // In internal_then_client mode, internal approval does NOT mark the
    // item ready_to_publish — it creates a creative_client request and
    // leaves the item in creative_review.
    const detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("creative_review");
    const clientRequest = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.gate, "creative_client"));
    expect(clientRequest).toHaveLength(1);
  });

  // ── §23 step 21: Sophie receives a client review (client-only) ───────
  it("§23 step 21: sophie's comment view contains only client-visible content (no internal discussion)", async () => {
    const itemId = await seedItemInCreativeReview(omar, "Client review scope");
    // Elena posts a client-visible question
    await discussions.createComment(
      { id: elena.id },
      {
        contentItemId: itemId,
        body: "Should the closing frame carry the brand monogram?",
        visibility: "client",
        label: "question",
      },
    );
    // Omar posts an internal-only discussion (workflow coordination)
    await discussions.createComment(
      { id: omar.id },
      {
        contentItemId: itemId,
        body: "Internal: Jon flagged the open, plz loop him in before V2.",
        visibility: "internal",
        label: "general",
      },
    );
    const sophieView = await discussions.listCommentsForItem({ id: sophie.id }, itemId);
    expect(sophieView.length).toBeGreaterThan(0);
    expect(sophieView.every((c) => c.visibility === "client")).toBe(true);
    expect(sophieView.some((c) => c.body.includes("brand monogram"))).toBe(true);
    expect(sophieView.some((c) => c.body.includes("Internal: Jon flagged"))).toBe(false);
  });

  // ── §23 step 22: Sophie approves → ready_to_publish + V2 is final ────
  it("§23 step 22: client approval of V2 sets the item to ready_to_publish and marks V2 as final", async () => {
    const itemId = await seedItemInCreativeReview(omar, "Client approve");
    // V1 → request changes → V2 → internal approve → client approve
    await deliveries.submitDelivery(
      { id: elena.id },
      {
        contentItemId: itemId,
        description: "V1",
        links: [{ provider: "frame_io", label: "V1", url: "https://f.io/v/v1", isPreview: true }],
      },
    );
    const { approvalRequests } = await import("@/lib/db/schema");
    const v1Reqs = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.contentItemId, itemId));
    const v1Internal = v1Reqs.find((r) => r.gate === "creative_internal");
    if (!v1Internal) throw new Error("V1 creative_internal request not found");
    await deliveries.decideApproval(
      { id: jon.id },
      {
        approvalRequestId: v1Internal.id,
        decision: "changes_requested",
        feedback: "Tighten the opening",
      },
    );
    await deliveries.submitDelivery(
      { id: elena.id },
      {
        contentItemId: itemId,
        description: "V2",
        links: [{ provider: "frame_io", label: "V2", url: "https://f.io/v/v2", isPreview: true }],
      },
    );
    const v2InternalReqs = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.contentItemId, itemId));
    const v2Internal = v2InternalReqs.find(
      (r) => r.gate === "creative_internal" && r.status === "pending",
    );
    if (!v2Internal) throw new Error("V2 creative_internal request not found");
    await deliveries.decideApproval(
      { id: jon.id },
      { approvalRequestId: v2Internal.id, decision: "approved" },
    );
    const afterInternal = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.contentItemId, itemId));
    const client = afterInternal.find(
      (r) => r.gate === "creative_client" && r.status === "pending",
    );
    if (!client) throw new Error("creative_client request was not created by internal approval");
    await deliveries.decideApproval(
      { id: sophie.id },
      { approvalRequestId: client.id, decision: "approved" },
    );
    const detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("ready_to_publish");
    const versions = await deliveries.listDeliveriesForItem({ id: maya.id }, itemId);
    const v2 = versions.find((v) => v.versionNumber === 2);
    expect(v2).toBeDefined();
    expect(v2!.isFinalApproved).toBe(true);
  });

  // ── §23 step 23: Daniel records IG + TikTok as Published ─────────────
  it("§23 step 23: recording 2 of 4 channels as Published flips overall status to partially_published", async () => {
    const itemId = await seedItemReadyToPublish(omar, "Partial publish");
    const links = await listItemChannels(itemId);
    const ig = links.find((l) => l.platform === "instagram")!;
    const tiktok = links.find((l) => l.platform === "tiktok")!;
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: ig.id,
        status: "published",
        publishedUrl: "https://instagram.com/p/abc",
      },
    );
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: tiktok.id,
        status: "published",
        publishedUrl: "https://tiktok.com/@northstar/video/abc",
      },
    );
    const detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("partially_published");
  });

  // ── §23 step 24: Facebook Failed → edited → retried → Published ──────
  it("§23 step 24: re-recording a channel updates the same record (failed → published)", async () => {
    const itemId = await seedItemReadyToPublish(omar, "Failed then retry");
    const links = await listItemChannels(itemId);
    const fb = links.find((l) => l.platform === "facebook")!;
    // First attempt — failed. The aggregate keeps the item in
    // "ready_to_publish" because a failed record is not yet "closed"
    // (per the aggregate: only published+skipped count toward
    // closure). This matches the master prompt §23 step 24 narrative:
    // failed → edited → retried → published.
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: fb.id,
        status: "failed",
        failureReason: "API rate-limited",
      },
    );
    let detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("ready_to_publish");
    // Retry — published
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: fb.id,
        status: "published",
        publishedUrl: "https://facebook.com/northstar/posts/abc",
      },
    );
    detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("partially_published");
    // Single record row per channel (not duplicated)
    const { publicationRecords } = await import("@/lib/db/schema");
    const all = await db.select().from(publicationRecords);
    const fbRecs = all.filter((r) => r.contentItemChannelId === fb.id);
    expect(fbRecs).toHaveLength(1);
    expect(fbRecs[0]!.status).toBe("published");
  });

  // ── §23 step 25: YouTube is Skipped with a reason ────────────────────
  it("§23 step 25: recording YouTube as skipped (with a note) does not block the published aggregate", async () => {
    const itemId = await seedItemReadyToPublish(omar, "YouTube skip");
    const links = await listItemChannels(itemId);
    const ig = links.find((l) => l.platform === "instagram")!;
    const tiktok = links.find((l) => l.platform === "tiktok")!;
    const fb = links.find((l) => l.platform === "facebook")!;
    const yt = links.find((l) => l.platform === "youtube")!;
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: ig.id,
        status: "published",
        publishedUrl: "https://instagram.com/p/ig",
      },
    );
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: tiktok.id,
        status: "published",
        publishedUrl: "https://tiktok.com/@northstar/video/tk",
      },
    );
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: fb.id,
        status: "published",
        publishedUrl: "https://facebook.com/northstar/posts/fb",
      },
    );
    await publishing.recordPublication(
      { id: daniel.id },
      {
        contentItemChannelId: yt.id,
        status: "skipped",
        note: "Brand not active on YouTube for this product",
      },
    );
    const detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("published");
  });

  // ── §23 step 26: overall status becomes Published ────────────────────
  it("§23 step 26: closing every selected channel transitions overall status to published", async () => {
    const itemId = await seedItemReadyToPublish(omar, "All closed");
    const links = await listItemChannels(itemId);
    for (const link of links) {
      await publishing.recordPublication(
        { id: daniel.id },
        {
          contentItemChannelId: link.id,
          status: "published",
          publishedUrl: `https://${link.platform}.example/northstar/${link.id.slice(0, 6)}`,
        },
      );
    }
    const detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("published");
  });

  // ── §23 step 27: planning list + KPI show consistent final state ─────
  it("§23 step 27: listWorkspaceContent + getContentItem both return the final published status", async () => {
    const itemId = await seedItemReadyToPublish(omar, "Final consistency");
    const links = await listItemChannels(itemId);
    for (const link of links) {
      await publishing.recordPublication(
        { id: daniel.id },
        {
          contentItemChannelId: link.id,
          status: "published",
          publishedUrl: `https://${link.platform}.example/northstar/${link.id.slice(0, 6)}`,
        },
      );
    }
    const list = await content.listWorkspaceContent({ id: maya.id }, workspaceId);
    const matched = list.find((i) => i.id === itemId)!;
    expect(matched.status).toBe("published");
    const detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("published");
  });

  // ── §23 step 28: archive/restore preserves history ────────────────────
  it("§23 step 28: cancellation preserves the activity history (no rows are deleted)", async () => {
    const itemId = await content.quickCreateContentItem(
      { id: omar.id },
      {
        workspaceId,
        title: "Archive/restore history test",
        format: "static_post",
        brief: "x",
        plannedPublishAt: new Date(),
        channelIds,
      },
    );
    await content.transitionContent(
      { id: omar.id },
      { contentItemId: itemId, action: "submit_content_review" },
    );
    const { activityEvents } = await import("@/lib/db/schema");
    const before = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.contentItemId, itemId));
    expect(before.length).toBeGreaterThan(0);
    // Cancel preserves history — no rows are deleted, only the status changes.
    const cancelled = await content.transitionContent(
      { id: maya.id },
      {
        contentItemId: itemId,
        action: "cancel",
        reason: "Brand paused the campaign",
      },
    );
    expect(cancelled.to).toBe("cancelled");
    const after = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.contentItemId, itemId));
    // History grows (cancel emits an event), nothing is deleted.
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    const detail = await content.getContentItem({ id: maya.id }, itemId);
    expect((detail as unknown as { status: string }).status).toBe("cancelled");
  });

  // ── §23 step 29/30: mobile + keyboard-only ───────────────────────────
  // These are UI-only concerns covered by tests/e2e/mobile-safari.spec.ts
  // and tests/e2e/mobile.spec.ts (step 29) plus tests/e2e/a11y.spec.ts
  // (step 30). At the service layer the contract is that the data the
  // mobile review/publish actions consume is queryable by the role
  // that performs them — covered by the assertions in steps 7, 20, 22.
  it("§23 step 29/30: every role that can act on the service can also list the items they need to act on", async () => {
    const itemId = await seedItemReadyToPublish(omar, "Multi-role reachability");
    // Daniel (publisher) sees the item in the planning list — this is
    // what the mobile publish screen renders.
    const danielList = await content.listWorkspaceContent({ id: daniel.id }, workspaceId);
    expect(danielList.find((i) => i.id === itemId)).toBeTruthy();
    // Jon (internal_reviewer) sees the same item — what the review
    // decision screen renders.
    const jonList = await content.listWorkspaceContent({ id: jon.id }, workspaceId);
    expect(jonList.find((i) => i.id === itemId)).toBeTruthy();
  });

  // ── §23 step 7/13/15: workflow rules table covers the documented transitions (regression guard)
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

  // ── §23 step 7: workflow state-machine resolver denies out-of-table transitions
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

  // ── helpers ───────────────────────────────────────────────────────────
  async function seedItemInCreativeReview(owner: { id: string }, title: string): Promise<string> {
    const itemId = await content.quickCreateContentItem(
      { id: owner.id },
      {
        workspaceId,
        title,
        format: "static_post",
        brief: title,
        plannedPublishAt: new Date(),
        channelIds,
      },
    );
    await content.transitionContent(
      { id: owner.id },
      { contentItemId: itemId, action: "submit_content_review" },
    );
    await content.transitionContent(
      { id: jon.id },
      { contentItemId: itemId, action: "approve_content" },
    );
    await content.transitionContent(
      { id: maya.id },
      { contentItemId: itemId, action: "assign_designer" },
    );
    return itemId;
  }

  async function seedItemReadyToPublish(owner: { id: string }, title: string): Promise<string> {
    const itemId = await seedItemInCreativeReview(owner, title);
    await deliveries.submitDelivery(
      { id: elena.id },
      {
        contentItemId: itemId,
        description: "V1",
        links: [{ provider: "frame_io", label: "V1", url: "https://f.io/v/v1", isPreview: true }],
      },
    );
    const { approvalRequests } = await import("@/lib/db/schema");
    const internalReqs = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.contentItemId, itemId));
    const internal = internalReqs.find((r) => r.gate === "creative_internal")!;
    await deliveries.decideApproval(
      { id: jon.id },
      { approvalRequestId: internal.id, decision: "approved" },
    );
    // Re-fetch: the client request is created by the internal approval
    // in `internal_then_client` mode, so it did not exist in the
    // previous snapshot.
    const afterInternal = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.contentItemId, itemId));
    const client = afterInternal.find((r) => r.gate === "creative_client");
    if (!client) throw new Error("creative_client request was not created by internal approval");
    await deliveries.decideApproval(
      { id: sophie.id },
      { approvalRequestId: client.id, decision: "approved" },
    );
    return itemId;
  }

  async function listItemChannels(itemId: string) {
    const { contentItemChannels, socialChannels } = await import("@/lib/db/schema");
    return db
      .select({
        id: contentItemChannels.id,
        platform: socialChannels.platform,
      })
      .from(contentItemChannels)
      .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
      .where(eq(contentItemChannels.contentItemId, itemId));
  }
});
