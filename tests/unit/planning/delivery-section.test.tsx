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
  it("preselects only the immediately previous delivery version assets", async () => {
    const user = userEvent.setup();
    render(
      <DeliverySection
        {...baseProps}
        deliveries={[
          {
            id: "delivery-v1",
            versionNumber: 1,
            description: "V1",
            designerNote: null,
            submittedAt: "2026-08-25T10:00:00.000Z",
            isFinalApproved: false,
            submittedBy: { id: "u-1", name: "Designer" },
            links: [
              {
                id: "link-a",
                provider: "other",
                label: "Asset A",
                url: "/api/deliveries/assets/link-a",
                isPreview: true,
                mediaAssetId: "asset-a",
                mediaKind: "image",
              },
              {
                id: "link-b",
                provider: "other",
                label: "Asset B",
                url: "/api/deliveries/assets/link-b",
                isPreview: true,
                mediaAssetId: "asset-b",
                mediaKind: "image",
              },
            ],
          },
        ]}
        mediaAssets={["asset-a", "asset-b", "asset-c"].map((id) => ({
          id,
          title: id,
          kind: "image",
          byteSize: 100,
          workspaceName: "Northstar Coffee",
          visibility: "workspace",
        }))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Submit new version" }));
    expect(screen.getByRole("checkbox", { name: /asset-a/i })).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect(screen.getByRole("checkbox", { name: /asset-b/i })).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect(screen.getByRole("checkbox", { name: /asset-c/i })).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(screen.getByText("New in V2")).toBeInTheDocument();
  });

  it("explains why assets are not actionable while an idea is still a draft", () => {
    render(
      <DeliverySection {...baseProps} contentStatus="draft" isDesigner={false} isManager={false} />,
    );

    expect(screen.getByTestId("delivery-not-ready")).toBeInTheDocument();
    expect(screen.getByText("Assets are waiting for an earlier step")).toBeInTheDocument();
    expect(screen.queryByTestId("delivery-submit-form")).not.toBeInTheDocument();
  });

  it("shows media already attached to the post before a search", async () => {
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

    expect(screen.getByText("Existing hero image")).toBeInTheDocument();
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
