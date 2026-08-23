import { describe, expect, it } from "vitest";
import { computeLevel, InvalidUsageDeltaError, type UsageLevel } from "@/lib/usage/threshold";

/**
 * M2.3 — pure unit tests for the threshold classification function.
 *
 * `computeLevel(value, limit)` is the heart of the usage-tracking
 * service: it takes a (value, limit) pair and returns the level
 * the counter should be classified at. The function is intentionally
 * pure (no DB, no clock) so it can be unit-tested deterministically.
 *
 * Boundary semantics — these are the M2 spec:
 *
 *   - value < 80% of limit   → 'healthy'
 *   - value ≥ 80% of limit   → 'warning'
 *   - value ≥ 90% of limit   → 'urgent'
 *   - value ≥ 100% of limit  → 'over_limit'
 *
 *   - limit is null          → 'healthy' (unlimited, no level)
 *   - limit is 0             → 'over_limit' if value > 0, 'healthy' if value = 0
 *   - value is negative      → caller bug; the function's contract
 *                              is to never receive one, but the
 *                              service layer's InvalidUsageDeltaError
 *                              is the actual guard.
 */
describe("M2.3 computeLevel", () => {
  describe("boundary crossing (the 4 levels)", () => {
    it("value 0, limit 100 → healthy", () => {
      expect(computeLevel(0, 100)).toBe<UsageLevel>("healthy");
    });

    it("value 79, limit 100 → healthy (just below 80% warning)", () => {
      expect(computeLevel(79, 100)).toBe<UsageLevel>("healthy");
    });

    it("value 80, limit 100 → warning (the 80% boundary)", () => {
      expect(computeLevel(80, 100)).toBe<UsageLevel>("warning");
    });

    it("value 89, limit 100 → warning (just below 90% urgent)", () => {
      expect(computeLevel(89, 100)).toBe<UsageLevel>("warning");
    });

    it("value 90, limit 100 → urgent (the 90% boundary)", () => {
      expect(computeLevel(90, 100)).toBe<UsageLevel>("urgent");
    });

    it("value 99, limit 100 → urgent (just below 100% over_limit)", () => {
      expect(computeLevel(99, 100)).toBe<UsageLevel>("urgent");
    });

    it("value 100, limit 100 → over_limit (the 100% boundary)", () => {
      expect(computeLevel(100, 100)).toBe<UsageLevel>("over_limit");
    });

    it("value 130, limit 100 → over_limit (over_limit legitimately exceeds 100%)", () => {
      expect(computeLevel(130, 100)).toBe<UsageLevel>("over_limit");
    });
  });

  describe("unlimited resources (null limit)", () => {
    it("value 0, limit null → healthy (no limit configured)", () => {
      expect(computeLevel(0, null)).toBe<UsageLevel>("healthy");
    });

    it("value 1_000_000, limit null → healthy (no limit configured, no level)", () => {
      // A resource with no limit configured never reaches a
      // threshold, regardless of how much is consumed. The
      // platform console still shows the live counter, but the
      // status pill is always green.
      expect(computeLevel(1_000_000, null)).toBe<UsageLevel>("healthy");
    });
  });

  describe("zero limit edge case", () => {
    it("value 0, limit 0 → healthy (0/0 is not a violation — nothing was used)", () => {
      // The M2 spec explicitly calls this out: "0 limit → percent
      // is Infinity → level is over_limit only if value > 0". A
      // value of 0 with a limit of 0 means "nothing has been used
      // against a non-existent limit", which is a degenerate but
      // legal state for a freshly-provisioned agency whose plan
      // has not yet been bound.
      expect(computeLevel(0, 0)).toBe<UsageLevel>("healthy");
    });

    it("value 1, limit 0 → over_limit (one byte used against a 0-byte limit is a violation)", () => {
      // The classic "0-byte storage plan" test: if value > 0 and
      // the limit is 0, the agency is over_limit. This catches a
      // naive implementation that special-cases limit === 0 to
      // return 'healthy'.
      expect(computeLevel(1, 0)).toBe<UsageLevel>("over_limit");
    });
  });

  describe("exact-1 boundaries (sanity check on the < vs <= choice)", () => {
    it("value 79, limit 100 → NOT warning (warning is at 80)", () => {
      // If this test ever fails, someone changed `< 80%` to `<= 80%`
      // (or vice versa) without updating the spec.
      expect(computeLevel(79, 100)).not.toBe<UsageLevel>("warning");
    });

    it("value 89, limit 100 → NOT urgent (urgent is at 90)", () => {
      expect(computeLevel(89, 100)).not.toBe<UsageLevel>("urgent");
    });

    it("value 99, limit 100 → NOT over_limit (over_limit is at 100)", () => {
      expect(computeLevel(99, 100)).not.toBe<UsageLevel>("over_limit");
    });
  });

  describe("non-round limits (verify the percentage math, not just the threshold gates)", () => {
    it("limit 7, value 6 → warning (6/7 = 85.7%)", () => {
      // 6/7 ≈ 85.7% — should be warning, not urgent. The
      // function is computing the percent on the fly, not
      // hard-coding "value 80 = warning".
      expect(computeLevel(6, 7)).toBe<UsageLevel>("warning");
    });

    it("limit 7, value 7 → over_limit (7/7 = 100%)", () => {
      expect(computeLevel(7, 7)).toBe<UsageLevel>("over_limit");
    });

    it("limit 10, value 9 → urgent (9/10 = 90%)", () => {
      expect(computeLevel(9, 10)).toBe<UsageLevel>("urgent");
    });
  });

  describe("bigint values (storage_bytes can be terabyte-scale)", () => {
    it("value Number.MAX_SAFE_INTEGER, limit Number.MAX_SAFE_INTEGER → over_limit (100%)", () => {
      expect(computeLevel(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe<UsageLevel>(
        "over_limit",
      );
    });

    it("value 5_368_709_120, limit 5_368_709_120 → over_limit (5 GB exactly)", () => {
      // 5 GB at 100%. Matches the Starter plan storage_bytes limit
      // (5_368_709_120 bytes) from M2.1's seed.
      expect(computeLevel(5_368_709_120, 5_368_709_120)).toBe<UsageLevel>("over_limit");
    });

    it("value 4_294_967_296, limit 5_368_709_120 → warning (80.0%)", () => {
      // 4294967296 / 5368709120 = exactly 0.8 = 80% — the
      // warning boundary. The value is 2^32, the natural
      // ceiling of an int32 column, used to verify the function
      // handles values that exceed int32 but fit in int53.
      expect(computeLevel(4_294_967_296, 5_368_709_120)).toBe<UsageLevel>("warning");
    });
  });
});

/**
 * `InvalidUsageDeltaError` is the structured error the service layer
 * throws when a delta would take the counter negative. The unit
 * tests assert the error shape (name + message) so the integration
 * tests can `toThrow(InvalidUsageDeltaError)` and `expect(err.message).toMatch(...)`.
 */
describe("M2.3 InvalidUsageDeltaError", () => {
  it("is a real Error subclass with the documented name", () => {
    const err = new InvalidUsageDeltaError("social_profiles:instagram", 0, -1);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidUsageDeltaError);
    expect(err.name).toBe("InvalidUsageDeltaError");
  });

  it("message includes the resource name and the attempted value (debugging aid)", () => {
    const err = new InvalidUsageDeltaError("workspaces", 0, -1);
    expect(err.message).toContain("workspaces");
    // The "would land at" framing: "delta -1 from current 0 would
    // land at -1, which is below the floor of 0". Tests that grep
    // the message look for the resource and the floor; the exact
    // wording is implementation-defined.
    expect(err.message).toContain("-1");
  });
});

/**
 * getUsage's *derived* level — used when no threshold event row
 * exists yet. The integration test suite covers the "event
 * already exists" path; this is the simpler math-only path that
 * the unit tests can verify exhaustively.
 */
describe("M2.3 derived level (used by getUsage when no event exists)", () => {
  // These mirror the cases above, but expressed as a
  // parametrized table for one-glance readability.
  const cases: Array<{ value: number; limit: number | null; expected: UsageLevel }> = [
    { value: 0, limit: 100, expected: "healthy" },
    { value: 79, limit: 100, expected: "healthy" },
    { value: 80, limit: 100, expected: "warning" },
    { value: 89, limit: 100, expected: "warning" },
    { value: 90, limit: 100, expected: "urgent" },
    { value: 99, limit: 100, expected: "urgent" },
    { value: 100, limit: 100, expected: "over_limit" },
    { value: 150, limit: 100, expected: "over_limit" },
    { value: 0, limit: null, expected: "healthy" },
    { value: 999_999, limit: null, expected: "healthy" },
    { value: 0, limit: 0, expected: "healthy" },
    { value: 1, limit: 0, expected: "over_limit" },
  ];
  for (const c of cases) {
    it(`value=${c.value}, limit=${c.limit} → ${c.expected}`, () => {
      expect(computeLevel(c.value, c.limit)).toBe<UsageLevel>(c.expected);
    });
  }
});
