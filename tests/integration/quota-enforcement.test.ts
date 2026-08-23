import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  agencyEntitlements,
  agencyUsageCounters,
  platformPlanTemplates,
} from "@/lib/db/schema";
import { LimitExceededError, releaseCapacity, reserveCapacity } from "@/lib/entitlements";
import { getUsage } from "@/lib/usage";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: databaseUrl, max: 12 });
const db = drizzle(pool);

async function seedAgency(limits: Record<string, unknown>) {
  const [plan] = await db
    .insert(platformPlanTemplates)
    .values({
      slug: `quota-${Math.random().toString(36).slice(2)}`,
      name: "Quota test",
      defaultLimits: limits,
    })
    .returning();
  const [agency] = await db
    .insert(agencies)
    .values({ name: "Quota Agency", slug: `quota-${Math.random().toString(36).slice(2)}` })
    .returning();
  if (!plan || !agency) throw new Error("quota fixture could not be created");
  await db.insert(agencyEntitlements).values({
    agencyId: agency.id,
    planTemplateId: plan.id,
  });
  return agency.id;
}

describe("M2.4 — transactional quota enforcement", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE agency_usage_counter, agency_usage_threshold_event,
        agency_entitlement_change, agency_entitlement,
        platform_audit_event, platform_plan_template, agency
      RESTART IDENTITY CASCADE
    `);
  });

  it("serializes concurrent reservations so capacity cannot be oversold", async () => {
    const agencyId = await seedAgency({ workspaces: 3 });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        db.transaction(async (tx) => {
          await reserveCapacity(tx, agencyId, [{ resource: "workspaces", increase: 1 }]);
        }),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(7);
    expect(rejected.every((result) => result.reason instanceof LimitExceededError)).toBe(true);

    const [counter] = await db
      .select()
      .from(agencyUsageCounters)
      .where(eq(agencyUsageCounters.resourceKey, "workspaces"));
    expect(counter?.currentValue).toBe(3);
  });

  it("rejects a multi-resource reservation atomically", async () => {
    const agencyId = await seedAgency({ workspaces: 1, users: 50 });
    await expect(
      db.transaction(async (tx) => {
        await reserveCapacity(tx, agencyId, [
          { resource: "users", increase: 50 },
          { resource: "workspaces", increase: 2 },
        ]);
      }),
    ).rejects.toBeInstanceOf(LimitExceededError);

    const counters = await db
      .select()
      .from(agencyUsageCounters)
      .where(eq(agencyUsageCounters.agencyId, agencyId));
    expect(counters).toHaveLength(0);
  });

  it("releases archived resources and makes the seat available again", async () => {
    const agencyId = await seedAgency({ users: 1 });
    await db.transaction(async (tx) => {
      await reserveCapacity(tx, agencyId, [{ resource: "users", increase: 1 }]);
    });
    await db.transaction(async (tx) => {
      await releaseCapacity(tx, agencyId, ["users"]);
    });
    await expect(
      db.transaction(async (tx) => {
        await reserveCapacity(tx, agencyId, [{ resource: "users", increase: 1 }]);
      }),
    ).resolves.toBeUndefined();
  });

  it("reports over-limit after a limit is lowered without deleting existing usage", async () => {
    const agencyId = await seedAgency({ workspaces: 5 });
    await db.transaction(async (tx) => {
      await reserveCapacity(tx, agencyId, [{ resource: "workspaces", increase: 4 }]);
    });
    await db
      .update(agencyEntitlements)
      .set({ overrides: { workspaces: 2 } })
      .where(eq(agencyEntitlements.agencyId, agencyId));

    const usage = await getUsage(db, agencyId);
    expect(usage.counters.workspaces).toBe(4);
    expect(usage.thresholds.workspaces).toMatchObject({ level: "over_limit", limit: 2 });
  });
});
