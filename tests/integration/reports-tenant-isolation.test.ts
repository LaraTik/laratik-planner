import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  socialChannels,
  socialProfileDailyMetrics,
  users,
  workspaces,
} from "@/lib/db/schema";
import { aggregateAgencyReach } from "@/lib/reports/aggregate";
import { resolveAgencyReportSelection } from "@/features/reports/server";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const testDb = drizzle(pool);

describe("agency report tenant isolation", () => {
  let agencyAId: string;
  let agencyBId: string;
  let workspaceAId: string;
  let workspaceBId: string;
  let channelAId: string;
  let channelBId: string;

  beforeAll(async () => {
    await migrate(testDb, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await testDb.execute(sql`
      TRUNCATE social_profile_daily_metric, social_channel, workspace,
        agency_membership, bootstrap_lock, agency, "user"
      RESTART IDENTITY CASCADE
    `);

    const [agencyA, agencyB] = await testDb
      .insert(agencies)
      .values([
        { name: "Agency A", slug: "agency-a" },
        { name: "Agency B", slug: "agency-b" },
      ])
      .returning();
    agencyAId = agencyA!.id;
    agencyBId = agencyB!.id;

    const [user] = await testDb
      .insert(users)
      .values({ email: "reports@tenant-test.invalid", displayName: "Reports Test" })
      .returning();

    const [workspaceA, workspaceB] = await testDb
      .insert(workspaces)
      .values([
        { agencyId: agencyAId, slug: "main-a", name: "Workspace A", createdBy: user!.id },
        { agencyId: agencyBId, slug: "main-b", name: "Workspace B", createdBy: user!.id },
      ])
      .returning();
    workspaceAId = workspaceA!.id;
    workspaceBId = workspaceB!.id;

    const [channelA, channelB] = await testDb
      .insert(socialChannels)
      .values([
        { workspaceId: workspaceAId, platform: "instagram", accountName: "A channel" },
        { workspaceId: workspaceBId, platform: "instagram", accountName: "B channel" },
      ])
      .returning();
    channelAId = channelA!.id;
    channelBId = channelB!.id;

    await testDb.insert(socialProfileDailyMetrics).values([
      {
        socialChannelId: channelAId,
        metricDate: "2026-10-01",
        observedAt: new Date("2026-10-01T12:00:00Z"),
        reach: 100,
        providerApiVersion: "test",
        responseHash: "agency-a-metric",
      },
      {
        socialChannelId: channelBId,
        metricDate: "2026-10-01",
        observedAt: new Date("2026-10-01T12:00:00Z"),
        reach: 9000,
        providerApiVersion: "test",
        responseHash: "agency-b-metric",
      },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects foreign workspace and channel IDs before a report can be rendered or saved", async () => {
    await expect(
      resolveAgencyReportSelection({
        agencyId: agencyAId,
        workspaceIds: [workspaceBId],
        channelIds: [channelBId],
      }),
    ).resolves.toBeNull();

    await expect(
      resolveAgencyReportSelection({
        agencyId: agencyAId,
        workspaceIds: [workspaceAId],
        channelIds: [channelBId],
      }),
    ).resolves.toBeNull();
  });

  it("accepts a same-agency workspace and channel selection", async () => {
    await expect(
      resolveAgencyReportSelection({
        agencyId: agencyAId,
        workspaceIds: [workspaceAId],
        channelIds: [channelAId],
      }),
    ).resolves.toEqual({ workspaceIds: [workspaceAId], channelIds: [channelAId] });
  });

  it("aggregates only the active agency even when callers provide another agency's IDs", async () => {
    const result = await aggregateAgencyReach({
      agencyId: agencyAId,
      workspaceIds: [workspaceAId, workspaceBId],
      channelIds: [channelAId, channelBId],
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-01T23:59:59Z"),
    });

    expect(result.perChannel.map((channel) => channel.channelId)).toEqual([channelAId]);
    expect(result.totals.reach).toBe(100);
  });

  it("returns an empty aggregate when only foreign IDs are supplied", async () => {
    const result = await aggregateAgencyReach({
      agencyId: agencyAId,
      workspaceIds: [workspaceBId],
      channelIds: [channelBId],
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-01T23:59:59Z"),
    });

    expect(result.perChannel).toEqual([]);
    expect(result.totals.reach).toBe(0);
  });
});
