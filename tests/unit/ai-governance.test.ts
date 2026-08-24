import { describe, expect, it } from "vitest";
import {
  resolveEnabledCapabilities,
  AiBudgetReservationSchema,
  AI_CAPABILITIES,
} from "@/lib/ai/governance";

/**
 * M3.3 — AI governance unit tests.
 *
 * The pure helpers (`resolveEnabledCapabilities`,
 * `AiBudgetReservationSchema`) are tested here. The DB-bound
 * paths (`enforceAiBudget`, `reconcileAiBudget`,
 * `loadEnabledCapabilities`) are tested in
 * `tests/integration/ai-governance.test.ts`.
 *
 * The capability intersection is the §15 contract:
 *
 *   "The platform's `/api/ai/generate` route is the authoritative
 *    gate; this set is what M2.4 enforces and what the UI hides
 *    buttons against."
 *
 * The pure function must:
 *   - Return the effective capabilities when the agency has not
 *     expressed a preference (null array).
 *   - Return the intersection when the agency has expressed a
 *     preference.
 *   - Refuse to widen the effective set under any circumstances.
 */
describe("M3.3 — AI governance pure helpers (unit)", () => {
  describe("resolveEnabledCapabilities", () => {
    const allSix = new Set(AI_CAPABILITIES);

    it("returns the effective set when the agency has no explicit capabilities", () => {
      const out = resolveEnabledCapabilities({
        effectiveCapabilities: allSix,
        agencyExplicitCapabilities: null,
      });
      expect(out.size).toBe(6);
      expect(out.has("campaign_ideas")).toBe(true);
    });

    it("returns the intersection when the agency has an explicit set", () => {
      const out = resolveEnabledCapabilities({
        effectiveCapabilities: allSix,
        agencyExplicitCapabilities: ["caption_drafts", "brief_improvement"],
      });
      expect(out.size).toBe(2);
      expect([...out].sort()).toEqual(["brief_improvement", "caption_drafts"]);
    });

    it("returns an empty set when the agency's set is disjoint from the plan ceiling", () => {
      const planOnly = new Set(["completeness_check"] as const);
      const out = resolveEnabledCapabilities({
        effectiveCapabilities: planOnly,
        agencyExplicitCapabilities: ["caption_drafts"],
      });
      expect(out.size).toBe(0);
    });

    it("never widens beyond the effective set even if the agency list is larger", () => {
      // Defence against an operator who tries to bypass the
      // plan ceiling by sending a wider array than the plan
      // allows. The intersection is the upper bound.
      const out = resolveEnabledCapabilities({
        effectiveCapabilities: new Set(["caption_drafts"] as const),
        agencyExplicitCapabilities: ["campaign_ideas", "brief_improvement", "caption_drafts"],
      });
      expect(out.size).toBe(1);
      expect(out.has("caption_drafts")).toBe(true);
      expect(out.has("brief_improvement")).toBe(false);
    });

    it("treats an empty agency list as 'agency wants nothing'", () => {
      const out = resolveEnabledCapabilities({
        effectiveCapabilities: allSix,
        agencyExplicitCapabilities: [],
      });
      expect(out.size).toBe(0);
    });
  });

  describe("AiBudgetReservationSchema", () => {
    it("accepts a valid reservation", () => {
      const parsed = AiBudgetReservationSchema.parse({
        capability: "caption_drafts",
        estimatedInputTokens: 120,
        estimatedOutputTokens: 300,
        monthlyRequestsReserved: 1,
        dailyRequestsReserved: 1,
      });
      expect(parsed.capability).toBe("caption_drafts");
    });

    it("rejects a non-allowed capability", () => {
      expect(() =>
        AiBudgetReservationSchema.parse({
          capability: "rogue_capability",
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
          monthlyRequestsReserved: 1,
          dailyRequestsReserved: 1,
        }),
      ).toThrow();
    });

    it("rejects a negative token count", () => {
      expect(() =>
        AiBudgetReservationSchema.parse({
          capability: "caption_drafts",
          estimatedInputTokens: -1,
          estimatedOutputTokens: 0,
          monthlyRequestsReserved: 1,
          dailyRequestsReserved: 1,
        }),
      ).toThrow();
    });

    it("requires monthlyRequestsReserved to be a positive integer", () => {
      expect(() =>
        AiBudgetReservationSchema.parse({
          capability: "caption_drafts",
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
          monthlyRequestsReserved: 0,
          dailyRequestsReserved: 1,
        }),
      ).toThrow();
    });
  });
});
