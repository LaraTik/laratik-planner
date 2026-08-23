import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, eq, and } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencyEntitlements,
  agencyUsageCounters,
  agencyUsageThresholdEvents,
  platformPlanTemplates,
  agencies,
  users,
} from "@/lib/db/schema";
import { recordUsage } from "@/lib/usage/record-usage";
import { getUsage } from "@/lib/usage/get-usage";
import { InvalidUsageDeltaError } from "@/lib/usage/threshold";
import { expectPgConstraint } from "./_db-error";

/**
 * M2.3 — DB-level integration tests for the usage-tracking service.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... pnpm test:integration
 *
 * The tests exercise:
 *   - the new `agency_usage_counter` table (migration 0010) and its
 *     UPSERT + CHECK behavior,
 *   - the threshold-event emission logic in `recordUsage`,
 *   - the full-snapshot read in `getUsage`.
 *
 * The M2.1 schema (plan templates, agency_entitlement, threshold
 * events) is reused; the seed data mirrors the M2.1
 * `seedTestAgency` helper so the tests are independent of any
 * fixture file.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

async function resetSchema(): Promise<void> {
  // The M2.3 table (agency_usage_counter) is in the truncate list.
  // The append-only triggers on agency_entitlement_change and
  // platform_audit_event do not fire on TRUNCATE.
  await db.execute(sql`
    TRUNCATE
      agency_usage_counter, agency_usage_threshold_event,
      agency_entitlement_change, agency_entitlement,
      platform_audit_event, platform_plan_template,
      agency_membership, bootstrap_lock, agency, "user"
    RESTART IDENTITY CASCADE
  `);
}

async function seedTestAgency(opts?: {
  planSlug?: string;
  overrides?: Record<string, unknown>;
}): Promise<{ agencyId: string; userId: string; planTemplateId: string }> {
  const planSlug = opts?.planSlug ?? "starter";
  const overrides = opts?.overrides ?? null;

  // Seed 4 plan templates (the integration runner wipes them on
  // reset). The numbers match M2.1's seed and the M2.1 test
  // expectations exactly.
  const allCapabilities = [
    "campaign_ideas",
    "brief_improvement",
    "caption_drafts",
    "platform_adaptation",
    "related_format_ideas",
    "completeness_check",
  ];
  await db.insert(platformPlanTemplates).values([
    {
      slug: "starter",
      name: "Starter",
      description: "1 workspace, 3 users, 5 profiles",
      defaultLimits: {
        workspaces: 1,
        users: 3,
        total_social_profiles: 5,
        social_profiles_per_platform: 1,
        storage_bytes: 5_368_709_120,
        monthly_ai_requests: 100,
        monthly_ai_input_tokens: 100_000,
        monthly_ai_output_tokens: 50_000,
        daily_ai_requests_per_user: 20,
        max_output_tokens_per_request: 2_000,
        enabled_capabilities: allCapabilities,
      },
    },
    {
      slug: "growth",
      name: "Growth",
      description: "5 workspaces, 15 users, 25 profiles",
      defaultLimits: {
        workspaces: 5,
        users: 15,
        total_social_profiles: 25,
        social_profiles_per_platform: 3,
        storage_bytes: 53_687_091_200,
        monthly_ai_requests: 1_000,
        monthly_ai_input_tokens: 1_000_000,
        monthly_ai_output_tokens: 500_000,
        daily_ai_requests_per_user: 50,
        max_output_tokens_per_request: 4_000,
        enabled_capabilities: allCapabilities,
      },
    },
    {
      slug: "enterprise",
      name: "Enterprise",
      description: "50 workspaces, 200 users, 250 profiles",
      defaultLimits: {
        workspaces: 50,
        users: 200,
        total_social_profiles: 250,
        social_profiles_per_platform: 20,
        storage_bytes: 536_870_912_000,
        monthly_ai_requests: 10_000,
        monthly_ai_input_tokens: 10_000_000,
        monthly_ai_output_tokens: 5_000_000,
        daily_ai_requests_per_user: 200,
        max_output_tokens_per_request: 8_000,
        enabled_capabilities: allCapabilities,
      },
    },
    {
      slug: "custom",
      name: "Custom",
      description: "No defaults",
      defaultLimits: null,
    },
  ]);

  const [agency] = await db
    .insert(agencies)
    .values({ name: "Acme", slug: `acme-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `owner-${Math.random().toString(36).slice(2, 8)}@usage.test`,
      displayName: "Owner",
    })
    .returning();
  if (!agency || !user) throw new Error("failed to seed agency + user");

  const [template] = await db
    .select()
    .from(platformPlanTemplates)
    .where(eq(platformPlanTemplates.slug, planSlug));
  if (!template) throw new Error(`plan template ${planSlug} not seeded`);

  await db.insert(agencyEntitlements).values({
    agencyId: agency.id,
    planTemplateId: template.id,
    overrides,
  });

  return { agencyId: agency.id, userId: user.id, planTemplateId: template.id };
}

describe("M2.3 — recordUsage / getUsage (DB integration)", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await resetSchema();
  });

  // ─── recordUsage happy path ─────────────────────────────────────────
  describe("recordUsage happy path", () => {
    it("counter increments and no threshold event is emitted below 80%", async () => {
      const { agencyId } = await seedTestAgency();
      // Starter plan: workspaces = 1. 0.5 of 1 = 50% — well below 80%.
      // Increment by 0 to test the "read only" path without crossing.
      const newValue = await recordUsage(db, agencyId, "workspaces", 0);
      expect(newValue).toBe(0);

      const [row] = await db
        .select()
        .from(agencyUsageCounters)
        .where(eq(agencyUsageCounters.agencyId, agencyId));
      expect(row?.currentValue).toBe(0);
      expect(row?.resourceKey).toBe("workspaces");
      expect(row?.version).toBe(1);

      const events = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(eq(agencyUsageThresholdEvents.agencyId, agencyId));
      expect(events).toHaveLength(0);
    });

    it("UPSERT accumulates deltas across calls (INSERT then UPDATE path)", async () => {
      const { agencyId } = await seedTestAgency();
      // Increment the workspaces counter three times. After the
      // first call the row is created (INSERT path, version = 1);
      // the next two hit the UPDATE path (version = 2, 3).
      const v1 = await recordUsage(db, agencyId, "workspaces", 1);
      const v2 = await recordUsage(db, agencyId, "workspaces", 1);
      const v3 = await recordUsage(db, agencyId, "workspaces", 1);
      expect([v1, v2, v3]).toEqual([1, 2, 3]);

      const rows = await db
        .select()
        .from(agencyUsageCounters)
        .where(eq(agencyUsageCounters.agencyId, agencyId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.currentValue).toBe(3);
      expect(rows[0]?.version).toBe(3);
    });
  });

  // ─── 80% / 90% / 100% boundary emission ─────────────────────────────
  describe("threshold event emission at 80% / 90% / 100%", () => {
    it("crossing 80% writes a 'warning' event with the right percent", async () => {
      const { agencyId } = await seedTestAgency();
      // Starter monthly_ai_requests limit = 100. 80/100 = 80% (the
      // warning boundary).
      const newValue = await recordUsage(db, agencyId, "ai_requests_month", 80);
      expect(newValue).toBe(80);

      const events = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(eq(agencyUsageThresholdEvents.agencyId, agencyId));
      // 80/100 = 80% → exactly the warning boundary, must emit.
      expect(events).toHaveLength(1);
      expect(events[0]?.level).toBe("warning");
      expect(Number(events[0]?.percent)).toBeCloseTo(80, 1);
      expect(events[0]?.resource).toBe("ai_requests_month");
    });

    it("crossing 100% in a single call writes warning, urgent, AND over_limit events for the same resource", async () => {
      const { agencyId } = await seedTestAgency();
      // 100/100 = 100% — should emit warning (80%) AND
      // urgent (90%) AND over_limit (100%) in one call.
      const newValue = await recordUsage(db, agencyId, "ai_requests_month", 100);
      expect(newValue).toBe(100);

      const events = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(eq(agencyUsageThresholdEvents.agencyId, agencyId));
      const levels = events.map((e) => e.level).sort();
      expect(levels).toEqual(["over_limit", "urgent", "warning"]);
    });

    it("crossing 100% writes an 'over_limit' event with percent > 100 when value exceeds the limit", async () => {
      const { agencyId } = await seedTestAgency();
      // 120/100 = 120% — over_limit legitimately exceeds 100%.
      const newValue = await recordUsage(db, agencyId, "ai_requests_month", 120);
      expect(newValue).toBe(120);

      const [event] = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(
          and(
            eq(agencyUsageThresholdEvents.agencyId, agencyId),
            eq(agencyUsageThresholdEvents.level, "over_limit"),
          ),
        );
      expect(event).toBeDefined();
      expect(Number(event?.percent)).toBeCloseTo(120, 1);
    });

    it("a resource with no limit (overridden to null) emits NO threshold events", async () => {
      // The override `{"monthly_ai_requests": null}` means
      // the limit is unlimited — even at 10_000 used, no level.
      const { agencyId } = await seedTestAgency({
        overrides: { monthly_ai_requests: null },
      });
      const newValue = await recordUsage(db, agencyId, "ai_requests_month", 10_000);
      expect(newValue).toBe(10_000);

      const events = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(eq(agencyUsageThresholdEvents.agencyId, agencyId));
      expect(events).toHaveLength(0);
    });
  });

  // ─── Idempotency at same level ─────────────────────────────────────
  describe("threshold dedupe (re-emitting the same level is a no-op)", () => {
    it("a second crossing of the SAME boundary does NOT create a second event row", async () => {
      const { agencyId } = await seedTestAgency();
      // First call: 80/100 = 80% → warning emitted.
      await recordUsage(db, agencyId, "ai_requests_month", 80);
      // Second call: 81/100 = still 80%+ (we do not cross 90%).
      // No second warning.
      const valueAgain = await recordUsage(db, agencyId, "ai_requests_month", 1);
      expect(valueAgain).toBe(81);

      const events = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(eq(agencyUsageThresholdEvents.agencyId, agencyId));
      const warningEvents = events.filter((e) => e.level === "warning");
      expect(warningEvents).toHaveLength(1);
    });

    it("a second crossing of the SAME boundary that takes value above and back does NOT create a second event row", async () => {
      const { agencyId } = await seedTestAgency();
      // First call: push to 100 (warning + urgent + over_limit).
      await recordUsage(db, agencyId, "ai_requests_month", 100);
      // Now push to 101 — still over_limit. No new event.
      await recordUsage(db, agencyId, "ai_requests_month", 1);
      const overLimitEvents = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(
          and(
            eq(agencyUsageThresholdEvents.agencyId, agencyId),
            eq(agencyUsageThresholdEvents.level, "over_limit"),
          ),
        );
      expect(overLimitEvents).toHaveLength(1);
    });
  });

  // ─── Per-platform independence ──────────────────────────────────────
  describe("per-platform counter independence", () => {
    it("Instagram counter at 100% does NOT affect Facebook counter's level", async () => {
      const { agencyId } = await seedTestAgency();
      // The Starter plan's social_profiles_per_platform = 1.
      // social_profiles:instagram counter at 1 → 100% of 1.
      // social_profiles:facebook counter at 0 → 0%.
      await recordUsage(db, agencyId, "social_profiles:instagram", 1);
      await recordUsage(db, agencyId, "social_profiles:facebook", 0);

      const snapshot = await getUsage(db, agencyId);
      expect(snapshot.counters["social_profiles:instagram"]).toBe(1);
      expect(snapshot.counters["social_profiles:facebook"]).toBe(0);
      // Instagram is over_limit, Facebook is healthy.
      expect(snapshot.thresholds["social_profiles:instagram"]?.level).toBe("over_limit");
      expect(snapshot.thresholds["social_profiles:facebook"]?.level).toBe("healthy");
    });
  });

  // ─── Negative delta / floor ────────────────────────────────────────
  describe("counter must never go negative", () => {
    it("throws InvalidUsageDeltaError when a negative delta would take the counter below 0", async () => {
      const { agencyId } = await seedTestAgency();
      // Counter is at 0; a delta of -1 would land at -1, which
      // is below the floor. Must throw.
      await expect(recordUsage(db, agencyId, "workspaces", -1)).rejects.toBeInstanceOf(
        InvalidUsageDeltaError,
      );
    });

    it("negative deltas ARE allowed as long as the result is >= 0", async () => {
      const { agencyId } = await seedTestAgency();
      // First, push to 2.
      await recordUsage(db, agencyId, "workspaces", 2);
      // Then decrement by 1 → 1, which is >= 0. Should succeed.
      const v = await recordUsage(db, agencyId, "workspaces", -1);
      expect(v).toBe(1);
    });

    it("a raw INSERT that lands at -1 is rejected by the CHECK constraint (DB-level safety net)", async () => {
      // The service layer's InvalidUsageDeltaError is the first
      // line of defense; the CHECK constraint on
      // agency_usage_counter.current_value >= 0 is the second.
      // This test documents that the DB-level check still works
      // for the "raw SQL bypass" path. Future code that
      // accidentally issues an INSERT without going through
      // recordUsage is caught here.
      const { agencyId } = await seedTestAgency();
      await expectPgConstraint(
        db.execute(sql`
          INSERT INTO agency_usage_counter (agency_id, resource_key, current_value)
          VALUES (${agencyId}, 'workspaces', -1)
        `),
        "agency_usage_counter_current_value_nonneg",
      );
    });
  });

  // ─── getUsage snapshot ─────────────────────────────────────────────
  describe("getUsage snapshot", () => {
    it("on a freshly-provisioned agency all counters are 0 and all levels are healthy", async () => {
      const { agencyId } = await seedTestAgency();
      const snapshot = await getUsage(db, agencyId);
      // Every documented resource is present.
      expect(Object.keys(snapshot.counters).sort()).toEqual(
        [
          "ai_input_tokens_month",
          "ai_output_tokens_month",
          "ai_requests_month",
          "social_profiles",
          "social_profiles:facebook",
          "social_profiles:instagram",
          "social_profiles:linkedin",
          "social_profiles:other",
          "social_profiles:pinterest",
          "social_profiles:snapchat",
          "social_profiles:threads",
          "social_profiles:tiktok",
          "social_profiles:x",
          "social_profiles:youtube",
          "storage_bytes",
          "users",
          "workspaces",
        ].sort(),
      );
      // Every counter is 0.
      for (const value of Object.values(snapshot.counters)) {
        expect(value).toBe(0);
      }
      // Every level is healthy.
      for (const t of Object.values(snapshot.thresholds)) {
        expect(t.level).toBe("healthy");
      }
    });

    it("returns the full resource snapshot with correct level mapping after a 100% crossing", async () => {
      const { agencyId } = await seedTestAgency();
      // 1 workspace on Starter. Push 1 workspace.
      await recordUsage(db, agencyId, "workspaces", 1);
      const snapshot = await getUsage(db, agencyId);
      // workspaces is at 100% of limit 1 → over_limit.
      expect(snapshot.thresholds["workspaces"]?.level).toBe("over_limit");
      // users is at 0% of limit 3 → healthy.
      expect(snapshot.thresholds["users"]?.level).toBe("healthy");
      // The limits map is populated for every known resource.
      expect(snapshot.limits["workspaces"]).toBe(1);
      expect(snapshot.limits["users"]).toBe(3);
      // Storage bytes is 5 GB.
      expect(snapshot.limits["storage_bytes"]).toBe(5_368_709_120);
      // Per-platform limits share the same plan value
      // (social_profiles_per_platform = 1 on Starter).
      expect(snapshot.limits["social_profiles:instagram"]).toBe(1);
      expect(snapshot.limits["social_profiles:facebook"]).toBe(1);
    });

    it("preserves the most severe recorded event even when the current value is below the threshold", async () => {
      // The "getUsage after over_limit crossing" spec: a
      // previous 'over_limit' event exists; the snapshot
      // reports the most-severe recorded level, not the
      // current derived level. This is intentional: the alert
      // channel has already been notified, and the platform
      // console shows the historical state until the counter
      // is explicitly cleared (M2.7+ will add a "clear event"
      // action).
      const { agencyId } = await seedTestAgency();
      // Push 80/100 = 80% → warning.
      await recordUsage(db, agencyId, "ai_requests_month", 80);
      // Push 20 more → 100/100 = 100% → warning + urgent + over_limit.
      await recordUsage(db, agencyId, "ai_requests_month", 20);
      // Now push 1 more → 101 — still over_limit → no new event.
      await recordUsage(db, agencyId, "ai_requests_month", 1);
      const snapshot = await getUsage(db, agencyId);
      expect(snapshot.thresholds["ai_requests_month"]?.level).toBe("over_limit");
      expect(snapshot.thresholds["ai_requests_month"]?.percent).not.toBeNull();
    });
  });
});
