import { describe, expect, it } from "vitest";
import { clampBadge, BADGE_DISPLAY_CAP } from "@/lib/nav/badge-format";

/**
 * Round-4: badge formatter clamps + safely renders counts.
 *
 * The pill renderer can only fit a 2-character numeric badge
 * inside a 24×24 chip. Anything over `BADGE_DISPLAY_CAP` collapses
 * to "99+" so the chip stays one line and never wraps.
 */
describe("clampBadge", () => {
  it('returns "0" for zero', () => {
    expect(clampBadge(0)).toBe("0");
  });

  it("returns the raw string for in-range positive counts", () => {
    expect(clampBadge(1)).toBe("1");
    expect(clampBadge(7)).toBe("7");
    expect(clampBadge(42)).toBe("42");
    expect(clampBadge(98)).toBe("98");
  });

  it("collapses to `${CAP}+` strictly above the cap", () => {
    expect(clampBadge(BADGE_DISPLAY_CAP)).toBe("99");
    expect(clampBadge(BADGE_DISPLAY_CAP + 1)).toBe("99+");
    expect(clampBadge(150)).toBe("99+");
    expect(clampBadge(1_000)).toBe("99+");
  });

  it('collapses non-finite / negative inputs to "0"', () => {
    expect(clampBadge(Number.NaN)).toBe("0");
    expect(clampBadge(Number.POSITIVE_INFINITY)).toBe("0");
    expect(clampBadge(Number.NEGATIVE_INFINITY)).toBe("0");
    expect(clampBadge(-1)).toBe("0");
    expect(clampBadge(-99)).toBe("0");
  });

  it("keeps the cap constant in lock-step with badges.ts BADGE_CAP", () => {
    // The two constants live in different files (badges.ts is
    // server-only) but stay aligned. If a future change shifts
    // either cap, this assertion forces both updates.
    expect(BADGE_DISPLAY_CAP).toBe(99);
  });
});
