import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression: a shared post's collection link must be usable by the recipient.
 *
 * The route used to build its share URL from `new URL(req.url).origin`. In
 * production the container runs behind Traefik with `HOSTNAME=0.0.0.0`
 * (see `Dockerfile`), so the host the route sees is the proxy-facing bind
 * address and every link came back as `http://0.0.0.0:3000/share/...` —
 * copy/paste, WhatsApp and the native share sheet all handed the recipient a
 * dead URL.
 *
 * The fix routes the origin through `resolvePublicAppOrigin`, the same helper
 * the single-asset public-link route already used. The resolver itself is
 * pinned in `public-app-origin.test.ts`; this suite pins that *this* route
 * actually calls it, which is the part that regressed.
 */

const authMock = vi.fn();
const createMediaShareCollectionMock = vi.fn();

const envState = {
  AUTH_URL: "https://planner.laratik.com",
  NEXT_PUBLIC_APP_URL: "https://planner.laratik.com",
  NODE_ENV: "production",
};

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/media/collection-service", () => ({
  createMediaShareCollection: createMediaShareCollectionMock,
}));
vi.mock("@/lib/media/service", () => ({
  MediaPermissionError: class MediaPermissionError extends Error {},
}));
vi.mock("@/lib/validation/env", () => ({
  get serverEnv() {
    return { AUTH_URL: envState.AUTH_URL, NODE_ENV: envState.NODE_ENV };
  },
  get clientEnv() {
    return { NEXT_PUBLIC_APP_URL: envState.NEXT_PUBLIC_APP_URL };
  },
}));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/media/share-collections/route");
}

function postRequest(origin: string) {
  return new NextRequest(`${origin}/api/media/share-collections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceType: "delivery_version",
      sourceId: "11111111-1111-4111-8111-111111111111",
      title: "Launch reel",
    }),
  });
}

async function shareUrlFor(origin: string) {
  const { POST } = await loadRoute();
  const res = await POST(postRequest(origin));
  expect(res.status).toBe(201);
  const payload = (await res.json()) as { url: string };
  return payload.url;
}

beforeEach(() => {
  // Clear call history (not implementations) so "never called" assertions
  // can't see calls made by an earlier test in this file.
  vi.clearAllMocks();
  envState.AUTH_URL = "https://planner.laratik.com";
  envState.NEXT_PUBLIC_APP_URL = "https://planner.laratik.com";
  envState.NODE_ENV = "production";
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  createMediaShareCollectionMock.mockResolvedValue({
    id: "collection-1",
    token: "tok-123",
    expiresAt: new Date("2026-10-14T00:00:00.000Z"),
  });
});

describe("POST /api/media/share-collections — share link origin", () => {
  it("builds the link on the configured public origin when the request host is proxy-facing", async () => {
    const url = await shareUrlFor("http://0.0.0.0:3000");

    expect(url).toBe("https://planner.laratik.com/share/media-collection/tok-123");
  });

  it("never emits a wildcard or loopback host in production", async () => {
    for (const origin of ["http://0.0.0.0:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
      const url = await shareUrlFor(origin);

      expect(new URL(url).hostname).toBe("planner.laratik.com");
      expect(url).not.toContain("0.0.0.0");
      expect(url).not.toContain("127.0.0.1");
      expect(url).not.toContain("[::1]");
    }
  });

  it("falls back to the canonical domain when the configured origins are unusable", async () => {
    envState.AUTH_URL = "http://0.0.0.0:3000";
    envState.NEXT_PUBLIC_APP_URL = "http://0.0.0.0:3000";

    expect(await shareUrlFor("http://0.0.0.0:3000")).toBe(
      "https://planner.laratik.com/share/media-collection/tok-123",
    );
  });

  it("keeps a local origin in development so the link is testable on localhost", async () => {
    envState.NODE_ENV = "development";
    envState.AUTH_URL = "http://localhost:3000";
    envState.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    expect(await shareUrlFor("http://localhost:3000")).toBe(
      "http://localhost:3000/share/media-collection/tok-123",
    );
  });
});

describe("POST /api/media/share-collections — auth", () => {
  it("returns 401 without a session and creates no share", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await loadRoute();

    const res = await POST(postRequest("http://0.0.0.0:3000"));

    expect(res.status).toBe(401);
    expect(createMediaShareCollectionMock).not.toHaveBeenCalled();
  });
});
