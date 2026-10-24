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
  workspaces as workspacesTable,
} from "@/lib/db/schema";
import { loadCreativeExportData } from "@/features/content/planning-xlsx-export-data.server";
import type { EnrichedContentItem } from "@/lib/content/enriched-list";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

describe("planning XLSX export data", () => {
  let workspaceAId: string;
  let workspaceBId: string;
  let itemAId: string;
  let channelAId: string;
  let channelBId: string;

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
      .values({ email: "planner@xlsx-export.test", displayName: "Planner" })
      .returning({ id: users.id });
    const [agencyA] = await db
      .insert(agencies)
      .values({ name: "Export Agency A", slug: "export-agency-a" })
      .returning({ id: agencies.id });
    const [agencyB] = await db
      .insert(agencies)
      .values({ name: "Export Agency B", slug: "export-agency-b" })
      .returning({ id: agencies.id });
    await db.insert(agencyMemberships).values([
      { agencyId: agencyA!.id, userId: user!.id, status: "active", isAgencyAdmin: true },
      { agencyId: agencyB!.id, userId: user!.id, status: "active", isAgencyAdmin: true },
    ]);

    const workspaceRows = await db
      .insert(workspacesTable)
      .values([
        {
          agencyId: agencyA!.id,
          name: "Export Workspace A",
          slug: "xlsx-export-a",
          createdBy: user!.id,
        },
        {
          agencyId: agencyB!.id,
          name: "Export Workspace B",
          slug: "xlsx-export-b",
          createdBy: user!.id,
        },
      ])
      .returning({ id: workspacesTable.id });
    workspaceAId = workspaceRows[0]!.id;
    workspaceBId = workspaceRows[1]!.id;

    const channels = await db
      .insert(socialChannels)
      .values([
        { workspaceId: workspaceAId, platform: "instagram", accountName: "A Instagram" },
        { workspaceId: workspaceBId, platform: "facebook", accountName: "B Facebook" },
      ])
      .returning({ id: socialChannels.id });
    channelAId = channels[0]!.id;
    channelBId = channels[1]!.id;

    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId: workspaceAId,
        title: "Arabic campaign",
        format: "static_post",
        plannedPublishAt: new Date("2026-10-24T12:00:00.000Z"),
        contentOwnerId: user!.id,
        createdBy: user!.id,
        status: "draft",
        mediaRequired: false,
        formatPayload: { schemaVersion: 1, contentLanguage: "ar", caption: "منشور عربي" },
      })
      .returning({ id: contentItems.id });
    itemAId = item!.id;

    await db.insert(contentItemChannels).values([
      { contentItemId: itemAId, socialChannelId: channelAId },
      // Deliberately malformed cross-workspace association: the export loader
      // must not leak another workspace's channel, even if legacy data has it.
      { contentItemId: itemAId, socialChannelId: channelBId },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("loads creative and channel copy only for the requested workspace", async () => {
    const items = [{ id: itemAId }] as EnrichedContentItem[];

    const data = await loadCreativeExportData(workspaceAId, items);
    expect(data.get(itemAId)).toMatchObject({
      payload: { contentLanguage: "ar", caption: "منشور عربي" },
      mediaRequired: false,
      channels: [{ socialChannelId: channelAId, accountName: "A Instagram" }],
    });

    const wrongWorkspaceData = await loadCreativeExportData(workspaceBId, items);
    expect(wrongWorkspaceData.has(itemAId)).toBe(false);
  });
});
