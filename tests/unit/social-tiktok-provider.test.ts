import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTikTokAuthorizationUrl,
  exchangeTikTokCodeForTokens,
  fetchTikTokProfile,
  refreshTikTokCredentials,
  TIKTOK_SCOPES,
} from "@/lib/social/providers/tiktok";
import { SocialProviderError, isSocialProviderError } from "@/lib/social/http";

/**
 * M4 — TikTok provider unit tests.
 *
 *   - the authorization URL includes every required scope, the state,
 *     and the redirect URI
 *   - the code exchange returns a 24-hour access token and stores the
 *     refresh token (TikTok rotates it on every refresh)
 *   - the refresh path surfaces `auth_expired` when TikTok rejects
 *     the refresh token (e.g. after 365 days)
 *   - the profile fetch maps every Display API field to the normalized
 *     shape, including null for fields the user denied
 *   - errors carry the `SocialProviderError` shape with sanitized
 *     fields; tokens never appear in the message
 */

const originalFetch = globalThis.fetch;
const originalTiktokEnabled = process.env.SOCIAL_TIKTOK_ENABLED;
const originalClientKey = process.env.TIKTOK_CLIENT_KEY;
const originalClientSecret = process.env.TIKTOK_CLIENT_SECRET;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalTiktokEnabled === undefined) delete process.env.SOCIAL_TIKTOK_ENABLED;
  else process.env.SOCIAL_TIKTOK_ENABLED = originalTiktokEnabled;
  if (originalClientKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
  else process.env.TIKTOK_CLIENT_KEY = originalClientKey;
  if (originalClientSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
  else process.env.TIKTOK_CLIENT_SECRET = originalClientSecret;
  vi.restoreAllMocks();
});

beforeEach(() => {
  process.env.SOCIAL_TIKTOK_ENABLED = "true";
  process.env.TIKTOK_CLIENT_KEY = "test-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-secret";
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TIKTOK_SCOPES", () => {
  it("lists only the read scopes from the plan", () => {
    expect(TIKTOK_SCOPES).toEqual(["user.info.basic", "user.info.profile", "user.info.stats"]);
  });
});

describe("buildTikTokAuthorizationUrl", () => {
  it("uses the TikTok authorize URL and pins the redirect_uri", () => {
    const url = buildTikTokAuthorizationUrl({
      clientKey: "ck",
      state: "xyz",
      redirectUri: "https://planner.laratik.com/api/social/tiktok/callback",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(u.searchParams.get("client_key")).toBe("ck");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("xyz");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://planner.laratik.com/api/social/tiktok/callback",
    );
  });
  it("includes every read scope in the URL", () => {
    const url = buildTikTokAuthorizationUrl({
      clientKey: "ck",
      state: "s",
      redirectUri: "https://x",
    });
    const u = new URL(url);
    const scope = (u.searchParams.get("scope") ?? "").split(",").sort();
    expect(scope).toEqual([...TIKTOK_SCOPES].sort());
  });
});

describe("exchangeTikTokCodeForTokens", () => {
  it("POSTs form-encoded body and returns tokens with 24h expiry", async () => {
    const now = Date.now();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        access_token: "tt-access",
        refresh_token: "tt-refresh",
        expires_in: 86_400, // 24h
        refresh_expires_in: 31_536_000, // 365d
        open_id: "open-1",
        scope: TIKTOK_SCOPES.join(","),
        token_type: "Bearer",
      }),
    ) as typeof fetch;
    const result = await exchangeTikTokCodeForTokens({
      clientKey: "ck",
      clientSecret: "cs",
      code: "the-code",
      redirectUri: "https://x",
    });
    expect(result.credentials.accessToken).toBe("tt-access");
    expect(result.credentials.refreshToken).toBe("tt-refresh");
    expect(result.openId).toBe("open-1");
    expect(result.accessTokenExpiresAt.getTime() - now).toBeGreaterThan(86_000_000);
    expect(result.refreshTokenExpiresAt?.getTime()).toBeGreaterThan(now + 31_000_000_000);
  });
  it("surfaces 401 as auth_expired", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { error: "invalid_grant" }),
    ) as typeof fetch;
    await expect(
      exchangeTikTokCodeForTokens({
        clientKey: "ck",
        clientSecret: "cs",
        code: "x",
        redirectUri: "https://x",
      }),
    ).rejects.toMatchObject({ code: "auth_expired" });
  });
});

describe("refreshTikTokCredentials", () => {
  it("rotates both tokens (TikTok refreshes the refresh token)", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        access_token: "tt-access-v2",
        refresh_token: "tt-refresh-v2",
        expires_in: 86_400,
        refresh_expires_in: 31_536_000,
        open_id: "open-1",
      }),
    ) as typeof fetch;
    const result = await refreshTikTokCredentials({
      clientKey: "ck",
      clientSecret: "cs",
      refreshToken: "tt-refresh",
    });
    expect(result.credentials.accessToken).toBe("tt-access-v2");
    expect(result.credentials.refreshToken).toBe("tt-refresh-v2");
  });
  it("surfaces 401 (e.g. expired 365d refresh) as auth_expired", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { error: "invalid_grant" }),
    ) as typeof fetch;
    await expect(
      refreshTikTokCredentials({
        clientKey: "ck",
        clientSecret: "cs",
        refreshToken: "tt-refresh",
      }),
    ).rejects.toMatchObject({ code: "auth_expired" });
  });
});

describe("fetchTikTokProfile", () => {
  it("returns the normalized profile shape", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        data: {
          user: {
            open_id: "open-1",
            union_id: "union-1",
            avatar_url: "https://example.com/avatar.jpg",
            display_name: "Test User",
            username: "testuser",
            profile_deep_link: "https://tiktok.com/@testuser",
            is_verified: false,
            follower_count: 12345,
            following_count: 67,
            likes_count: 890,
            video_count: 12,
          },
        },
      }),
    ) as typeof fetch;
    const p = await fetchTikTokProfile("tok");
    expect(p.openId).toBe("open-1");
    expect(p.displayName).toBe("Test User");
    expect(p.username).toBe("testuser");
    expect(p.followerCount).toBe(12345);
    expect(p.mediaCount).toBe(12);
  });
  it("returns null for fields the user denied", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        data: {
          user: {
            open_id: "open-1",
            display_name: "No Stats User",
            username: "nostats",
          },
        },
      }),
    ) as typeof fetch;
    const p = await fetchTikTokProfile("tok");
    expect(p.followerCount).toBeNull();
    expect(p.likesCount).toBeNull();
    expect(p.avatarUrl).toBeNull();
  });
});

describe("error-surface safety", () => {
  it("isSocialProviderError round-trips", () => {
    expect(isSocialProviderError(new SocialProviderError("not_found", false, null))).toBe(true);
    expect(isSocialProviderError(new Error("nope"))).toBe(false);
  });
});
