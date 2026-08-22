import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  brandLinkedResources,
  brandPublishingRules,
  users,
  workspaces,
} from "@/lib/db/schema";
import { expectPgConstraint } from "./_db-error";

/**
 * Goal: enforce the DB-level invariants on the new `brand_publishing_rule`
 * and `brand_linked_resource` tables.
 *
 * - `brand_publishing_rule.rule_type` is restricted to the supported enum
 *   ('alt_text', 'hashtag', 'compliance', 'channel', 'general') via a
 *   CHECK constraint (`brand_publishing_rule_type_valid`).
 * - `brand_linked_resource.provider` is restricted to the supported enum
 *   ('google_drive', 'figma', 'canva', 'dropbox', 'other') via a CHECK
 *   constraint (`brand_linked_resource_provider_valid`).
 * - `brand_linked_resource.url` MUST be HTTPS — enforced by
 *   `brand_linked_resource_url_https`.
 *
 * Both tables are tenant-scoped (workspace_id NOT NULL with restrict FK)
 * and soft-archivable (`archived_at` column, no default, no
 * `archived_at IS NOT NULL` requirement on insert).
 *
 * Runs only when `TEST_DATABASE_URL` is set — same pattern as
 * `schema.test.ts` and `journey.test.ts`.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

describe("brand kit: publishing rules and linked resources", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    // The new tables aren't in the existing schema-test TRUNCATE list, so
    // we own the cleanup for them here. The parent tables are also reset
    // so each test starts from a known state.
    await db.execute(sql`
      TRUNCATE
        brand_publishing_rule, brand_linked_resource,
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

  it("keeps publishing rules tenant-scoped and soft-archivable", async () => {
    const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
    const [user] = await db
      .insert(users)
      .values({ email: "manager@brand.test", displayName: "Manager" })
      .returning();
    const [ws] = await db
      .insert(workspaces)
      .values({ agencyId: agency!.id, slug: "main", name: "Main", createdBy: user!.id })
      .returning();

    const [rule] = await db
      .insert(brandPublishingRules)
      .values({
        workspaceId: ws!.id,
        createdBy: user!.id,
        ruleType: "alt_text",
        title: "Describe meaningful visuals",
        content: "Write concise alt text for every informative image.",
      })
      .returning();

    expect(rule).toBeDefined();
    expect(rule!.workspaceId).toBe(ws!.id);
    expect(rule!.ruleType).toBe("alt_text");
    // Soft-archive: the column is nullable, fresh insert must leave it null.
    expect(rule!.archivedAt).toBeNull();
  });

  it("rejects a non-HTTPS linked resource", async () => {
    const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
    const [user] = await db
      .insert(users)
      .values({ email: "manager@brand.test", displayName: "Manager" })
      .returning();
    const [ws] = await db
      .insert(workspaces)
      .values({ agencyId: agency!.id, slug: "main", name: "Main", createdBy: user!.id })
      .returning();

    await expectPgConstraint(
      db.insert(brandLinkedResources).values({
        workspaceId: ws!.id,
        createdBy: user!.id,
        provider: "figma",
        name: "Design library",
        url: "http://example.test/file",
      }),
      "brand_linked_resource_url_https",
    );
  });

  it("rejects unsupported publishing-rule and provider values", async () => {
    const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
    const [user] = await db
      .insert(users)
      .values({ email: "manager@brand.test", displayName: "Manager" })
      .returning();
    const [ws] = await db
      .insert(workspaces)
      .values({ agencyId: agency!.id, slug: "main", name: "Main", createdBy: user!.id })
      .returning();

    // Unknown rule_type — bypass the TS enum by inserting via raw SQL so
    // the CHECK constraint, not the type system, is the one rejecting it.
    await expectPgConstraint(
      db.execute(
        sql`INSERT INTO "brand_publishing_rule" ("workspace_id", "created_by", "rule_type", "title", "content") VALUES (${ws!.id}, ${user!.id}, 'unknown', 'x', 'y')`,
      ),
      "brand_publishing_rule_type_valid",
    );

    // Unknown provider — same idea, raw insert so the CHECK fires.
    await expectPgConstraint(
      db.execute(
        sql`INSERT INTO "brand_linked_resource" ("workspace_id", "created_by", "provider", "name", "url") VALUES (${ws!.id}, ${user!.id}, 'unknown', 'x', 'https://example.test/x')`,
      ),
      "brand_linked_resource_provider_valid",
    );
  });
});
