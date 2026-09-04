import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Notification actionUrl — integration coverage.
 *
 * The plan was originally a "unit" file under `tests/unit/` but the
 * helper is a thin wrapper around a single Drizzle lookup, so the
 * meaningful coverage is the DB round trip + the URL shape on the
 * row. Putting the file here keeps it next to the other service-
 * level integration tests (`discussions`, `deliveries`, etc.) and
 * inherits the integration suite's `setup.ts` (mocked `next/cache`).
 *
 * The fix introduced `buildActionUrlForContentItem` in
 * `src/lib/notifications/service.ts` so the bell click lands the
 * user on `/app/w/<slug>/planning/<id>` (the real App Router
 * segment) instead of the broken `/app/planning/<id>` literal that
 * caused the React #441 error boundary in
 * `src/app/(app)/error.tsx` to surface.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for action-url tests");

process.env.DATABASE_URL = TEST_DB_URL;

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

type Schema = typeof import("@/lib/db/schema");
type Service = typeof import("@/lib/notifications/service");
type Deliveries = typeof import("@/lib/deliveries/service");

let schema: Schema;
let service: Service;
let deliveries: Deliveries;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  schema = await import("@/lib/db/schema");
  service = await import("@/lib/notifications/service");
  deliveries = await import("@/lib/deliveries/service");
});

const WORKSPACE_SLUG = "acme-flow";
const CONTENT_TITLE = "Spring launch teaser";

async function seedWorkspaceAndContentItem() {
  const [manager] = await db
    .insert(schema.users)
    .values({
      email: `manager-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      displayName: "Manager",
      name: "Manager",
    })
    .returning();
  if (!manager) throw new Error("user seed failed");
  const [reviewer] = await db
    .insert(schema.users)
    .values({
      email: `reviewer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      displayName: "Reviewer",
      name: "Reviewer",
    })
    .returning();
  if (!reviewer) throw new Error("reviewer seed failed");
  const [agency] = await db
    .insert(schema.agencies)
    .values({
      name: "Test Agency",
      slug: `agency-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    })
    .returning();
  if (!agency) throw new Error("agency seed failed");
  await db.insert(schema.agencyMemberships).values({
    agencyId: agency.id,
    userId: manager.id,
    isAgencyAdmin: true,
    status: "active",
  });
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      agencyId: agency.id,
      name: "Acme Flow",
      slug: WORKSPACE_SLUG,
      createdBy: manager.id,
    })
    .returning();
  if (!workspace) throw new Error("workspace seed failed");
  const [contentItem] = await db
    .insert(schema.contentItems)
    .values({
      workspaceId: workspace.id,
      title: CONTENT_TITLE,
      format: "static_post",
      status: "draft",
      createdBy: manager.id,
      contentOwnerId: reviewer.id,
      plannedPublishAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();
  if (!contentItem) throw new Error("content_item seed failed");
  return { workspace, contentItem, manager };
}

describe("buildActionUrlForContentItem (helper URL shape)", () => {
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

  it("returns /app/w/<slug>/planning/<id> when the workspace exists (UUID lookup)", async () => {
    const { workspace, contentItem } = await seedWorkspaceAndContentItem();
    const url = await service.buildActionUrlForContentItem(workspace.id, contentItem.id, null);
    expect(url).toBe(`/app/w/${WORKSPACE_SLUG}/planning/${contentItem.id}`);
  });

  it("accepts a slug in place of a UUID and resolves the same row", async () => {
    const { contentItem } = await seedWorkspaceAndContentItem();
    const url = await service.buildActionUrlForContentItem(WORKSPACE_SLUG, contentItem.id, null);
    expect(url).toBe(`/app/w/${WORKSPACE_SLUG}/planning/${contentItem.id}`);
  });

  it("appends the #publishing hash when hash is 'publishing'", async () => {
    const { workspace, contentItem } = await seedWorkspaceAndContentItem();
    const url = await service.buildActionUrlForContentItem(
      workspace.id,
      contentItem.id,
      "publishing",
    );
    expect(url).toBe(`/app/w/${WORKSPACE_SLUG}/planning/${contentItem.id}#publishing`);
  });

  it("appends the #discussion hash when hash is 'discussion'", async () => {
    const { workspace, contentItem } = await seedWorkspaceAndContentItem();
    const url = await service.buildActionUrlForContentItem(
      workspace.id,
      contentItem.id,
      "discussion",
    );
    expect(url).toBe(`/app/w/${WORKSPACE_SLUG}/planning/${contentItem.id}#discussion`);
  });

  it("returns /app when the workspace row is missing", async () => {
    const { contentItem } = await seedWorkspaceAndContentItem();
    const url = await service.buildActionUrlForContentItem(
      "00000000-0000-0000-0000-000000000000",
      contentItem.id,
      null,
    );
    expect(url).toBe("/app");
  });

  it("returns /app when called with an empty identifier", async () => {
    const { contentItem } = await seedWorkspaceAndContentItem();
    const url = await service.buildActionUrlForContentItem("", contentItem.id, null);
    expect(url).toBe("/app");
  });
});

describe("notification actionUrl writers — fix regression", () => {
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

  it("never writes the broken /app/planning/<id> literal anywhere under src/lib/", async () => {
    // Static guard: the literal must not appear in production code.
    // The helper comment in `deliveries/service.ts` is the only
    // allowed reference (it documents the bug we just fixed).
    const { readFile, readdir, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");

    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...(await walk(full)));
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          out.push(full);
        }
      }
      return out;
    }

    const libRoot = join(process.cwd(), "src", "lib");
    await stat(libRoot);
    const files = await walk(libRoot);
    const offenders: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8");
      // The literal is a code pattern, not the substring "/app/planning/"
      // which legitimately appears in our routing docs. Match the
      // template-literal form used by the original bug.
      if (/[`'"]\/app\/planning\//.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the delivery fan-out stores a /app/w/<slug>/planning/<id> URL on the inserted notification row", async () => {
    // The delivery service is the bug's smoking gun: it called
    // enqueueDeliveryNotification without actionUrl, so the row
    // always picked up the broken /app/planning/<id> fallback.
    // The fix threads a slug-based URL through. We assert the
    // resulting notification row by reading the outbox payload
    // (the enqueue → dispatch path runs out-of-band).
    const { workspace, contentItem, manager } = await seedWorkspaceAndContentItem();
    // Make the manager a designer in the workspace so the policy
    // gate inside `submitDelivery` allows the call.
    const [membership] = await db
      .insert(schema.workspaceMemberships)
      .values({ workspaceId: workspace.id, userId: manager.id, status: "active" })
      .returning();
    if (!membership) throw new Error("membership seed failed");
    await db.insert(schema.workspaceMembershipRoles).values({
      workspaceMembershipId: membership.id,
      role: "designer",
    });
    // The content item needs a designer_id for the delivery
    // submission gate; we set the manager as designer.
    await db
      .update(schema.contentItems)
      .set({ designerId: manager.id, status: "in_design" })
      .where(sql`${schema.contentItems.id} = ${contentItem.id}`);

    // Need a delivery link (SubmitDeliverySchema requires ≥1).
    const { SubmitDeliverySchema, submitDelivery } = deliveries;
    const input = SubmitDeliverySchema.parse({
      contentItemId: contentItem.id,
      description: "Draft 1",
      links: [
        {
          provider: "figma",
          label: "Figma draft",
          url: "https://figma.com/file/abc",
        },
      ],
    });
    await submitDelivery({ id: manager.id }, input);

    // The dispatch path runs in a single-fork integration env via
    // the seeded outbox. We directly inspect the outbox row that
    // the enqueue helper wrote — its payload.actionUrl is the URL
    // we want to pin.
    const outbox = await db
      .select({ payload: schema.outboxEvents.payload })
      .from(schema.outboxEvents)
      .where(sql`${schema.outboxEvents.eventType} = 'delivery'`)
      .limit(1);
    const payload = outbox[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.actionUrl).toBe(`/app/w/${WORKSPACE_SLUG}/planning/${contentItem.id}`);
  });
});
