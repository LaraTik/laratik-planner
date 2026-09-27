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
} from "@/lib/db/schema";
import { expectPgConstraint } from "./_db-error";

/**
 * Goal 1 contract: every CHECK constraint + UNIQUE index from the master
 * prompt §8 is enforced at the DB level. This test file spins up a real
 * Postgres (any reachable instance, see TEST_DATABASE_URL), applies the
 * migration, and exercises the key invariants.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... pnpm test:integration
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

/**
 * Build the agency → workspace → channel → content item → channel link chain
 * that `publication_record` hangs off. Each test truncates in `beforeEach`, so
 * the fixed slugs are safe; what varies is the `expires_at` / `published_url`
 * combination under test.
 */
async function seedPublicationChannel() {
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
  return { cic: cic!.id, user: user!.id };
}

describe("schema invariants", () => {
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

  // ─── Agency uniqueness invariants (master prompt §8) ───────────────────
  // After M1.7 the singleton invariant is intentionally gone — the
  // agency table allows any number of rows. The remaining uniqueness
  // invariant is the per-deployment `lower(slug)` index, asserted by
  // the multi-agency suite in `agency-singleton-constraint.test.ts`.
  describe("agency slug uniqueness", () => {
    it("rejects a second agency with a case-different but slug-equal name", async () => {
      await db.insert(agencies).values({ name: "Acme", slug: "acme" });
      await expectPgConstraint(
        db.insert(agencies).values({ name: "ACME Copy", slug: "ACME" }),
        "agency_slug_unique",
      );
    });
  });

  // ─── Email format invariant (added) ─────────────────────────────────────
  describe("email format", () => {
    it("rejects malformed email", async () => {
      await expectPgConstraint(
        db.insert(users).values({ email: "not-an-email", displayName: "Bad" }),
        "user_email_format",
      );
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
      await expectPgConstraint(
        db.insert(contentItems).values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          status: "blocked",
        }),
        "content_item_blocked_needs_reason",
      );
    });

    it("cancelled requires cancellation_reason", async () => {
      await expectPgConstraint(
        db.insert(contentItems).values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          status: "cancelled",
        }),
        "content_item_cancelled_needs_reason",
      );
    });

    it("changes_requested requires change_request_gate", async () => {
      await expectPgConstraint(
        db.insert(contentItems).values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          status: "changes_requested",
        }),
        "content_item_changes_requested_needs_gate",
      );
    });

    it("defaults media_required to true so no existing post loses its floor", async () => {
      // The DEFAULT is the whole safety argument for migration 0055: a
      // row inserted without the column must still require media, so
      // shipping the migration cannot silently open the assetless path
      // for content that already exists.
      const [row] = await db
        .insert(contentItems)
        .values({
          workspaceId,
          title: "T",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
        })
        .returning({ mediaRequired: contentItems.mediaRequired });
      expect(row!.mediaRequired).toBe(true);
    });

    it("stores an explicit media_required=false for a text-only post", async () => {
      const [row] = await db
        .insert(contentItems)
        .values({
          workspaceId,
          title: "Caption only",
          format: "static_post",
          plannedPublishAt: new Date(),
          contentOwnerId: userId,
          createdBy: userId,
          mediaRequired: false,
        })
        .returning({ mediaRequired: contentItems.mediaRequired });
      expect(row!.mediaRequired).toBe(false);
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
      const [user] = await db
        .insert(users)
        .values({ email: "a@x.io", displayName: "A" })
        .returning();
      const [ws] = await db
        .insert(workspaces)
        .values({ agencyId: agency!.id, slug: "w", name: "W", createdBy: user!.id })
        .returning();
      await expectPgConstraint(
        db.insert(socialChannels).values({
          workspaceId: ws!.id,
          platform: "instagram",
          accountName: "IG",
          url: "ftp://example.com",
        }),
        "social_channel_url_https",
      );
    });
  });

  // ─── Publication record invariants ────────────────────────────────────
  describe("publication_record", () => {
    it("published requires url + time + publisher", async () => {
      const [agency] = await db.insert(agencies).values({ name: "A", slug: "a" }).returning();
      const [user] = await db
        .insert(users)
        .values({ email: "a@x.io", displayName: "A" })
        .returning();
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

      await expectPgConstraint(
        db.insert(publicationRecords).values({
          contentItemChannelId: cic!.id,
          status: "published",
        }),
        "publication_published_needs_url_time_publisher",
      );
    });

    it("accepts an ephemeral published row with a null url", async () => {
      // The regression this feature exists for: an Instagram Story has no
      // permanent link, and the old invariant made that insert impossible.
      const { cic, user } = await seedPublicationChannel();

      const [record] = await db
        .insert(publicationRecords)
        .values({
          contentItemChannelId: cic,
          status: "published",
          publishedUrl: null,
          actualPublishedAt: new Date(),
          publisherId: user,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        })
        .returning({ id: publicationRecords.id, expiresAt: publicationRecords.expiresAt });

      expect(record?.id).toBeDefined();
      expect(record?.expiresAt).toBeInstanceOf(Date);
    });

    it("still rejects published with neither a url nor an expiry", async () => {
      const { cic, user } = await seedPublicationChannel();

      await expectPgConstraint(
        db.insert(publicationRecords).values({
          contentItemChannelId: cic,
          status: "published",
          actualPublishedAt: new Date(),
          publisherId: user,
          publishedUrl: null,
          expiresAt: null,
        }),
        "publication_published_needs_url_time_publisher",
      );
    });

    it("still rejects an ephemeral published row with no publisher", async () => {
      // The relaxation only covers the url; time and publisher stay required.
      const { cic } = await seedPublicationChannel();

      await expectPgConstraint(
        db.insert(publicationRecords).values({
          contentItemChannelId: cic,
          status: "published",
          actualPublishedAt: new Date(),
          publisherId: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        }),
        "publication_published_needs_url_time_publisher",
      );
    });

    it("still rejects an ephemeral published row with no publish time", async () => {
      const { cic, user } = await seedPublicationChannel();

      await expectPgConstraint(
        db.insert(publicationRecords).values({
          contentItemChannelId: cic,
          status: "published",
          actualPublishedAt: null,
          publisherId: user,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        }),
        "publication_published_needs_url_time_publisher",
      );
    });
  });
});
