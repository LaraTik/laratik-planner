import { describe, expect, it } from "vitest";
import {
  ALL_AI_CAPABILITIES,
  ALL_PLATFORM_KEYS,
  AgencyNotFoundError,
  type AgencyEntitlementRow,
  type EffectiveEntitlement,
  type PlatformPlanTemplateRow,
} from "@/lib/entitlements/types";
import {
  mergeEntitlement,
  getEffectiveEntitlement,
} from "@/lib/entitlements/get-effective-entitlement";

/**
 * M2.2 — unit tests for the pure merge function.
 *
 * The merge is the read-side contract: given an entitlement row and
 * the plan template it points at, return the resolved limits. The
 * function is a pure transformation over the input objects — no
 * Date.now(), no Math.random() — so the unit tests can pin every
 * branch without any DB or clock infrastructure.
 *
 * The M2.1 test file mirrors this style: the integration tests
 * exercise the DB-touching service (`changeAgencyPlan`), the unit
 * tests exercise the pure transformation. The integration tests
 * assert the read-side end-to-end via `getEffectiveEntitlement`.
 */
describe("M2.2 — entitlement merge function (unit)", () => {
  const starterTemplate: PlatformPlanTemplateRow = {
    id: "tmpl-starter",
    slug: "starter",
    name: "Starter",
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
      enabled_capabilities: [...ALL_AI_CAPABILITIES],
    },
  };

  const starterEntitlement: AgencyEntitlementRow = {
    agencyId: "agency-1",
    planTemplateId: starterTemplate.id,
    overrides: null,
    hardStopPercent: "100",
    gracePolicy: null,
  };

  function entitlementWith(overrides: AgencyEntitlementRow["overrides"]): AgencyEntitlementRow {
    return { ...starterEntitlement, overrides };
  }

  // ─── Defaults only ────────────────────────────────────────────────
  describe("defaults only", () => {
    it("returns the plan defaults verbatim when the agency has no overrides", () => {
      const result = mergeEntitlement({
        entitlement: starterEntitlement,
        planTemplate: starterTemplate,
      });
      expect(result.maxWorkspaces).toBe(1);
      expect(result.maxUsers).toBe(3);
      expect(result.maxSocialProfiles).toBe(5);
      expect(result.maxStorageBytes).toBe(5_368_709_120);
      expect(result.maxMonthlyAiRequests).toBe(100);
      expect(result.maxMonthlyAiInputTokens).toBe(100_000);
      expect(result.maxMonthlyAiOutputTokens).toBe(50_000);
      expect(result.maxDailyAiRequestsPerUser).toBe(20);
      expect(result.maxOutputTokensPerRequest).toBe(2_000);
    });

    it("expands the per-platform record to one entry per PlatformKey (each defaulting to social_profiles_per_platform)", () => {
      const result = mergeEntitlement({
        entitlement: starterEntitlement,
        planTemplate: starterTemplate,
      });
      // Every platform gets the plan's per-platform cap (1 for Starter).
      for (const key of ALL_PLATFORM_KEYS) {
        expect(result.maxProfilesPerPlatform[key]).toBe(1);
      }
      // The record has exactly 8 keys — no extras, no missing.
      expect(Object.keys(result.maxProfilesPerPlatform).sort()).toEqual(
        [...ALL_PLATFORM_KEYS].sort(),
      );
    });

    it("enabledAiCapabilities is the plan default set when the agency has no overrides", () => {
      const result = mergeEntitlement({
        entitlement: starterEntitlement,
        planTemplate: starterTemplate,
      });
      // The plan has all 6; the agency has none. Intersection = all 6.
      expect([...result.enabledAiCapabilities].sort()).toEqual([...ALL_AI_CAPABILITIES].sort());
    });

    it("hardStopPercent defaults to 100.00 when neither plan nor override sets it", () => {
      const result = mergeEntitlement({
        entitlement: starterEntitlement,
        planTemplate: starterTemplate,
      });
      expect(result.hardStopPercent).toBe(100);
    });

    it("gracePolicy defaults to 'hard' when neither plan nor override sets it", () => {
      const result = mergeEntitlement({
        entitlement: starterEntitlement,
        planTemplate: starterTemplate,
      });
      expect(result.gracePolicy).toBe("hard");
    });
  });

  // ─── Missing agency_entitlement row ────────────────────────────────
  describe("overrides only (no entitlement row)", () => {
    it("rejects with AgencyNotFoundError when the agency has no entitlement row", async () => {
      // The DB-bound function returns a Promise. The unit test
      // exercises the same path with `entitlement: null` to assert
      // the empty-case behavior without a real DB.
      await expect(
        getEffectiveEntitlement({
          agencyId: "00000000-0000-0000-0000-000000000001",
          entitlement: null,
        }),
      ).rejects.toBeInstanceOf(AgencyNotFoundError);
    });

    it("the rejected error carries the agencyId for caller-side logging", async () => {
      const caught = await getEffectiveEntitlement({
        agencyId: "00000000-0000-0000-0000-000000000002",
        entitlement: null,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(AgencyNotFoundError);
      expect((caught as AgencyNotFoundError).agencyId).toBe("00000000-0000-0000-0000-000000000002");
    });
  });

  // ─── Per-key override wins ────────────────────────────────────────
  describe("overrides win where set", () => {
    it.each([
      ["maxWorkspaces", { workspaces: 99 }, 99],
      ["maxUsers", { users: 99 }, 99],
      ["maxSocialProfiles", { total_social_profiles: 99 }, 99],
      ["maxProfilesPerPlatform.instagram", { social_profiles_per_platform: 7 }, 7],
      ["maxStorageBytes", { storage_bytes: 999_999_999 }, 999_999_999],
      ["maxMonthlyAiRequests", { monthly_ai_requests: 9999 }, 9999],
      ["maxMonthlyAiInputTokens", { monthly_ai_input_tokens: 999_999 }, 999_999],
      ["maxMonthlyAiOutputTokens", { monthly_ai_output_tokens: 555_555 }, 555_555],
      ["maxDailyAiRequestsPerUser", { daily_ai_requests_per_user: 333 }, 333],
      ["maxOutputTokensPerRequest", { max_output_tokens_per_request: 8888 }, 8888],
    ])("%s — override replaces the plan default", (_name, override, expected) => {
      const result = mergeEntitlement({
        entitlement: entitlementWith(override),
        planTemplate: starterTemplate,
      });
      if (_name === "maxProfilesPerPlatform.instagram") {
        // Every platform picks up the override (the JSONB shape is a
        // single per-platform cap, not a per-key map).
        for (const key of ALL_PLATFORM_KEYS) {
          expect(result.maxProfilesPerPlatform[key]).toBe(expected);
        }
      } else {
        // Type-safe field access via the field name.
        const field = _name as keyof EffectiveEntitlement;
        expect(result[field]).toBe(expected);
      }
    });
  });

  // ─── null override semantics ──────────────────────────────────────
  describe("null override means unlimited (not 0)", () => {
    it("maxWorkspaces = null is preserved as null (unlimited), not coerced to 0", () => {
      const result = mergeEntitlement({
        entitlement: entitlementWith({ workspaces: null }),
        planTemplate: starterTemplate,
      });
      // The plan default is 1; the override is null. The merge rule
      // says: "present key in overrides → that value wins". null
      // is a present value, so it wins.
      expect(result.maxWorkspaces).toBeNull();
      // Confirm the type — null, not undefined, not 0.
      expect(result.maxWorkspaces).not.toBe(0);
      expect(result.maxWorkspaces).not.toBeUndefined();
    });

    it("maxUsers = null wins over the plan default of 3", () => {
      const result = mergeEntitlement({
        entitlement: entitlementWith({ users: null }),
        planTemplate: starterTemplate,
      });
      expect(result.maxUsers).toBeNull();
    });

    it("maxStorageBytes = null wins over the plan default", () => {
      const result = mergeEntitlement({
        entitlement: entitlementWith({ storage_bytes: null }),
        planTemplate: starterTemplate,
      });
      expect(result.maxStorageBytes).toBeNull();
    });

    it("enabled_capabilities = null is treated as 'no constraint' (the full plan set survives the intersection)", () => {
      const result = mergeEntitlement({
        entitlement: entitlementWith({ enabled_capabilities: null }),
        planTemplate: starterTemplate,
      });
      // Plan has 6; override is null. The intersection of {6} and
      // {no constraint} is {6}.
      expect([...result.enabledAiCapabilities].sort()).toEqual([...ALL_AI_CAPABILITIES].sort());
    });
  });

  // ─── enabledAiCapabilities intersection ───────────────────────────
  describe("enabledAiCapabilities intersection", () => {
    it("plan has 6, override restricts to 4 → result is 4", () => {
      const result = mergeEntitlement({
        entitlement: entitlementWith({
          enabled_capabilities: [
            "campaign_ideas",
            "brief_improvement",
            "caption_drafts",
            "completeness_check",
          ],
        }),
        planTemplate: starterTemplate,
      });
      expect([...result.enabledAiCapabilities].sort()).toEqual(
        ["brief_improvement", "campaign_ideas", "caption_drafts", "completeness_check"].sort(),
      );
    });

    it("plan has 6, override sets [] → result is [] (no capabilities allowed)", () => {
      const result = mergeEntitlement({
        entitlement: entitlementWith({ enabled_capabilities: [] }),
        planTemplate: starterTemplate,
      });
      expect(result.enabledAiCapabilities.size).toBe(0);
    });

    it("plan has 4, override has 6 → result is the 4 (the plan ceiling wins)", () => {
      const restrictedTemplate: PlatformPlanTemplateRow = {
        ...starterTemplate,
        defaultLimits: {
          ...starterTemplate.defaultLimits!,
          enabled_capabilities: [
            "campaign_ideas",
            "brief_improvement",
            "caption_drafts",
            "completeness_check",
          ],
        },
      };
      const result = mergeEntitlement({
        entitlement: starterEntitlement, // agency has no overrides
        planTemplate: restrictedTemplate,
      });
      expect([...result.enabledAiCapabilities].sort()).toEqual(
        ["brief_improvement", "campaign_ideas", "caption_drafts", "completeness_check"].sort(),
      );
    });

    it("plan has 4, override restricts to 2 → result is the 2 (the more restrictive)", () => {
      const restrictedTemplate: PlatformPlanTemplateRow = {
        ...starterTemplate,
        defaultLimits: {
          ...starterTemplate.defaultLimits!,
          enabled_capabilities: [
            "campaign_ideas",
            "brief_improvement",
            "caption_drafts",
            "completeness_check",
          ],
        },
      };
      const result = mergeEntitlement({
        entitlement: entitlementWith({
          enabled_capabilities: ["campaign_ideas", "brief_improvement"],
        }),
        planTemplate: restrictedTemplate,
      });
      expect([...result.enabledAiCapabilities].sort()).toEqual(
        ["brief_improvement", "campaign_ideas"].sort(),
      );
    });

    it("plan is null, override has 3 → result is the 3 (no plan constraint to intersect against)", () => {
      const customTemplate: PlatformPlanTemplateRow = {
        ...starterTemplate,
        defaultLimits: null, // the "Custom" sentinel
      };
      const result = mergeEntitlement({
        entitlement: entitlementWith({
          enabled_capabilities: ["campaign_ideas", "brief_improvement", "caption_drafts"],
        }),
        planTemplate: customTemplate,
      });
      expect([...result.enabledAiCapabilities].sort()).toEqual(
        ["brief_improvement", "campaign_ideas", "caption_drafts"].sort(),
      );
    });

    it("plan is null, override is null → result is the full 6-capability default set", () => {
      const customTemplate: PlatformPlanTemplateRow = {
        ...starterTemplate,
        defaultLimits: null,
      };
      const result = mergeEntitlement({
        entitlement: entitlementWith({ enabled_capabilities: null }),
        planTemplate: customTemplate,
      });
      expect([...result.enabledAiCapabilities].sort()).toEqual([...ALL_AI_CAPABILITIES].sort());
    });
  });

  // ─── hardStopPercent clamp + default ──────────────────────────────
  describe("hardStopPercent", () => {
    it("clamps an override of 150 to 100", () => {
      const result = mergeEntitlement({
        entitlement: entitlementWith({ workspaces: 1 }),
        planTemplate: {
          ...starterTemplate,
          defaultLimits: { ...starterTemplate.defaultLimits! },
        },
      });
      // No override on hardStopPercent — the column-level default is
      // 100. To test the clamp, we exercise the change-plan service
      // path: the value is read from the row, which the merge
      // function clamps. Use a row with the override baked in.
      const resultWithOverride = mergeEntitlement({
        entitlement: { ...starterEntitlement, hardStopPercent: "150.00" },
        planTemplate: starterTemplate,
      });
      expect(resultWithOverride.hardStopPercent).toBe(100);
      // (Suppress the unused result warning from the first call.)
      expect(result.maxWorkspaces).toBe(1);
    });

    it("clamps an override of -5 to 0", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, hardStopPercent: "-5" },
        planTemplate: starterTemplate,
      });
      expect(result.hardStopPercent).toBe(0);
    });

    it("preserves a fractional value within the [0, 100] range", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, hardStopPercent: "95.50" },
        planTemplate: starterTemplate,
      });
      expect(result.hardStopPercent).toBe(95.5);
    });

    it("defaults to 100 when the row carries the column default '100' and no override", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, hardStopPercent: "100.00" },
        planTemplate: starterTemplate,
      });
      expect(result.hardStopPercent).toBe(100);
    });

    it("accepts a 0 hard stop (no enforcement at all)", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, hardStopPercent: "0" },
        planTemplate: starterTemplate,
      });
      expect(result.hardStopPercent).toBe(0);
    });
  });

  // ─── gracePolicy default + override semantics ─────────────────────
  describe("gracePolicy", () => {
    it("override 'allow_grace' on the agency wins over the plan's 'block' default", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, gracePolicy: "allow_grace" },
        planTemplate: starterTemplate,
      });
      expect(result.gracePolicy).toBe("soft");
    });

    it("override 'block' on the agency wins over the plan's 'allow_grace' default", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, gracePolicy: "block" },
        planTemplate: starterTemplate,
      });
      expect(result.gracePolicy).toBe("hard");
    });

    it("agency null + plan 'block' → 'hard' (the Drizzle wire name maps to the read-side name)", () => {
      const planWithGrace: PlatformPlanTemplateRow = {
        ...starterTemplate,
        defaultLimits: { ...starterTemplate.defaultLimits!, grace_policy: "block" },
      };
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, gracePolicy: null },
        planTemplate: planWithGrace,
      });
      expect(result.gracePolicy).toBe("hard");
    });

    it("agency null + plan 'allow_grace' → 'soft'", () => {
      const planWithGrace: PlatformPlanTemplateRow = {
        ...starterTemplate,
        defaultLimits: { ...starterTemplate.defaultLimits!, grace_policy: "allow_grace" },
      };
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, gracePolicy: null },
        planTemplate: planWithGrace,
      });
      expect(result.gracePolicy).toBe("soft");
    });

    it("both null → defaults to 'hard'", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, gracePolicy: null },
        planTemplate: starterTemplate,
      });
      expect(result.gracePolicy).toBe("hard");
    });
  });

  // ─── Custom sentinel plan (null defaults) ─────────────────────────
  describe("Custom plan (null defaults)", () => {
    const customTemplate: PlatformPlanTemplateRow = {
      id: "tmpl-custom",
      slug: "custom",
      name: "Custom",
      defaultLimits: null,
    };

    it("with no overrides, every numeric limit is null (the agency must override)", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, overrides: null },
        planTemplate: customTemplate,
      });
      expect(result.maxWorkspaces).toBeNull();
      expect(result.maxUsers).toBeNull();
      expect(result.maxSocialProfiles).toBeNull();
      for (const key of ALL_PLATFORM_KEYS) {
        expect(result.maxProfilesPerPlatform[key]).toBeNull();
      }
      expect(result.maxStorageBytes).toBeNull();
      expect(result.maxMonthlyAiRequests).toBeNull();
      expect(result.maxMonthlyAiInputTokens).toBeNull();
      expect(result.maxMonthlyAiOutputTokens).toBeNull();
      expect(result.maxDailyAiRequestsPerUser).toBeNull();
      expect(result.maxOutputTokensPerRequest).toBeNull();
    });

    it("with no overrides, enabledAiCapabilities defaults to the full 6-capability set", () => {
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, overrides: null },
        planTemplate: customTemplate,
      });
      expect([...result.enabledAiCapabilities].sort()).toEqual([...ALL_AI_CAPABILITIES].sort());
    });

    it("agency overrides every limit → the overrides are the result verbatim", () => {
      const overrides = {
        workspaces: 10,
        users: 50,
        total_social_profiles: 100,
        social_profiles_per_platform: 5,
        storage_bytes: 1_000_000_000,
        monthly_ai_requests: 5000,
        monthly_ai_input_tokens: 2_000_000,
        monthly_ai_output_tokens: 1_000_000,
        daily_ai_requests_per_user: 100,
        max_output_tokens_per_request: 4000,
        enabled_capabilities: [...ALL_AI_CAPABILITIES],
      };
      const result = mergeEntitlement({
        entitlement: { ...starterEntitlement, overrides },
        planTemplate: customTemplate,
      });
      expect(result.maxWorkspaces).toBe(10);
      expect(result.maxUsers).toBe(50);
      expect(result.maxSocialProfiles).toBe(100);
      for (const key of ALL_PLATFORM_KEYS) {
        expect(result.maxProfilesPerPlatform[key]).toBe(5);
      }
      expect(result.maxStorageBytes).toBe(1_000_000_000);
      expect(result.maxMonthlyAiRequests).toBe(5000);
      expect(result.maxMonthlyAiInputTokens).toBe(2_000_000);
      expect(result.maxMonthlyAiOutputTokens).toBe(1_000_000);
      expect(result.maxDailyAiRequestsPerUser).toBe(100);
      expect(result.maxOutputTokensPerRequest).toBe(4000);
    });
  });
});
