import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliverySection } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/delivery-section";
import {
  setMediaRequiredAction,
  submitDeliveryAction,
} from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions";

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions", () => ({
  submitDeliveryAction: vi.fn(),
  setMediaRequiredAction: vi.fn(),
}));
vi.mock("@/components/media/media-upload-form", () => ({
  MediaUploadForm: () => null,
}));
vi.mock("@/components/media/media-source-picker", () => ({
  // Capture the props so the test can assert the picker is rendered with
  // the canonical folder id forwarded — this is the contract that fixes
  // both reported bugs in the Delivery tab.
  MediaSourcePicker: (props: Record<string, unknown>) => (
    <div
      data-testid="mock-media-source-picker"
      data-content-item-id={typeof props.contentItemId === "string" ? props.contentItemId : ""}
      data-default-folder-id={
        typeof props.defaultFolderId === "string" ? props.defaultFolderId : ""
      }
      data-has-on-asset-ready={typeof props.onAssetReady === "function" ? "1" : "0"}
      data-initial-source={typeof props.initialSource === "string" ? props.initialSource : ""}
    >
      <div role="tab" aria-label="From device" />
      <div role="tab" aria-label="From link" />
    </div>
  ),
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

  it("shows the current version, review owner, and next step as a handoff", () => {
    render(
      <DeliverySection
        {...baseProps}
        approvalGates={["creative_internal", "creative_client"]}
        deliveries={[
          {
            id: "delivery-v2",
            versionNumber: 2,
            description: "Final cut",
            designerNote: "Review the opening frame.",
            submittedAt: "2026-08-25T10:00:00.000Z",
            isFinalApproved: false,
            submittedBy: { id: "u-1", name: "Designer" },
            links: [],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("delivery-review-handoff")).toHaveTextContent("Review handoff");
    expect(screen.getByTestId("delivery-review-handoff")).toHaveTextContent("V2");
    expect(screen.getByText("Internal and client reviewers")).toBeInTheDocument();
    expect(screen.getByText(/A reviewer approves this version/i)).toBeInTheDocument();
    expect(screen.getAllByText(/by Designer/i).length).toBeGreaterThan(0);
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
    const searchButton = screen.getByRole("button", { name: "Search media library" });
    expect(searchButton).toHaveAttribute("aria-expanded", "false");
    expect(searchButton).toHaveAttribute("aria-controls", "delivery-media-search-panel");
    await user.click(searchButton);
    expect(screen.getByRole("button", { name: "Close media search" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Search the media library")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close media search" }));
    expect(screen.getByRole("button", { name: "Search media library" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Search media library" })).toHaveFocus();
  });

  it("restores focus to the uploader trigger when the uploader closes", async () => {
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

    const uploadButton = screen.getByRole("button", { name: "Upload and attach media" });
    expect(uploadButton).toHaveAttribute("aria-expanded", "false");
    expect(uploadButton).toHaveAttribute("aria-controls", "delivery-media-uploader-panel");
    await user.click(uploadButton);
    expect(screen.getByRole("button", { name: "Hide uploader" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Hide uploader" }));
    expect(screen.getByRole("button", { name: "Upload and attach media" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Upload and attach media" })).toHaveFocus();
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

describe("DeliverySection uploader", () => {
  it("renders the media source picker with both device and link tabs when the uploader is open", async () => {
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

    await user.click(screen.getByRole("button", { name: "Upload and attach media" }));
    const picker = screen.getByTestId("mock-media-source-picker");
    expect(picker).toBeInTheDocument();
    expect(picker.getAttribute("data-initial-source")).toBe("device");
    expect(picker.getAttribute("data-content-item-id")).toBe(baseProps.contentItemId);
    // Both source tabs must be present so designers can switch from device
    // upload to link import without leaving the Delivery tab.
    expect(screen.getByRole("tab", { name: "From device" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "From link" })).toBeInTheDocument();
    expect(picker.getAttribute("data-has-on-asset-ready")).toBe("1");
  });

  it("forwards the canonical default folder id to the picker so uploads land in Posts / Format / YYYY / MM", async () => {
    const user = userEvent.setup();
    render(
      <DeliverySection
        {...baseProps}
        defaultFolderId="00000000-0000-0000-0000-000000000777"
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

    await user.click(screen.getByRole("button", { name: "Upload and attach media" }));
    const picker = screen.getByTestId("mock-media-source-picker");
    expect(picker.getAttribute("data-default-folder-id")).toBe(
      "00000000-0000-0000-0000-000000000777",
    );
  });

  it("syncs mediaAssets prop changes (link import via router.refresh) into the picker without remounting", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
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
            links: [],
          },
        ]}
        mediaAssets={[]}
      />,
    );

    // Open the new-version form. With an empty initial mediaAssets list,
    // the picker has no asset rows to render yet.
    await user.click(screen.getByRole("button", { name: "Submit new version" }));
    expect(screen.queryByText("Imported reel via link")).not.toBeInTheDocument();

    // Simulate router.refresh() handing down a fresh mediaAssets prop that
    // now includes the link-imported video. The picker MUST render the new
    // asset without a full page reload — that was the regression this
    // test pins: useState(mediaAssets) only initializes on mount, so
    // before the fix the link importer's refresh was a silent no-op for
    // any post whose picker was already mounted.
    rerender(
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
            links: [],
          },
        ]}
        mediaAssets={[
          {
            id: "asset-link-import",
            title: "Imported reel via link",
            kind: "video",
            mimeType: "video/mp4",
            byteSize: 5_000_000,
            workspaceName: "Northstar Coffee",
            visibility: "workspace",
          },
        ]}
      />,
    );

    const checkbox = await screen.findByRole("checkbox", { name: /imported reel via link/i });
    expect(checkbox).toHaveAttribute("data-state", "checked");
    expect(
      document.querySelector('video[aria-label="Imported reel via link"]'),
    ).toBeInTheDocument();
  });
});

describe("DeliverySection — optional media (caption-only posts)", () => {
  beforeEach(() => {
    vi.mocked(setMediaRequiredAction).mockResolvedValue({ ok: true });
  });

  it("blocks an empty submission while the post requires media", async () => {
    const user = userEvent.setup();
    render(<DeliverySection {...baseProps} mediaRequired canSetMediaRequired />);

    await user.click(screen.getByRole("button", { name: /submit for creative review/i }));

    expect(
      await screen.findByText("Select at least one stored Media Library asset."),
    ).toBeInTheDocument();
  });

  it("lets a designer submit with no assets once the post is marked assetless", async () => {
    const user = userEvent.setup();
    render(<DeliverySection {...baseProps} mediaRequired={false} canSetMediaRequired />);

    // The floor is lifted, so the missing-asset error must NOT appear.
    await user.click(screen.getByRole("button", { name: /submit for creative review/i }));
    expect(
      screen.queryByText("Select at least one stored Media Library asset."),
    ).not.toBeInTheDocument();

    // …but the description becomes load-bearing, because with no files
    // it is the only record reviewers will see.
    expect(await screen.findByText(/describe what is being delivered/i)).toBeInTheDocument();
  });

  it("explains the no-media path when the empty delivery form is collapsed", async () => {
    const user = userEvent.setup();
    render(<DeliverySection {...baseProps} mediaRequired={false} canSetMediaRequired />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.getByText(/describe what was delivered and submit it without media/i),
    ).toBeInTheDocument();
  });

  it("explains the no-media path when a planner can enable it", async () => {
    const user = userEvent.setup();
    render(<DeliverySection {...baseProps} mediaRequired canSetMediaRequired />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.getByText(/describe what was delivered and submit it without media/i),
    ).toBeInTheDocument();
  });

  it("offers a clear continue-without-media action to planners", async () => {
    const user = userEvent.setup();
    render(<DeliverySection {...baseProps} mediaRequired canSetMediaRequired />);

    await user.click(screen.getByRole("button", { name: /continue without media/i }));

    await waitFor(() => {
      expect(setMediaRequiredAction).toHaveBeenCalledWith(
        baseProps.workspaceSlug,
        baseProps.contentItemId,
        false,
      );
    });
    expect(screen.getByRole("checkbox", { name: /this post ships no creative/i })).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  it("persists the toggle through the server action and reflects the new state", async () => {
    const user = userEvent.setup();
    render(<DeliverySection {...baseProps} mediaRequired canSetMediaRequired />);

    const toggle = screen.getByRole("checkbox", { name: /this post ships no creative/i });
    expect(toggle).toHaveAttribute("data-state", "unchecked");

    await user.click(toggle);

    await waitFor(() => {
      expect(setMediaRequiredAction).toHaveBeenCalledWith(
        baseProps.workspaceSlug,
        baseProps.contentItemId,
        false,
      );
    });
    await waitFor(() => {
      expect(toggle).toHaveAttribute("data-state", "checked");
    });
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("waits for the optional-media decision before allowing submission", async () => {
    const user = userEvent.setup();
    let resolveToggle!: (result: { ok: true }) => void;
    vi.mocked(setMediaRequiredAction).mockReturnValue(
      new Promise((resolve) => {
        resolveToggle = resolve;
      }),
    );
    render(<DeliverySection {...baseProps} mediaRequired canSetMediaRequired />);

    await user.click(screen.getByRole("checkbox", { name: /this post ships no creative/i }));
    const submit = screen.getByRole("button", { name: /submit for creative review/i });

    expect(submit).toBeDisabled();
    resolveToggle({ ok: true });
    await waitFor(() => expect(submit).toBeEnabled());
    expect(submitDeliveryAction).not.toHaveBeenCalled();
  });

  it("rolls the toggle back and surfaces the translated code when the server refuses", async () => {
    const user = userEvent.setup();
    vi.mocked(setMediaRequiredAction).mockResolvedValue({
      ok: false,
      errorCode: "updateFailed",
    });
    render(<DeliverySection {...baseProps} mediaRequired canSetMediaRequired />);

    const toggle = screen.getByRole("checkbox", { name: /this post ships no creative/i });
    await user.click(toggle);

    // `role="alert"` carries no accessible name — it is announced from
    // its text content, so match the text rather than a `name` option.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /media requirement could not be updated/i,
    );
    // A designer must never be left believing the floor was lifted.
    await waitFor(() => {
      expect(toggle).toHaveAttribute("data-state", "unchecked");
    });
  });

  it("translates a permission refusal instead of showing an English-only code", async () => {
    const user = userEvent.setup();
    vi.mocked(setMediaRequiredAction).mockResolvedValue({ ok: false, errorCode: "forbidden" });
    render(<DeliverySection {...baseProps} mediaRequired canSetMediaRequired />);

    await user.click(screen.getByRole("checkbox", { name: /this post ships no creative/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/do not have permission/i);
    // The raw code must never reach the surface.
    expect(alert).not.toHaveTextContent(/forbidden/);
  });

  it("disables the toggle for viewers who cannot set it", () => {
    render(<DeliverySection {...baseProps} mediaRequired={false} canSetMediaRequired={false} />);

    const toggle = screen.getByRole("checkbox", { name: /this post ships no creative/i });
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText(/ask a planner or workspace manager to mark this post as text-only/i),
    ).toBeInTheDocument();
  });
});
