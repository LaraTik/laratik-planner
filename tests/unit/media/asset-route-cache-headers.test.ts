import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PR 1 / Tier 1 (perf/media): `/api/media/assets/[id]` cache headers.
 *
 * Every authorized object read is no-store because a browser's cached
 * cookie value does not change when workspace membership or visibility is
 * revoked. Immutable preview variants can use a separate cache policy.
 */

const authMock = vi.fn();
const mediaAssetForActorMock = vi.fn();
const fetchStorageObjectMock = vi.fn();

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: vi.fn() }));
vi.mock("@/features/media/server", () => ({
  mediaAssetForActor: mediaAssetForActorMock,
  MediaPermissionError: class MediaPermissionError extends Error {},
  moveMediaAsset: vi.fn(),
  renameMediaAsset: vi.fn(),
  restoreMediaAsset: vi.fn(),
  setMediaAssetVisibility: vi.fn(),
  trashMediaAsset: vi.fn(),
}));
vi.mock("@/lib/storage/read-service", () => ({
  fetchStorageObject: fetchStorageObjectMock,
}));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/media/assets/[id]/route");
}

const fakeAsset = {
  asset: {
    id: "asset-1",
    title: "Hero",
    status: "ready",
    agencyId: "agency-1",
    ownerWorkspaceId: "ws-1",
  },
  object: {
    id: "obj-1",
    mimeType: "image/png",
    originalName: "hero.png",
  },
};

function fakeRemote(headers: Record<string, string> = {}) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
        controller.close();
      },
    }),
    status: 200,
    headers: new Headers(headers),
  };
}

beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  mediaAssetForActorMock.mockResolvedValue(fakeAsset);
  fetchStorageObjectMock.mockResolvedValue(fakeRemote());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/media/assets/[id] — cache policy", () => {
  it("does not cache previews after authorization", async () => {
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toBeNull();
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("keeps downloads uncached and sets an attachment filename", async () => {
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1?download=1");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toBeNull();
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; /);
  });

  it("passes through the R2 ETag so the browser can revalidate cheaply", async () => {
    fetchStorageObjectMock.mockResolvedValue(
      fakeRemote({
        etag: '"abc123"',
        "content-length": "12345",
        "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT",
      }),
    );
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.headers.get("etag")).toBe('"abc123"');
    expect(res.headers.get("content-length")).toBe("12345");
    expect(res.headers.get("last-modified")).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
  });

  it("returns 401 without a session and never reaches R2", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.status).toBe(401);
    expect(fetchStorageObjectMock).not.toHaveBeenCalled();
  });
});
