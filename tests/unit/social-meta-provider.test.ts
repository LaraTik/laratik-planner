import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMetaAuthorizationUrl,
  exchangeMetaCodeForShortLivedToken,
  exchangeShortLivedForLongLivedToken,
  discoverMetaPages,
  fetchMetaFacebookPageSnapshot,
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
  // 2026-08-28: `read_insights` was removed. Meta deprecated it for
  // new apps and rejects the OAuth dialog with `Invalid Scopes:
  // read_insights` when the Login for Business config or the URL
  // still includes it. The four remaining scopes cover every
  // metric the social pipeline reads.
  it("lists only the read scopes that are still valid for new Meta apps", () => {
    expect(META_SCOPES).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_manage_insights",
    ]);
  });
  it("does not include the deprecated read_insights scope", () => {
    expect(META_SCOPES).not.toContain("read_insights");
  });
  it("contains no publish / manage / ads scope", () => {
    // Defensive: the project rule is "read-only analytics first;
    // never request publish, manage, or ads scopes".
    for (const forbidden of [
      "publish_pages",
      "publish_video",
      "manage_pages",
      "ads_management",
      "ads_read",
      "business_management",
    ]) {
      expect(META_SCOPES).not.toContain(forbidden);
    }
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

describe("fetchMetaFacebookPageSnapshot — Page insights metric_type + partial flag", () => {
  // Regression guard for the 2026-08-28 finding: the Page insights
  // endpoint silently returned all-null values for `page_views` and
  // `page_post_engagements` when the URL was missing
  // `metric_type=total_value`. The IG fix (3dc7fa2) added this
  // parameter for the IG path; the Page path was missed. The
  // analytics page therefore showed `Followers: <n>` with the
  // other four columns blank for every Page channel, and the
  // `partial: false` flag in `sourceMetadata` hid the gap from
  // the user.
  const baseGraph = "https://graph.facebook.com/v25.0";
  const pageId = "939269935939946";
  const accessToken = "page-token";

  it("sends metric_type=total_value on the Page insights call", async () => {
    let capturedInsightsUrl: string | null = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${baseGraph}/${pageId}/insights`)) {
        capturedInsightsUrl = url;
        return jsonResponse(200, {
          data: [
            { name: "page_impressions_unique", period: "day", values: [{ value: 2401 }] },
            { name: "page_views", period: "day", values: [{ value: 91 }] },
            { name: "page_post_engagements", period: "day", values: [{ value: 28 }] },
          ],
        });
      }
      if (url.startsWith(`${baseGraph}/${pageId}?`)) {
        return jsonResponse(200, {
          id: pageId,
          name: "Food Game",
          fan_count: 69,
          followers_count: 69,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaFacebookPageSnapshot({
      accessToken,
      pageId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });

    expect(capturedInsightsUrl).not.toBeNull();
    const params = new URL(capturedInsightsUrl!).searchParams;
    // The bug regression: the URL MUST include `metric_type=total_value`.
    // If a future refactor drops this parameter, the test fails and
    // `page_views` + `page_post_engagements` silently go to null.
    expect(params.get("metric_type")).toBe("total_value");
    expect(params.get("period")).toBe("day");
    expect(params.get("metric")).toBe("page_impressions_unique,page_views,page_post_engagements");
    // And the snapshot actually populated the values (not null).
    expect(snapshot.followerCount).toBe(69);
    expect(snapshot.reach).toBe(2401);
    expect(snapshot.views).toBe(91);
    expect(snapshot.interactions).toBe(28);
    // And the partial flag is FALSE because all fields are populated.
    expect((snapshot.sourceMetadata as { partial?: boolean }).partial).toBe(false);
  });

  it("marks the snapshot as partial when the follower is captured but insights are null", async () => {
    // Simulates the 2026-08-28 bug surface: the basic fields call
    // succeeds (fan_count=69) but the insights call returns 200 with
    // an empty `data` array (e.g. brand new page, no engagement
    // yet). Pre-fix the partial flag was `false`; post-fix it must
    // be `true` so the analytics page can show the "partial" pill
    // and the operator can see that the row is incomplete.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${baseGraph}/${pageId}/insights`)) {
        return jsonResponse(200, { data: [] });
      }
      if (url.startsWith(`${baseGraph}/${pageId}?`)) {
        return jsonResponse(200, {
          id: pageId,
          name: "Food Game",
          fan_count: 69,
          followers_count: 69,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaFacebookPageSnapshot({
      accessToken,
      pageId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    expect(snapshot.followerCount).toBe(69);
    expect(snapshot.reach).toBeNull();
    expect(snapshot.views).toBeNull();
    expect(snapshot.interactions).toBeNull();
    // The partial flag is TRUE because at least one insight is null.
    expect((snapshot.sourceMetadata as { partial?: boolean }).partial).toBe(true);
    expect((snapshot.sourceMetadata as { reason?: string }).reason).toBe(
      "page_insights_unavailable",
    );
  });

  it("writes the provider error code into sourceMetadata when the insights call returns 403 (permission_denied)", async () => {
    // 2026-08-28: regression guard for the Sentry-free diagnostic
    // path. The worker writes the provider error code into the
    // row's sourceMetadata so a DB query (or the analytics
    // health banner) reveals why the insights are missing.
    // The pre-fix code returned null silently and the operator
    // had no way to know it was a permission issue.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${baseGraph}/${pageId}/insights`)) {
        return jsonResponse(403, {
          error: {
            code: 200,
            message: "(#200) Requires business_management permission",
          },
        });
      }
      if (url.startsWith(`${baseGraph}/${pageId}?`)) {
        return jsonResponse(200, {
          id: pageId,
          name: "Food Game",
          fan_count: 69,
          followers_count: 69,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaFacebookPageSnapshot({
      accessToken,
      pageId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    expect(snapshot.followerCount).toBe(69);
    // All insight fields are null because the call returned 403.
    expect(snapshot.reach).toBeNull();
    expect(snapshot.views).toBeNull();
    expect(snapshot.interactions).toBeNull();
    // The new diagnostic surface: providerErrorCode is in
    // sourceMetadata so the analytics health banner can render
    // the actual code without Sentry.
    const meta = snapshot.sourceMetadata as {
      partial?: boolean;
      reason?: string;
      providerErrorCode?: string;
    };
    expect(meta.partial).toBe(true);
    expect(meta.reason).toBe("page_insights_unavailable");
    expect(meta.providerErrorCode).toBe("permission_denied");
  });
});

/**
 * 2026-08-28: rate-limit usage awareness. Meta returns
 * `X-App-Usage` and `X-Business-Use-Case-Usage` on every 2xx
 * response; we surface them on `sourceMetadata` so the cron
 * worker can drive proactive backoff before the 429 cliff. The
 * keys are flat (no nested JSON) so a SQL query can read them.
 */
describe("fetchMetaFacebookPageSnapshot — rate-limit usage on sourceMetadata", () => {
  it("writes appUsageCallCount/Cpu/Time when X-App-Usage is returned", async () => {
    const accessToken = "page-access-token";
    const pageId = "12345";
    const app = { call_count: 42, total_cputime: 10, total_time: 15 };
    globalThis.fetch = (async (url: string) => {
      if (url.includes(`/${pageId}?`)) {
        return jsonResponse(
          200,
          { id: pageId, fan_count: 100 },
          {
            "x-app-usage": JSON.stringify(app),
          },
        );
      }
      if (url.includes(`/${pageId}/insights`)) {
        return jsonResponse(200, { data: [] }, {});
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaFacebookPageSnapshot({
      accessToken,
      pageId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    const meta = snapshot.sourceMetadata as Record<string, number | boolean | null>;
    expect(meta.appUsageCallCount).toBe(42);
    expect(meta.appUsageCpu).toBe(10);
    expect(meta.appUsageTime).toBe(15);
  });

  it("writes businessUsageMaxCallCount as the max across businesses × asset types", async () => {
    const accessToken = "page-access-token";
    const pageId = "12345";
    const business = {
      "1": [{ type: "pages", call_count: 47, total_cputime: 5, total_time: 7 }],
      "2": [{ type: "instagram", call_count: 88, total_cputime: 9, total_time: 12 }],
    };
    globalThis.fetch = (async (url: string) => {
      if (url.includes(`/${pageId}?`)) {
        return jsonResponse(200, { id: pageId, fan_count: 100 }, {});
      }
      if (url.includes(`/${pageId}/insights`)) {
        return jsonResponse(
          200,
          { data: [] },
          { "x-business-use-case-usage": JSON.stringify(business) },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaFacebookPageSnapshot({
      accessToken,
      pageId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    const meta = snapshot.sourceMetadata as Record<string, number | boolean | null>;
    expect(meta.businessUsageMaxCallCount).toBe(88);
  });

  it("does NOT write usage keys when Meta omits the headers", async () => {
    const accessToken = "page-access-token";
    const pageId = "12345";
    globalThis.fetch = (async (url: string) => {
      if (url.includes(`/${pageId}?`)) {
        return jsonResponse(200, { id: pageId, fan_count: 100 });
      }
      if (url.includes(`/${pageId}/insights`)) {
        return jsonResponse(200, { data: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaFacebookPageSnapshot({
      accessToken,
      pageId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    const meta = snapshot.sourceMetadata as Record<string, number | boolean | null>;
    expect(meta.appUsageCallCount).toBeUndefined();
    expect(meta.appUsageCpu).toBeUndefined();
    expect(meta.businessUsageMaxCallCount).toBeUndefined();
  });
});

describe("fetchMetaInstagramSnapshot — rate-limit usage + field-expansion", () => {
  it("requests media.limit(10){id,like_count,comments_count,permalink,timestamp} on the basic call", async () => {
    const accessToken = "ig-access-token";
    const igUserId = "17841234567890123";
    let basicFieldsParam = "";
    globalThis.fetch = (async (url: string) => {
      if (url.includes(`/${igUserId}?`)) {
        const u = new URL(url);
        basicFieldsParam = u.searchParams.get("fields") ?? "";
        return jsonResponse(200, {
          id: igUserId,
          followers_count: 248,
          media_count: 46,
          follows_count: 12,
          username: "__foodgame",
          name: "Food Game",
          media: { data: [] },
        });
      }
      if (url.includes(`/${igUserId}/insights`)) {
        return jsonResponse(200, { data: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    await fetchMetaInstagramSnapshot({
      accessToken,
      igUserId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    // The field-expansion is purely future-proofing for per-post
    // engagement; the basic call already ran. We just verify the
    // fields= string contains the expected expansion.
    expect(basicFieldsParam).toContain("media.limit(10)");
    expect(basicFieldsParam).toContain("like_count");
    expect(basicFieldsParam).toContain("comments_count");
    expect(basicFieldsParam).toContain("permalink");
    expect(basicFieldsParam).toContain("timestamp");
  });

  it("writes latestPostId + like/comment counts on sourceMetadata when the basic call returns media", async () => {
    const accessToken = "ig-access-token";
    const igUserId = "17841234567890123";
    globalThis.fetch = (async (url: string) => {
      if (url.includes(`/${igUserId}?`)) {
        return jsonResponse(200, {
          id: igUserId,
          followers_count: 248,
          media_count: 46,
          follows_count: 12,
          username: "__foodgame",
          name: "Food Game",
          media: {
            data: [
              {
                id: "ig-post-1",
                like_count: 21,
                comments_count: 7,
                permalink: "https://instagram.com/p/1",
                timestamp: "2026-08-27T12:00:00+0000",
              },
              { id: "ig-post-2", like_count: 5, comments_count: 0 },
            ],
          },
        });
      }
      if (url.includes(`/${igUserId}/insights`)) {
        return jsonResponse(200, { data: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaInstagramSnapshot({
      accessToken,
      igUserId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    const meta = snapshot.sourceMetadata as Record<string, number | boolean | string | null>;
    // Future-proofing: per-post engagement is out of scope for M4
    // but the most recent post's id + counts land on the row so a
    // future per-post job can read them without an extra call.
    expect(meta.latestPostId).toBe("ig-post-1");
    expect(meta.latestPostLikeCount).toBe(21);
    expect(meta.latestPostCommentCount).toBe(7);
  });

  it("does not write latestPostId when the response has no media data (older Meta responses)", async () => {
    const accessToken = "ig-access-token";
    const igUserId = "17841234567890123";
    globalThis.fetch = (async (url: string) => {
      if (url.includes(`/${igUserId}?`)) {
        return jsonResponse(200, {
          id: igUserId,
          followers_count: 248,
          media_count: 46,
          follows_count: 12,
        });
      }
      if (url.includes(`/${igUserId}/insights`)) {
        return jsonResponse(200, { data: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaInstagramSnapshot({
      accessToken,
      igUserId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    const meta = snapshot.sourceMetadata as Record<string, number | boolean | string | null>;
    expect(meta.latestPostId).toBeUndefined();
  });

  it("writes appUsageCallCount when X-App-Usage is on the IG insights call", async () => {
    const accessToken = "ig-access-token";
    const igUserId = "17841234567890123";
    const app = { call_count: 7, total_cputime: 1, total_time: 2 };
    globalThis.fetch = (async (url: string) => {
      if (url.includes(`/${igUserId}?`)) {
        return jsonResponse(200, {
          id: igUserId,
          followers_count: 248,
          media_count: 46,
          follows_count: 12,
        });
      }
      if (url.includes(`/${igUserId}/insights`)) {
        return jsonResponse(200, { data: [] }, { "x-app-usage": JSON.stringify(app) });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchMetaInstagramSnapshot({
      accessToken,
      igUserId,
      apiVersion: "v25.0",
      requestIdHint: "test-req",
    });
    const meta = snapshot.sourceMetadata as Record<string, number | boolean | string | null>;
    expect(meta.appUsageCallCount).toBe(7);
    expect(meta.appUsageCpu).toBe(1);
    expect(meta.appUsageTime).toBe(2);
  });
});
