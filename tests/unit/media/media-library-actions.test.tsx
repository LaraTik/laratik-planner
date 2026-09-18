import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MediaLibraryActions } from "@/components/media/media-library-actions";

vi.mock("next/router", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const lookup: Record<string, string> = {
  "media.agencyWorkspace.all": "All workspaces",
  "media.agencyWorkspace.label": "Switch workspace",
  "media.agencyWorkspace.selectActiveAria": "Active workspace: {name}. Click to switch.",
  "media.agencyWorkspace.selectAria": "Select a workspace. Click to open.",
  "media.agencyWorkspace.noWorkspacesAria": "No writable workspaces",
  "media.uploadDialog.openAria": "Add media",
  "media.uploadDialog.openLabel": "Add media",
};

// The component pulls the locale strings from the in-app
// `<LocaleProvider>` for the visible labels, but the en keys above
// are still useful as a cross-check that nothing is silenced in
// the lookup table.
void lookup;

describe("MediaLibraryActions", () => {
  it("threads the active workspace into the agency workspace switcher trigger", () => {
    const studioOne = { id: "ws-1", name: "Studio One", slug: "studio-one" };
    const studioTwo = { id: "ws-2", name: "Studio Two", slug: "studio-two" };
    render(
      <LocaleProvider locale="en">
        <MediaLibraryActions
          mode="agency"
          canUpload
          workspace={studioTwo}
          agencyWorkspaces={[studioOne, studioTwo]}
          basePath="/app/media"
          preserveParams={{ q: "summer" }}
          workspaceOptions={[studioOne, studioTwo]}
          folderOptionsByWorkspace={{
            [studioTwo.id]: [],
          }}
        />
      </LocaleProvider>,
    );
    // Pre-fix the trigger hardcoded `active={null}` so it always read
    // "All workspaces". With the fix, selecting workspace ws-2 in
    // the URL surfaces its name in the trigger.
    expect(screen.getByTestId("media-agency-workspace-switcher-trigger")).toHaveTextContent(
      "Studio Two",
    );
    // "All workspaces" must NOT be the trigger label any more.
    expect(screen.getByTestId("media-agency-workspace-switcher-trigger")).not.toHaveTextContent(
      /^All workspaces$/,
    );
  });

  it("falls back to 'All workspaces' when the active workspace is not in the writable list", () => {
    const studioOne = { id: "ws-1", name: "Studio One", slug: "studio-one" };
    const studioTwo = { id: "ws-2", name: "Studio Two", slug: "studio-two" };
    const otherWorkspace = { id: "ws-9", name: "Other Workspace", slug: "other" };
    render(
      <LocaleProvider locale="en">
        <MediaLibraryActions
          mode="agency"
          canUpload={false}
          // Simulates `?workspace=ws-9` where the user lacks write
          // access — the writable list excludes it. The trigger
          // should fall back to "All workspaces" instead of
          // confusingly showing a name the user can't switch to.
          workspace={otherWorkspace}
          agencyWorkspaces={[studioOne, studioTwo]}
          basePath="/app/media"
          preserveParams={{}}
          workspaceOptions={[studioOne, studioTwo]}
          folderOptionsByWorkspace={{}}
        />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("media-agency-workspace-switcher-trigger")).toHaveTextContent(
      "All workspaces",
    );
  });
});
