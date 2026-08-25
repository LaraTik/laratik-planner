/**
 * Unit tests for the capture-mode retry behaviour added to
 * `tests/e2e/_helpers.ts`.
 *
 * Background: the Next.js 16.3.1 dev server on the Linux CI runner
 * occasionally returns a transient 500 from `/api/dev/sign-in` and
 * `/api/dev/seed` during a route-manifest race (see run 32569436774).
 * We retry these endpoints in capture mode so the visual-baseline step
 * survives a single bad manifest write. The retry must NEVER mask a
 * real 500 in compare mode — that is how flaky prod paths get caught.
 *
 * IMPORTANT: `process.env.PW_VISUAL_CAPTURE` is read at module-load
 * time by `_helpers.ts`, so this file sets it BEFORE the dynamic
 * import. The compare-mode test uses `vi.resetModules()` to re-import
 * the helper with the env var unset.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIRequestContext, APIResponse } from "@playwright/test";

// Capture mode is the default for this file — every test that needs
// the retry must run with PW_VISUAL_CAPTURE=1 set before the import.
process.env.PW_VISUAL_CAPTURE = "1";

type MockedRequest = APIRequestContext & {
  post: ReturnType<typeof vi.fn>;
};

function makeResponse(status: number, body: unknown = {}): APIResponse {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as APIResponse;
}

function makeMockRequest(responses: Array<{ status: number; body?: unknown }>): MockedRequest {
  let i = 0;
  const post = vi.fn(async () => {
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return makeResponse(next.status, next.body);
  });
  return { post } as unknown as MockedRequest;
}

const { devSignIn, devSeed, withRetry } = await import("../../tests/e2e/_helpers");

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

beforeEach(() => {
  consoleLogSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withRetry (capture mode)", () => {
  it("returns the value when the first attempt succeeds", async () => {
    const fn = vi.fn(async () => 42);
    const result = await withRetry(fn, "ok-op");
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("retries once on a 500 error and returns the next success", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("devSignIn failed: 500 <!DOCTYPE html>...");
      return "ok";
    });
    const result = await withRetry(fn, "devSignIn");
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("devSignIn retry 1/2 after 500"),
    );
  });

  it("throws after the 500 retries are exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new Error("devSignIn failed: 500 <!DOCTYPE html>...");
    });
    await expect(withRetry(fn, "devSignIn")).rejects.toThrow(/devSignIn failed: 500/);
    expect(fn).toHaveBeenCalledTimes(3);
    // The 1st and 2nd retry log lines; no 3rd because the loop exits.
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-500 error immediately without retrying", async () => {
    const fn = vi.fn(async () => {
      throw new Error("devSignIn failed: 400 bad request");
    });
    await expect(withRetry(fn, "devSignIn")).rejects.toThrow(/400/);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("rethrows a non-Error throwable (e.g. string) when it does not contain 500", async () => {
    const fn = vi.fn(async () => {
      throw "network unreachable";
    });
    await expect(withRetry(fn, "devSignIn")).rejects.toBe("network unreachable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses real timers (the configured delay is real, not microtask)", async () => {
    // TEST-11 (GAP-FULL-REVIEW-2026-08-25): replaced the
    // wall-clock assertion with vi.useFakeTimers() so this test
    // is deterministic (no CI runner load flake) and finishes in
    // a few ms instead of ≥ 2.2s of real wall time. The contract
    // we pin: the helper actually waits the configured delay
    // between attempts (not a microtask flush). With fake timers
    // we observe the third attempt fire only after we advance
    // the clock past the second delay.
    vi.useFakeTimers();
    try {
      const fn = vi.fn(async () => {
        throw new Error("devSignIn failed: 500 <html>");
      });
      const promise = expect(withRetry(fn, "devSignIn", 3, 1100)).rejects.toThrow();
      // Advance past the first delay (between attempt 1 and 2).
      await vi.advanceTimersByTimeAsync(1100);
      // Advance past the second delay (between attempt 2 and 3).
      await vi.advanceTimersByTimeAsync(1100);
      // By now the third attempt has fired and the helper has
      // thrown; the assertion resolves.
      await promise;
      // Three attempts, two delays consumed.
      expect(fn).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("devSignIn retry integration", () => {
  it("recovers when the first POST returns 500 and the second returns 200 (capture mode)", async () => {
    const request = makeMockRequest([
      { status: 500, body: "<!DOCTYPE html>...manifest error..." },
      {
        status: 200,
        body: {
          userId: "00000000-0000-0000-0000-000000000001",
          email: "test@laratik.local",
          role: "agency_admin",
        },
      },
    ]);

    const result = await devSignIn(request);

    expect(result).toEqual({
      userId: "00000000-0000-0000-0000-000000000001",
      email: "test@laratik.local",
      role: "agency_admin",
    });
    expect(request.post).toHaveBeenCalledTimes(2);
  });

  it("throws after three consecutive 500s (exhausted retries)", async () => {
    const request = makeMockRequest([
      { status: 500, body: "<html>1</html>" },
      { status: 500, body: "<html>2</html>" },
      { status: 500, body: "<html>3</html>" },
    ]);

    await expect(devSignIn(request)).rejects.toThrow(/devSignIn failed: 500/);
    expect(request.post).toHaveBeenCalledTimes(3);
  });

  it("propagates a 400 immediately without retrying", async () => {
    const request = makeMockRequest([{ status: 400, body: "bad request" }]);
    await expect(devSignIn(request)).rejects.toThrow(/devSignIn failed: 400/);
    expect(request.post).toHaveBeenCalledTimes(1);
  });
});

describe("devSeed retry integration", () => {
  it("recovers when the first POST returns 500 and the second returns 200 (capture mode)", async () => {
    const request = makeMockRequest([
      { status: 500, body: "<html>manifest race</html>" },
      {
        status: 200,
        body: {
          userId: "00000000-0000-0000-0000-000000000001",
          agencyId: "00000000-0000-0000-0000-000000000002",
          workspaceId: "00000000-0000-0000-0000-000000000003",
          workspaceSlug: "acme",
          channelIds: ["ch-1"],
          contentItemId: "ci-1",
        },
      },
    ]);

    const result = await devSeed(request);
    expect(result.workspaceSlug).toBe("acme");
    expect(result.contentItemId).toBe("ci-1");
    expect(request.post).toHaveBeenCalledTimes(2);
  });
});

describe("withRetry (compare mode — no retries)", () => {
  // Re-import the helper with PW_VISUAL_CAPTURE unset so the
  // module-level `isCaptureMode` constant is `false`.
  const originalCapture = process.env.PW_VISUAL_CAPTURE;
  beforeEach(() => {
    delete process.env.PW_VISUAL_CAPTURE;
    vi.resetModules();
  });
  afterEach(() => {
    if (originalCapture === undefined) delete process.env.PW_VISUAL_CAPTURE;
    else process.env.PW_VISUAL_CAPTURE = originalCapture;
  });

  it("propagates a 500 on the first attempt without retrying", async () => {
    const { withRetry: withRetryCompare } = await import("../../tests/e2e/_helpers");
    const fn = vi.fn(async () => {
      throw new Error("devSignIn failed: 500 <html>");
    });
    await expect(withRetryCompare(fn, "devSignIn")).rejects.toThrow(/devSignIn failed: 500/);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("propagates a 400 immediately without retrying", async () => {
    const { withRetry: withRetryCompare } = await import("../../tests/e2e/_helpers");
    const fn = vi.fn(async () => {
      throw new Error("devSignIn failed: 400 bad request");
    });
    await expect(withRetryCompare(fn, "devSignIn")).rejects.toThrow(/400/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
