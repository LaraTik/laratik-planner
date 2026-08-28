import { afterEach, describe, expect, it } from "vitest";
import { SocialProviderError, isSocialProviderError, providerRequest } from "@/lib/social/http";

/**
 * M4 — provider HTTP client.
 *
 * The HTTP client is the only place that talks to the public
 * internet, so the safety properties are concentrated here:
 *
 *   - 429 / 5xx retry with full-jitter (cap 4s)
 *   - 401 / 403 surface as auth_expired
 *   - 404 surfaces as not_found
 *   - other 4xx surface as invalid_response
 *   - timeout surfaces as provider_unavailable
 *   - 1 MiB body cap rejects oversize bodies
 *
 * The unit suite uses a stubbed `fetch` to keep the tests fast and
 * deterministic. The timeout and retry tests run with a short jitter
 * ceiling by relying on the existing `MAX_JITTER_MS` constant.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("providerRequest", () => {
  it("returns the body and a request id on success", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(200, { ok: true }, { "x-request-id": "abc-123" }),
      )) as typeof fetch;
    const { status, body, requestId } = await providerRequest("https://example.com/x");
    expect(status).toBe(200);
    expect(body).toBe(JSON.stringify({ ok: true }));
    expect(requestId).toBe("abc-123");
  });

  it("surfaces 401 as auth_expired (not retryable)", async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse(401, { error: "x" }))) as typeof fetch;
    await expect(providerRequest("https://example.com/x")).rejects.toMatchObject({
      code: "auth_expired",
      retryable: false,
    });
  });

  it("surfaces 404 as not_found", async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse(404, { error: "x" }))) as typeof fetch;
    await expect(providerRequest("https://example.com/x")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("surfaces 400 with Meta 'invalid insights metric' (error.code: 100) as not_configured", async () => {
    // 2026-08-28: Meta returns HTTP 400 with body
    //   { "error": { "code": 100, "message": "(#100) The value must
    //   be a valid insights metric", ... } }
    // when the app is missing a specific insight metric
    // (App Review allowlist / app mode). The pre-fix classifyStatus
    // mapped this to `invalid_response` and the page branch's
    // catch threw it, surfacing as the misleading "Meta returned an
    // unrecognized response" error. The fix: detect the metric-
    // not-available pattern and return `not_configured` so the page
    // branch silently writes a `partial: true` row instead of
    // marking the channel failed.
    const metaBody = JSON.stringify({
      error: {
        message: "(#100) The value must be a valid insights metric",
        type: "OAuthException",
        code: 100,
        error_subcode: 1888399,
        fbtrace_id: "Abc123def456",
      },
    });
    globalThis.fetch = (() =>
      Promise.resolve(new Response(metaBody, { status: 400 }))) as typeof fetch;
    await expect(providerRequest("https://example.com/x")).rejects.toMatchObject({
      code: "not_configured",
      retryable: false,
    });
  });

  it("surfaces 400 with non-metric error code as invalid_response (not_configured is opt-in)", async () => {
    // 400 with `error.code: 100` but a NON-metric message (e.g.
    // a generic parameter error) should still be `invalid_response` —
    // the not_configured classification is gated on the message
    // containing "metric" or "insights".
    const metaBody = JSON.stringify({
      error: {
        message: "(#100) Missing required parameter: since",
        type: "OAuthException",
        code: 100,
        fbtrace_id: "Xyz789",
      },
    });
    globalThis.fetch = (() =>
      Promise.resolve(new Response(metaBody, { status: 400 }))) as typeof fetch;
    await expect(providerRequest("https://example.com/x")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("retries 429 then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      if (calls < 2) return Promise.resolve(jsonResponse(429, { error: "throttled" }));
      return Promise.resolve(jsonResponse(200, { ok: true }));
    }) as typeof fetch;
    const { status } = await providerRequest("https://example.com/x");
    expect(status).toBe(200);
    expect(calls).toBe(2);
  });

  it("retries 503 twice then surfaces provider_unavailable", async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve(jsonResponse(503, { error: "down" }));
    }) as typeof fetch;
    // 2 retries × up to 4s full-jitter = up to 8s; budget 12s to be safe.
    await expect(providerRequest("https://example.com/x")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(calls).toBe(3);
  }, 12_000);

  it("rejects an oversize body (1 MiB cap)", async () => {
    const big = "x".repeat(1024 * 1024 + 8);
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(big, {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      )) as typeof fetch;
    await expect(providerRequest("https://example.com/x")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("surfaces network errors as provider_unavailable (retryable)", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ECONNRESET"))) as typeof fetch;
    // 2 retries × up to 4s full-jitter; budget 12s to be safe.
    await expect(providerRequest("https://example.com/x")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  }, 12_000);
});

describe("isSocialProviderError", () => {
  it("returns true for SocialProviderError", () => {
    expect(isSocialProviderError(new SocialProviderError("not_found", false, null))).toBe(true);
  });
  it("returns false for other errors", () => {
    expect(isSocialProviderError(new Error("x"))).toBe(false);
    expect(isSocialProviderError("x")).toBe(false);
  });
});

/**
 * 2026-08-28: rate-limit usage header parsing. Meta returns the
 * per-app and per-business usage as JSON-encoded `X-App-Usage`
 * and `X-Business-Use-Case-Usage` headers on every 2xx (and most
 * 429) responses. The providerRequest function surfaces them on
 * the success response so the cron worker can drive proactive
 * backoff before the 429 cliff.
 */
describe("providerRequest — rate-limit usage", () => {
  it("parses X-App-Usage on the success response", async () => {
    const app = { call_count: 12, total_cputime: 3, total_time: 4 };
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(200, { ok: true }, { "x-app-usage": JSON.stringify(app) }),
      )) as typeof fetch;
    const { usage } = await providerRequest("https://example.com/x");
    expect(usage.app).toEqual(app);
    expect(usage.business).toBeNull();
  });

  it("parses X-Business-Use-Case-Usage keyed by business id", async () => {
    const business = {
      "10209062998196500": [
        { type: "pages", call_count: 47, total_cputime: 5, total_time: 7 },
        { type: "instagram", call_count: 30, total_cputime: 3, total_time: 5 },
      ],
    };
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(
          200,
          { ok: true },
          {
            "x-business-use-case-usage": JSON.stringify(business),
          },
        ),
      )) as typeof fetch;
    const { usage } = await providerRequest("https://example.com/x");
    expect(usage.app).toBeNull();
    expect(usage.business).toEqual(business);
  });

  it("parses both headers when both are present", async () => {
    const app = { call_count: 17, total_cputime: 4, total_time: 6 };
    const business = {
      "1": [{ type: "pages", call_count: 1, total_cputime: 0, total_time: 0 }],
    };
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(
          200,
          { ok: true },
          {
            "x-app-usage": JSON.stringify(app),
            "x-business-use-case-usage": JSON.stringify(business),
          },
        ),
      )) as typeof fetch;
    const { usage } = await providerRequest("https://example.com/x");
    expect(usage.app).toEqual(app);
    expect(usage.business).toEqual(business);
  });

  it("treats a malformed X-App-Usage header as absent (does not throw)", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(200, { ok: true }, { "x-app-usage": "not-json" }),
      )) as typeof fetch;
    const { usage } = await providerRequest("https://example.com/x");
    expect(usage.app).toBeNull();
    expect(usage.business).toBeNull();
  });

  it("treats a non-numeric X-App-Usage header as absent (defensive)", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(
          200,
          { ok: true },
          {
            "x-app-usage": JSON.stringify({ call_count: "high", total_cputime: 1, total_time: 1 }),
          },
        ),
      )) as typeof fetch;
    const { usage } = await providerRequest("https://example.com/x");
    expect(usage.app).toBeNull();
  });

  it("returns null usage fields when the headers are missing entirely", async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse(200, { ok: true }))) as typeof fetch;
    const { usage } = await providerRequest("https://example.com/x");
    expect(usage.app).toBeNull();
    expect(usage.business).toBeNull();
  });
});
