import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

process.env.DATABASE_URL = TEST_DB_URL;

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

type Publishing = typeof import("@/lib/publishing");
type Schema = typeof import("@/lib/db/schema");

let publishing: Publishing;
let schema: Schema;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  publishing = await import("@/lib/publishing");
  schema = await import("@/lib/db/schema");
});

/**
 * M4.6 — Publish-ready Post and Reel packages integration tests.
 *
 * Covers the full platform-payload + materiality + readiness
 * lifecycle against a real Postgres database.
 *
 *   1. Save → read roundtrip preserves the discriminated union.
 *   2. Saving increments `content_items.revision`.
 *   3. Saving a payload material resets an open approval.
 *   4. An internal note does NOT increment revision.
 *   5. Readiness blocks when the payload is missing the
 *      final-copy approval flag.
 *   6. Readiness allows publishing when the payload is
 *      complete (caption + final-copy approved + alt text).
 *   7. Cross-workspace channel access is rejected
 *      (IDOR defence).
 */
describe("M4.6 — publish package lifecycle (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        activity_event, approval_decision, approval_request,
        outbox_event, notification,
        delivery_link, delivery_version,
        comment, comment_mention,
        publication_record, content_assignment, content_item_channel,
        content_item,
        social_channel, content_pillar, campaign,
        workspace_settings, workspace_membership_role, workspace_membership,
        workspace, agency_membership, agency,
        "user"
      RESTART IDENTITY CASCADE
    `);
  });

  async function seedWorkspaceAndContentItem(): Promise<{
    workspaceId: string;
    contentItemId: string;
    managerId: string;
  }> {
    const [manager] = await db
      .insert(schema.users)
      .values({
        email: `manager-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        displayName: "Manager",
        name: "Manager",
      })
      .returning();
    if (!manager) throw new Error("user seed failed");
    const [agency] = await db
      .insert(schema.agencies)
      .values({
        name: "Test Agency",
        slug: `agency-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      })
      .returning();
    if (!agency) throw new Error("agency seed failed");
    await db.insert(schema.agencyMemberships).values({
      userId: manager.id,
      agencyId: agency.id,
      isAgencyAdmin: true,
      status: "active",
    });
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({
        name: "Test Workspace",
        slug: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agencyId: agency.id,
        createdBy: manager.id,
      })
      .returning();
    if (!workspace) throw new Error("workspace seed failed");
    const [item] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: workspace.id,
        title: "Test post",
        format: "static_post",
        brief: "A test post",
        plannedPublishAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        contentOwnerId: manager.id,
        createdBy: manager.id,
      })
      .returning();
    if (!item) throw new Error("content item seed failed");
    return {
      workspaceId: workspace.id,
      contentItemId: item.id,
      managerId: manager.id,
    };
  }

  async function seedSocialChannel(
    workspaceId: string,
  ): Promise<{ channelId: string; cicId: string }> {
    const [channel] = await db
      .insert(schema.socialChannels)
      .values({
        workspaceId,
        platform: "instagram",
        accountName: "@test",
        handle: "@test",
        isActive: true,
      })
      .returning();
    if (!channel) throw new Error("social channel seed failed");
    return { channelId: channel.id, cicId: "" };
  }

  async function attachChannel(contentItemId: string, socialChannelId: string): Promise<string> {
    const [cic] = await db
      .insert(schema.contentItemChannels)
      .values({
        contentItemId,
        socialChannelId,
      })
      .returning();
    if (!cic) throw new Error("content item channel seed failed");
    return cic.id;
  }

  it("savePlatformPayload roundtrip preserves the discriminated union", async () => {
    const { workspaceId, contentItemId, managerId } = await seedWorkspaceAndContentItem();
    const { channelId } = await seedSocialChannel(workspaceId);
    await attachChannel(contentItemId, channelId);
    const actor = { id: managerId };

    const payload = {
      schemaVersion: 1 as const,
      platform: "instagram" as const,
      feedCrop: "4:5" as const,
      caption: "Hello, world.",
      hashtags: ["#laratik"],
      mentions: [],
      collaborators: [],
      carouselOrder: [],
      disclosures: {
        paidPartnership: false,
        aiGenerated: false,
        syntheticMedia: false,
        rightsConfirmed: true,
      },
      publicationMethod: "api" as const,
      approval: { finalCopyApproved: true, approvedByUserId: null, approvedAt: null },
      deliveryReferences: [],
      altText: "An instagram post.",
    };

    await publishing.savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId: channelId,
      payload,
    });
    const read = await publishing.readPlatformPayload({
      actor,
      workspaceId,
      contentItemId,
      socialChannelId: channelId,
    });
    expect(read?.platform).toBe("instagram");
    expect((read as { caption?: string }).caption).toBe("Hello, world.");
  });

  it("saving a payload increments content_items.revision", async () => {
    const { workspaceId, contentItemId, managerId } = await seedWorkspaceAndContentItem();
    const { channelId } = await seedSocialChannel(workspaceId);
    await attachChannel(contentItemId, channelId);

    const [before] = await db
      .select({ revision: schema.contentItems.revision })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${contentItemId}`)
      .limit(1);
    expect(before?.revision).toBe(0);

    await publishing.savePlatformPayload({ id: managerId }, workspaceId, {
      contentItemId,
      socialChannelId: channelId,
      payload: {
        schemaVersion: 1,
        platform: "instagram",
        feedCrop: "1:1",
        caption: "First save",
        hashtags: [],
        mentions: [],
        collaborators: [],
        carouselOrder: [],
        disclosures: {
          paidPartnership: false,
          aiGenerated: false,
          syntheticMedia: false,
          rightsConfirmed: false,
        },
        publicationMethod: "api",
        approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
        deliveryReferences: [],
      },
    });

    const [after] = await db
      .select({ revision: schema.contentItems.revision })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${contentItemId}`)
      .limit(1);
    expect((after?.revision ?? -1) > (before?.revision ?? 0)).toBe(true);
  });

  it("keeps final-copy approval server-owned and resets it after a material edit", async () => {
    const { workspaceId, contentItemId, managerId } = await seedWorkspaceAndContentItem();
    const { channelId } = await seedSocialChannel(workspaceId);
    await attachChannel(contentItemId, channelId);
    const actor = { id: managerId };
    const payload = {
      schemaVersion: 1 as const,
      platform: "instagram" as const,
      feedCrop: "1:1" as const,
      caption: "Approved copy",
      altText: "A campaign image",
      hashtags: [],
      mentions: [],
      collaborators: [],
      carouselOrder: [],
      disclosures: {
        paidPartnership: false,
        aiGenerated: false,
        syntheticMedia: false,
        rightsConfirmed: true,
      },
      publicationMethod: "api" as const,
      approval: {
        finalCopyApproved: true,
        approvedByUserId: managerId,
        approvedAt: new Date().toISOString(),
      },
      deliveryReferences: [],
      selectedDestinationProfile: { socialChannelId: channelId },
    };

    await publishing.savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId: channelId,
      payload,
    });
    let saved = await publishing.readPlatformPayload({
      actor,
      workspaceId,
      contentItemId,
      socialChannelId: channelId,
    });
    expect(saved?.approval).toEqual({
      finalCopyApproved: false,
      approvedByUserId: null,
      approvedAt: null,
    });

    saved = await publishing.setFinalCopyApproval(actor, workspaceId, {
      contentItemId,
      socialChannelId: channelId,
      approved: true,
    });
    expect(saved.approval.finalCopyApproved).toBe(true);
    expect(saved.approval.approvedByUserId).toBe(managerId);
    expect(saved.approval.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await publishing.savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId: channelId,
      payload: { ...saved, caption: "Materially revised copy" },
    });
    const revised = await publishing.readPlatformPayload({
      actor,
      workspaceId,
      contentItemId,
      socialChannelId: channelId,
    });
    expect(revised?.approval.finalCopyApproved).toBe(false);
  });

  it("rejects final-copy approval from a non-admin workspace planner", async () => {
    const { workspaceId, contentItemId } = await seedWorkspaceAndContentItem();
    const { channelId } = await seedSocialChannel(workspaceId);
    await attachChannel(contentItemId, channelId);
    const [workspace] = await db
      .select({ agencyId: schema.workspaces.agencyId })
      .from(schema.workspaces)
      .where(sql`${schema.workspaces.id} = ${workspaceId}`)
      .limit(1);
    if (!workspace) throw new Error("workspace lookup failed");
    const [planner] = await db
      .insert(schema.users)
      .values({
        email: `planner-${Date.now()}@example.com`,
        displayName: "Planner",
        name: "Planner",
      })
      .returning();
    if (!planner) throw new Error("planner seed failed");
    await db.insert(schema.agencyMemberships).values({
      userId: planner.id,
      agencyId: workspace.agencyId,
      isAgencyAdmin: false,
      status: "active",
    });
    const [membership] = await db
      .insert(schema.workspaceMemberships)
      .values({ userId: planner.id, workspaceId, status: "active" })
      .returning();
    if (!membership) throw new Error("membership seed failed");
    await db.insert(schema.workspaceMembershipRoles).values({
      workspaceMembershipId: membership.id,
      role: "content_planner",
    });

    await expect(
      publishing.setFinalCopyApproval({ id: planner.id }, workspaceId, {
        contentItemId,
        socialChannelId: channelId,
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("confirms readiness only after a complete, approved package reaches publish status", async () => {
    const { workspaceId, contentItemId, managerId } = await seedWorkspaceAndContentItem();
    const { channelId } = await seedSocialChannel(workspaceId);
    await attachChannel(contentItemId, channelId);
    const [delivery] = await db
      .insert(schema.deliveryVersions)
      .values({
        contentItemId,
        versionNumber: 1,
        description: "Final creative",
        submittedBy: managerId,
        isFinalApproved: true,
      })
      .returning();
    if (!delivery) throw new Error("delivery seed failed");
    await db
      .update(schema.contentItems)
      .set({ status: "ready_to_publish", approvedDeliveryVersionId: delivery.id })
      .where(sql`${schema.contentItems.id} = ${contentItemId}`);

    const actor = { id: managerId };
    await publishing.savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId: channelId,
      payload: {
        schemaVersion: 1,
        platform: "instagram",
        feedCrop: "1:1",
        caption: "Ready to publish",
        altText: "A complete campaign image",
        hashtags: [],
        mentions: [],
        collaborators: [],
        carouselOrder: [],
        disclosures: {
          paidPartnership: false,
          aiGenerated: false,
          syntheticMedia: false,
          rightsConfirmed: true,
        },
        publicationMethod: "api",
        approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
        deliveryReferences: [{ deliveryVersionId: delivery.id, role: "primary" }],
        selectedDestinationProfile: { socialChannelId: channelId },
      },
    });
    await publishing.setFinalCopyApproval(actor, workspaceId, {
      contentItemId,
      socialChannelId: channelId,
      approved: true,
    });

    const report = await publishing.confirmPublishReadiness(actor, {
      workspaceId,
      contentItemId,
    });
    expect(report.canPublish).toBe(true);
    expect(report.blockers).toBe(0);

    const events = await db.execute(sql`
      SELECT summary FROM activity_event
      WHERE content_item_id = ${contentItemId}
        AND summary = 'Publish package confirmed ready'
    `);
    expect(events.rows).toHaveLength(1);
  });

  it("readiness blocks when final-copy approval is missing", async () => {
    const { workspaceId, contentItemId, managerId } = await seedWorkspaceAndContentItem();
    const { channelId } = await seedSocialChannel(workspaceId);
    await attachChannel(contentItemId, channelId);

    // No payload saved — readiness should report blockers.
    const report = await publishing.evaluateReadiness({
      actor: { id: managerId },
      workspaceId,
      contentItemId,
    });
    expect(report.blockers).toBeGreaterThan(0);
    expect(report.canPublish).toBe(false);
  });

  it("internal note does NOT increment revision", async () => {
    const { contentItemId, managerId } = await seedWorkspaceAndContentItem();
    const actor = { id: managerId };

    const [before] = await db
      .select({ revision: schema.contentItems.revision })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${contentItemId}`)
      .limit(1);
    expect(before?.revision).toBe(0);

    await publishing.recordNonMaterialityEvent({
      actor,
      contentItemId,
      resource: "internal_note",
      summary: "Plan reminder: shoot on Tuesday",
    });

    const [after] = await db
      .select({ revision: schema.contentItems.revision })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${contentItemId}`)
      .limit(1);
    expect(after?.revision).toBe(0);
  });

  it("cross-workspace channel access is rejected (IDOR defence)", async () => {
    // Workspace A: content item + channel.
    const a = await seedWorkspaceAndContentItem();
    const aChannel = await seedSocialChannel(a.workspaceId);
    await attachChannel(a.contentItemId, aChannel.channelId);

    // Workspace B: a separate user + agency.
    const [bUser] = await db
      .insert(schema.users)
      .values({
        email: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        displayName: "B",
        name: "B",
      })
      .returning();
    if (!bUser) throw new Error("user B seed failed");
    const [bAgency] = await db
      .insert(schema.agencies)
      .values({
        name: "B Agency",
        slug: `b-agency-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      })
      .returning();
    if (!bAgency) throw new Error("agency B seed failed");
    await db.insert(schema.agencyMemberships).values({
      userId: bUser.id,
      agencyId: bAgency.id,
      isAgencyAdmin: true,
      status: "active",
    });
    const [bWorkspace] = await db
      .insert(schema.workspaces)
      .values({
        name: "B",
        slug: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agencyId: bAgency.id,
        createdBy: bUser.id,
      })
      .returning();
    if (!bWorkspace) throw new Error("workspace B seed failed");

    // B reads A's channel — forbidden. The service throws
    // `FORBIDDEN` (B is not a member of A's workspace)
    // before the channel query runs, which is a stronger
    // defence than `NOT_FOUND`. Both signals are acceptable
    // for IDOR — what matters is that B never sees A's data.
    await expect(
      publishing.readPlatformPayload({
        actor: { id: bUser.id },
        workspaceId: a.workspaceId,
        contentItemId: a.contentItemId,
        socialChannelId: aChannel.channelId,
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) as never });
  });
});
