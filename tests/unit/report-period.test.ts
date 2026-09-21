import { describe, expect, it } from "vitest";
import { resolveCustomPeriod, resolvePeriodPreset } from "@/lib/reports/aggregate";

/**
 * Round 3 of ui-ux-pro-max / Team & Access — period helpers.
 *
 * These two helpers are the only public API the builder surfaces for
 * "what's the period" — everything else flows through them. Catching
 * an off-by-one here would silently render a wrong date-range PDF, so
 * the tests pin the boundary semantics to the day.
 */

describe("resolvePeriodPreset", () => {
  const NOW = new Date("2026-05-24T12:00:00Z");

  it("returns a 7-day window ending today (inclusive)", () => {
    const p = resolvePeriodPreset("7d", NOW);
    expect(p.from.toISOString()).toBe("2026-05-18T00:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-05-24T23:59:59.999Z");
    expect(p.preset).toBe("7d");
    expect(p.label).toBe("7d");
  });

  it("returns a 30-day window ending today (inclusive)", () => {
    const p = resolvePeriodPreset("30d", NOW);
    expect(p.from.toISOString().slice(0, 10)).toBe("2026-04-25");
    expect(p.to.toISOString().slice(0, 10)).toBe("2026-05-24");
    expect(p.preset).toBe("30d");
  });

  it("returns a 90-day window ending today (inclusive)", () => {
    const p = resolvePeriodPreset("90d", NOW);
    expect(p.from.toISOString().slice(0, 10)).toBe("2026-02-24");
    expect(p.to.toISOString().slice(0, 10)).toBe("2026-05-24");
    expect(p.preset).toBe("90d");
  });

  it("uses the supplied `now` floor (inclusive on both ends)", () => {
    const p = resolvePeriodPreset("7d", new Date("2026-01-01T00:00:00Z"));
    // Jan 1 -> Dec 26 (7 days inclusive).
    expect(p.from.toISOString().slice(0, 10)).toBe("2025-12-26");
    expect(p.to.toISOString().slice(0, 10)).toBe("2026-01-01");
  });
});

describe("resolveCustomPeriod", () => {
  it("accepts start === end (single day)", () => {
    const d = new Date("2026-05-01T00:00:00Z");
    const p = resolveCustomPeriod(d, new Date(d));
    expect(p.preset).toBe("custom");
    expect(p.from.getTime()).toBe(d.getTime());
    expect(p.to.getTime()).toBe(d.getTime());
  });

  it("rejects inverted ranges", () => {
    expect(() =>
      resolveCustomPeriod(new Date("2026-05-10T00:00:00Z"), new Date("2026-05-01T00:00:00Z")),
    ).toThrow(/start.*before.*end/i);
  });

  it("accepts multi-month ranges", () => {
    const p = resolveCustomPeriod(
      new Date("2025-12-31T00:00:00Z"),
      new Date("2026-01-31T23:59:59Z"),
    );
    expect(p.from.toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(p.to.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(p.preset).toBe("custom");
    expect(p.label).toBe("custom");
  });
});
