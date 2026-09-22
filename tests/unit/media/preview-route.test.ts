import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PR 2 / Tier 2 (perf/media): pinning the cache policy + auth gate
 * for `/api/media/assets/[id]/preview`.
 *
 * The route is the read path for the 480px WebP variant stored by
 * `src/lib/media/thumbnails.ts`. Its contract is intentionally narrow
 * — same shape as the full route's tests, just narrower:
 *
 *   - 401 without a session (the full route already pins this)
 *   - 404 when the asset has no preview variant (legacy asset OR
 *     a generator failure at upload time). 404 is indistinguishable
 *     from "asset not readable" to non-owners — that's intentional so
 *     a user without read access can't enumerate which assets have
 *     previews.
 *   - 200 + immutable cache headers when the preview exists and the
 *     caller can read the asset. The `Cache-Control: immutable`
 *     header is the load-bearing piece — the variant is content-
 *     addressed by its storage_object id, so the browser can skip
 *     revalidation entirely for the lifetime of the cache entry.
 *   - The route also forwards intrinsic width/height as
 *     `X-Preview-Width` / `X-Preview-Height` so the browser can
 *     reserve layout space before the bytes finish decoding.
 *
 * The actual byte stream and 502-on-R2-outage path are integration
 * concerns (tests/integration); this unit suite mocks the storage
 * adapter to stay hermetic.
 */

const authMock = vi.fn();
const fetchPreviewForActorMock = vi.fn();
const fetchStorageObjectMock = vi.fn();

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: vi.fn() }));
vi.mock("@/lib/media/thumbnails", () => ({
  fetchPreviewForActor: fetchPreviewForActorMock,
}));
vi.mock("@/lib/storage/read-service", () => ({
  fetchStorageObject: fetchStorageObjectMock,
}));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/media/assets/[id]/preview/route");
}

const fakePreview = {
  agencyId: "agency-1",
  workspaceId: "ws-1",
  objectId: "preview-obj-1",
  width: 480,
  height: 360,
  mimeType: "image/webp",
};

function fakeRemote(opts: { contentLength?: string; etag?: string } = {}) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0x52, 0x49, 0x46, 0x46]));
        controller.close();
      },
    }),
    status: 200,
    headers: new Headers({
      ...(opts.contentLength ? { "content-length": opts.contentLength } : {}),
      ...(opts.etag ? { etag: opts.etag } : {}),
    }),
  };
}

beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  fetchPreviewForActorMock.mockResolvedValue(fakePreview);
  fetchStorageObjectMock.mockResolvedValue(fakeRemote());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/media/assets/[id]/preview — cache policy", () => {
  it("returns max-age=86400, immutable + Vary: Cookie when the variant exists", async () => {
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1/preview");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400, immutable");
    expect(res.headers.get("Vary")).toBe("Cookie");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    // Content-Type must NOT include "no-store" — that would defeat the
    // whole point of the cache. We assert the negative here so a
    // future PR that adds `no-store` for safety reasons fails this
    // test and forces a re-think.
    expect(res.headers.get("Cache-Control")).not.toMatch(/no-store/);
  });

  it("forwards intrinsic dimensions as X-Preview-Width / X-Preview-Height", async () => {
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1/preview");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.headers.get("X-Preview-Width")).toBe("480");
    expect(res.headers.get("X-Preview-Height")).toBe("360");
  });

  it("passes through ETag and Content-Length from R2 for cheap revalidation", async () => {
    fetchStorageObjectMock.mockResolvedValue(fakeRemote({ contentLength: "12345", etag: '"v1"' }));
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1/preview");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.headers.get("etag")).toBe('"v1"');
    expect(res.headers.get("content-length")).toBe("12345");
  });

  it("omits X-Preview-Width / X-Preview-Height when the variant has no recorded dimensions", async () => {
    fetchPreviewForActorMock.mockResolvedValue({
      ...fakePreview,
      width: null,
      height: null,
    });
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1/preview");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.headers.get("X-Preview-Width")).toBeNull();
    expect(res.headers.get("X-Preview-Height")).toBeNull();
  });
});

describe("/api/media/assets/[id]/preview — 404 paths", () => {
  it("returns 404 when the asset has no preview variant (legacy asset)", async () => {
    fetchPreviewForActorMock.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1/preview");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.status).toBe(404);
    // We must NOT have tried to fetch bytes from R2 — the auth+lookup
    // gate is the only work a 404 should cost.
    expect(fetchStorageObjectMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the auth gate passes but R2 returns null", async () => {
    fetchStorageObjectMock.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1/preview");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.status).toBe(502);
  });
});

describe("/api/media/assets/[id]/preview — auth", () => {
  it("returns 401 without a session and never touches the storage layer", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const req = new NextRequest("http://localhost/api/media/assets/asset-1/preview");
    const res = await GET(req, { params: Promise.resolve({ id: "asset-1" }) });

    expect(res.status).toBe(401);
    expect(fetchPreviewForActorMock).not.toHaveBeenCalled();
    expect(fetchStorageObjectMock).not.toHaveBeenCalled();
  });
});
