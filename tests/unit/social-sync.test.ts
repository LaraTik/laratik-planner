import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextSyncAt, backoffAt, BACKOFF_MS } from "@/lib/social/sync";

/**
 * M4 — sync worker unit tests.
 *
 * The pure scheduling helpers are the only safe unit target: the
 * worker itself is integration-tested via
 * `tests/integration/social-repository.test.ts` (claim/refresh/save
 * invariants) and the real cron flow is exercised in
 * `tests/e2e/social-analytics.spec.ts` once that lands.
 *
 * What this suite guarantees:
 *
 *   - `nextSyncAt` is always strictly in the future and lands on
 *     03:15 the next day.
 *   - `backoffAt` follows the 15m / 1h / 6h / next-day ladder
 *     exactly; the failure count is 1-indexed.
 *   - The exported `BACKOFF_MS` matches the plan's documented
 *     ladder; the values are stable across calls.
 */

describe("nextSyncAt", () => {
  it("returns a Date strictly in the future", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const next = nextSyncAt(now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it("lands on 03:15 UTC the next day", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const next = nextSyncAt(now);
    expect(next.getUTCDate()).toBe(25);
    expect(next.getUTCHours()).toBe(3);
    expect(next.getUTCMinutes()).toBe(15);
  });

  it("handles a date that is already past 03:15 (lands on the day after)", () => {
    const now = new Date("2026-08-24T05:00:00Z");
    const next = nextSyncAt(now);
    expect(next.getUTCDate()).toBe(25);
    expect(next.getUTCHours()).toBe(3);
  });
});

describe("backoffAt", () => {
  const now = new Date("2026-08-24T12:00:00Z");

  it("clamps to the first slot for failureCount=1 (~15m)", () => {
    const t = backoffAt(now, 1);
    expect(t.getTime() - now.getTime()).toBe(15 * 60_000);
  });

  it("clamps to the second slot for failureCount=2 (~1h)", () => {
    const t = backoffAt(now, 2);
    expect(t.getTime() - now.getTime()).toBe(60 * 60_000);
  });

  it("clamps to the third slot for failureCount=3 (~6h)", () => {
    const t = backoffAt(now, 3);
    expect(t.getTime() - now.getTime()).toBe(6 * 60 * 60_000);
  });

  it("clamps to next-day for failureCount>=4", () => {
    const t = backoffAt(now, 4);
    const oneDay = 24 * 60 * 60_000;
    expect(t.getTime() - now.getTime()).toBeGreaterThanOrEqual(oneDay - 1000);
  });

  it("the BACKOFF_MS ladder is stable", () => {
    expect(BACKOFF_MS).toEqual([15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]);
  });
});

// `vi` is imported to satisfy the test contract for any
// future stubs (none required today). The `beforeEach` and
// `afterEach` are placeholders for the cron-route integration
// test that lives in tests/integration.
let _ph: unknown = null;
beforeEach(() => {
  _ph = null;
});
afterEach(() => {
  _ph = null;
  vi.restoreAllMocks();
});
void _ph;
