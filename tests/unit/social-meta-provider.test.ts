import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMetaAuthorizationUrl,
  exchangeMetaCodeForShortLivedToken,
  exchangeShortLivedForLongLivedToken,
  discoverMetaPages,
  fetchMetaInstagramSnapshot,
  META_SCOPES,
  type MetaTokenResponse,
} from "@/lib/social/providers/meta";
import { SocialProviderError, formatProviderError, isSocialProviderError } from "@/lib/social/http";

/**
 * M2 — Meta provider unit tests.
 *
 * The Meta adapter is the only piece of code that talks to the
 * `graph.facebook.com` endpoints on behalf of the application. The
 * safety properties are concentrated here:
 *
 *   - Authorization URL requests ONLY the read scopes listed in the
 *     plan; no publish / manage / ads scope ever appears in the URL.
 *   - The state parameter is a 64-character hex digest (32 bytes
 *     hex-encoded) and is the same value persisted by the connect
 *     route.
 *   - Short-lived → long-lived token exchange sends the user access
 *     token, not the app secret alone, and returns an access token
 *     with an expiry.
 *   - `/me/accounts` pagination follows the `cursors.after` link up
 *     to a hard cap of 100 pages.
 *   - Pages are filtered to those that hold `PROFILE_PLUS_ANALYZE` or
 *     full-control tasks; a Page with only `ADVERTISE` is dropped.
 *   - A `link.instagram_business_account` is mapped to an Instagram
 *     `ConnectedProfile` with `parentProviderAccountId` set to the
 *     Page's external ID.
 *   - Every returned Page access token is stored in
 *     `profileAccessTokens` keyed by both the Page external ID and
 *     the linked Instagram external ID; tokens are NOT on the
 *     returned `ConnectedProfile[]`.
 *   - All `SocialProviderError`s raised here are surfaceable via
 *     `formatProviderError` and `isSocialProviderError`, and never
 *     include the access token, the URL, or the response body.
 *   - `providerRequest` calls pass through the `process.env` Graph
 *     API version, with a hard default when the env is missing.
 *   - Logger calls (via `console.error`) never include the
 *     authorization header, the access token, or the body.
 */

const originalFetch = globalThis.fetch;
const originalGraphVersion = process.env.META_GRAPH_API_VERSION;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalGraphVersion === undefined) {
    delete process.env.META_GRAPH_API_VERSION;
  } else {
    process.env.META_GRAPH_API_VERSION = originalGraphVersion;
  }
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("META_SCOPES", () => {
  it("lists only the read scopes from the plan", () => {
    expect(META_SCOPES).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "read_insights",
      "instagram_basic",
      "instagram_manage_insights",
    ]);
  });
});

describe("buildMetaAuthorizationUrl", () => {
  const baseEnv = {
    META_APP_ID: "app-1",
    META_APP_SECRET: "secret",
    META_LOGIN_CONFIG_ID: "cfg",
    META_GRAPH_API_VERSION: "v25.0",
  } as const;

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  it("uses the Facebook Login for Business dialog and pins the redirect_uri", () => {
    const url = buildMetaAuthorizationUrl({
      appId: "app-1",
      loginConfigId: "cfg",
      state: "abcdef",
      redirectUri: "https://planner.laratik.com/api/social/meta/callback",
    });
    const u = new URL(url);
    expect(u.origin).toBe("https://www.facebook.com");
    expect(u.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    expect(u.searchParams.get("client_id")).toBe("app-1");
    expect(u.searchParams.get("config_id")).toBe("cfg");
    expect(u.searchParams.get("state")).toBe("abcdef");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://planner.laratik.com/api/social/meta/callback",
    );
    expect(u.searchParams.get("response_type")).toBe("code");
  });

  it("includes the META_SCOPES joined by a comma and no other scope", () => {
    const url = buildMetaAuthorizationUrl({
      appId: "app-1",
      loginConfigId: "cfg",
      state: "s",
      redirectUri: "https://planner.laratik.com/cb",
    });
    const u = new URL(url);
    const scope = u.searchParams.get("scope") ?? "";
    expect(scope.split(",").sort()).toEqual([...META_SCOPES].sort());
    // No write / publish scope leaks into the URL.
    expect(scope).not.toMatch(/pages_manage|publish_|ads_|instagram_content_publish/);
  });
});

describe("exchangeMetaCodeForShortLivedToken", () => {
  it("POSTs the code and returns the access token payload", async () => {
    const mockResponse: MetaTokenResponse = {
      access_token: "short-token",
      token_type: "bearer",
    };
    globalThis.fetch = vi.fn(async () => jsonResponse(200, mockResponse)) as typeof fetch;
    const result = await exchangeMetaCodeForShortLivedToken({
      appId: "app-1",
      appSecret: "secret",
      code: "the-code",
      redirectUri: "https://planner.laratik.com/api/social/meta/callback",
    });
    expect(result).toEqual(mockResponse);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain("https://graph.facebook.com/v25.0/oauth/access_token");
    expect(init.method).toBe("POST");
    const body = String(init.body);
    expect(body).toContain("client_id=app-1");
    expect(body).toContain("client_secret=secret");
    expect(body).toContain("code=the-code");
    expect(body).toContain("redirect_uri=");
  });

  it("surfaces 401 from Meta as auth_expired", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { error: { message: "bad code" } }),
    ) as typeof fetch;
    await expect(
      exchangeMetaCodeForShortLivedToken({
        appId: "app-1",
        appSecret: "secret",
        code: "x",
        redirectUri: "https://planner.laratik.com/cb",
      }),
    ).rejects.toMatchObject({ code: "auth_expired", retryable: false });
  });
});

describe("exchangeShortLivedForLongLivedToken", () => {
  it("exchanges the short token for a long-lived token with an expiry", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        access_token: "long-token",
        token_type: "bearer",
        expires_in: 5_184_000,
      }),
    ) as typeof fetch;
    const result = await exchangeShortLivedForLongLivedToken({
      appId: "app-1",
      appSecret: "secret",
      shortLivedToken: "short",
    });
    expect(result.accessToken).toBe("long-token");
    expect(result.accessTokenExpiresAt).toBeInstanceOf(Date);
    // expires_in is ~60 days; 5_184_000 = 60d, the test asserts a 50–70 day window.
    const ms = (result.accessTokenExpiresAt as Date).getTime() - Date.now();
    expect(ms).toBeGreaterThan(50 * 24 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(70 * 24 * 60 * 60 * 1000);
  });

  it("does not require a refresh-token (Meta long-lived is the only refreshable form)", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { access_token: "long-token", expires_in: 7_200_000 }),
    ) as typeof fetch;
    const result = await exchangeShortLivedForLongLivedToken({
      appId: "app-1",
      appSecret: "secret",
      shortLivedToken: "short",
    });
    expect(result.refreshToken).toBeUndefined();
    expect(result.refreshTokenExpiresAt).toBeNull();
  });
});

describe("discoverMetaPages", () => {
  const baseGraph = "https://graph.facebook.com/v25.0";
  const appId = "app-1";
  const appSecret = "secret";

  it("returns Pages with PROFILE_PLUS_ANALYZE and a linked Instagram account", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${baseGraph}/me/accounts`)) {
        return jsonResponse(200, {
          data: [
            {
              id: "page-1",
              name: "Acme Coffee",
              access_token: "page-tok-1",
              tasks: ["PROFILE_PLUS_ANALYZE", "MANAGE"],
              picture: { data: { url: "https://graph.facebook.com/p1.jpg" } },
              link: "https://facebook.com/acme",
              followers_count: 1234,
              instagram_business_account: {
                id: "ig-1",
                username: "acme",
                name: "Acme IG",
                profile_picture_url: "https://graph.facebook.com/ig1.jpg",
                followers_count: 5678,
                media_count: 42,
              },
            },
          ],
          paging: {},
        });
      }
      if (url.startsWith(`${baseGraph}/page-1`)) {
        return jsonResponse(200, {
          id: "page-1",
          name: "Acme Coffee",
          fan_count: 1234,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const result = await discoverMetaPages({ appId, appSecret, accessToken: "user-tok" });
    expect(result.profiles).toHaveLength(2);
    const page = result.profiles.find((p) => p.platform === "facebook");
    const ig = result.profiles.find((p) => p.platform === "instagram");
    expect(page).toBeDefined();
    expect(ig).toBeDefined();
    expect(page?.providerAccountId).toBe("page-1");
    expect(page?.accountName).toBe("Acme Coffee");
    expect(page?.handle).toBeNull();
    expect(page?.avatarUrl).toBe("https://graph.facebook.com/p1.jpg");
    expect(page?.profileUrl).toBe("https://facebook.com/acme");
    expect(page?.parentProviderAccountId).toBeNull();
    expect(ig?.providerAccountId).toBe("ig-1");
    expect(ig?.parentProviderAccountId).toBe("page-1");
    expect(ig?.handle).toBe("acme");
    // Tokens live on the credentials envelope, NOT on the profiles.
    expect(JSON.stringify(result.profiles)).not.toContain("page-tok-1");
    expect(JSON.stringify(result.profiles)).not.toContain("user-tok");
    // Both keys exist on the profileAccessTokens.
    const tokens = result.credentials.profileAccessTokens ?? {};
    expect(tokens["page-1"]).toBe("page-tok-1");
    expect(tokens["ig-1"]).toBe("page-tok-1");
  });

  it("filters out Pages that only have ADVERTISE / no analytics tasks", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${baseGraph}/me/accounts`)) {
        return jsonResponse(200, {
          data: [
            {
              id: "page-ad",
              name: "Ads Only",
              access_token: "ad-tok",
              tasks: ["ADVERTISE", "CREATE_AD"],
              picture: { data: { url: "https://x" } },
              link: "https://facebook.com/ad",
            },
            {
              id: "page-ok",
              name: "OK",
              access_token: "ok-tok",
              tasks: ["PROFILE_PLUS_ANALYZE"],
              picture: { data: { url: "https://x" } },
              link: "https://facebook.com/ok",
            },
          ],
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;
    const result = await discoverMetaPages({ appId, appSecret, accessToken: "user-tok" });
    const ids = result.profiles.map((p) => p.providerAccountId);
    expect(ids).toEqual(["page-ok"]);
  });

  it("follows paging.next up to a hard cap of 100 Pages", async () => {
    let count = 0;
    globalThis.fetch = vi.fn(async () => {
      count += 1;
      return jsonResponse(200, {
        data: [
          {
            id: `page-${count}`,
            name: `Page ${count}`,
            access_token: `tok-${count}`,
            tasks: ["PROFILE_PLUS_ANALYZE"],
            picture: { data: { url: "https://x" } },
            link: `https://facebook.com/${count}`,
          },
        ],
        paging: { next: `${baseGraph}/me/accounts?after=cursor` },
      });
    }) as typeof fetch;
    const result = await discoverMetaPages({ appId, appSecret, accessToken: "user-tok" });
    expect(result.profiles).toHaveLength(100);
    expect(count).toBeLessThanOrEqual(101);
  });

  it("stops at 100 pages even when Meta keeps paginating", async () => {
    let count = 0;
    globalThis.fetch = vi.fn(async () => {
      count += 1;
      return jsonResponse(200, {
        data: [
          {
            id: `page-${count}`,
            name: `Page ${count}`,
            access_token: `tok-${count}`,
            tasks: ["PROFILE_PLUS_ANALYZE"],
            picture: { data: { url: "https://x" } },
            link: `https://facebook.com/${count}`,
          },
        ],
        paging: {
          cursors: { after: "next" },
          next: `https://graph.facebook.com/me/accounts?after=next`,
        },
      });
    }) as typeof fetch;
    const result = await discoverMetaPages({ appId, appSecret, accessToken: "user-tok" });
    expect(result.profiles).toHaveLength(100);
    expect(count).toBeLessThanOrEqual(101); // first page + 99 follow-ups is acceptable
  });

  it("surfaces 429 as rate_limited and retryable", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(429, { error: { message: "throttled" } }),
    ) as typeof fetch;
    // 2 retries × up to 4s full-jitter = up to 8s. Budget 12s.
    await expect(
      discoverMetaPages({ appId, appSecret, accessToken: "user-tok" }),
    ).rejects.toMatchObject({ code: "rate_limited", retryable: true });
  }, 12_000);

  it("raises invalid_response on malformed JSON", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    ) as typeof fetch;
    await expect(
      discoverMetaPages({ appId, appSecret, accessToken: "user-tok" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("error-surface safety", () => {
  it("formatProviderError does not include the URL or token", () => {
    const err = new SocialProviderError("auth_expired", false, "req-123");
    const formatted = formatProviderError(err);
    expect(formatted).toContain("auth_expired");
    expect(formatted).not.toContain("Bearer");
    expect(formatted).not.toContain("access_token");
  });

  it("isSocialProviderError round-trips", () => {
    const err = new SocialProviderError("not_found", false, null);
    expect(isSocialProviderError(err)).toBe(true);
    expect(isSocialProviderError(new Error("nope"))).toBe(false);
  });
});

describe("fetchMetaInstagramSnapshot — IG insights metric_type", () => {
  // Regression guard for the 2026-08-27 pre-flight finding: the IG
  // insights endpoint requires `metric_type=total_value` for
  // `profile_views`, `accounts_engaged`, and `total_interactions`.
  // Without it, the API returns 400 and the function surfaces `null`
  // for every metric on every IG account, which silently breaks the
  // engagement-rate card and the portfolio aggregate strip.
  const baseGraph = "https://graph.facebook.com/v25.0";
  const igUserId = "17841480087235357";
  const accessToken = "page-token";

  it("sends metric_type=total_value on the IG insights call", async () => {
    let capturedInsightsUrl: string | null = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${baseGraph}/${igUserId}/insights`)) {
        capturedInsightsUrl = url;
        return jsonResponse(200, {
          data: [
            { name: "reach", period: "day", values: [{ value: 2401 }] },
            { name: "profile_views", period: "day", values: [{ value: 91 }] },
            { name: "accounts_engaged", period: "day", values: [{ value: 15 }] },
            { name: "total_interactions", period: "day", values: [{ value: 28 }] },
          ],
        });
      }
      if (url.startsWith(`${baseGraph}/${igUserId}?`)) {
        return jsonResponse(200, {
          id: igUserId,
          username: "__foodgame",
          name: "Food Game",
          followers_count: 248,
          media_count: 46,
          follows_count: 0,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaInstagramSnapshot({
      accessToken,
      igUserId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });

    expect(capturedInsightsUrl).not.toBeNull();
    // The bug regression: the URL MUST include `metric_type=total_value`.
    // If a future refactor drops this parameter, the test fails and the
    // engagement-rate card silently goes to null.
    const params = new URL(capturedInsightsUrl!).searchParams;
    expect(params.get("metric_type")).toBe("total_value");
    expect(params.get("period")).toBe("day");
    // All four metrics are requested.
    expect(params.get("metric")).toBe("reach,profile_views,accounts_engaged,total_interactions");
    // And the snapshot actually populated the values (not null).
    expect(snapshot.engagedAccounts).toBe(15);
    expect(snapshot.interactions).toBe(28);
    expect(snapshot.views).toBe(91);
    expect(snapshot.reach).toBe(2401);
  });
});
