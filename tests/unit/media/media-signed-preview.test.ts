import { describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the "images do not display correctly" defect.
 *
 * The agency-wide library (`/app/media`) rendered the same grid as the
 * workspace library but never called the preview signer, so every thumbnail
 * fell back to `/api/media/assets/<id>/preview` and streamed through the
 * Next.js Node process instead of Cloudflare's edge. The workspace route
 * signed; the agency route did not. Both now go through
 * `attachSignedPreviewUrls`, and this test pins the behaviour that was
 * silently missing.
 */
const getSignedPreviewUrls = vi.fn(async () => new Map<string, string>());

vi.mock("@/lib/media/thumbnails", () => ({
  getSignedPreviewUrls: (...args: unknown[]) =>
    (getSignedPreviewUrls as unknown as (...a: unknown[]) => unknown)(...args),
}));

const { attachSignedPreviewUrls } = await import("@/lib/media/signed-preview");

function row(id: string, previewStorageObjectId: string | null) {
  return {
    asset: { id, agencyId: "agency-1", ownerWorkspaceId: "workspace-1" },
    object: { previewStorageObjectId },
  };
}

describe("attachSignedPreviewUrls", () => {
  it("attaches the signed edge URL to each row that has one", async () => {
    getSignedPreviewUrls.mockResolvedValueOnce(new Map([["a-1", "https://edge.example/a-1.webp"]]));

    const result = await attachSignedPreviewUrls([
      row("a-1", "preview-1"),
      row("a-2", "preview-2"),
    ]);

    expect(result[0]?.signedPreviewUrl).toBe("https://edge.example/a-1.webp");
    // No signed URL for a-2 (e.g. the batch signer failed for that object):
    // the row must resolve to null so the component falls back to the proxy,
    // never to a stale or wrong URL.
    expect(result[1]?.signedPreviewUrl).toBeNull();
  });

  it("passes each row's agency, owner workspace and preview object to the signer", async () => {
    getSignedPreviewUrls.mockResolvedValueOnce(new Map());

    await attachSignedPreviewUrls([row("a-1", "preview-9")]);

    expect(getSignedPreviewUrls).toHaveBeenCalledWith([
      {
        assetId: "a-1",
        agencyId: "agency-1",
        workspaceId: "workspace-1",
        previewStorageObjectId: "preview-9",
      },
    ]);
  });

  it("returns null signed URLs when the signer returns nothing at all", async () => {
    getSignedPreviewUrls.mockResolvedValueOnce(new Map());

    const result = await attachSignedPreviewUrls([row("a-1", "preview-1")]);

    expect(result[0]?.signedPreviewUrl).toBeNull();
  });

  it("does not call the signer for an empty page", async () => {
    getSignedPreviewUrls.mockClear();

    const result = await attachSignedPreviewUrls([]);

    expect(result).toEqual([]);
    expect(getSignedPreviewUrls).not.toHaveBeenCalled();
  });

  it("leaves assets without a preview variant null so they use the proxy fallback", async () => {
    getSignedPreviewUrls.mockResolvedValueOnce(new Map());

    const result = await attachSignedPreviewUrls([row("a-1", null)]);

    expect(result[0]?.signedPreviewUrl).toBeNull();
  });

  it("preserves every original row column", async () => {
    getSignedPreviewUrls.mockResolvedValueOnce(new Map([["a-1", "https://edge/x.webp"]]));

    const result = await attachSignedPreviewUrls([
      {
        ...row("a-1", "preview-1"),
        workspaceName: "Acme",
        object: { previewStorageObjectId: "preview-1", kind: "image" },
      },
    ]);

    expect(result[0]?.workspaceName).toBe("Acme");
    expect(result[0]?.object.kind).toBe("image");
    expect(result[0]?.signedPreviewUrl).toBe("https://edge/x.webp");
  });
});
