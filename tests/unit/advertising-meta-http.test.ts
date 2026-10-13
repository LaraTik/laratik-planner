import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaReadClient, MetaHttpError } from "@/lib/advertising/meta-http";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Meta read client", () => {
  it("uses a bounded GET with the server-resolved credential and no token in the response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { data: [] }));
    globalThis.fetch = fetchMock;

    const result = await createMetaReadClient("v24.0", {
      accessToken: "secret-token",
      appSecretProof: "secret-proof",
    }).get("me/adaccounts", { fields: "id,name" });

    expect(result).toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe(
      "https://graph.facebook.com/v24.0/me/adaccounts?fields=id%2Cname",
    );
    expect(requestInit).toMatchObject({
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: "Bearer secret-token",
        "X-FB-APPSECRET-PROOF": "secret-proof",
      },
    });
  });

  it("retries bounded provider failures and then succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(429, { error: { code: 17 } }))
      .mockResolvedValueOnce(jsonResponse(503, { error: { code: 1 } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    globalThis.fetch = fetchMock;

    await expect(createMetaReadClient().get("me", {})).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces a sanitized non-retryable provider error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(403, { error: { code: 190, message: "secret-token" } }));
    globalThis.fetch = fetchMock;

    const request = createMetaReadClient().get("me", {});
    await expect(request).rejects.toMatchObject({
      name: "MetaHttpError",
      status: 403,
      code: 190,
      message: "Meta advertising request failed",
    });
    await expect(request.catch((error: unknown) => error)).resolves.toBeInstanceOf(MetaHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
