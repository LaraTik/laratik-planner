import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AgencyLifecycleActionSchema, CreateAgencySchema } from "@/lib/platform/agencies";

describe("M2 platform agency service", () => {
  it("validates all four add-agency steps as one command", () => {
    const parsed = CreateAgencySchema.parse({
      name: "Northstar Studio",
      slug: "northstar-studio",
      locale: "en",
      timezone: "Europe/Vienna",
      adminEmail: "owner@example.com",
      adminName: "Agency Owner",
      planTemplateId: "00000000-0000-0000-0000-000000000001",
      overrides: { social_profiles_by_platform: { instagram: 8, tiktok: 2 } },
      reason: "New customer onboarding",
    });
    expect(parsed.overrides.social_profiles_by_platform?.instagram).toBe(8);
  });

  it("rejects unsafe slugs and incomplete audit reasons", () => {
    expect(() =>
      CreateAgencySchema.parse({
        name: "Unsafe",
        slug: "Unsafe Slug",
        adminEmail: "owner@example.com",
        adminName: "Owner",
        planTemplateId: "00000000-0000-0000-0000-000000000001",
        reason: "x",
      }),
    ).toThrow();
  });

  it("keeps suspension and archive recovery as distinct actions", () => {
    for (const action of ["suspend", "restore", "archive", "unarchive"] as const) {
      expect(
        AgencyLifecycleActionSchema.parse({
          agencyId: "00000000-0000-0000-0000-000000000001",
          action,
          reason: "Operator requested lifecycle change",
        }).action,
      ).toBe(action);
    }
  });

  it("enforces exact service permissions and never restores an archive indirectly", () => {
    const source = readFileSync(resolve(__dirname, "../../src/lib/platform/agencies.ts"), "utf8");
    expect(source).toContain('requirePlatformPermission(actor, "platform.agency.create")');
    expect(source).toContain('"platform.agency.lifecycle.manage"');
    expect(source).toContain('"platform.agency.archive"');
    expect(source).toContain('input.action === "unarchive"');
    expect(source).not.toContain("{ suspendedAt: null, archivedAt: null };");
  });

  it("puts plan authorization inside the service wrapper", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/lib/entitlements/change-agency-plan.ts"),
      "utf8",
    );
    expect(source).toContain("changeAgencyPlanAsPlatform");
    expect(source).toContain('requirePlatformPermission(actor, "platform.agency.plan.manage")');
  });

  it("keeps agency, entitlement, admin invitation, counters, and audit in one transaction", () => {
    const source = readFileSync(resolve(__dirname, "../../src/lib/platform/agencies.ts"), "utf8");
    const transactionStart = source.indexOf("db.transaction");
    const emailSend = source.indexOf("await sendEmail");
    expect(transactionStart).toBeGreaterThan(0);
    expect(source.slice(transactionStart, emailSend)).toContain("insert(agencies)");
    expect(source.slice(transactionStart, emailSend)).toContain("insert(agencyEntitlements)");
    expect(source.slice(transactionStart, emailSend)).toContain("insert(invitations)");
    expect(source.slice(transactionStart, emailSend)).toContain("insert(platformAuditEvents)");
    expect(emailSend).toBeGreaterThan(source.indexOf("return { ...agency"));
  });
});
