import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { agencies, agencyUsageThresholdEvents } from "@/lib/db/schema";
import { mergeEntitlement } from "@/lib/entitlements";
import { KNOWN_RESOURCES } from "@/lib/usage";

const agencyId = "00000000-0000-0000-0000-000000000001";
const planId = "00000000-0000-0000-0000-000000000002";

describe("M2 entitlement hardening", () => {
  it("supports a distinct social-profile cap for every platform type", () => {
    const result = mergeEntitlement({
      entitlement: {
        agencyId,
        planTemplateId: planId,
        overrides: {
          social_profiles_by_platform: { instagram: 7, tiktok: 2, threads: 4 },
        },
        hardStopPercent: "100.00",
        gracePolicy: "block",
      },
      planTemplate: {
        id: planId,
        slug: "growth",
        name: "Growth",
        defaultLimits: { social_profiles_per_platform: 3 },
      },
    });

    expect(result.maxProfilesPerPlatform.instagram).toBe(7);
    expect(result.maxProfilesPerPlatform.tiktok).toBe(2);
    expect(result.maxProfilesPerPlatform.threads).toBe(4);
    expect(result.maxProfilesPerPlatform.facebook).toBe(3);
    expect(result.maxProfilesPerPlatform.snapchat).toBe(3);
  });

  it("tracks both total profiles and every supported per-platform counter", () => {
    expect(KNOWN_RESOURCES).toContain("social_profiles");
    expect(KNOWN_RESOURCES).toContain("social_profiles:threads");
    expect(KNOWN_RESOURCES).toContain("social_profiles:snapchat");
  });

  it("stores typed agency lifecycle state and threshold usage cycles", () => {
    expect(Reflect.get(agencies, "suspendedAt")).toBeDefined();
    expect(Reflect.get(agencies, "archivedAt")).toBeDefined();
    expect(Reflect.get(agencyUsageThresholdEvents, "cycleKey")).toBeDefined();
  });

  it("derives quota health from current usage instead of historical events", () => {
    const source = readFileSync(resolve(__dirname, "../../src/lib/usage/get-usage.ts"), "utf8");
    expect(source).not.toContain("severityOf(e.level)");
    expect(source).toContain("computeLevel(value, limit)");
  });

  it("backfills existing agencies onto a compatibility plan", () => {
    const migration = readFileSync(
      resolve(__dirname, "../../src/lib/db/migrations/0011_entitlement_hardening.sql"),
      "utf8",
    );
    expect(migration).toMatch(/INSERT INTO "agency_entitlement"/);
    expect(migration).toMatch(/FROM "agency"/);
    expect(migration).toMatch(/WHERE p\."slug" = 'enterprise'/);
  });
});
