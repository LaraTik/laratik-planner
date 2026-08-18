import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  users,
  workspaces,
  contentItems,
  socialChannels,
  contentItemChannels,
  publicationRecords,
  invitations,
} from "@/lib/db/schema";

/**
 * Goal 1 contract: every CHECK constraint + UNIQUE index from the master
 * prompt §8 is enforced at the DB level. This test file spins up a real
 * Postgres (any reachable instance, see TEST_DATABASE_URL), applies the
 * migration, and exercises the key invariants.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... pnpm test:integration
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const SKIP = !TEST_DB_URL;

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

describe.skipIf(SKIP)("schema invariants (Goal 1)", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    // Clean state per test
    await db.execute(sql`
      TRUNCATE
        publication_record, content_item_channel, content_item,
        social_channel, brand_asset, brand_voice_rule,
        content_assignment, content_template, content_pillar, campaign,
        workspace_membership_role, workspace_membership, workspace_settings,
        workspace, invitation_workspace_role, invitation,
        agency_membership, bootstrap_lock, agency, "user"
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── Singleton agency invariant (master prompt §8) ─────────────────────
  describe("singleton agency", () => {
    it("allows exactly one agency row", async () => {
      await db.insert(agencies).values({ name: "Acme", slug: "acme" });
      await expect(
        db.insert(agencies).values({ name: "Other", slug: "other" }),
      ).rejects.toThrow(/agency_singleton_unique/);
    });
  });

  // ─── Email format invariant (added) ─────────────────────────────────────
  describe("email format", () => {
    it("rejects malformed email", async () => {
      await expect(
        db.insert(users).values({ email: "not-an-email", displayName: "Bad" }),
      ).rejects.toThrow(/user_email_format/);
    });
  });

  // ─── Content status invariants (master prompt §8) ─────────────────────
  describe("content_item status rules", () => {
    let workspaceId: string;
    let userId: string;

    beforeEach(async () => {
      const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
      const [user] = await db
        .insert(users)
        .values({ email: "a@x.io", displayName: "A" })
        .returning();
      const [ws] = await db
        .insert(workspaces)
        .values({
          agencyId: agency!.id,
          slug: "main",
          name: "Main",
          createdBy: user!.id,
        })
        .returning();
      workspaceId = ws!.id;
      userId = user!.id;
    });

    it("blocks requires blocked_reason", async () => {
      await expect(
        db.insert(contentItems).values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          status: "blocked",
        }),
      ).rejects.toThrow(/content_item_blocked_needs_reason/);
    });

    it("cancelled requires cancellation_reason", async () => {
      await expect(
        db.insert(contentItems).values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          status: "cancelled",
        }),
      ).rejects.toThrow(/content_item_cancelled_needs_reason/);
    });

    it("changes_requested requires change_request_gate", async () => {
      await expect(
        db.insert(contentItems).values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          status: "changes_requested",
        }),
      ).rejects.toThrow(/content_item_changes_requested_needs_gate/);
    });

    it("valid status with required reason succeeds", async () => {
      await expect(
        db.insert(contentItems).values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          status: "blocked",
          blockedReason: "needs review",
        }),
      ).resolves.toBeDefined();
    });
  });

  // ─── Social channel URL invariant ─────────────────────────────────────
  describe("social_channel url", () => {
    it("rejects non-http(s) URLs", async () => {
      const [agency] = await db.insert(agencies).values({ name: "A", slug: "a" }).returning();
      const [user] = await db.insert(users).values({ email: "a@x.io", displayName: "A" }).returning();
      const [ws] = await db
        .insert(workspaces)
        .values({ agencyId: agency!.id, slug: "w", name: "W", createdBy: user!.id })
        .returning();
      await expect(
        db.insert(socialChannels).values({
          workspaceId: ws!.id,
          platform: "instagram",
          accountName: "IG",
          url: "ftp://example.com",
        }),
      ).rejects.toThrow(/social_channel_url_https/);
    });
  });

  // ─── Publication record invariants ────────────────────────────────────
  describe("publication_record", () => {
    it("published requires url + time + publisher", async () => {
      const [agency] = await db.insert(agencies).values({ name: "A", slug: "a" }).returning();
      const [user] = await db.insert(users).values({ email: "a@x.io", displayName: "A" }).returning();
      const [ws] = await db
        .insert(workspaces)
        .values({ agencyId: agency!.id, slug: "w", name: "W", createdBy: user!.id })
        .returning();
      const [ch] = await db
        .insert(socialChannels)
        .values({ workspaceId: ws!.id, platform: "instagram", accountName: "IG" })
        .returning();
      const [ci] = await db
        .insert(contentItems)
        .values({
          workspaceId: ws!.id,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: user!.id,
          createdBy: user!.id,
        })
        .returning();
      const [cic] = await db
        .insert(contentItemChannels)
        .values({ contentItemId: ci!.id, socialChannelId: ch!.id })
        .returning();

      await expect(
        db.insert(publicationRecords).values({
          contentItemChannelId: cic!.id,
          status: "published",
        }),
      ).rejects.toThrow(/publication_published_needs_url_time_publisher/);
    });
  });
});
