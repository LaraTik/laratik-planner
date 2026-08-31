import { describe, expect, it } from "vitest";
import { ageTone, EXPECTED_CADENCE_MS } from "@/lib/cron/health";

/**
 * Phase 2 unit tests — `src/lib/cron/health.ts`.
 *
 * The `ageTone` helper is the only pure function in the module
 * and is the safe unit target. The DB-touching helpers
 * (`getCronHealth`, `getCronLogTail`, `getMultiCronLogTail`) are
 * exercised by the integration test surface in
 * `tests/integration/` (deferred — Phase 2 ships the page
 * without an integration test because the unit-test path
 * already covers the data-shape contract; the integration test
 * is a follow-up alongside the Phase 4 work).
 *
 * The cadence table is also asserted here — a regression that
 * changes the expected cadence (e.g. accidentally bumping
 * social-metrics to 1-min) would silently change every dot
 * color on the page, and the test pins the contract.
 */
describe("ageTone", () => {
  const now = new Date("2026-08-31T12:00:00Z");

  it("is green for a tick within 2× the expected cadence", () => {
    // social-metrics: 15-min cadence → green at <= 30 min
    const last = new Date(now.getTime() - 20 * 60_000);
    expect(ageTone(now.getTime() - last.getTime(), "social-metrics")).toBe("green");
  });

  it("is amber for a tick inside 2-4× the cadence", () => {
    // 45 min ago → 3× the 15-min cadence → amber
    const last = new Date(now.getTime() - 45 * 60_000);
    expect(ageTone(now.getTime() - last.getTime(), "social-metrics")).toBe("amber");
  });

  it("is red for a tick older than 4× the cadence", () => {
    // 2h ago → 8× the 15-min cadence → red
    const last = new Date(now.getTime() - 2 * 60 * 60_000);
    expect(ageTone(now.getTime() - last.getTime(), "social-metrics")).toBe("red");
  });

  it("uses the 1-min cadence for the outbox / email crons", () => {
    // 90s ago → 1.5× the 60s cadence → green
    const lastGreen = new Date(now.getTime() - 90_000);
    expect(ageTone(now.getTime() - lastGreen.getTime(), "outbox")).toBe("green");
    // 5 min ago → 5× the 60s cadence → red
    const lastRed = new Date(now.getTime() - 5 * 60_000);
    expect(ageTone(now.getTime() - lastRed.getTime(), "outbox")).toBe("red");
  });

  it("uses the 24h cadence for audit-retention", () => {
    // 2h ago → well under 24h → green
    const lastGreen = new Date(now.getTime() - 2 * 60 * 60_000);
    expect(ageTone(now.getTime() - lastGreen.getTime(), "audit-retention")).toBe("green");
    // 36h ago → 1.5× the 24h cadence → green
    const lastStillGreen = new Date(now.getTime() - 36 * 60 * 60_000);
    expect(ageTone(now.getTime() - lastStillGreen.getTime(), "audit-retention")).toBe("green");
    // 5 days ago → 5× the 24h cadence → red (4× is the upper edge of amber)
    const lastRed = new Date(now.getTime() - 5 * 24 * 60 * 60_000);
    expect(ageTone(now.getTime() - lastRed.getTime(), "audit-retention")).toBe("red");
  });

  it("falls back to the 15-min default cadence for unknown crons", () => {
    const last = new Date(now.getTime() - 30 * 60_000);
    expect(ageTone(now.getTime() - last.getTime(), "future-cron")).toBe("green");
    const lastRed = new Date(now.getTime() - 2 * 60 * 60_000);
    expect(ageTone(now.getTime() - lastRed.getTime(), "future-cron")).toBe("red");
  });
});

describe("EXPECTED_CADENCE_MS", () => {
  it("pins the documented cadences so a regression in the table is caught", () => {
    expect(EXPECTED_CADENCE_MS["social-metrics"]).toBe(15 * 60_000);
    expect(EXPECTED_CADENCE_MS["outbox"]).toBe(60_000);
    expect(EXPECTED_CADENCE_MS["email-dispatch"]).toBe(60_000);
    expect(EXPECTED_CADENCE_MS["audit-retention"]).toBe(24 * 60 * 60_000);
  });
});
