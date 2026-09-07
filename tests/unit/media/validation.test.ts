import { beforeEach, describe, expect, it, vi } from "vitest";

const readUrlMock = vi.hoisted(() => vi.fn(async () => "https://signed.example/media"));

vi.mock("@/lib/storage/read-service", () => ({
  createStorageObjectReadUrl: readUrlMock,
}));

const { validateStoredMediaObject } = await import("@/lib/media/validation");

describe("stored media validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    readUrlMock.mockResolvedValue("https://signed.example/media");
  });

  it("reads only a bounded prefix and accepts a matching signature", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
          status: 206,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      validateStoredMediaObject({
        agencyId: "agency-1",
        workspaceId: "workspace-1",
        objectId: "object-1",
        contentType: "image/png",
      }),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://signed.example/media",
      expect.objectContaining({ headers: { Range: "bytes=0-65535" } }),
    );
  });

  it("returns image dimensions when the bounded prefix includes the header", async () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    const pngView = new DataView(png.buffer);
    pngView.setUint32(16, 1200);
    pngView.setUint32(20, 630);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(png, { status: 206 })),
    );

    await expect(
      validateStoredMediaObject({
        agencyId: "agency-1",
        workspaceId: "workspace-1",
        objectId: "object-1",
        contentType: "image/png",
      }),
    ).resolves.toEqual({ width: 1200, height: 630 });
  });

  it("rejects content whose bytes do not match the declared type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new TextEncoder().encode("not a png"), { status: 206 })),
    );

    await expect(
      validateStoredMediaObject({
        agencyId: "agency-1",
        workspaceId: "workspace-1",
        objectId: "object-1",
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("keeps transient storage failures retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await expect(
      validateStoredMediaObject({
        agencyId: "agency-1",
        workspaceId: "workspace-1",
        objectId: "object-1",
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
  });
});
