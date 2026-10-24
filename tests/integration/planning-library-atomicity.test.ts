import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for planning library tests");
process.env.DATABASE_URL = testDatabaseUrl;

type Db = typeof import("@/lib/db").db;
type Schema = typeof import("@/lib/db/schema");

let db: Db;
let schema: Schema;
let createCampaign: typeof import("@/lib/planning/campaigns").createCampaign;
let archiveCampaign: typeof import("@/lib/planning/campaigns").archiveCampaign;
let createPillar: typeof import("@/lib/planning/pillars").createPillar;
let archivePillar: typeof import("@/lib/planning/pillars").archivePillar;
let restorePillar: typeof import("@/lib/planning/pillars").restorePillar;
let createTemplate: typeof import("@/lib/planning/templates").createTemplate;
let archiveTemplate: typeof import("@/lib/planning/templates").archiveTemplate;

let workspaceId: string;
let actorId: string;
const triggerName = "test_reject_planning_library_activity";
const functionName = "test_reject_planning_library_activity";

beforeAll(async () => {
  ({ db } = await import("@/lib/db"));
  schema = await import("@/lib/db/schema");
  ({ createCampaign, archiveCampaign } = await import("@/lib/planning/campaigns"));
  ({ createPillar, archivePillar, restorePillar } = await import("@/lib/planning/pillars"));
  ({ createTemplate, archiveTemplate } = await import("@/lib/planning/templates"));
});

beforeEach(async () => {
  await dropTestTrigger();
  await db.execute(sql`TRUNCATE agency, "user" CASCADE`);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `planning-library-${suffix}@example.com`,
      displayName: "Planning library manager",
      name: "Planning library manager",
      emailVerified: new Date(),
    })
    .returning({ id: schema.users.id });
  if (!user) throw new Error("planning library user seed failed");
  actorId = user.id;

  const [agency] = await db
    .insert(schema.agencies)
    .values({ name: "Planning library agency", slug: `planning-library-${suffix}` })
    .returning({ id: schema.agencies.id });
  if (!agency) throw new Error("planning library agency seed failed");
  await db
    .insert(schema.agencyMemberships)
    .values({ agencyId: agency.id, userId: actorId, status: "active" });

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      agencyId: agency.id,
      name: "Planning library workspace",
      slug: `planning-library-${suffix}`,
      createdBy: actorId,
    })
    .returning({ id: schema.workspaces.id });
  if (!workspace) throw new Error("planning library workspace seed failed");
  workspaceId = workspace.id;

  const [membership] = await db
    .insert(schema.workspaceMemberships)
    .values({ workspaceId, userId: actorId, status: "active" })
    .returning({ id: schema.workspaceMemberships.id });
  if (!membership) throw new Error("planning library membership seed failed");
  await db.insert(schema.workspaceMembershipRoles).values({
    workspaceMembershipId: membership.id,
    role: "workspace_manager",
  });
});

afterEach(dropTestTrigger);
afterAll(async () => db?.$client?.end());

async function dropTestTrigger() {
  if (!db) return;
  await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON activity_event`));
  await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}()`));
}

describe("planning library transaction and row-lock guarantees", () => {
  it("rolls back campaign, pillar, and template rows when their audit insert fails", async () => {
    await db.execute(
      sql.raw(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.summary LIKE 'Created campaign %'
          OR NEW.summary LIKE 'Created pillar %'
          OR NEW.summary LIKE 'Created template %' THEN
          RAISE EXCEPTION 'forced planning-library activity failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${triggerName} BEFORE INSERT ON activity_event FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
      ),
    );

    const actor = { id: actorId };
    await expect(
      createCampaign(actor, workspaceId, { name: "Atomic campaign", status: "draft" }),
    ).rejects.toMatchObject({ cause: { message: "forced planning-library activity failure" } });
    await expect(createPillar(actor, workspaceId, { name: "Atomic pillar" })).rejects.toMatchObject(
      { cause: { message: "forced planning-library activity failure" } },
    );
    await expect(
      createTemplate(actor, workspaceId, {
        name: "Atomic template",
        format: "static_post",
        defaultChannelIds: [],
      }),
    ).rejects.toMatchObject({ cause: { message: "forced planning-library activity failure" } });

    expect(
      await db
        .select()
        .from(schema.campaigns)
        .where(sql`${schema.campaigns.workspaceId} = ${workspaceId}`),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.contentPillars)
        .where(sql`${schema.contentPillars.workspaceId} = ${workspaceId}`),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.contentTemplates)
        .where(sql`${schema.contentTemplates.workspaceId} = ${workspaceId}`),
    ).toHaveLength(0);
  });

  it("serializes duplicate archive and restore requests and writes one event per transition", async () => {
    const actor = { id: actorId };
    const campaign = await createCampaign(actor, workspaceId, {
      name: "Campaign",
      status: "draft",
    });
    const pillar = await createPillar(actor, workspaceId, { name: "Pillar" });
    const template = await createTemplate(actor, workspaceId, {
      name: "Template",
      format: "static_post",
      defaultChannelIds: [],
    });

    await Promise.all([
      archiveCampaign(actor, workspaceId, campaign.id),
      archiveCampaign(actor, workspaceId, campaign.id),
      archivePillar(actor, workspaceId, pillar.id),
      archivePillar(actor, workspaceId, pillar.id),
      archiveTemplate(actor, workspaceId, template.id),
      archiveTemplate(actor, workspaceId, template.id),
    ]);
    await Promise.all([
      restorePillar(actor, workspaceId, pillar.id),
      restorePillar(actor, workspaceId, pillar.id),
    ]);

    const events = await db
      .select({ summary: schema.activityEvents.summary })
      .from(schema.activityEvents)
      .where(sql`${schema.activityEvents.workspaceId} = ${workspaceId}`);
    expect(events.map((event) => event.summary).sort()).toEqual(
      [
        'Created campaign "Campaign"',
        'Created pillar "Pillar"',
        'Created template "Template"',
        'Archived campaign "Campaign"',
        'Archived pillar "Pillar"',
        'Archived template "Template"',
        'Restored pillar "Pillar"',
      ].sort(),
    );

    const [archivedCampaign] = await db
      .select({ archivedAt: schema.campaigns.archivedAt })
      .from(schema.campaigns)
      .where(sql`${schema.campaigns.id} = ${campaign.id}`);
    const [archivedTemplate] = await db
      .select({ archivedAt: schema.contentTemplates.archivedAt })
      .from(schema.contentTemplates)
      .where(sql`${schema.contentTemplates.id} = ${template.id}`);
    const [restoredPillar] = await db
      .select({ archivedAt: schema.contentPillars.archivedAt })
      .from(schema.contentPillars)
      .where(sql`${schema.contentPillars.id} = ${pillar.id}`);
    expect(archivedCampaign?.archivedAt).not.toBeNull();
    expect(archivedTemplate?.archivedAt).not.toBeNull();
    expect(restoredPillar?.archivedAt).toBeNull();
  });
});
