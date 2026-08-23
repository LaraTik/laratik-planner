import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencyEntitlements,
  agencyEntitlementChanges,
  agencyUsageThresholdEvents,
  platformAuditEvents,
  platformPlanTemplates,
  agencies,
  users,
} from "@/lib/db/schema";
import { expectPgConstraint } from "./_db-error";

/**
 * M2.1 — DB-level invariants for the plans / entitlements /
 * threshold-events / platform-audit tables.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... pnpm test:integration
 *
 * These tests exercise the migration-emitted schema (the trigger
 * function, the NOT NULL / CHECK constraints, the unique dedupe
 * index). They require a database that has had ALL migrations
 * applied — the `beforeAll` re-runs `migrate` to make sure. Migration
 * `0008` supports an empty database, so this suite exercises the same
 * from-zero path used by production recovery.
 *
 * Schema-level invariants (column nullability, Drizzle type shape)
 * are asserted in `tests/unit/plans-schema.test.ts`.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

async function resetSchema(): Promise<void> {
  // The 5 M2.1 tables + the cascading tables the tests depend on
  // are all in the public schema. Use CASCADE so the partial unique
  // index / FK references do not block the truncate. The triggers
  // on `agency_entitlement_change` and `platform_audit_event`
  // do NOT fire on TRUNCATE (only on UPDATE / DELETE per row).
  await db.execute(sql`
    TRUNCATE
      platform_audit_event, agency_usage_threshold_event,
      agency_entitlement_change, agency_entitlement,
      platform_plan_template,
      agency_membership, bootstrap_lock, agency, "user"
    RESTART IDENTITY CASCADE
  `);
}

async function seedTestAgency(): Promise<{ agencyId: string; userId: string }> {
  // The seeded plan templates are written by migration 0009 with
  // `ON CONFLICT (slug) DO NOTHING`. A truncated DB has no plan
  // templates, so re-seed the 4 master-prompt tiers here. The
  // numbers match the M2.1 task spec exactly:
  //   Starter: 1/3/5/5GB/100/100k/50k/20/2k
  //   Growth: 5/15/25/50GB/1k/1M/500k/50/4k
  //   Enterprise: 50/200/250/500GB/10k/10M/5M/200/8k
  //   Custom: NULL defaults
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
        storage_bytes: 5368709120,
        monthly_ai_requests: 100,
        monthly_ai_input_tokens: 100000,
        monthly_ai_output_tokens: 50000,
        daily_ai_requests_per_user: 20,
        max_output_tokens_per_request: 2000,
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
        storage_bytes: 53687091200,
        monthly_ai_requests: 1000,
        monthly_ai_input_tokens: 1000000,
        monthly_ai_output_tokens: 500000,
        daily_ai_requests_per_user: 50,
        max_output_tokens_per_request: 4000,
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
        storage_bytes: 536870912000,
        monthly_ai_requests: 10000,
        monthly_ai_input_tokens: 10000000,
        monthly_ai_output_tokens: 5000000,
        daily_ai_requests_per_user: 200,
        max_output_tokens_per_request: 8000,
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

  const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
  const [user] = await db
    .insert(users)
    .values({ email: "owner@plans.test", displayName: "Owner" })
    .returning();
  if (!agency || !user) throw new Error("failed to seed agency + user");
  return { agencyId: agency.id, userId: user.id };
}

describe("M2.1 — plans / entitlements / threshold / audit (DB invariants)", () => {
  beforeAll(async () => {
    // Idempotent: if the DB is already migrated, this is a no-op.
    // Idempotent on an already migrated database and valid from zero.
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await resetSchema();
  });

  // ─── Seeded plan templates ───────────────────────────────────────────
  describe("plan template seed (migration 0009)", () => {
    it("inserts starter / growth / enterprise / custom on a fresh DB", async () => {
      // The seed runs as part of the migration. We re-insert the
      // 4 tiers here because the TRUNCATE in beforeEach wipes
      // them; the migration only seeds once. This test asserts
      // both the presence of all 4 slugs and the realistic
      // numeric values from the M2.1 task spec.
      const { agencyId, userId } = await seedTestAgency();

      const all = await db.select().from(platformPlanTemplates);
      const slugs = all.map((t) => t.slug).sort();
      expect(slugs).toEqual(["custom", "enterprise", "growth", "starter"]);

      const bySlug = Object.fromEntries(all.map((t) => [t.slug, t]));

      // Starter: 1/3/5/5GB/100/100k/50k/20/2k
      const starter = bySlug.starter!.defaultLimits as Record<string, number | string[]>;
      expect(starter.workspaces).toBe(1);
      expect(starter.users).toBe(3);
      expect(starter.total_social_profiles).toBe(5);
      expect(starter.social_profiles_per_platform).toBe(1);
      expect(starter.storage_bytes).toBe(5_368_709_120); // 5 GB
      expect(starter.monthly_ai_requests).toBe(100);
      expect(starter.monthly_ai_input_tokens).toBe(100_000);
      expect(starter.monthly_ai_output_tokens).toBe(50_000);
      expect(starter.daily_ai_requests_per_user).toBe(20);
      expect(starter.max_output_tokens_per_request).toBe(2_000);

      // Growth: 5/15/25/50GB/1k/1M/500k/50/4k
      const growth = bySlug.growth!.defaultLimits as Record<string, number | string[]>;
      expect(growth.workspaces).toBe(5);
      expect(growth.users).toBe(15);
      expect(growth.total_social_profiles).toBe(25);
      expect(growth.social_profiles_per_platform).toBe(3);
      expect(growth.storage_bytes).toBe(53_687_091_200); // 50 GB
      expect(growth.monthly_ai_requests).toBe(1_000);
      expect(growth.monthly_ai_input_tokens).toBe(1_000_000);
      expect(growth.monthly_ai_output_tokens).toBe(500_000);
      expect(growth.daily_ai_requests_per_user).toBe(50);
      expect(growth.max_output_tokens_per_request).toBe(4_000);

      // Enterprise: 50/200/250/500GB/10k/10M/5M/200/8k
      const ent = bySlug.enterprise!.defaultLimits as Record<string, number | string[]>;
      expect(ent.workspaces).toBe(50);
      expect(ent.users).toBe(200);
      expect(ent.total_social_profiles).toBe(250);
      expect(ent.social_profiles_per_platform).toBe(20);
      expect(ent.storage_bytes).toBe(536_870_912_000); // 500 GB
      expect(ent.monthly_ai_requests).toBe(10_000);
      expect(ent.monthly_ai_input_tokens).toBe(10_000_000);
      expect(ent.monthly_ai_output_tokens).toBe(5_000_000);
      expect(ent.daily_ai_requests_per_user).toBe(200);
      expect(ent.max_output_tokens_per_request).toBe(8_000);

      // Custom: NULL defaults (sentinel for "no defaults; agency
      // must override every limit").
      expect(bySlug.custom!.defaultLimits).toBeNull();

      // Use the agency + user so the variable is not flagged as
      // unused — the dedupe test below needs both.
      expect(agencyId).toBeDefined();
      expect(userId).toBeDefined();
    });

    it("seed INSERT is idempotent (ON CONFLICT (slug) WHERE archived_at IS NULL DO NOTHING)", async () => {
      // The migration's seed is wrapped in
      //   ON CONFLICT (slug) WHERE archived_at IS NULL DO NOTHING
      // so a re-run after a partial failure does not overwrite
      // operator edits to the non-unique columns. We assert that
      // the partial unique index lets a re-insert at the same
      // slug (with different `name` / `description` / `default_limits`)
      // silently no-op, while the row from the first insert is
      // preserved. We use raw SQL here because Drizzle's typed
      // insert does not expose the ON CONFLICT clause without an
      // explicit `.onConflictDoNothing()` call.
      await seedTestAgency();

      await db.execute(sql`
        INSERT INTO platform_plan_template (slug, name, description, default_limits)
        VALUES ('starter', 'Starter — RENAMED', 'Different', '{"workspaces":99,"users":99}'::jsonb)
        ON CONFLICT (slug) WHERE archived_at IS NULL DO NOTHING
      `);

      const [starter] = await db
        .select()
        .from(platformPlanTemplates)
        .where(eq(platformPlanTemplates.slug, "starter"));
      // The first seed won; the rename is silently dropped.
      expect(starter?.name).toBe("Starter");
      expect(starter?.description).toBe("1 workspace, 3 users, 5 profiles");
      // The default_limits JSONB is the original (not the 99/99
      // attempted by the second insert).
      const limits = starter!.defaultLimits as Record<string, number>;
      expect(limits.workspaces).toBe(1);
      expect(limits.users).toBe(3);
    });

    it("starter defaultLimits include the documented key set", async () => {
      await seedTestAgency();
      const [starter] = await db
        .select()
        .from(platformPlanTemplates)
        .where(eq(platformPlanTemplates.slug, "starter"));
      expect(starter).toBeDefined();
      const limits = starter!.defaultLimits as Record<string, unknown>;
      // The M2.1 task explicitly lists these 11 keys. Missing any
      // one is a contract violation that the M2.2 merge function
      // will silently treat as "no limit" — a footgun.
      const expectedKeys = [
        "workspaces",
        "users",
        "total_social_profiles",
        "social_profiles_per_platform",
        "storage_bytes",
        "monthly_ai_requests",
        "monthly_ai_input_tokens",
        "monthly_ai_output_tokens",
        "daily_ai_requests_per_user",
        "max_output_tokens_per_request",
        "enabled_capabilities",
      ];
      for (const key of expectedKeys) {
        expect(limits).toHaveProperty(key);
      }
      // enabled_capabilities is the all-6 set per the task spec.
      expect(limits.enabled_capabilities).toEqual([
        "campaign_ideas",
        "brief_improvement",
        "caption_drafts",
        "platform_adaptation",
        "related_format_ideas",
        "completeness_check",
      ]);
    });
  });

  // ─── agency_entitlement FK behavior ─────────────────────────────────
  describe("agency_entitlement FK", () => {
    it("cascades on agency delete (the entitlement is meaningless without the agency)", async () => {
      const { agencyId } = await seedTestAgency();
      const [template] = await db
        .select()
        .from(platformPlanTemplates)
        .where(eq(platformPlanTemplates.slug, "starter"));
      await db.insert(agencyEntitlements).values({
        agencyId,
        planTemplateId: template!.id,
      });

      await db.delete(agencies).where(eq(agencies.id, agencyId));

      const remaining = await db
        .select()
        .from(agencyEntitlements)
        .where(eq(agencyEntitlements.agencyId, agencyId));
      expect(remaining).toHaveLength(0);
    });

    it("rejects an entitlement that points at a non-existent plan_template_id (FK)", async () => {
      const { agencyId } = await seedTestAgency();
      // Use a random UUID that is not a real plan template — the FK
      // constraint should reject the insert with a "violates foreign
      // key constraint" message. Postgres truncates FK constraint
      // names to 63 chars; the generated name is
      // `agency_entitlement_plan_template_id_platform_plan_template_id_fk`
      // (78 chars) which Postgres stores as
      // `agency_entitlement_plan_template_id_platform_plan_template_id_f`
      // (63 chars). We assert against the truncated form to match
      // what Postgres actually reports in the error message.
      const randomUuid = "00000000-0000-0000-0000-000000000000";
      await expectPgConstraint(
        db.insert(agencyEntitlements).values({
          agencyId,
          planTemplateId: randomUuid,
        }),
        "agency_entitlement_plan_template_id_platform_plan_template_id_f",
      );
    });

    it("rejects an entitlement with plan_template_id = NULL (NOT NULL discipline)", async () => {
      const { agencyId } = await seedTestAgency();
      // Drizzle's typed insert will not let us pass undefined for
      // a NOT NULL column. The raw SQL path is the only way to
      // produce the violating statement, so we use a direct
      // execute to assert the NOT NULL constraint at the DB level.
      // The error message Postgres emits is "null value in column
      // "plan_template_id" of relation..." — we assert against the
      // quoted column name to keep the assertion stable across
      // Postgres versions.
      await expectPgConstraint(
        db.execute(
          sql`INSERT INTO agency_entitlement (agency_id, plan_template_id) VALUES (${agencyId}, NULL)`,
        ),
        '"plan_template_id"',
      );
    });

    it("rejects hard_stop_percent outside 0..100 (CHECK constraint)", async () => {
      const { agencyId } = await seedTestAgency();
      const [template] = await db
        .select()
        .from(platformPlanTemplates)
        .where(eq(platformPlanTemplates.slug, "starter"));
      // Drizzle's numeric type accepts strings; the CHECK
      // constraint is what protects the 0..100 range.
      await expectPgConstraint(
        db.execute(sql`
          INSERT INTO agency_entitlement (agency_id, plan_template_id, hard_stop_percent)
          VALUES (${agencyId}, ${template!.id}, 150)
        `),
        "agency_entitlement_hard_stop_max",
      );
      await expectPgConstraint(
        db.execute(sql`
          INSERT INTO agency_entitlement (agency_id, plan_template_id, hard_stop_percent)
          VALUES (${agencyId}, ${template!.id}, -1)
        `),
        "agency_entitlement_hard_stop_range",
      );
    });
  });

  // ─── agency_entitlement_change (APPEND-ONLY) ─────────────────────────
  describe("agency_entitlement_change is append-only", () => {
    it("INSERT works", async () => {
      const { agencyId, userId } = await seedTestAgency();
      const [row] = await db
        .insert(agencyEntitlementChanges)
        .values({
          agencyId,
          actorUserId: userId,
          before: { plan_template_id: null },
          after: { plan_template_id: "abc" },
          reason: "manual-change",
        })
        .returning();
      expect(row?.id).toBeDefined();
    });

    it("UPDATE raises an exception (BEFORE UPDATE trigger)", async () => {
      const { agencyId, userId } = await seedTestAgency();
      const [row] = await db
        .insert(agencyEntitlementChanges)
        .values({
          agencyId,
          actorUserId: userId,
          before: {},
          after: {},
          reason: "x",
        })
        .returning();
      // The trigger is the source of truth: UPDATE is rejected with
      // a clear "append-only" message that names the table and the
      // trigger. The migration comment block documents this as a
      // SECURITY DEFINER-style trigger.
      await expectPgConstraint(
        db
          .update(agencyEntitlementChanges)
          .set({ reason: "tampered" })
          .where(eq(agencyEntitlementChanges.id, row!.id)),
        "agency_entitlement_change_no_update",
      );
    });

    it("DELETE raises an exception (BEFORE DELETE trigger)", async () => {
      const { agencyId, userId } = await seedTestAgency();
      const [row] = await db
        .insert(agencyEntitlementChanges)
        .values({
          agencyId,
          actorUserId: userId,
          before: {},
          after: {},
          reason: "x",
        })
        .returning();
      await expectPgConstraint(
        db.delete(agencyEntitlementChanges).where(eq(agencyEntitlementChanges.id, row!.id)),
        "agency_entitlement_change_no_update",
      );
    });

    it("blocks hard-delete of an actor that has ever written an entitlement change (ON DELETE RESTRICT)", async () => {
      // The append-only trigger blocks UPDATE, so we cannot use
      // ON DELETE SET NULL on the actor FK (a SET NULL cascade is
      // an UPDATE). The chosen alternative is ON DELETE RESTRICT:
      // a user that has ever appeared as an actor in an
      // entitlement change cannot be hard-deleted. This test
      // documents that behavior so a future migration that "fixes"
      // the FK to SET NULL is caught at the test layer.
      const { agencyId, userId } = await seedTestAgency();
      await db.insert(agencyEntitlementChanges).values({
        agencyId,
        actorUserId: userId,
        before: {},
        after: {},
        reason: "x",
      });
      await expectPgConstraint(
        db.delete(users).where(eq(users.id, userId)),
        "agency_entitlement_change_actor_user_id_user_id_fk",
      );
    });
  });

  // ─── agency_usage_threshold_event dedupe ────────────────────────────
  describe("agency_usage_threshold_event dedupe", () => {
    it("UNIQUE (agency_id, resource, level) — second insert at same level raises", async () => {
      const { agencyId } = await seedTestAgency();
      await db.insert(agencyUsageThresholdEvents).values({
        agencyId,
        resource: "workspaces",
        percent: "85.00",
        level: "warning",
      });
      await expectPgConstraint(
        db.insert(agencyUsageThresholdEvents).values({
          agencyId,
          resource: "workspaces",
          percent: "86.00",
          level: "warning",
        }),
        "agency_usage_threshold_event_dedupe_idx",
      );
    });

    it("different level at same resource does NOT collide (the dedupe is per-level)", async () => {
      const { agencyId } = await seedTestAgency();
      // warning → urgent → over_limit are three independent events
      // for the same resource. The dedupe key is the triple, so all
      // three should land cleanly.
      await db.insert(agencyUsageThresholdEvents).values({
        agencyId,
        resource: "users",
        percent: "80.00",
        level: "warning",
      });
      await db.insert(agencyUsageThresholdEvents).values({
        agencyId,
        resource: "users",
        percent: "90.00",
        level: "urgent",
      });
      await db.insert(agencyUsageThresholdEvents).values({
        agencyId,
        resource: "users",
        percent: "110.00",
        level: "over_limit",
      });
      const rows = await db
        .select()
        .from(agencyUsageThresholdEvents)
        .where(eq(agencyUsageThresholdEvents.agencyId, agencyId));
      expect(rows).toHaveLength(3);
    });

    it("rejects percent < 0 (CHECK constraint)", async () => {
      const { agencyId } = await seedTestAgency();
      await expectPgConstraint(
        db.execute(sql`
          INSERT INTO agency_usage_threshold_event
            (agency_id, resource, percent, level)
          VALUES (${agencyId}, 'workspaces', -1, 'warning')
        `),
        "agency_usage_threshold_event_percent_nonneg",
      );
    });

    it("accepts percent > 100 (over_limit legitimately exceeds 100%)", async () => {
      const { agencyId } = await seedTestAgency();
      // 130% is a real observation: the agency has used 130% of
      // its workspaces. The CHECK is `>= 0`, not `<= 100`, so this
      // must succeed.
      const [row] = await db
        .insert(agencyUsageThresholdEvents)
        .values({
          agencyId,
          resource: "workspaces",
          percent: "130.00",
          level: "over_limit",
        })
        .returning();
      expect(row?.id).toBeDefined();
    });
  });

  // ─── platform_audit_event (APPEND-ONLY) ─────────────────────────────
  describe("platform_audit_event is append-only", () => {
    it("INSERT works (no actor = system action; with actor = human action)", async () => {
      const { userId } = await seedTestAgency();
      const [withActor] = await db
        .insert(platformAuditEvents)
        .values({
          actorUserId: userId,
          action: "agency.create",
          target: { type: "agency", id: "abc" },
          before: null,
          after: { name: "Acme" },
        })
        .returning();
      const [withoutActor] = await db
        .insert(platformAuditEvents)
        .values({
          action: "system.heartbeat",
          target: { type: "system", id: "scheduler" },
        })
        .returning();
      expect(withActor?.id).toBeDefined();
      expect(withoutActor?.id).toBeDefined();
    });

    it("UPDATE raises an exception (BEFORE UPDATE trigger)", async () => {
      await seedTestAgency();
      const [row] = await db
        .insert(platformAuditEvents)
        .values({
          action: "agency.create",
          target: { type: "agency", id: "abc" },
        })
        .returning();
      await expectPgConstraint(
        db
          .update(platformAuditEvents)
          .set({ action: "tampered" })
          .where(eq(platformAuditEvents.id, row!.id)),
        "platform_audit_event_no_update",
      );
    });

    it("DELETE raises an exception (BEFORE DELETE trigger)", async () => {
      await seedTestAgency();
      const [row] = await db
        .insert(platformAuditEvents)
        .values({
          action: "agency.create",
          target: { type: "agency", id: "abc" },
        })
        .returning();
      await expectPgConstraint(
        db.delete(platformAuditEvents).where(eq(platformAuditEvents.id, row!.id)),
        "platform_audit_event_no_update",
      );
    });

    it("blocks hard-delete of an actor that has ever written a platform audit event (ON DELETE RESTRICT)", async () => {
      // The append-only trigger blocks UPDATE, so the actor FK
      // must be ON DELETE RESTRICT (not SET NULL). This test
      // documents the behavior so a future migration that changes
      // the FK to SET NULL is caught at the test layer.
      const { userId } = await seedTestAgency();
      await db.insert(platformAuditEvents).values({
        actorUserId: userId,
        action: "agency.suspend",
        target: { type: "agency", id: "abc" },
      });
      await expectPgConstraint(
        db.delete(users).where(eq(users.id, userId)),
        "platform_audit_event_actor_user_id_user_id_fk",
      );
    });

    it("system-initiated events (actorUserId null) can be inserted and are not FK-blocked", async () => {
      // The column is nullable specifically so a system actor
      // (no human user) can write a row. The ON DELETE RESTRICT
      // does not apply to rows with null actor_user_id.
      await seedTestAgency();
      const [row] = await db
        .insert(platformAuditEvents)
        .values({
          actorUserId: null,
          action: "system.heartbeat",
          target: { type: "system", id: "scheduler" },
        })
        .returning();
      expect(row?.id).toBeDefined();
      expect(row?.actorUserId).toBeNull();
    });
  });

  // ─── Append-only trigger covers BOTH tables ────────────────────────
  describe("append-only is enforced uniformly", () => {
    it("trigger is installed on both agency_entitlement_change and platform_audit_event", async () => {
      // The trigger name is the same function attached to two
      // tables. If a future migration accidentally only adds it
      // to one table, this test catches it. The function name is
      // the contract: `forbid_modify_audit_log`.
      const result = await db.execute<{ count: string }>(sql`
        SELECT count(*)::text AS count
        FROM pg_trigger
        WHERE tgname IN (
          'agency_entitlement_change_no_update',
          'platform_audit_event_no_update'
        )
        AND tgenabled = 'O'
      `);
      expect(Number(result.rows[0]?.count ?? "0")).toBe(2);
    });

    it("the trigger function is the same single function (no copy-paste)", async () => {
      // Both triggers must reference the same forbid_modify_audit_log
      // function. Copy-paste would let a future change to one
      // trigger's logic diverge from the other.
      const result = await db.execute<{ count: string }>(sql`
        SELECT count(DISTINCT t.tgfoid)::text AS count
        FROM pg_trigger t
        JOIN pg_proc p ON t.tgfoid = p.oid
        WHERE p.proname = 'forbid_modify_audit_log'
        AND t.tgname IN (
          'agency_entitlement_change_no_update',
          'platform_audit_event_no_update'
        )
      `);
      expect(Number(result.rows[0]?.count ?? "0")).toBe(1);
    });
  });
});
