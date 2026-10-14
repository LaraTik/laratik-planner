import { describe, expect, it } from "vitest";
import {
  assetAspectRatio,
  mediaAssetSrc,
  resolveFolderPath,
} from "@/components/media/media-asset-shared";
import type { MediaLibraryRow } from "@/components/media/media-asset-shared";

/**
 * Minimal row factory. The library row type is derived from a Drizzle query,
 * so building a literal for it in a test means asserting against a large
 * surface. These tests only care about the columns the helpers read, which is
 * the same set the helpers document.
 */
function row(overrides: {
  width?: number | null;
  height?: number | null;
  previewStorageObjectId?: string | null;
  signedPreviewUrl?: string | null;
  id?: string;
  folderId?: string | null;
}): MediaLibraryRow {
  const {
    width = 1080,
    height = 1080,
    previewStorageObjectId = "preview-1",
    signedPreviewUrl = null,
    id = "asset-1",
    folderId = null,
  } = overrides;
  return {
    asset: {
      id,
      agencyId: "agency-1",
      ownerWorkspaceId: "workspace-1",
      title: "Asset",
      altText: null,
      status: "ready",
      sourceType: "browser",
      visibility: "workspace",
      folderId,
    },
    object: {
      id: "object-1",
      originalName: "asset.png",
      mimeType: "image/png",
      byteSize: 1024,
      width,
      height,
      kind: "image",
      status: "ready",
      previewStorageObjectId,
    },
    workspaceName: "Acme",
    folder: null,
    relatedContentItems: [],
    signedPreviewUrl,
  } as unknown as MediaLibraryRow;
}

describe("assetAspectRatio", () => {
  it("returns the asset's own ratio so the grid never has to crop it", () => {
    // A 9:16 reel. Under the old card grid this was forced into aspect-[4/3]
    // with object-cover, which centre-cropped it to a horizontal sliver.
    expect(assetAspectRatio(row({ width: 1080, height: 1920 }))).toBeCloseTo(0.5625, 4);
    expect(assetAspectRatio(row({ width: 1920, height: 1080 }))).toBeCloseTo(1.7778, 4);
  });

  it("preserves square assets exactly", () => {
    expect(assetAspectRatio(row({ width: 800, height: 800 }))).toBe(1);
  });

  it("falls back to 4:3 when dimensions are missing or unusable", () => {
    expect(assetAspectRatio(row({ width: null, height: null }))).toBeCloseTo(4 / 3, 4);
    expect(assetAspectRatio(row({ width: 0, height: 100 }))).toBeCloseTo(4 / 3, 4);
    expect(assetAspectRatio(row({ width: 100, height: 0 }))).toBeCloseTo(4 / 3, 4);
  });

  it("clamps extreme ratios so one panorama cannot break the grid rhythm", () => {
    // A 4000x50 panorama would otherwise render a 3px sliver.
    expect(assetAspectRatio(row({ width: 4000, height: 50 }))).toBe(2);
    // A 50x4000 ultra-tall strip would otherwise render a 2000px column.
    expect(assetAspectRatio(row({ width: 50, height: 4000 }))).toBe(0.5);
  });

  it("keeps 9:16 inside the clamp range so vertical stories are never cropped", () => {
    expect(assetAspectRatio(row({ width: 1080, height: 1920 }))).toBeGreaterThan(0.5);
  });
});

describe("mediaAssetSrc", () => {
  it("prefers the signed edge URL when the server issued one", () => {
    const src = mediaAssetSrc(row({ signedPreviewUrl: "https://edge.example/preview.webp" }));
    expect(src).toBe("https://edge.example/preview.webp");
  });

  it("falls back to the preview proxy when no signed URL exists", () => {
    expect(mediaAssetSrc(row({ previewStorageObjectId: "preview-1" }))).toBe(
      "/api/media/assets/asset-1/preview",
    );
  });

  it("falls back to the original object for legacy assets with no preview", () => {
    expect(mediaAssetSrc(row({ previewStorageObjectId: null }))).toBe("/api/media/assets/asset-1");
  });

  it("URL-encodes the asset id", () => {
    const encoded = mediaAssetSrc(row({ id: "a/b?c", previewStorageObjectId: null }));
    expect(encoded).toBe("/api/media/assets/a%2Fb%3Fc");
  });
});

describe("resolveFolderPath", () => {
  const folders = [
    { id: "root", name: "Brand", parentId: null },
    { id: "child", name: "Logos", parentId: "root" },
    { id: "grand", name: "2026", parentId: "child" },
  ];

  it("builds an ancestor chain path", () => {
    expect(resolveFolderPath("grand", folders, "Unfiled")).toBe("Brand / Logos / 2026");
  });

  it("returns the unfiled label when the asset has no folder", () => {
    expect(resolveFolderPath(null, folders, "Unfiled")).toBe("Unfiled");
  });

  it("returns the unfiled label for a folder id that is not in the list", () => {
    expect(resolveFolderPath("missing", folders, "Unfiled")).toBe("Unfiled");
  });

  it("terminates on a cycle instead of looping forever", () => {
    const cyclic = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];
    expect(resolveFolderPath("a", cyclic, "Unfiled")).toBe("B / A");
  });
});
