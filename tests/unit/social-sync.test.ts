import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backoffAt,
  BACKOFF_MS,
  nextSyncAt,
  TEST_ERROR_CODES,
  type TestErrorCode,
} from "@/lib/social/sync";
import { TEST_ERROR_COPY } from "@/lib/social/test-error-codes";

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

describe("channel test error taxonomy", () => {
  // The domain layer exposes stable codes only. User-facing copy is
  // owned by the active interface catalog and tested for EN/AR parity
  // in the i18n catalog suite.
  const codes: TestErrorCode[] = [
    "auth_expired",
    "permission_denied",
    "rate_limited",
    "provider_unavailable",
    "not_found",
    "invalid_response",
    "platform_kek_missing",
    "social_not_enabled",
    "not_configured",
    "no_connection",
    "not_connected",
    "unknown",
  ];

  it("covers every documented code", () => {
    expect(TEST_ERROR_CODES).toEqual(codes);
    expect(Object.keys(TEST_ERROR_COPY).sort()).toEqual([...TEST_ERROR_CODES].sort());
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

/**
 * 2026-08-28: rate-limit awareness helpers. The cron worker
 * reads each snapshot's `sourceMetadata` to drive a 60s
 * pre-channel backoff when any usage layer is at or above 80%.
 * The threshold and the four usage fields are documented in
 * Meta's Graph API reference; 80% is the soft cap Meta's own
 * docs recommend ("stay under ~80% to be safe").
 */
describe("rate-limit backoff helpers", () => {
  it("imports the test seam", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    expect(__test__.RATE_LIMIT_USAGE_THRESHOLD).toBe(80);
    expect(__test__.RATE_LIMIT_BACKOFF_MS).toBe(60_000);
  });

  it("does not back off when no usage was reported", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    expect(__test__.readUsageFromSourceMetadata(null)).toBeNull();
    expect(__test__.readUsageFromSourceMetadata({})).toBeNull();
    expect(__test__.readUsageFromSourceMetadata({ unrelated: "key" })).toBeNull();
  });

  it("extracts the four usage numbers from a populated sourceMetadata", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    const md = {
      partial: false,
      appUsageCallCount: 42,
      appUsageCpu: 10,
      appUsageTime: 15,
      businessUsageMaxCallCount: 88,
    };
    const got = __test__.readUsageFromSourceMetadata(md);
    expect(got).toEqual({
      appUsageCallCount: 42,
      appUsageCpu: 10,
      appUsageTime: 15,
      businessUsageMaxCallCount: 88,
    });
  });

  it("extracts a partial set of usage numbers (defensive against missing headers)", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    // Realistic: Meta sometimes returns only the app header and
    // omits the business one (or vice versa). The helper must
    // surface whatever was returned and default the rest to null.
    const md = { appUsageCallCount: 12 };
    const got = __test__.readUsageFromSourceMetadata(md);
    expect(got?.appUsageCallCount).toBe(12);
    expect(got?.appUsageCpu).toBeNull();
    expect(got?.appUsageTime).toBeNull();
    expect(got?.businessUsageMaxCallCount).toBeNull();
  });

  it("triggers backoff at exactly 80% on any of the four layers", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    expect(
      __test__.shouldBackoff({
        appUsageCallCount: 80,
        appUsageCpu: 50,
        appUsageTime: 50,
        businessUsageMaxCallCount: 50,
      }),
    ).toBe(true);
    expect(
      __test__.shouldBackoff({
        appUsageCallCount: 50,
        appUsageCpu: 80,
        appUsageTime: 50,
        businessUsageMaxCallCount: 50,
      }),
    ).toBe(true);
    expect(
      __test__.shouldBackoff({
        appUsageCallCount: 50,
        appUsageCpu: 50,
        appUsageTime: 80,
        businessUsageMaxCallCount: 50,
      }),
    ).toBe(true);
    expect(
      __test__.shouldBackoff({
        appUsageCallCount: 50,
        appUsageCpu: 50,
        appUsageTime: 50,
        businessUsageMaxCallCount: 80,
      }),
    ).toBe(true);
  });

  it("does not trigger backoff below 80% on every layer", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    expect(
      __test__.shouldBackoff({
        appUsageCallCount: 79,
        appUsageCpu: 60,
        appUsageTime: 60,
        businessUsageMaxCallCount: 70,
      }),
    ).toBe(false);
  });

  it("treats a null layer as 0 (no backoff triggered by a missing header)", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    // Only the app layer is present (79%); business header was
    // missing entirely. shouldBackoff must not treat null as
    // 100 and falsely trigger.
    expect(
      __test__.shouldBackoff({
        appUsageCallCount: 79,
        appUsageCpu: 79,
        appUsageTime: 79,
        businessUsageMaxCallCount: null,
      }),
    ).toBe(false);
  });
});

/**
 * 2026-08-28: error-code persistence. The catch block in
 * `runChannelSyncCore` used to fall back to `err.name` for any
 * `SocialProviderError` that wasn't `auth_expired`,
 * `permission_denied`, or retryable. That meant a `not_found`
 * or `invalid_response` SPE — both `retryable: false` — would
 * persist the literal class name "SocialProviderError" to
 * `lastSyncErrorCode`, which the analytics health banner then
 * surfaced verbatim. The fix is to return `err.code` for any SPE
 * regardless of retryability. These tests pin the contract.
 */
describe("syncErrorCodeFor", () => {
  it("returns err.code for a SocialProviderError with a non-retryable, non-auth code (not_found)", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    const { SocialProviderError } = await import("@/lib/social/http");
    const err = new SocialProviderError("not_found", false, null);
    // Must be the typed code, not the class name.
    expect(__test__.syncErrorCodeFor(err)).toBe("not_found");
    expect(__test__.syncErrorCodeFor(err)).not.toBe("SocialProviderError");
  });

  it("returns err.code for a SocialProviderError with invalid_response", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    const { SocialProviderError } = await import("@/lib/social/http");
    const err = new SocialProviderError("invalid_response", false, null);
    expect(__test__.syncErrorCodeFor(err)).toBe("invalid_response");
  });

  it("returns err.code for an auth_expired SPE (existing happy path)", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    const { SocialProviderError } = await import("@/lib/social/http");
    expect(__test__.syncErrorCodeFor(new SocialProviderError("auth_expired", false, null))).toBe(
      "auth_expired",
    );
  });

  it("returns err.code for a retryable SPE (rate_limited)", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    const { SocialProviderError } = await import("@/lib/social/http");
    expect(__test__.syncErrorCodeFor(new SocialProviderError("rate_limited", true, null))).toBe(
      "rate_limited",
    );
  });

  it("returns err.name for a non-SPE Error (best-effort diagnostic)", async () => {
    const { __test__ } = await import("@/lib/social/sync");
    class MyWeirdError extends Error {
      constructor() {
        super("x");
        this.name = "MyWeirdError";
      }
    }
    expect(__test__.syncErrorCodeFor(new MyWeirdError())).toBe("MyWeirdError");
  });

  it('returns "unknown" for non-Error values', async () => {
    const { __test__ } = await import("@/lib/social/sync");
    expect(__test__.syncErrorCodeFor("a string")).toBe("unknown");
    expect(__test__.syncErrorCodeFor(null)).toBe("unknown");
    expect(__test__.syncErrorCodeFor(undefined)).toBe("unknown");
    expect(__test__.syncErrorCodeFor({ code: "fake" })).toBe("unknown");
  });
});
