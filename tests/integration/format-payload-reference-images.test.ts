import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  agencies,
  agencyMemberships,
  contentItems,
  users,
  workspaceMemberships,
  workspaceMembershipRoles,
  workspaces as workspacesTable,
} from "@/lib/db/schema";
import { updateFormatPayload } from "@/features/content/format-payload.server";
import { parseFormatPayload, type StaticPostPayload } from "@/lib/format-payload/schemas";

/**
 * The "Required image / design reference" field stores two kinds of
 * reference: URLs in `requiredImageLinks` and uploaded files in
 * `requiredImageUploads`.
 *
 * These tests lock the service behaviour that the schema change enables:
 *
 *   1. an uploaded reference survives the write → read round trip (the
 *      per-format Zod schema is re-applied on every write, so a key that
 *      is not in the schema would be silently dropped)
 *   2. a designer's save — which only merges the fields a designer owns —
 *      does not wipe the planner's uploaded references
 *   3. an uploaded reference with a malformed media-asset id is rejected
 *      rather than written
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

const UPLOAD_ID = "3f1b7a52-0c4e-4a2b-9f2d-8a1c5e7b4d10";

describe("format payload — uploaded reference images", () => {
  let plannerActor: { id: string };
  let designerActor: { id: string };
  let workspaceId: string;
  let contentItemId: string;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        content_item_channel, content_item, workspace_membership_role,
        workspace_membership, workspace_settings, workspace,
        agency_membership, agency, "user"
      RESTART IDENTITY CASCADE
    `);

    const [planner] = await db
      .insert(users)
      .values({ email: "planner@reference-images.test", displayName: "Planner" })
      .returning({ id: users.id });
    const [designer] = await db
      .insert(users)
      .values({ email: "designer@reference-images.test", displayName: "Designer" })
      .returning({ id: users.id });
    plannerActor = { id: planner!.id };
    designerActor = { id: designer!.id };

    const [agency] = await db
      .insert(agencies)
      .values({ name: "Reference Images Agency", slug: "reference-images-agency" })
      .returning({ id: agencies.id });
    await db.insert(agencyMemberships).values({
      agencyId: agency!.id,
      userId: plannerActor.id,
      status: "active",
      isAgencyAdmin: true,
    });

    const [workspace] = await db
      .insert(workspacesTable)
      .values({
        agencyId: agency!.id,
        slug: "acme",
        name: "Acme",
        createdBy: plannerActor.id,
      })
      .returning({ id: workspacesTable.id });
    workspaceId = workspace!.id;

    const [plannerMembership] = await db
      .insert(workspaceMemberships)
      .values({ workspaceId, userId: plannerActor.id, status: "active" })
      .returning({ id: workspaceMemberships.id });
    await db
      .insert(workspaceMembershipRoles)
      .values({ workspaceMembershipId: plannerMembership!.id, role: "workspace_manager" });

    const [designerMembership] = await db
      .insert(workspaceMemberships)
      .values({ workspaceId, userId: designerActor.id, status: "active" })
      .returning({ id: workspaceMemberships.id });
    await db
      .insert(workspaceMembershipRoles)
      .values({ workspaceMembershipId: designerMembership!.id, role: "designer" });

    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: "Hero launch",
        format: "static_post",
        status: "draft",
        plannedPublishAt: new Date("2026-11-02T09:00:00Z"),
        contentOwnerId: plannerActor.id,
        designerId: designerActor.id,
        createdBy: plannerActor.id,
      })
      .returning({ id: contentItems.id });
    contentItemId = item!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("keeps an uploaded reference through the write and read round trip", async () => {
    await updateFormatPayload(plannerActor, {
      contentItemId,
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        caption: "Spring drop",
        requiredImageLinks: ["https://cdn.example.test/reference.png"],
        requiredImageUploads: [{ id: UPLOAD_ID, title: "hero-reference" }],
      },
    });

    const [row] = await db
      .select({ payload: contentItems.formatPayload })
      .from(contentItems)
      .where(sql`${contentItems.id} = ${contentItemId}`);

    const parsed = parseFormatPayload("static_post", row!.payload) as StaticPostPayload;
    expect(parsed.requiredImageLinks).toEqual(["https://cdn.example.test/reference.png"]);
    expect(parsed.requiredImageUploads).toEqual([{ id: UPLOAD_ID, title: "hero-reference" }]);
  });

  it("does not let a designer's save drop the planner's uploaded references", async () => {
    await updateFormatPayload(plannerActor, {
      contentItemId,
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        requiredImageUploads: [{ id: UPLOAD_ID, title: "hero-reference" }],
      },
    });

    // A designer only owns `references` / `additionalNotes` on a static
    // post. Their save must not remove what the planner uploaded.
    await updateFormatPayload(designerActor, {
      contentItemId,
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        references: ["https://cdn.example.test/moodboard.png"],
        additionalNotes: "Keep the logo clear of the crop.",
      },
    });

    const [row] = await db
      .select({ payload: contentItems.formatPayload })
      .from(contentItems)
      .where(sql`${contentItems.id} = ${contentItemId}`);

    const parsed = parseFormatPayload("static_post", row!.payload) as StaticPostPayload;
    expect(parsed.requiredImageUploads).toEqual([{ id: UPLOAD_ID, title: "hero-reference" }]);
    expect(parsed.references).toEqual(["https://cdn.example.test/moodboard.png"]);
  });

  it("rejects an uploaded reference whose id is not a media-asset id", async () => {
    await expect(
      updateFormatPayload(plannerActor, {
        contentItemId,
        format: "static_post",
        formatPayload: {
          schemaVersion: 1,
          requiredImageUploads: [{ id: "not-a-uuid", title: "hero-reference" }],
        },
      }),
    ).rejects.toThrow();
  });
});
