import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { fetchStorageObjectMock } = vi.hoisted(() => ({ fetchStorageObjectMock: vi.fn() }));
vi.mock("@/lib/storage/read-service", () => ({ fetchStorageObject: fetchStorageObjectMock }));

import { publicShareAssetResponse } from "@/features/media/public-share-response.server";

const row = {
  asset: { agencyId: "agency-1", ownerWorkspaceId: "workspace-1", title: "A & B" },
  object: { id: "object-1", mimeType: "image/png", originalName: "source.png" },
};

function remote(headers: Record<string, string> = {}, status = 200) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    }),
    status,
    headers: new Headers(headers),
  };
}

describe("publicShareAssetResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchStorageObjectMock.mockResolvedValue(remote());
  });

  it("proxies range requests with no-store and restrictive security headers", async () => {
    fetchStorageObjectMock.mockResolvedValue(
      remote({ "content-range": "bytes 0-2/8", "content-length": "3" }, 206),
    );
    const req = new NextRequest("https://planner.test/share?download=1", {
      headers: { Range: "bytes=0-2" },
    });

    const response = await publicShareAssetResponse(req, row);

    expect(fetchStorageObjectMock).toHaveBeenCalledWith({
      agencyId: "agency-1",
      workspaceId: "workspace-1",
      objectId: "object-1",
      expiresInSeconds: 60,
      headers: { Range: "bytes=0-2" },
    });
    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-range")).toBe("bytes 0-2/8");
    expect(response?.headers.get("content-length")).toBe("3");
    expect(response?.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response?.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response?.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(response?.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(response?.headers.get("content-disposition")).toMatch(/^attachment; filename\*=UTF-8''/);
  });

  it("returns null when the storage object is unavailable", async () => {
    fetchStorageObjectMock.mockResolvedValue(null);

    const response = await publicShareAssetResponse(
      new NextRequest("https://planner.test/share"),
      row,
    );

    expect(response).toBeNull();
  });
});
