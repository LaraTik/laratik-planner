import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MediaAgencyWorkspaceSwitcher } from "@/components/media/media-agency-workspace-switcher";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

const baseT = (key: string, params?: Record<string, string | number>) => {
  const lookup: Record<string, string> = {
    "media.agencyWorkspace.all": "All workspaces",
    "media.agencyWorkspace.label": "Switch workspace",
    "media.agencyWorkspace.selectActiveAria": "Active workspace: {name}. Click to switch.",
    "media.agencyWorkspace.selectAria": "Select a workspace. Click to open.",
    "media.agencyWorkspace.noWorkspacesAria": "No writable workspaces",
  };
  let result = lookup[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      result = result.replace(`{${name}}`, String(value));
    }
  }
  return result;
};

const studioOne = { id: "ws-1", name: "Studio One", slug: "studio-one" } as const;
const studioTwo = { id: "ws-2", name: "Studio Two", slug: "studio-two" } as const;
const studioThree = { id: "ws-3", name: "Studio Three", slug: "studio-three" } as const;
const threeOptions = [studioOne, studioTwo, studioThree];

describe("MediaAgencyWorkspaceSwitcher", () => {
  it("renders the active workspace name in the trigger", () => {
    render(
      <LocaleProvider locale="en">
        <MediaAgencyWorkspaceSwitcher
          active={studioTwo}
          options={threeOptions}
          basePath="/app/media"
          preserveParams={{ q: "summer" }}
          t={baseT}
        />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("media-agency-workspace-switcher-trigger")).toHaveTextContent(
      "Studio Two",
    );
  });

  it("opens the popover on click and navigates with preserved query params on Enter", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MediaAgencyWorkspaceSwitcher
          active={studioTwo}
          options={threeOptions}
          basePath="/app/media"
          preserveParams={{ q: "summer", kind: "video" }}
          t={baseT}
        />
      </LocaleProvider>,
    );
    await act(async () => {
      await user.click(screen.getByTestId("media-agency-workspace-switcher-trigger"));
    });
    const list = screen.getByTestId("media-agency-workspace-switcher-list");
    expect(list).toBeInTheDocument();
    // Arrow-down twice + Enter to land on the third workspace option.
    await act(async () => {
      list.focus();
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
    const target = pushMock.mock.calls[0]![0] as string;
    expect(target).toContain("workspace=ws-3");
    expect(target).toContain("q=summer");
    expect(target).toContain("kind=video");
  });

  it("navigates without ?workspace when 'All workspaces' is chosen", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MediaAgencyWorkspaceSwitcher
          active={studioOne}
          options={threeOptions}
          basePath="/app/media"
          preserveParams={{ q: "all" }}
          t={baseT}
        />
      </LocaleProvider>,
    );
    await act(async () => {
      await user.click(screen.getByTestId("media-agency-workspace-switcher-trigger"));
    });
    const allOption = screen.getByTestId("media-agency-workspace-option-all");
    await act(async () => {
      await user.click(allOption);
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
    const target = pushMock.mock.calls[0]![0] as string;
    expect(target).not.toContain("workspace=");
    expect(target).toContain("q=all");
  });

  it("is a no-op when the user clicks the active option", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MediaAgencyWorkspaceSwitcher
          active={studioTwo}
          options={threeOptions}
          basePath="/app/media"
          preserveParams={{}}
          t={baseT}
        />
      </LocaleProvider>,
    );
    await act(async () => {
      await user.click(screen.getByTestId("media-agency-workspace-switcher-trigger"));
    });
    const currentOption = screen.getByTestId(`media-agency-workspace-option-${studioTwo.id}`);
    await act(async () => {
      await user.click(currentOption);
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders the disabled no-workspace placeholder when options is empty", () => {
    render(
      <LocaleProvider locale="en">
        <MediaAgencyWorkspaceSwitcher
          active={null}
          options={[]}
          basePath="/app/media"
          preserveParams={{}}
          t={baseT}
        />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("media-agency-workspace-switcher-empty")).toBeInTheDocument();
    expect(screen.getByTestId("media-agency-workspace-switcher-empty")).toBeDisabled();
  });

  it("renders a static badge when exactly one workspace is available", () => {
    render(
      <LocaleProvider locale="en">
        <MediaAgencyWorkspaceSwitcher
          active={studioOne}
          options={[studioOne]}
          basePath="/app/media"
          preserveParams={{}}
          t={baseT}
        />
      </LocaleProvider>,
    );
    expect(screen.queryByTestId("media-agency-workspace-switcher-trigger")).toBeNull();
    expect(screen.getByTestId("media-agency-workspace-switcher-single")).toHaveTextContent(
      "Studio One",
    );
  });
});
