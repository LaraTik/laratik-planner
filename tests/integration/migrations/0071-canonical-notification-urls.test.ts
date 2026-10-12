import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const MIGRATIONS_DIR = join(process.cwd(), "src", "lib", "db", "migrations");
const BACKFILL_FILE = "0071_canonical_notification_action_urls.sql";

/**
 * Covers migration 0071, which rewrites stored notification action URLs from
 * the legacy `/app/w/<slug>/…` shape to the canonical
 * `/app/a/<agencySlug>/w/<slug>/…` one.
 *
 * Two failure modes this guards, both of which are silent:
 *
 *  1. **A migration file with no journal entry is never applied.** Drizzle's
 *     `migrate()` reads `meta/_journal.json` to decide what to run, so a
 *     hand-written `.sql` file that was not registered simply does not happen
 *     — no error, no drift signal, the app keeps emitting legacy URLs.
 *  2. **A backfill that resolves the workspace by slug instead of by FK
 *     guesses.** A workspace slug is unique per agency, not globally, so the
 *     rewrite keys on `notification.workspace_id`. The fixture deliberately
 *     puts the SAME slug in two agencies to prove the FK is what disambiguates.
 */
describe("migration 0071 — canonical notification action URLs", () => {
  let db: typeof import("@/lib/db").db;
  let pool: typeof import("@/lib/db").pool;
  let sql: typeof import("drizzle-orm").sql;
  let schema: typeof import("@/lib/db/schema");

  beforeAll(async () => {
    ({ db, pool } = await import("@/lib/db"));
    ({ sql } = await import("drizzle-orm"));
    schema = await import("@/lib/db/schema");
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
  });

  function backfillSql(): string {
    return readFileSync(join(MIGRATIONS_DIR, BACKFILL_FILE), "utf8");
  }

  async function runBackfill() {
    await pool.query(backfillSql());
  }

  it("has a journal entry, and every .sql file has exactly one", () => {
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };

    const entry = journal.entries.find((e) => e.tag === BACKFILL_FILE.replace(/\.sql$/, ""));
    expect(entry, `${BACKFILL_FILE} has no journal entry and would never run`).toBeDefined();

    const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBe(journal.entries.length);

    // idx must stay aligned to the filename, since drizzle orders by idx.
    for (const e of journal.entries) {
      expect(e.idx).toBe(Number(e.tag.slice(0, 4)));
    }
  });

  it("rewrites legacy URLs using the workspace FK, not the ambiguous slug", async () => {
    // Two agencies that each own a workspace with the IDENTICAL slug. Only the
    // FK can tell them apart.
    const stamp = Date.now();
    const [user] = await db
      .insert(schema.users)
      .values({ email: `mig-${stamp}@example.com`, displayName: "U" })
      .returning();
    if (!user) throw new Error("user seed failed");
    const userId = user.id;

    async function makeAgencyWithWorkspace(agencySlug: string, workspaceSlug: string) {
      const [agency] = await db
        .insert(schema.agencies)
        .values({ name: agencySlug, slug: agencySlug })
        .returning();
      if (!agency) throw new Error("agency seed failed");
      const [ws] = await db
        .insert(schema.workspaces)
        .values({
          agencyId: agency.id,
          name: "WS",
          slug: workspaceSlug,
          status: "active",
          createdBy: userId,
        })
        .returning();
      if (!ws) throw new Error("workspace seed failed");
      return { agency, ws };
    }

    const alpha = await makeAgencyWithWorkspace(`ag-alpha-${stamp}`, "shared-slug");
    const beta = await makeAgencyWithWorkspace(`ag-beta-${stamp}`, "shared-slug");

    const [itemAlpha] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: alpha.ws.id,
        contentOwnerId: userId,
        createdBy: userId,
        title: "alpha item",
        format: "static_post",
        plannedPublishAt: new Date(),
      })
      .returning();
    const [itemBeta] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: beta.ws.id,
        contentOwnerId: userId,
        createdBy: userId,
        title: "beta item",
        format: "static_post",
        plannedPublishAt: new Date(),
      })
      .returning();
    if (!itemAlpha || !itemBeta) throw new Error("content seed failed");

    const rows = await db
      .insert(schema.notifications)
      .values([
        {
          userId: userId,
          workspaceId: alpha.ws.id,
          contentItemId: itemAlpha.id,
          kind: "assignment",
          title: "alpha",
          body: "a",
          // WITH a fragment — the tail and hash must survive.
          actionUrl: `/app/w/shared-slug/planning/${itemAlpha.id}#publishing`,
        },
        {
          userId: userId,
          workspaceId: beta.ws.id,
          contentItemId: itemBeta.id,
          kind: "assignment",
          title: "beta",
          body: "b",
          // A bare workspace root, with no trailing path at all.
          actionUrl: `/app/w/shared-slug`,
        },
      ])
      .returning();

    await runBackfill();

    const after = await db
      .select({ title: schema.notifications.title, actionUrl: schema.notifications.actionUrl })
      .from(schema.notifications);
    const byTitle = new Map(after.map((r) => [r.title, r.actionUrl]));

    expect(byTitle.get("alpha")).toBe(
      `/app/a/${alpha.agency.slug}/w/shared-slug/planning/${itemAlpha.id}#publishing`,
    );
    expect(byTitle.get("beta")).toBe(`/app/a/${beta.agency.slug}/w/shared-slug`);
    // The whole point: two identical slugs resolved to two DIFFERENT agencies.
    expect(byTitle.get("alpha")).not.toBe(byTitle.get("beta"));
    expect(rows.length).toBe(2);
  });

  it("is idempotent — a second run changes nothing", async () => {
    const stamp = Date.now();
    const [agency] = await db
      .insert(schema.agencies)
      .values({ name: "Idem", slug: `idem-${stamp}` })
      .returning();
    const [user] = await db
      .insert(schema.users)
      .values({ email: `idem-${stamp}@example.com`, displayName: "U" })
      .returning();
    if (!agency || !user) throw new Error("seed failed");
    const [ws] = await db
      .insert(schema.workspaces)
      .values({
        agencyId: agency.id,
        name: "WS",
        slug: `idem-ws-${stamp}`,
        status: "active",
        createdBy: user.id,
      })
      .returning();
    if (!ws) throw new Error("workspace seed failed");

    await db.insert(schema.notifications).values({
      userId: user.id,
      workspaceId: ws.id,
      kind: "system",
      title: "row",
      body: "b",
      actionUrl: `/app/w/idem-ws-${stamp}/planning/abc`,
    });

    await runBackfill();
    const first = await db
      .select({ url: schema.notifications.actionUrl })
      .from(schema.notifications);

    await runBackfill();
    const second = await db
      .select({ url: schema.notifications.actionUrl })
      .from(schema.notifications);

    expect(second[0]?.url).toBe(first[0]?.url);
    expect(first[0]?.url).toBe(`/app/a/idem-${stamp}/w/idem-ws-${stamp}/planning/abc`);
  });

  it("leaves rows with no workspace_id untouched", async () => {
    const stamp = Date.now();
    const [user] = await db
      .insert(schema.users)
      .values({ email: `nws-${stamp}@example.com`, displayName: "U" })
      .returning();
    if (!user) throw new Error("seed failed");

    await db.insert(schema.notifications).values({
      userId: user.id,
      workspaceId: null,
      kind: "system",
      title: "orphan",
      body: "b",
      actionUrl: "/app/w/unknown-slug/planning/xyz",
    });

    await runBackfill();

    const [row] = await db
      .select({ url: schema.notifications.actionUrl })
      .from(schema.notifications);
    // Still resolves through the legacy route — nothing to rewrite it against.
    expect(row?.url).toBe("/app/w/unknown-slug/planning/xyz");
  });
});
