import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaAssetTile } from "@/components/media/media-asset-tile";
import { MediaViewer } from "@/components/media/media-viewer";
import type { MediaLibraryRow } from "@/components/media/media-asset-shared";

// `MediaAssetActions` (rendered on every tile) calls `useRouter`, which needs a
// mounted app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

function row(overrides: Partial<MediaLibraryRow> = {}): MediaLibraryRow {
  const base = {
    asset: {
      id: "asset-1",
      agencyId: "agency-1",
      ownerWorkspaceId: "workspace-1",
      title: "Launch reel",
      altText: null,
      status: "ready",
      sourceType: "browser",
      visibility: "workspace",
      folderId: null,
    },
    object: {
      id: "object-1",
      originalName: "reel.mp4",
      mimeType: "video/mp4",
      byteSize: 2048,
      width: 1080,
      height: 1920,
      kind: "video",
      status: "ready",
      previewStorageObjectId: "preview-1",
    },
    workspaceName: "Acme",
    folder: null,
    relatedContentItems: [],
    signedPreviewUrl: null,
  };
  return { ...base, ...overrides } as unknown as MediaLibraryRow;
}

function renderTile(rows: MediaLibraryRow[]) {
  return render(
    <MediaViewer
      rows={rows}
      folderOptionsById={[]}
      managerWorkspaceIds={["workspace-1"]}
      totalLabel="1 asset"
    >
      {rows.map((r, index) => (
        <MediaAssetTile key={r.asset.id} row={r} index={index} folderOptions={[]} />
      ))}
    </MediaViewer>,
  );
}

describe("MediaAssetTile", () => {
  it("gives the tile the asset's own aspect ratio instead of a fixed 4:3 box", () => {
    const { container } = renderTile([row()]);
    const button = container.querySelector("button");
    // 1080x1920 = 0.5625. A fixed aspect-[4/3] (1.333) is what used to
    // centre-crop every vertical reel.
    expect(button?.style.aspectRatio).toBe("0.5625");
  });

  it("never mounts a video element for a video asset", () => {
    const { container } = renderTile([row()]);
    // The old grid mounted one <video> per video row, so a mixed page opened up
    // to 24 players, each with its own range request and controls.
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders the image with the signed edge URL when one was issued", () => {
    const imageRow = row({
      object: {
        id: "object-1",
        originalName: "a.png",
        mimeType: "image/png",
        byteSize: 10,
        width: 1000,
        height: 500,
        durationMs: null,
        kind: "image",
        status: "ready",
        previewStorageObjectId: "preview-1",
      },
      signedPreviewUrl: "https://edge.example/p.webp",
    });
    renderTile([imageRow]);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://edge.example/p.webp");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("eager-loads only the prioritised tiles", () => {
    const first = row({
      object: {
        id: "o1",
        originalName: "a.png",
        mimeType: "image/png",
        byteSize: 10,
        width: 100,
        height: 100,
        durationMs: null,
        kind: "image",
        status: "ready",
        previewStorageObjectId: "p1",
      },
    });
    const { rerender } = render(
      <MediaViewer rows={[first]} folderOptionsById={[]} managerWorkspaceIds={[]} totalLabel="">
        <MediaAssetTile row={first} index={0} folderOptions={[]} priority />
      </MediaViewer>,
    );
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");

    rerender(
      <MediaViewer rows={[first]} folderOptionsById={[]} managerWorkspaceIds={[]} totalLabel="">
        <MediaAssetTile row={first} index={9} folderOptions={[]} />
      </MediaViewer>,
    );
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });

  it("opens the lightbox when the tile is activated", async () => {
    const user = userEvent.setup();
    renderTile([row()]);
    await user.click(screen.getByRole("button", { name: /launch reel/i }));
    expect(await screen.findByTestId("media-viewer")).toBeInTheDocument();
  });

  it("shows a status badge and hides the selection checkbox for a non-ready asset", () => {
    const processing = row({
      asset: {
        ...row().asset,
        id: "asset-2",
        title: "Pending upload",
        status: "processing",
      },
      object: {
        id: "object-2",
        originalName: "b.png",
        mimeType: "image/png",
        byteSize: 10,
        width: 100,
        height: 100,
        durationMs: null,
        kind: "image",
        status: "ready",
        previewStorageObjectId: null,
      },
    });
    const { container } = renderTile([processing]);
    expect(screen.getByTestId("media-tile-status")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
