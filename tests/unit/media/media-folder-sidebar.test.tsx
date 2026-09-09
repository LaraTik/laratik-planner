import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaFolderSidebar } from "@/components/media/media-folder-sidebar";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    scroll?: boolean;
  }) => (
    <a href={href} data-scroll={scroll === false ? "false" : undefined} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

const labels = {
  folders: "Folders",
  allMedia: "All media",
  unfiled: "Unfiled",
  agencyShared: "Agency shared",
  newFolder: "New folder",
  folderName: "Folder name",
  folderPlaceholder: "Campaign assets",
  createFolder: "Create folder",
  newSubfolder: "New subfolder",
  parentFolder: "Parent folder",
  rootFolder: "No parent (root folder)",
  renameFolder: "Rename folder",
  archiveFolder: "Archive folder",
  archiveConfirm: "Archive this folder?",
  folderError: "Folder action failed",
};

describe("MediaFolderSidebar navigation", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("keeps folder links on client navigation without resetting scroll", async () => {
    const user = userEvent.setup();
    render(
      <MediaFolderSidebar
        basePath="/app/media"
        preserveParams={{ q: "launch", view: "grid" }}
        workspaceId="workspace-1"
        workspaceName="Main workspace"
        folders={[{ id: "folder-1", name: "Campaign" }]}
        activeFolder=""
        sharedOnly={false}
        canManage={false}
        labels={labels}
      />,
    );

    expect(screen.getByRole("link", { name: /Campaign/ })).toHaveAttribute(
      "href",
      "/app/media?q=launch&view=grid&workspace=workspace-1&folder=folder-1",
    );
    expect(screen.getByRole("link", { name: /Campaign/ })).toHaveAttribute("data-scroll", "false");

    await user.selectOptions(screen.getByRole("combobox", { name: "Folders" }), "folder-1");

    expect(pushMock).toHaveBeenCalledWith(
      "/app/media?q=launch&view=grid&workspace=workspace-1&folder=folder-1",
      { scroll: false },
    );
  });

  it("creates a subfolder under the selected parent", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MediaFolderSidebar
        basePath="/app/media"
        preserveParams={{}}
        workspaceId="workspace-1"
        workspaceName="Main workspace"
        folders={[{ id: "folder-1", name: "Campaign" }]}
        activeFolder=""
        sharedOnly={false}
        canManage
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New subfolder: Campaign" }));
    await user.type(screen.getByLabelText("Folder name"), "Launch week");
    expect(screen.getByRole("combobox", { name: "Parent folder" })).toHaveValue("folder-1");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/media/folders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          workspaceId: "workspace-1",
          name: "Launch week",
          parentId: "folder-1",
        }),
      }),
    );
  });
});
