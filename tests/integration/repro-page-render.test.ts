import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceRole } from "@/lib/auth/invitation-command";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

let elenaId = "";

vi.mock("@/lib/auth/current-actor", () => ({
  currentActor: async () => (elenaId ? { id: elenaId } : null),
}));

vi.mock("@/lib/auth/config", () => ({
  auth: async () => ({ user: elenaId ? { id: elenaId } : null }),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const noop = () => {};
  return {
    ...actual,
    useRouter: () => ({
      push: noop,
      replace: noop,
      refresh: noop,
      back: noop,
      forward: noop,
      prefetch: noop,
    }),
    usePathname: () => "/app/a/northstar/w/northstar/planning/x",
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => new Map(),
  headers: async () => new Map(),
  draftMode: async () => ({ isEnabled: false }),
}));

describe("REPRO: render the planning page after a delivery submit", () => {
  let content: typeof import("@/lib/content/service") & typeof import("@/features/content/server");
  let deliveries: typeof import("@/lib/deliveries/service");
  let db: Awaited<typeof import("@/lib/db")>["db"];

  let workspaceId: string;
  let channelIds: string[] = [];
  let assetIds: string[] = [];
  let elena: { id: string };
  let jon: { id: string };
  let sophie: { id: string };
  let daniel: { id: string };
  let omar: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    content = Object.assign(
      await import("@/lib/content/service"),
      await import("@/features/content/server"),
    );
    deliveries = await import("@/lib/deliveries/service");
    ({ db } = await import("@/lib/db"));
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
    assetIds = [];
    channelIds = [];
    const {
      agencies,
      agencyMemberships,
      users,
      workspaces,
      socialChannels,
      workspaceSettings,
      mediaAssets,
      storageObjects,
      workspaceMemberships,
      workspaceMembershipRoles,
    } = await import("@/lib/db/schema");

    const all = await db
      .insert(users)
      .values(
        ["maya", "omar", "elena", "jon", "sophie", "daniel"].map((name) => ({
          email: `${name}@repro.test`,
          displayName: name,
          emailVerified: new Date(),
          role: "user",
        })),
      )
      .returning();
    const mayaU = all.find((u) => u.displayName === "maya")!;
    admin = { id: mayaU.id };
    omar = { id: all.find((u) => u.displayName === "omar")!.id };
    elena = { id: all.find((u) => u.displayName === "elena")!.id };
    jon = { id: all.find((u) => u.displayName === "jon")!.id };
    sophie = { id: all.find((u) => u.displayName === "sophie")!.id };
    daniel = { id: all.find((u) => u.displayName === "daniel")!.id };
    elenaId = elena.id;

    const [agency] = await db
      .insert(agencies)
      .values({ name: "Northstar Coffee", slug: "northstar" })
      .returning();
    await db.insert(agencyMemberships).values(
      all.map((u) => ({
        agencyId: agency!.id,
        userId: u.id,
        status: "active" as const,
        isAgencyAdmin: u.id === mayaU!.id,
      })),
    );
    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency!.id,
        name: "Northstar Coffee",
        slug: "northstar",
        timezone: "Europe/Vienna",
        createdBy: mayaU!.id,
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

    const roleForUser: Record<string, WorkspaceRole> = {
      [omar.id]: "content_planner",
      [elena.id]: "designer",
      [jon.id]: "internal_reviewer",
      [sophie.id]: "client_reviewer",
      [daniel.id]: "publisher",
    };
    for (const userId of Object.keys(roleForUser)) {
      const [wm] = await db
        .insert(workspaceMemberships)
        .values({ workspaceId, userId, status: "active" })
        .returning();
      await db
        .insert(workspaceMembershipRoles)
        .values({ workspaceMembershipId: wm!.id, role: roleForUser[userId]! });
    }

    for (const platform of ["instagram", "tiktok"] as const) {
      const [ch] = await db
        .insert(socialChannels)
        .values({
          workspaceId,
          platform,
          accountName: `NS ${platform}`,
          handle: `@ns_${platform}`,
          isActive: true,
        })
        .returning();
      channelIds.push(ch!.id);
    }

    // A SECOND workspace in the same agency — the reported tiles read
    // "DR Reem Reda", which is the asset OWNING workspace column, not the
    // post's workspace.
    const [otherWs] = await db
      .insert(workspaces)
      .values({
        agencyId: agency!.id,
        name: "DR Reem Reda",
        slug: "dr-reem-reda",
        timezone: "Europe/Vienna",
        createdBy: mayaU!.id,
      })
      .returning();

    for (let i = 0; i < 11; i += 1) {
      const ownerWs = i % 2 === 0 ? workspaceId : otherWs!.id;
      const [obj] = await db
        .insert(storageObjects)
        .values({
          agencyId: agency!.id,
          workspaceId: ownerWs,
          bucket: "repro",
          objectKey: `repro/${ownerWs}/${i}.jpg`,
          status: "active",
          kind: "image",
          originalName: `${i}.jpg`,
          mimeType: "image/jpeg",
          byteSize: 1_700_000 + i,
          createdBy: elena.id,
        })
        .returning({ id: storageObjects.id });
      const [preview] = await db
        .insert(storageObjects)
        .values({
          agencyId: agency!.id,
          workspaceId: ownerWs,
          bucket: "repro",
          objectKey: `repro/${ownerWs}/${i}-preview.webp`,
          status: "active",
          kind: "image",
          originalName: `${i}-preview.webp`,
          mimeType: "image/webp",
          byteSize: 40_000 + i,
          width: 400,
          height: 400,
          createdBy: elena.id,
        })
        .returning({ id: storageObjects.id });
      const [asset] = await db
        .insert(mediaAssets)
        .values({
          agencyId: agency!.id,
          ownerWorkspaceId: ownerWs,
          storageObjectId: obj!.id,
          previewStorageObjectId: preview!.id,
          title: `${i + 1}`,
          visibility: "agency",
          status: "ready",
          sourceType: "browser_file",
          createdBy: elena.id,
          updatedBy: elena.id,
        })
        .returning({ id: mediaAssets.id });
      assetIds.push(asset!.id);
    }
  });

  async function seedItemInDesign(title: string): Promise<string> {
    const itemId = await content.quickCreateContentItem(omar, {
      workspaceId,
      title,
      format: "carousel",
      brief: title,
      plannedPublishAt: new Date(),
      channelIds,
    });
    await content.transitionContent(omar, {
      contentItemId: itemId,
      action: "submit_content_review",
    });
    await content.transitionContent(jon, { contentItemId: itemId, action: "approve_content" });
    await content.transitionContent(admin, { contentItemId: itemId, action: "assign_designer" });
    return itemId;
  }

  async function requestCreativeChanges(itemId: string) {
    const { approvalRequests } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.contentItemId, itemId),
          eq(approvalRequests.gate, "creative_internal"),
          eq(approvalRequests.status, "pending"),
        ),
      );
    if (!row) throw new Error("expected pending creative_internal request");
    await deliveries.decideApproval(jon, {
      approvalRequestId: row.id,
      decision: "changes_requested",
      feedback: "Tighten it.",
    });
  }

  async function renderPage(itemId: string) {
    const mod = await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/page");
    const tree = await mod.default({
      params: Promise.resolve({ agencySlug: "northstar", slug: "northstar", id: itemId }),
      searchParams: Promise.resolve({}),
    });
    return renderToStaticMarkup(tree as React.ReactElement);
  }

  it("renders the page after V3 submit with 11 assets", async () => {
    const itemId = await seedItemInDesign("DR Reem Reda launch");

    await deliveries.submitDelivery(elena, {
      contentItemId: itemId,
      description: "V1",
      mediaAssetIds: assetIds.slice(0, 4),
    });
    await requestCreativeChanges(itemId);
    await deliveries.submitDelivery(elena, {
      contentItemId: itemId,
      description: "V2",
      mediaAssetIds: assetIds.slice(0, 5),
    });
    await requestCreativeChanges(itemId);

    // Render BEFORE the reported click.
    expect(await renderPage(itemId)).toContain("DR Reem Reda launch");

    // The reported click.
    await deliveries.submitDelivery(elena, {
      contentItemId: itemId,
      description: "V3",
      mediaAssetIds: assetIds,
    });

    // The page re-render Next.js performs after the server action.
    await expect(renderPage(itemId)).resolves.toContain("creative");
  });
});
