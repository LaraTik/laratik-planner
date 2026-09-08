import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliverySection } from "@/app/(app)/app/w/[slug]/planning/[id]/delivery-section";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  submitDeliveryAction: vi.fn(),
}));
vi.mock("@/components/media/media-upload-form", () => ({
  MediaUploadForm: () => null,
}));

const baseProps = {
  workspaceId: "00000000-0000-0000-0000-000000000001",
  workspaceName: "Northstar Coffee",
  workspaceSlug: "northstar",
  contentItemId: "00000000-0000-0000-0000-000000000002",
  contentStatus: "in_design",
  isDesigner: true,
  isManager: false,
  deliveries: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeliverySection media search", () => {
  it("does not render the existing media library until the user searches", async () => {
    const user = userEvent.setup();
    render(
      <DeliverySection
        {...baseProps}
        mediaAssets={[
          {
            id: "asset-existing",
            title: "Existing hero image",
            kind: "image",
            byteSize: 1200,
            workspaceName: "Northstar Coffee",
            visibility: "workspace",
          },
        ]}
      />,
    );

    expect(screen.queryByText("Existing hero image")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search media library" }));
    expect(screen.getByLabelText("Search the media library")).toBeInTheDocument();
  });

  it("loads matching image and video assets after an explicit search", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            assets: [
              {
                id: "asset-image",
                title: "Hero image",
                kind: "image",
                mimeType: "image/png",
                byteSize: 1200,
                workspaceName: "Northstar Coffee",
                visibility: "workspace",
              },
              {
                id: "asset-video",
                title: "Hero reel",
                kind: "video",
                mimeType: "video/mp4",
                byteSize: 2400,
                workspaceName: "Northstar Coffee",
                visibility: "workspace",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<DeliverySection {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Search media library" }));
    await user.type(screen.getByLabelText("Search the media library"), "hero");
    await user.click(screen.getByRole("button", { name: /^Search$/ }));

    await waitFor(() => {
      expect(screen.getByText("Hero image")).toBeInTheDocument();
      expect(screen.getByText("Hero reel")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/media/assets?workspaceId="),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(screen.getByRole("img", { name: "Hero image" })).toBeInTheDocument();
    expect(document.querySelector('video[aria-label="Hero reel"]')).toBeInTheDocument();
  });
});
