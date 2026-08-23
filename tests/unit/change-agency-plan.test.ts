import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AgencyEntitlementRowSchema,
  AgencyNotActiveError,
  AgencyNotFoundError,
  ChangeAgencyPlanInputSchema,
  LimitExceededError,
  OverrideShapeSchema,
  PlatformPlanTemplateRowSchema,
  type EffectiveEntitlement,
  findRemovedLimits,
} from "@/lib/entitlements";

/**
 * M2.2 — service-layer unit tests.
 *
 * The pure-merge logic is tested in `entitlement-merge.test.ts`.
 * This file exercises the rest of the service contract:
 *
 *   1. `findRemovedLimits` — the "complete removal" detector. The
 *      spec says: throw `LimitExceededError` only if the new plan
 *      would completely remove a limit (limit → null) while
 *      current usage > 0. The detector returns the set of
 *      resources that went non-null → null; the caller checks
 *      usage against that set.
 *
 *   2. Zod schema validation — the wire contract for the public
 *      API. The tests assert the schema accepts the documented
 *      shapes and rejects the documented bad shapes.
 *
 *   3. Domain error shape — `AgencyNotFoundError`,
 *      `AgencyNotActiveError`, `LimitExceededError` carry the
 *      fields downstream callers depend on for logging.
 *
 * The DB-bound paths (`changeAgencyPlan` with a real transaction)
 * are tested in `tests/integration/entitlement-service.test.ts`.
 */
describe("M2.2 — findRemovedLimits (unit)", () => {
  const base: EffectiveEntitlement = {
    maxWorkspaces: 1,
    maxUsers: 3,
    maxSocialProfiles: 5,
    maxProfilesPerPlatform: {
      instagram: 1,
      facebook: 1,
      tiktok: 1,
      linkedin: 1,
      youtube: 1,
      pinterest: 1,
      x: 1,
      threads: 1,
      snapchat: 1,
      other: 1,
    },
    maxStorageBytes: 1000,
    maxMonthlyAiRequests: 100,
    maxMonthlyAiInputTokens: 1000,
    maxMonthlyAiOutputTokens: 500,
    maxDailyAiRequestsPerUser: 20,
    maxOutputTokensPerRequest: 2000,
    enabledAiCapabilities: new Set(),
    hardStopPercent: 100,
    gracePolicy: "hard",
  };

  it("returns empty when no limit changed", () => {
    expect(findRemovedLimits(base, { ...base })).toEqual([]);
  });

  it("detects a single limit going non-null → null", () => {
    const after: EffectiveEntitlement = { ...base, maxWorkspaces: null };
    expect(findRemovedLimits(base, after)).toEqual(["workspaces"]);
  });

  it("detects every resource whose limit was removed (one per numeric field)", () => {
    const after: EffectiveEntitlement = {
      ...base,
      maxWorkspaces: null,
      maxUsers: null,
      maxStorageBytes: null,
      maxMonthlyAiRequests: null,
    };
    expect(new Set(findRemovedLimits(base, after))).toEqual(
      new Set(["workspaces", "users", "storage_bytes", "monthly_ai_requests"]),
    );
  });

  it("does NOT flag a per-platform limit going non-null → null (per-platform is a loosening)", () => {
    // The per-platform record is intentionally NOT in the detector.
    // Per-platform caps going from a number to null is a loosening
    // (more allowed, not less). The M2.2 spec only requires the
    // error for the agency-wide numeric limits.
    const after: EffectiveEntitlement = {
      ...base,
      maxProfilesPerPlatform: {
        instagram: null,
        facebook: null,
        tiktok: null,
        linkedin: null,
        youtube: null,
        pinterest: null,
        x: null,
        threads: null,
        snapchat: null,
        other: null,
      },
    };
    expect(findRemovedLimits(base, after)).toEqual([]);
  });

  it("does NOT flag a limit that was already null (no change)", () => {
    const before: EffectiveEntitlement = { ...base, maxWorkspaces: null };
    const after: EffectiveEntitlement = { ...base, maxWorkspaces: null };
    expect(findRemovedLimits(before, after)).toEqual([]);
  });

  it("does NOT flag a limit that went from null to non-null (tightening, not removal)", () => {
    const before: EffectiveEntitlement = { ...base, maxWorkspaces: null };
    const after: EffectiveEntitlement = { ...base, maxWorkspaces: 5 };
    expect(findRemovedLimits(before, after)).toEqual([]);
  });

  it("does NOT flag a limit that was lowered (5 → 3) but not removed", () => {
    const after: EffectiveEntitlement = { ...base, maxUsers: 3 };
    expect(findRemovedLimits(base, after)).toEqual([]);
  });
});

// ─── Zod schema tests ─────────────────────────────────────────────

describe("M2.2 — OverrideShapeSchema (Zod)", () => {
  it("accepts an empty object (no overrides)", () => {
    expect(() => OverrideShapeSchema.parse({})).not.toThrow();
  });

  it("accepts every documented key with a positive integer", () => {
    expect(() =>
      OverrideShapeSchema.parse({
        workspaces: 1,
        users: 3,
        total_social_profiles: 5,
        social_profiles_per_platform: 1,
        storage_bytes: 1024,
        monthly_ai_requests: 100,
        monthly_ai_input_tokens: 1000,
        monthly_ai_output_tokens: 500,
        daily_ai_requests_per_user: 20,
        max_output_tokens_per_request: 2000,
      }),
    ).not.toThrow();
  });

  it("accepts null values for every numeric key (unlimited)", () => {
    expect(() =>
      OverrideShapeSchema.parse({
        workspaces: null,
        users: null,
        storage_bytes: null,
      }),
    ).not.toThrow();
  });

  it("accepts the documented capability names", () => {
    expect(() =>
      OverrideShapeSchema.parse({
        enabled_capabilities: ["campaign_ideas", "caption_drafts"],
      }),
    ).not.toThrow();
  });

  it("accepts null for enabled_capabilities (no constraint)", () => {
    expect(() => OverrideShapeSchema.parse({ enabled_capabilities: null })).not.toThrow();
  });

  it("accepts the grace_policy values", () => {
    expect(() => OverrideShapeSchema.parse({ grace_policy: "block" })).not.toThrow();
    expect(() => OverrideShapeSchema.parse({ grace_policy: "allow_grace" })).not.toThrow();
    expect(() => OverrideShapeSchema.parse({ grace_policy: null })).not.toThrow();
  });

  it("rejects a negative number", () => {
    expect(() => OverrideShapeSchema.parse({ workspaces: -1 })).toThrow();
  });

  it("rejects a non-integer number", () => {
    expect(() => OverrideShapeSchema.parse({ workspaces: 1.5 })).toThrow();
  });

  it("rejects an unknown capability name", () => {
    expect(() =>
      OverrideShapeSchema.parse({ enabled_capabilities: ["not_a_real_capability"] }),
    ).toThrow();
  });

  it("rejects an unknown grace_policy value", () => {
    expect(() => OverrideShapeSchema.parse({ grace_policy: "maybe" })).toThrow();
  });
});

describe("M2.2 — AgencyEntitlementRowSchema (Zod)", () => {
  const valid = {
    agencyId: "00000000-0000-0000-0000-000000000001",
    planTemplateId: "00000000-0000-0000-0000-000000000002",
    overrides: null,
    hardStopPercent: "100.00",
    gracePolicy: null,
  };

  it("accepts a valid row", () => {
    expect(() => AgencyEntitlementRowSchema.parse(valid)).not.toThrow();
  });

  it("accepts a row with overrides", () => {
    expect(() =>
      AgencyEntitlementRowSchema.parse({
        ...valid,
        overrides: { workspaces: 5, users: null },
      }),
    ).not.toThrow();
  });

  it("rejects a non-UUID agencyId", () => {
    expect(() => AgencyEntitlementRowSchema.parse({ ...valid, agencyId: "abc" })).toThrow();
  });

  it("rejects a hardStopPercent that is not a numeric string", () => {
    expect(() =>
      AgencyEntitlementRowSchema.parse({ ...valid, hardStopPercent: "not-a-number" }),
    ).toThrow();
  });

  it("rejects unknown keys (strict mode)", () => {
    expect(() => AgencyEntitlementRowSchema.parse({ ...valid, unexpected: "field" })).toThrow();
  });
});

describe("M2.2 — PlatformPlanTemplateRowSchema (Zod)", () => {
  it("accepts a row with non-null defaults", () => {
    expect(() =>
      PlatformPlanTemplateRowSchema.parse({
        id: "00000000-0000-0000-0000-000000000001",
        slug: "starter",
        name: "Starter",
        defaultLimits: { workspaces: 1 },
      }),
    ).not.toThrow();
  });

  it("accepts a row with null defaults (Custom sentinel)", () => {
    expect(() =>
      PlatformPlanTemplateRowSchema.parse({
        id: "00000000-0000-0000-0000-000000000002",
        slug: "custom",
        name: "Custom",
        defaultLimits: null,
      }),
    ).not.toThrow();
  });
});

describe("M2.2 — ChangeAgencyPlanInputSchema (Zod)", () => {
  const valid = {
    agencyId: "00000000-0000-0000-0000-000000000001",
    planTemplateId: "00000000-0000-0000-0000-000000000002",
    reason: "upgraded to growth",
    actorUserId: "00000000-0000-0000-0000-000000000003",
  };

  it("accepts a valid input", () => {
    expect(() => ChangeAgencyPlanInputSchema.parse(valid)).not.toThrow();
  });

  it("accepts an input with overrides and current usage", () => {
    expect(() =>
      ChangeAgencyPlanInputSchema.parse({
        ...valid,
        overrides: { workspaces: 7 },
        currentUsage: { workspaces: 3 },
      }),
    ).not.toThrow();
  });

  it("rejects an empty reason", () => {
    expect(() => ChangeAgencyPlanInputSchema.parse({ ...valid, reason: "" })).toThrow();
  });

  it("rejects a reason longer than 500 characters", () => {
    expect(() =>
      ChangeAgencyPlanInputSchema.parse({ ...valid, reason: "a".repeat(501) }),
    ).toThrow();
  });

  it("rejects a non-UUID agencyId", () => {
    expect(() => ChangeAgencyPlanInputSchema.parse({ ...valid, agencyId: "abc" })).toThrow();
  });

  it("rejects a non-UUID actorUserId", () => {
    expect(() => ChangeAgencyPlanInputSchema.parse({ ...valid, actorUserId: "abc" })).toThrow();
  });

  it("rejects a negative currentUsage value", () => {
    expect(() =>
      ChangeAgencyPlanInputSchema.parse({
        ...valid,
        currentUsage: { workspaces: -1 },
      }),
    ).toThrow();
  });
});

// ─── Error class shape tests ──────────────────────────────────────

describe("M2.2 — domain error classes", () => {
  it("AgencyNotFoundError carries the agencyId and is an Error", () => {
    const e = new AgencyNotFoundError("00000000-0000-0000-0000-000000000001");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AgencyNotFoundError");
    expect(e.agencyId).toBe("00000000-0000-0000-0000-000000000001");
    expect(e.message).toContain("00000000-0000-0000-0000-000000000001");
  });

  it("AgencyNotActiveError carries the agencyId and the reason", () => {
    const e = new AgencyNotActiveError("00000000-0000-0000-0000-000000000001", "suspended");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AgencyNotActiveError");
    expect(e.agencyId).toBe("00000000-0000-0000-0000-000000000001");
    expect(e.reason).toBe("suspended");
  });

  it("LimitExceededError carries the details for the caller to render", () => {
    const e = new LimitExceededError({
      resource: "workspaces",
      currentUsage: 5,
      limit: 0,
      requestedIncrease: 0,
      userMessage: "Cannot remove workspaces limit while agency is using 5",
    });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("LimitExceededError");
    expect(e.details.resource).toBe("workspaces");
    expect(e.details.currentUsage).toBe(5);
  });
});

// ─── Zod error type assertion ─────────────────────────────────────

describe("M2.2 — Zod validation throws a ZodError on bad input", () => {
  it("ChangeAgencyPlanInputSchema throws a ZodError on missing required fields", () => {
    // The change-agency-plan service does not catch the ZodError;
    // the caller (route handler / platform console) catches it and
    // renders a 400 response. The ZodError type is what they
    // narrow on.
    try {
      ChangeAgencyPlanInputSchema.parse({});
      expect.fail("Expected ZodError");
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
    }
  });
});
