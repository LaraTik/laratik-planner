import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import {
  agencies,
  researchCollections,
  researchTeardowns,
  researchWatchlistAccounts,
  researchWatchlistMembers,
  researchWatchlists,
  users,
  workspaces,
} from "@/lib/db/schema";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

let workspaceId: string;
let userId: string;

describe("M4 — research collections and watchlists", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE research_teardown, research_collection, workspace, agency, "user"
      RESTART IDENTITY CASCADE
    `);
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Acme", slug: `acme-${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        email: `research-${Math.random().toString(36).slice(2, 8)}@example.com`,
        displayName: "Research Planner",
      })
      .returning();
    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency!.id,
        name: "Main",
        slug: `main-${Math.random().toString(36).slice(2, 8)}`,
        createdBy: user!.id,
      })
      .returning();
    workspaceId = workspace!.id;
    userId = user!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("assigns a teardown to a collection and clears the pointer on collection removal", async () => {
    const [collection] = await db
      .insert(researchCollections)
      .values({ workspaceId, createdBy: userId, name: "Q4 hooks", shareScope: "workspace" })
      .returning();
    const [teardown] = await db
      .insert(researchTeardowns)
      .values({
        workspaceId,
        createdBy: userId,
        sourceKind: "planner_notes",
        result: { schemaVersion: 1, hook: "Hook", promise: "Promise" },
      })
      .returning();

    await db
      .update(researchTeardowns)
      .set({ collectionId: collection!.id })
      .where(
        and(eq(researchTeardowns.id, teardown!.id), eq(researchTeardowns.workspaceId, workspaceId)),
      );

    const [assigned] = await db
      .select({ collectionId: researchTeardowns.collectionId })
      .from(researchTeardowns)
      .where(eq(researchTeardowns.id, teardown!.id));
    expect(assigned?.collectionId).toBe(collection!.id);

    await db.delete(researchCollections).where(eq(researchCollections.id, collection!.id));
    const [cleared] = await db
      .select({ collectionId: researchTeardowns.collectionId })
      .from(researchTeardowns)
      .where(eq(researchTeardowns.id, teardown!.id));
    expect(cleared?.collectionId).toBeNull();
  });

  it("keeps named account membership unique and cascades it with the watchlist", async () => {
    const [watchlist] = await db
      .insert(researchWatchlists)
      .values({ workspaceId, createdBy: userId, name: "Halal grocery competitors" })
      .returning();
    const [account] = await db
      .insert(researchWatchlistAccounts)
      .values({
        workspaceId,
        createdBy: userId,
        platform: "instagram",
        handle: "competitor",
        sourceUrl: "https://instagram.com/competitor",
      })
      .returning();

    await db
      .insert(researchWatchlistMembers)
      .values({ watchlistId: watchlist!.id, accountId: account!.id });

    await expect(
      db
        .insert(researchWatchlistMembers)
        .values({ watchlistId: watchlist!.id, accountId: account!.id }),
    ).rejects.toThrow();

    await db.delete(researchWatchlists).where(eq(researchWatchlists.id, watchlist!.id));
    const members = await db
      .select()
      .from(researchWatchlistMembers)
      .where(eq(researchWatchlistMembers.accountId, account!.id));
    expect(members).toHaveLength(0);
  });
});
