import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const activeMediaShareMock = vi.fn();
const createPublicMediaShareMock = vi.fn();
const revokePublicMediaShareMock = vi.fn();

const envState = {
  AUTH_URL: "https://planner.laratik.com",
  NEXT_PUBLIC_APP_URL: "https://planner.laratik.com",
  NODE_ENV: "production",
};

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/features/media/server", () => ({
  activeMediaShareForActor: activeMediaShareMock,
  createPublicMediaShare: createPublicMediaShareMock,
  revokePublicMediaShare: revokePublicMediaShareMock,
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
  return import("@/app/api/media/assets/[id]/public-link/route");
}

function request(method: string, origin = "http://0.0.0.0:3000") {
  return new NextRequest(origin + "/api/media/assets/asset-1/public-link", { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  envState.AUTH_URL = "https://planner.laratik.com";
  envState.NEXT_PUBLIC_APP_URL = "https://planner.laratik.com";
  envState.NODE_ENV = "production";
  authMock.mockResolvedValue({ user: { id: "manager-1" } });
  activeMediaShareMock.mockResolvedValue({
    asset: { id: "asset-1" },
    share: { id: "share-1", expiresAt: new Date("2026-10-21T00:00:00.000Z") },
  });
  createPublicMediaShareMock.mockResolvedValue({
    token: "safe-token",
    expiresAt: new Date("2026-10-21T00:00:00.000Z"),
  });
  revokePublicMediaShareMock.mockResolvedValue({ revoked: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("single media public-link route", () => {
  it("keeps the existing no-store active-share response", async () => {
    const { GET } = await loadRoute();
    const response = await GET(request("GET"), { params: Promise.resolve({ id: "asset-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({
      active: true,
      expiresAt: "2026-10-21T00:00:00.000Z",
    });
    expect(activeMediaShareMock).toHaveBeenCalledWith({ id: "manager-1" }, "asset-1");
  });

  it("keeps the canonical public origin and response shape when creating a link", async () => {
    const { POST } = await loadRoute();
    const response = await POST(request("POST"), { params: Promise.resolve({ id: "asset-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({
      url: "https://planner.laratik.com/share/media/safe-token",
      expiresAt: "2026-10-21T00:00:00.000Z",
    });
    expect(createPublicMediaShareMock).toHaveBeenCalledWith({ id: "manager-1" }, "asset-1");
  });

  it("keeps auth and permission failures at the route boundary", async () => {
    const { DELETE, GET } = await loadRoute();
    authMock.mockResolvedValueOnce(null);
    const unauthenticated = await GET(request("GET"), {
      params: Promise.resolve({ id: "asset-1" }),
    });
    expect(unauthenticated.status).toBe(401);

    const deniedError = new (await import("@/features/media/server")).MediaPermissionError(
      "Only workspace managers can manage media.",
    );
    activeMediaShareMock.mockRejectedValueOnce(deniedError);
    const denied = await GET(request("GET"), { params: Promise.resolve({ id: "asset-1" }) });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Only workspace managers can manage media." });

    const revoked = await DELETE(request("DELETE"), {
      params: Promise.resolve({ id: "asset-1" }),
    });
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ revoked: true });
  });
});
