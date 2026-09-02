import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  agencies,
  agencyMemberships,
  contentItemChannels,
  contentItems,
  socialChannels,
  users,
  workspaces,
} from "@/lib/db/schema";
import { listWorkspaceContentEnriched } from "@/lib/content/enriched-list";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

describe("enriched planning list filters", () => {
  let workspaceId: string;
  let actorId: string;
  let channelAId: string;
  let channelBId: string;
  let itemIds: Record<string, string>;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        content_item_channel, content_item, social_channel,
        workspace_membership_role, workspace_membership, workspace_settings,
        workspace, agency_membership, agency, "user"
      RESTART IDENTITY CASCADE
    `);

    const [user] = await db
      .insert(users)
      .values({ email: "planner@filters.test", displayName: "Planner" })
      .returning({ id: users.id });
    actorId = user!.id;

    const [agency] = await db
      .insert(agencies)
      .values({ name: "Filters Agency", slug: "filters-agency" })
      .returning({ id: agencies.id });
    await db.insert(agencyMemberships).values({
      agencyId: agency!.id,
      userId: actorId,
      status: "active",
      isAgencyAdmin: true,
    });

    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency!.id,
        name: "Filters Workspace",
        slug: "filters",
        createdBy: actorId,
      })
      .returning({ id: workspaces.id });
    workspaceId = workspace!.id;

    const channels = await db
      .insert(socialChannels)
      .values([
        { workspaceId, platform: "instagram", accountName: "Channel A" },
        { workspaceId, platform: "linkedin", accountName: "Channel B" },
      ])
      .returning({ id: socialChannels.id });
    channelAId = channels[0]!.id;
    channelBId = channels[1]!.id;

    const planned = new Date("2026-09-15T12:00:00.000Z");
    const rows = await db
      .insert(contentItems)
      .values([
        {
          workspaceId,
          title: "Planning item",
          format: "static_post",
          plannedPublishAt: planned,
          contentOwnerId: actorId,
          createdBy: actorId,
          status: "draft",
        },
        {
          workspaceId,
          title: "Review item",
          format: "carousel",
          plannedPublishAt: planned,
          contentOwnerId: actorId,
          createdBy: actorId,
          status: "content_review",
        },
        {
          workspaceId,
          title: "Design item",
          format: "story",
          plannedPublishAt: planned,
          contentOwnerId: actorId,
          createdBy: actorId,
          status: "approved_for_design",
        },
      ])
      .returning({ id: contentItems.id, title: contentItems.title });
    itemIds = Object.fromEntries(rows.map((row) => [row.title, row.id]));

    await db.insert(contentItemChannels).values([
      { contentItemId: itemIds["Planning item"]!, socialChannelId: channelAId },
      { contentItemId: itemIds["Review item"]!, socialChannelId: channelBId },
      { contentItemId: itemIds["Design item"]!, socialChannelId: channelAId },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies stage and channel filters to both rows and totals", async () => {
    const actor = { id: actorId };
    const now = new Date("2026-09-01T12:00:00.000Z");

    const stageResult = await listWorkspaceContentEnriched(
      actor,
      workspaceId,
      { stage: "approved_for_design", limit: 20 },
      now,
      ["workspace_manager"],
    );
    expect(stageResult.items.map((item) => item.title)).toEqual(["Design item"]);
    expect(stageResult.total).toBe(1);

    const channelResult = await listWorkspaceContentEnriched(
      actor,
      workspaceId,
      { channelId: channelBId, limit: 20 },
      now,
      ["workspace_manager"],
    );
    expect(channelResult.items.map((item) => item.title)).toEqual(["Review item"]);
    expect(channelResult.total).toBe(1);
  });

  it("filters health after enrichment without changing the unfiltered total contract", async () => {
    const result = await listWorkspaceContentEnriched(
      { id: actorId },
      workspaceId,
      { healthIn: ["needs_review"], limit: 20 },
      new Date("2026-09-01T12:00:00.000Z"),
      ["workspace_manager"],
    );

    expect(result.items.map((item) => item.title)).toEqual(["Review item"]);
    expect(result.total).toBe(3);
  });
});
