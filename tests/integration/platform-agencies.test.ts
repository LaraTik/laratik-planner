import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  agencies,
  agencyEntitlements,
  agencyMemberships,
  agencyUsageCounters,
  invitations,
  platformAdministrators,
  platformAuditEvents,
  platformPlanTemplates,
  users,
} from "@/lib/db/schema";

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({ sendEmail }));

describe("M2.5/M2.7 — platform agency lifecycle", () => {
  let db: typeof import("@/lib/db").db;
  let createAgency: typeof import("@/lib/platform/agencies").createAgency;
  let changeAgencyLifecycle: typeof import("@/lib/platform/agencies").changeAgencyLifecycle;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ createAgency, changeAgencyLifecycle } = await import("@/lib/platform/agencies"));
  });

  beforeEach(async () => {
    sendEmail.mockClear();
    await db.execute(sql`
      TRUNCATE agency_usage_counter, agency_usage_threshold_event,
        agency_entitlement_change, agency_entitlement,
        platform_audit_event, platform_administrator,
        platform_plan_template, invitation, agency_membership,
        agency, "user"
      RESTART IDENTITY CASCADE
    `);
  });

  async function seedPlatformActor() {
    const [actor] = await db
      .insert(users)
      .values({ email: "platform@example.test", displayName: "Platform Admin" })
      .returning();
    const [plan] = await db
      .insert(platformPlanTemplates)
      .values({ slug: "starter", name: "Starter", defaultLimits: { users: 3, workspaces: 1 } })
      .returning();
    if (!actor || !plan) throw new Error("platform fixture failed");
    await db.insert(platformAdministrators).values({
      userId: actor.id,
      reason: "integration fixture",
    });
    return { actor: { id: actor.id }, planId: plan.id };
  }

  it("creates organization, entitlement, invitation, counter, and audit atomically", async () => {
    const { actor, planId } = await seedPlatformActor();
    const result = await createAgency(actor, {
      name: "North Star Agency",
      slug: "north-star",
      locale: "en",
      timezone: "Europe/Vienna",
      adminEmail: "owner@north-star.test",
      adminName: "Agency Owner",
      planTemplateId: planId,
      overrides: { workspaces: 2 },
      reason: "new customer contract",
    });

    expect(result.invitationId).toBeTruthy();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [entitlements, inviteRows, counters, audits] = await Promise.all([
      db.select().from(agencyEntitlements).where(eq(agencyEntitlements.agencyId, result.id)),
      db.select().from(invitations).where(eq(invitations.agencyId, result.id)),
      db.select().from(agencyUsageCounters).where(eq(agencyUsageCounters.agencyId, result.id)),
      db
        .select()
        .from(platformAuditEvents)
        .where(sql`${platformAuditEvents.target} ->> 'id' = ${result.id}`),
    ]);
    expect(entitlements).toHaveLength(1);
    expect(inviteRows).toHaveLength(1);
    expect(counters[0]?.currentValue).toBe(1);
    expect(audits[0]?.action).toBe("agency.create");
  });

  it("leaves no partial agency when plan validation fails", async () => {
    const { actor } = await seedPlatformActor();
    await expect(
      createAgency(actor, {
        name: "Broken Agency",
        slug: "broken-agency",
        locale: "en",
        timezone: "UTC",
        adminEmail: "owner@broken.test",
        adminName: "Owner",
        planTemplateId: "00000000-0000-0000-0000-000000000000",
        overrides: {},
        reason: "rollback proof",
      }),
    ).rejects.toThrow("Plan template not found");
    expect(await db.select().from(agencies).where(eq(agencies.slug, "broken-agency"))).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("suspends, archives, and restores with an audit event for every action", async () => {
    const { actor, planId } = await seedPlatformActor();
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Lifecycle Agency", slug: "lifecycle-agency" })
      .returning();
    if (!agency) throw new Error("agency fixture failed");
    await db.insert(agencyEntitlements).values({ agencyId: agency.id, planTemplateId: planId });

    await changeAgencyLifecycle(actor, { agencyId: agency.id, action: "suspend", reason: "payment review" });
    await changeAgencyLifecycle(actor, { agencyId: agency.id, action: "archive", reason: "contract ended" });
    await changeAgencyLifecycle(actor, { agencyId: agency.id, action: "restore", reason: "contract renewed" });

    const [restored] = await db.select().from(agencies).where(eq(agencies.id, agency.id));
    expect(restored?.suspendedAt).toBeNull();
    expect(restored?.archivedAt).toBeNull();
    const events = await db
      .select({ action: platformAuditEvents.action, after: platformAuditEvents.after })
      .from(platformAuditEvents)
      .where(sql`${platformAuditEvents.target} ->> 'id' = ${agency.id}`);
    expect(events.map((event) => event.action)).toEqual([
      "agency.suspend",
      "agency.archive",
      "agency.restore",
    ]);
    expect(
      events.every(
        (event) => typeof (event.after as Record<string, unknown> | null)?.reason === "string",
      ),
    ).toBe(true);
  });

  it("uses an active existing account as the first agency administrator", async () => {
    const { actor, planId } = await seedPlatformActor();
    const [owner] = await db
      .insert(users)
      .values({ email: "existing@agency.test", displayName: "Existing Owner" })
      .returning();
    if (!owner) throw new Error("owner fixture failed");
    const result = await createAgency(actor, {
      name: "Existing Owner Agency",
      slug: "existing-owner-agency",
      locale: "en",
      timezone: "UTC",
      adminEmail: owner.email,
      adminName: "Existing Owner",
      planTemplateId: planId,
      overrides: {},
      reason: "existing customer account",
    });
    const [membership] = await db
      .select()
      .from(agencyMemberships)
      .where(eq(agencyMemberships.agencyId, result.id));
    expect(membership).toMatchObject({ userId: owner.id, status: "active", isAgencyAdmin: true });
    expect(await db.select().from(invitations).where(eq(invitations.agencyId, result.id))).toHaveLength(0);
  });
});
