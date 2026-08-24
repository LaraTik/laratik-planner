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
