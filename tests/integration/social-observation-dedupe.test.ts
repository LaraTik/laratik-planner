import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  users,
  workspaces,
  workspaceMemberships,
  socialChannels,
  socialPostObservations,
} from "@/lib/db/schema";
import { querySocialPostObservations } from "@/lib/social/analytics-query";
import { backfillMissingThumbnails } from "@/lib/social/thumbnail-backfill";

/**
 * Command Center observation de-duplication, against a real Postgres.
 *
 * `social_post_observation` stores one row per post PER SYNC DAY — the
 * unique index is (channel, provider, post id, observation_date). The read
 * path used to return those raw rows as if each were a distinct post, so a
 * workspace with 3 posts synced over 3 days produced 9 rows and Top
 * content ranked the SAME post three times. Every "Open source" link was
 * therefore identical.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... pnpm test:integration
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

let workspaceId: string;
let channelId: string;

async function seedWorkspaceAndChannel(slugSuffix = "dedupe") {
  const [agency] = await db
    .insert(agencies)
    .values({ name: "Agency", slug: `agency-${slugSuffix}` })
    .returning({ id: agencies.id });
  const [user] = await db
    .insert(users)
    .values({ email: `dedupe-${slugSuffix}@laratik.local`, displayName: "Owner" })
    .returning({ id: users.id });
  const [workspace] = await db
    .insert(workspaces)
    .values({
      agencyId: agency!.id,
      name: "Acme",
      slug: `acme-${slugSuffix}`,
      timezone: "UTC",
      createdBy: user!.id,
    })
    .returning({ id: workspaces.id });
  await db.insert(workspaceMemberships).values({
    workspaceId: workspace!.id,
    userId: user!.id,
  });
  const [channel] = await db
    .insert(socialChannels)
    .values({
      workspaceId: workspace!.id,
      platform: "instagram",
      accountName: "Acme IG",
      connectionStatus: "connected",
    })
    .returning({ id: socialChannels.id });
  return { workspaceId: workspace!.id, channelId: channel!.id };
}

/** Insert one post's daily snapshots, exactly as the provider sync does. */
async function seedSnapshots(
  postId: string,
  permalink: string,
  dates: string[],
  views: number,
  thumbnailUrl: string | null,
) {
  for (const observationDate of dates) {
    await db.insert(socialPostObservations).values({
      socialChannelId: channelId,
      observationDate,
      observedAt: new Date(`${observationDate}T06:00:00Z`),
      externalProvider: "meta",
      externalPostId: postId,
      permalink,
      thumbnailUrl,
      caption: observationDate === dates[0] ? `caption for ${postId}` : null,
      publishedAt: new Date("2026-09-20T10:00:00Z"),
      mediaType: "reel",
      views,
      reach: views,
      likes: 10,
      comments: 1,
      interactions: 11,
      providerApiVersion: "v25.0",
      providerRequestId: `req-${postId}-${observationDate}`,
      sourceMetadata: { fixture: true },
    });
  }
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
});

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE
      social_post_observation, social_profile_daily_metric, social_oauth_state,
      social_channel, social_connection,
      publication_record, content_item_channel, content_item,
      brand_asset, brand_voice_rule,
      content_assignment, content_template, content_pillar, campaign,
      workspace_membership_role, workspace_membership, workspace_settings,
      workspace, invitation_workspace_role, invitation,
      agency_membership, bootstrap_lock, agency, "user"
    RESTART IDENTITY CASCADE
  `);
  const seeded = await seedWorkspaceAndChannel();
  workspaceId = seeded.workspaceId;
  channelId = seeded.channelId;
});

afterAll(async () => {
  await pool.end();
});

describe("querySocialPostObservations de-duplication", () => {
  it("returns one row per post even when a post has many daily snapshots", async () => {
    await seedSnapshots(
      "post-a",
      "https://example.test/a",
      ["2026-09-18", "2026-09-19", "2026-09-20"],
      5_000,
      null,
    );
    await seedSnapshots(
      "post-b",
      "https://example.test/b",
      ["2026-09-18", "2026-09-19"],
      9_000,
      null,
    );

    const rows = await querySocialPostObservations(db, workspaceId, "UTC", new Date());

    expect(rows).toHaveLength(2);
    const keys = rows.map((row) => row.observation.externalPostId).sort();
    expect(keys).toEqual(["post-a", "post-b"]);
  });

  it("keeps the NEWEST snapshot of a post, so its metrics are current", async () => {
    // post-a grew from 1,000 to 9,000 views across its snapshots.
    await db.insert(socialPostObservations).values([
      {
        socialChannelId: channelId,
        observationDate: "2026-09-18",
        observedAt: new Date("2026-09-18T06:00:00Z"),
        externalProvider: "meta",
        externalPostId: "post-a",
        permalink: "https://example.test/a",
        publishedAt: new Date("2026-09-20T10:00:00Z"),
        mediaType: "reel",
        views: 1_000,
        providerApiVersion: "v25.0",
        sourceMetadata: {},
      },
      {
        socialChannelId: channelId,
        observationDate: "2026-09-20",
        observedAt: new Date("2026-09-20T06:00:00Z"),
        externalProvider: "meta",
        externalPostId: "post-a",
        permalink: "https://example.test/a",
        publishedAt: new Date("2026-09-20T10:00:00Z"),
        mediaType: "reel",
        views: 9_000,
        providerApiVersion: "v25.0",
        sourceMetadata: {},
      },
    ]);

    const rows = await querySocialPostObservations(db, workspaceId, "UTC", new Date());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.observation.views).toBe(9_000);
  });

  it("gives every post its own permalink, so Top content links differ", async () => {
    for (const [id, link] of [
      ["post-a", "https://example.test/a"],
      ["post-b", "https://example.test/b"],
      ["post-c", "https://example.test/c"],
    ] as const) {
      await seedSnapshots(id, link, ["2026-09-18", "2026-09-19"], 100, null);
    }
    const rows = await querySocialPostObservations(db, workspaceId, "UTC", new Date());
    expect(new Set(rows.map((row) => row.observation.permalink)).size).toBe(3);
  });

  it("keeps the workspace scope intact", async () => {
    await seedSnapshots("post-a", "https://example.test/a", ["2026-09-18"], 100, null);
    const other = await seedWorkspaceAndChannel("other");
    const rows = await querySocialPostObservations(db, other.workspaceId, "UTC", new Date());
    expect(rows).toHaveLength(0);
  });
});

describe("backfillMissingThumbnails", () => {
  it("only considers posts whose thumbnail is missing", async () => {
    await seedSnapshots(
      "has-thumb",
      "https://example.test/a",
      ["2026-09-18"],
      100,
      "https://cdn.test/a.jpg",
    );
    await seedSnapshots("no-thumb", "https://example.test/b", ["2026-09-18"], 200, null);

    const result = await backfillMissingThumbnails(db, workspaceId, "token");

    // The already-populated post is never fetched: provider fails, so it is
    // reported as unsupported and its stored thumbnail must be untouched.
    const rows = await querySocialPostObservations(db, workspaceId, "UTC", new Date());
    const populated = rows.find((row) => row.observation.externalPostId === "has-thumb");
    expect(populated?.observation.thumbnailUrl).toBe("https://cdn.test/a.jpg");
    expect(result.updated).toBe(0);
  });

  it("never overwrites an existing thumbnail even when a fetch succeeds", async () => {
    await seedSnapshots(
      "has-thumb",
      "https://example.test/a",
      ["2026-09-18"],
      100,
      "https://cdn.test/original.jpg",
    );
    const result = await backfillMissingThumbnails(db, workspaceId, "token");
    const rows = await querySocialPostObservations(db, workspaceId, "UTC", new Date());
    expect(rows[0]!.observation.thumbnailUrl).toBe("https://cdn.test/original.jpg");
    expect(result.candidates).toBe(0);
  });

  it("treats each post once regardless of how many snapshots it has", async () => {
    await seedSnapshots(
      "no-thumb",
      "https://example.test/b",
      ["2026-09-16", "2026-09-17", "2026-09-18"],
      200,
      null,
    );
    // Three snapshot rows exist for this post. The backfill must consider
    // ONE candidate, not three, so provider cost is bounded per post.
    const result = await backfillMissingThumbnails(db, workspaceId, "token");
    expect(result.candidates).toBe(1);
  });
});
