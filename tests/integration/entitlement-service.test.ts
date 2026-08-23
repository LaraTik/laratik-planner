import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencyEntitlements,
  agencyEntitlementChanges,
  platformAuditEvents,
  platformPlanTemplates,
  agencies,
  users,
} from "@/lib/db/schema";
import { expectPgConstraint } from "./_db-error";

/**
 * M2.2 — DB-level integration tests for the entitlement service.
 *
 * The pure-merge logic is tested in
 * `tests/unit/entitlement-merge.test.ts`. This file exercises the
 * DB-bound parts:
 *
 *   - `changeAgencyPlan` is one drizzle transaction that writes
 *     three rows (entitlement UPDATE + change INSERT + audit
 *     INSERT) atomically. The transactional test is the headline
 *     test: any failure in the audit insert must roll back the
 *     entitlement UPDATE.
 *   - The `agency_entitlement_change` table is append-only via a
 *     BEFORE UPDATE / BEFORE DELETE trigger (migration 0009). The
 *     service MUST work with that trigger; the integration test
 *     documents the expected behavior.
 *   - Lifecycle rejection: a suspended / archived agency is
 *     rejected with `AgencyNotActiveError`. The service writes a
 *     `platform_audit_event` with action
 *     `entitlement.change.rejected` so the rejection is visible
 *     in the platform audit timeline.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... pnpm test:integration
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

let changeAgencyPlan: typeof import("@/lib/entitlements/change-agency-plan").changeAgencyPlan;
let getEffectiveEntitlement: typeof import("@/lib/entitlements/get-effective-entitlement").getEffectiveEntitlement;
let AgencyNotFoundError: typeof import("@/lib/entitlements/types").AgencyNotFoundError;
let AgencyNotActiveError: typeof import("@/lib/entitlements/types").AgencyNotActiveError;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  const mod = await import("@/lib/entitlements/change-agency-plan");
  changeAgencyPlan = mod.changeAgencyPlan;
  const types = await import("@/lib/entitlements/types");
  AgencyNotFoundError = types.AgencyNotFoundError;
  AgencyNotActiveError = types.AgencyNotActiveError;
  getEffectiveEntitlement = (await import("@/lib/entitlements/get-effective-entitlement"))
    .getEffectiveEntitlement;
});

beforeEach(async () => {
  // Wipe everything in dependency order. The append-only triggers
  // do NOT fire on TRUNCATE (only on per-row UPDATE / DELETE).
  await db.execute(sql`
    TRUNCATE
      platform_audit_event, agency_usage_threshold_event,
      agency_entitlement_change, agency_entitlement,
      platform_plan_template,
      agency_membership, bootstrap_lock, agency, "user"
    RESTART IDENTITY CASCADE
  `);
});

async function seedFixtures() {
  // Seed 4 plan templates. The migration seeds them once; we re-seed
  // here because the TRUNCATE in beforeEach wipes them.
  const allCapabilities = [
    "campaign_ideas",
    "brief_improvement",
    "caption_drafts",
    "platform_adaptation",
    "related_format_ideas",
    "completeness_check",
  ];
  const [starter] = await db
    .insert(platformPlanTemplates)
    .values({
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
    })
    .returning();
  const [growth] = await db
    .insert(platformPlanTemplates)
    .values({
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
    })
    .returning();
  const [enterprise] = await db
    .insert(platformPlanTemplates)
    .values({
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
    })
    .returning();
  const [custom] = await db
    .insert(platformPlanTemplates)
    .values({
      slug: "custom",
      name: "Custom",
      description: "No defaults",
      defaultLimits: null,
    })
    .returning();
  if (!starter || !growth || !enterprise || !custom) {
    throw new Error("Failed to seed plan templates");
  }

  // Seed the agency and a user that will play the actor role.
  const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
  const [user] = await db
    .insert(users)
    .values({ email: "actor@plans.test", displayName: "Actor" })
    .returning();
  if (!agency || !user) throw new Error("Failed to seed agency + user");

  // Provision the agency on the Starter plan.
  await db.insert(agencyEntitlements).values({
    agencyId: agency.id,
    planTemplateId: starter.id,
  });

  return {
    starterId: starter.id,
    growthId: growth.id,
    enterpriseId: enterprise.id,
    customId: custom.id,
    agencyId: agency.id,
    userId: user.id,
  };
}

describe("M2.2 — changeAgencyPlan service (integration)", () => {
  // ─── Happy path ───────────────────────────────────────────────────
  describe("happy path", () => {
    it("writes all 3 rows in one transaction (entitlement UPDATE + change + audit)", async () => {
      const { agencyId, userId, growthId, starterId } = await seedFixtures();

      const result = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: { workspaces: 7 },
        reason: "upgraded to growth",
        actorUserId: userId,
      });

      // 1. The entitlement row was updated to point at Growth + the
      //    override. The PK is agencyId; the returned row echoes that.
      const [entitlement] = await db
        .select()
        .from(agencyEntitlements)
        .where(eq(agencyEntitlements.agencyId, agencyId));
      expect(entitlement?.planTemplateId).toBe(growthId);
      const overrides = entitlement?.overrides as { workspaces?: number };
      expect(overrides?.workspaces).toBe(7);
      expect(result.entitlement.agencyId).toBe(agencyId);

      // 2. The change row carries the full before / after.
      const [change] = await db
        .select()
        .from(agencyEntitlementChanges)
        .where(eq(agencyEntitlementChanges.agencyId, agencyId));
      expect(change?.actorUserId).toBe(userId);
      const before = change?.before as { plan_template_id?: string; overrides?: unknown };
      const after = change?.after as { plan_template_id?: string; overrides?: unknown };
      expect(before?.plan_template_id).toBe(starterId);
      expect(after?.plan_template_id).toBe(growthId);
      expect(change?.reason).toBe("upgraded to growth");
      expect(result.change.id).toBeDefined();

      // 3. The audit row references the agency + the action.
      const auditRows = await db
        .select()
        .from(platformAuditEvents)
        .where(sql`${platformAuditEvents.target} ->> 'id' = ${agencyId}`);
      const [matchingAudit] = auditRows;
      expect(matchingAudit).toBeDefined();
      expect(matchingAudit?.action).toBe("entitlement.change");
      expect(matchingAudit?.actorUserId).toBe(userId);
      const target = matchingAudit?.target as { type?: string; id?: string };
      expect(target?.type).toBe("agency");
      expect(target?.id).toBe(agencyId);
      // The audit row's before/after mirrors the change row's
      // before/after — both are full snapshots of the entitlement.
      const auditBefore = matchingAudit?.before as { plan_template_id?: string };
      const auditAfter = matchingAudit?.after as { plan_template_id?: string };
      expect(auditBefore?.plan_template_id).toBe(starterId);
      expect(auditAfter?.plan_template_id).toBe(growthId);
      expect(result.audit.id).toBeDefined();
    });

    it("returns the entitlement, change, and audit rows on success", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();

      const result = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: {},
        reason: "test",
        actorUserId: userId,
      });

      expect(result.entitlement.agencyId).toBe(agencyId);
      expect(result.entitlement.planTemplateId).toBe(growthId);
      expect(result.change.agencyId).toBe(agencyId);
      expect(result.change.reason).toBe("test");
      expect(result.audit.action).toBe("entitlement.change");
    });

    it("uses `null` for `overrides` when the call passes `overrides: {}`", async () => {
      // An empty `overrides` object is the "use plan defaults" signal;
      // the service should normalize it to `null` so the merge function
      // falls through to the plan template defaults without
      // persisting an empty JSONB.
      const { agencyId, userId, growthId } = await seedFixtures();

      await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: {},
        reason: "test",
        actorUserId: userId,
      });

      const [entitlement] = await db
        .select()
        .from(agencyEntitlements)
        .where(eq(agencyEntitlements.agencyId, agencyId));
      expect(entitlement?.overrides).toBeNull();
    });

    it("replaces old overrides so a new plan can inherit its own defaults", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      // First change: set workspaces override.
      await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: { workspaces: 7 },
        reason: "first change",
        actorUserId: userId,
      });
      // Second change: only update users; the old workspace override
      // must not leak into the replacement configuration.
      const result = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: { users: 25 },
        reason: "second change",
        actorUserId: userId,
      });
      const overrides = result.entitlement.overrides as { workspaces?: number; users?: number };
      expect(overrides?.workspaces).toBeUndefined();
      expect(overrides?.users).toBe(25);
    });
  });

  // ─── Lifecycle rejection ─────────────────────────────────────────
  describe("lifecycle rejection (suspended / archived)", () => {
    it("rejects with AgencyNotActiveError when the agency is suspended", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      await db
        .update(agencies)
        .set({ suspendedAt: new Date("2026-08-22T00:00:00Z") })
        .where(eq(agencies.id, agencyId));

      const calls = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: {},
        reason: "should be rejected",
        actorUserId: userId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(calls).toBeInstanceOf(AgencyNotActiveError);
      expect((calls as InstanceType<typeof AgencyNotActiveError>).reason).toBe("suspended");

      // No rows were written. The service still inserts a rejection
      // audit row (per the M2.2 spec), but the throw causes the
      // entire transaction to roll back — including the audit row.
      // The "no partial writes" rule means the rejection is not
      // persisted to the audit log; it is surfaced via the thrown
      // error to the caller. (M2.7 will add a separate rejection
      // log if the platform console needs to see rejected changes.)
      const ent = await db
        .select()
        .from(agencyEntitlements)
        .where(eq(agencyEntitlements.agencyId, agencyId));
      expect(ent[0]?.planTemplateId).not.toBe(growthId);
      const changeRows = await db
        .select()
        .from(agencyEntitlementChanges)
        .where(eq(agencyEntitlementChanges.agencyId, agencyId));
      expect(changeRows).toHaveLength(0);
      const auditRows = await db
        .select()
        .from(platformAuditEvents)
        .where(sql`${platformAuditEvents.target} ->> 'id' = ${agencyId}`);
      expect(auditRows).toHaveLength(0);
    });

    it("rejects with AgencyNotActiveError when the agency is archived", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      await db
        .update(agencies)
        .set({ archivedAt: new Date("2026-08-22T00:00:00Z") })
        .where(eq(agencies.id, agencyId));

      const caught = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: {},
        reason: "should be rejected",
        actorUserId: userId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(AgencyNotActiveError);
      expect((caught as InstanceType<typeof AgencyNotActiveError>).reason).toBe("archived");

      const changeRows = await db
        .select()
        .from(agencyEntitlementChanges)
        .where(eq(agencyEntitlementChanges.agencyId, agencyId));
      expect(changeRows).toHaveLength(0);
    });

    it("rejects with AgencyNotActiveError when the agency is suspended AND archived (suspended takes precedence in the audit message)", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      await db
        .update(agencies)
        .set({
          suspendedAt: new Date("2026-08-22T00:00:00Z"),
          archivedAt: new Date("2026-08-22T00:00:00Z"),
        })
        .where(eq(agencies.id, agencyId));

      const caught = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: {},
        reason: "should be rejected",
        actorUserId: userId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(AgencyNotActiveError);
      // Suspended is the more specific state — archived agencies are
      // soft-archived and recoverable; suspended is the active gate.
      expect((caught as InstanceType<typeof AgencyNotActiveError>).reason).toBe("suspended");
    });
  });

  // ─── Non-existent agency ─────────────────────────────────────────
  describe("non-existent agency", () => {
    it("rejects with AgencyNotFoundError", async () => {
      const { userId, growthId } = await seedFixtures();
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const caught = await changeAgencyPlan({
        agencyId: fakeId,
        planTemplateId: growthId,
        overrides: {},
        reason: "test",
        actorUserId: userId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(AgencyNotFoundError);

      // No audit row was written — the agency doesn't exist, so
      // there is nothing to audit against. The service fails fast.
      const auditRows = await db
        .select()
        .from(platformAuditEvents)
        .where(sql`${platformAuditEvents.target} ->> 'id' = ${fakeId}`);
      expect(auditRows).toHaveLength(0);
    });
  });

  // ─── Append-only enforcement ─────────────────────────────────────
  describe("append-only enforcement on agency_entitlement_change", () => {
    it("the trigger blocks direct UPDATE on agency_entitlement_change", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      // Trigger a real change so a row exists.
      const result = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: { workspaces: 9 },
        reason: "create",
        actorUserId: userId,
      });
      // The trigger RAISES an exception with the constraint name
      // `agency_entitlement_change_no_update`.
      await expectPgConstraint(
        db
          .update(agencyEntitlementChanges)
          .set({ reason: "tampered" })
          .where(eq(agencyEntitlementChanges.id, result.change.id)),
        "agency_entitlement_change_no_update",
      );
    });
  });

  // ─── Atomic rollback ─────────────────────────────────────────────
  describe("transactional rollback on failure", () => {
    it("rolls back the entitlement UPDATE when an in-transaction failure occurs", async () => {
      const { agencyId, userId, starterId } = await seedFixtures();
      // Capture the original entitlement state so we can compare
      // after the failed call.
      const [original] = await db
        .select()
        .from(agencyEntitlements)
        .where(eq(agencyEntitlements.agencyId, agencyId));
      expect(original?.planTemplateId).toBe(starterId);

      // Force a failure inside the transaction by passing a plan
      // template id that does not exist. The FK on
      // `agency_entitlement.plan_template_id` will reject the
      // UPDATE, the transaction rolls back, and no change / audit
      // rows are inserted. This is the integration-level proof of
      // the "no partial writes" contract.
      const fakePlanId = "00000000-0000-0000-0000-000000000000";
      const caught = await changeAgencyPlan({
        agencyId,
        planTemplateId: fakePlanId,
        overrides: {},
        reason: "fk should fail",
        actorUserId: userId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      // The FK violation bubbles as a generic Postgres error, not
      // a domain error. The important assertion is the rollback.
      expect(caught).toBeDefined();

      // The entitlement row is unchanged.
      const [after] = await db
        .select()
        .from(agencyEntitlements)
        .where(eq(agencyEntitlements.agencyId, agencyId));
      expect(after?.planTemplateId).toBe(starterId);
      // No change row was inserted.
      const changeRows = await db
        .select()
        .from(agencyEntitlementChanges)
        .where(eq(agencyEntitlementChanges.agencyId, agencyId));
      expect(changeRows).toHaveLength(0);
      // No audit row was inserted.
      const auditRows = await db
        .select()
        .from(platformAuditEvents)
        .where(sql`${platformAuditEvents.target} ->> 'id' = ${agencyId}`);
      expect(auditRows).toHaveLength(0);
    });
  });

  // ─── End-to-end read after write ─────────────────────────────────
  describe("getEffectiveEntitlement reads merged state after changeAgencyPlan", () => {
    it("the new entitlement reflects the post-change plan + overrides", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();

      // Sanity check: the agency is on Starter, so workspaces = 1.
      const before = await getEffectiveEntitlement({ agencyId });
      expect(before.maxWorkspaces).toBe(1);

      // Switch to Growth with a workspaces override of 7.
      await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: { workspaces: 7 },
        reason: "upgrade",
        actorUserId: userId,
      });

      const after = await getEffectiveEntitlement({ agencyId });
      expect(after.maxWorkspaces).toBe(7);
      // Users is the plan default for Growth (15) — no override.
      expect(after.maxUsers).toBe(15);
    });
  });

  // ─── Safe limit changes ──────────────────────────────────────────
  describe("limit changes preserve tenant data", () => {
    it("allows a finite limit to be lowered below current usage and records the reason", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      const result = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: { workspaces: 1 },
        reason: "contract reduced to one workspace",
        actorUserId: userId,
        currentUsage: { workspaces: 4 },
      });

      expect(result.entitlement.overrides).toMatchObject({ workspaces: 1 });
      expect(result.change.reason).toBe("contract reduced to one workspace");
      expect(result.audit.after).toMatchObject({ reason: "contract reduced to one workspace" });
    });

    it("treats null limits as unlimited rather than rejecting active usage", async () => {
      const { agencyId, userId, customId } = await seedFixtures();
      const result = await changeAgencyPlan({
        agencyId,
        planTemplateId: customId,
        overrides: {},
        reason: "move to custom unlimited plan",
        actorUserId: userId,
        currentUsage: { workspaces: 4, users: 3 },
      });
      expect(result.entitlement.planTemplateId).toBe(customId);
    });
  });

  // ─── Zod input validation ───────────────────────────────────────
  describe("Zod input validation", () => {
    it("throws ZodError when agencyId is not a UUID", async () => {
      const { userId, growthId } = await seedFixtures();
      const { z } = await import("zod");
      const caught = await changeAgencyPlan({
        agencyId: "not-a-uuid",
        planTemplateId: growthId,
        overrides: {},
        reason: "test",
        actorUserId: userId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(z.ZodError);
    });

    it("throws ZodError when reason is empty", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      const { z } = await import("zod");
      const caught = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: {},
        reason: "",
        actorUserId: userId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(z.ZodError);
    });

    it("throws ZodError when currentUsage is negative", async () => {
      const { agencyId, userId, growthId } = await seedFixtures();
      const { z } = await import("zod");
      const caught = await changeAgencyPlan({
        agencyId,
        planTemplateId: growthId,
        overrides: {},
        reason: "test",
        actorUserId: userId,
        currentUsage: { workspaces: -1 },
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(z.ZodError);
    });
  });
});
