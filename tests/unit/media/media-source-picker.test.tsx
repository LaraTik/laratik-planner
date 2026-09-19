import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MediaSourcePicker } from "@/components/media/media-source-picker";

// Capture forwarded props in module-scoped arrays. The link importer mock
// lives inside an inactive Radix Tabs panel that Radix doesn't render at
// all (no `forceMount`), so its call only lands in the array once the user
// activates the link tab. The device tab is the default, so its call lands
// on first render.
const uploadCalls: Array<Record<string, unknown>> = [];
const linkCalls: Array<Record<string, unknown>> = [];

vi.mock("@/components/media/media-upload-form", () => ({
  MediaUploadForm: (props: Record<string, unknown>) => {
    uploadCalls.push(props);
    return <div data-testid="mock-media-upload-form" />;
  },
}));
vi.mock("@/components/media/media-link-importer", () => ({
  MediaLinkImporter: (props: Record<string, unknown>) => {
    linkCalls.push(props);
    return <div data-testid="mock-media-link-importer" />;
  },
}));

afterEach(() => {
  uploadCalls.length = 0;
  linkCalls.length = 0;
});

const workspaceOptions = [{ id: "ws-1", name: "Northstar Coffee" }];
const folderOptionsByWorkspace = {
  "ws-1": [{ id: "folder-canonical", name: "Posts / Reel / 2026 / 09", parentId: null }],
};

function renderPicker(overrides: Partial<Parameters<typeof MediaSourcePicker>[0]> = {}) {
  return render(
    <LocaleProvider locale="en">
      <MediaSourcePicker
        workspaceOptions={workspaceOptions}
        folderOptionsByWorkspace={folderOptionsByWorkspace}
        contentItemId="ci-1"
        defaultFolderId="folder-canonical"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("MediaSourcePicker", () => {
  it("exposes both device and link source tabs", () => {
    renderPicker();
    expect(screen.getByRole("tab", { name: "From device" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "From link" })).toBeInTheDocument();
  });

  it("forwards defaultFolderId to the device child on first render", () => {
    renderPicker({ contentItemId: "ci-1", defaultFolderId: "folder-canonical" });
    expect(uploadCalls).toHaveLength(1);
    const [upload] = uploadCalls;
    expect(upload?.contentItemId).toBe("ci-1");
    expect(upload?.defaultFolderId).toBe("folder-canonical");
  });

  it("forwards contentItemId (but not defaultFolderId) to the link child once the link tab is activated", async () => {
    const user = userEvent.setup();
    renderPicker({ contentItemId: "ci-1", defaultFolderId: "folder-canonical" });
    expect(linkCalls).toHaveLength(0);
    await user.click(screen.getByRole("tab", { name: "From link" }));
    expect(linkCalls).toHaveLength(1);
    const [link] = linkCalls;
    expect(link?.contentItemId).toBe("ci-1");
    // The link importer does not surface a folder picker — the server
    // resolves the folder from contentItemId. The picker must not forward
    // defaultFolderId here so its contract stays minimal.
    expect(link).not.toHaveProperty("defaultFolderId");
  });

  it("falls back to no defaultFolderId when the parent omits it", () => {
    render(
      <LocaleProvider locale="en">
        <MediaSourcePicker
          workspaceOptions={workspaceOptions}
          folderOptionsByWorkspace={folderOptionsByWorkspace}
        />
      </LocaleProvider>,
    );
    expect(uploadCalls).toHaveLength(1);
    const [upload] = uploadCalls;
    expect(upload?.defaultFolderId).toBeUndefined();
    expect(upload?.contentItemId).toBeUndefined();
  });

  it("forwards onAssetReady to the device child only", () => {
    const handler = () => {};
    renderPicker({ onAssetReady: handler });
    expect(uploadCalls).toHaveLength(1);
    const [upload] = uploadCalls;
    expect(upload?.onAssetReady).toBe(handler);
  });
});
