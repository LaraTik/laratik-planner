import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MediaFolderTree } from "@/components/media/media-folder-tree";
import type { MediaFolderTreeRow } from "@/lib/media/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));
vi.mock("next/link", () => ({
  // Strip `scroll` to avoid prop-forward noise; only href + children matter.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  default: ({ href, children, scroll, ...rest }: Record<string, unknown>) => (
    <a href={String(href)} {...rest}>
      {children as React.ReactNode}
    </a>
  ),
}));

const fixtures = (): MediaFolderTreeRow[] => [
  {
    id: "posts-root",
    name: "Posts",
    parentId: null,
    sortOrder: 0,
    assetCount: 4,
    descendantAssetCount: 4,
    kind: "system",
    isBrandRoot: false,
    isPostsRoot: true,
    isYearFolder: false,
    isMonthFolder: false,
  },
  {
    id: "posts-2026",
    name: "2026",
    parentId: "posts-root",
    sortOrder: 0,
    assetCount: 4,
    descendantAssetCount: 4,
    kind: "system",
    isBrandRoot: false,
    isPostsRoot: false,
    isYearFolder: true,
    isMonthFolder: false,
  },
  {
    id: "posts-2026-09",
    name: "September",
    parentId: "posts-2026",
    sortOrder: 0,
    assetCount: 2,
    descendantAssetCount: 2,
    kind: "system",
    isBrandRoot: false,
    isPostsRoot: false,
    isYearFolder: false,
    isMonthFolder: true,
  },
  {
    id: "user-folder",
    name: "Brand Q4",
    parentId: null,
    sortOrder: 1,
    assetCount: 2,
    descendantAssetCount: 2,
    kind: "user",
    isBrandRoot: false,
    isPostsRoot: false,
    isYearFolder: false,
    isMonthFolder: false,
  },
];

const baseLabels = (t: (key: string, params?: Record<string, string | number>) => string) => ({
  tree: t("media.tree.label"),
  allMedia: t("media.breadcrumb.allMedia"),
  unfiled: t("media.breadcrumb.unfiled"),
  agencyShared: t("media.breadcrumb.agencyShared"),
  newFolder: t("media.newFolder"),
  folderPlaceholder: t("media.folderNamePlaceholder"),
  createFolder: t("media.createFolder"),
  parentFolder: t("media.parentFolder"),
  rootFolder: t("media.rootFolder"),
  folderError: t("media.folderError"),
  renameFolder: t("media.renameFolder"),
  archiveFolder: t("media.archiveFolder"),
  archiveConfirm: t("media.archiveConfirm"),
  postBadge: t("media.tree.postBadge"),
  brandBadge: t("media.tree.brandBadge"),
  systemBadge: t("media.tree.systemBadge"),
  info: t("media.tree.info"),
  openInfo: t("media.tree.openInfo"),
});

const baseT = (key: string, params?: Record<string, string | number>) => {
  const lookup: Record<string, string> = {
    "media.tree.label": "Folder tree",
    "media.breadcrumb.allMedia": "All media",
    "media.breadcrumb.unfiled": "Unfiled",
    "media.breadcrumb.agencyShared": "Agency shared",
    "media.newFolder": "New folder",
    "media.folderNamePlaceholder": "Name your folder",
    "media.createFolder": "Create",
    "media.parentFolder": "Parent",
    "media.rootFolder": "(workspace root)",
    "media.folderError": "Couldn't create folder",
    "media.renameFolder": "Rename",
    "media.archiveFolder": "Archive",
    "media.archiveConfirm": "Archive?",
    "media.tree.postBadge": "Posts",
    "media.tree.brandBadge": "Brand",
    "media.tree.systemBadge": "Auto",
    "media.tree.info": "Info",
    "media.tree.openInfo": "Open info",
    "media.tree.expandAll": "Expand all",
    "media.tree.collapseAll": "Collapse all",
    "media.tree.searchPlaceholder": "Filter folders",
    "media.tree.noFoldersYet": "Create your first folder",
    "media.tree.noSearchMatch": "No matches",
    "media.tree.section.quickFilters": "Quick filters",
    "media.tree.section.folders": "Folders",
    "media.tree.section.shared": "Shared",
    "media.tree.actions.label": "Folder actions",
    "media.tree.actions.info": "Folder info",
    "media.tree.actions.newSubfolder": "New subfolder",
    "media.tree.actions.rename": "Rename folder",
    "media.tree.actions.archive": "Archive folder",
    "media.tree.actions.archiveConfirm": "Archive?",
    "media.tree.expand": "Expand {name}",
    "media.tree.collapse": "Collapse {name}",
    "media.tree.assetCount": "{count} assets",
  };
  let result = lookup[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      result = result.replace(`{${name}}`, String(value));
    }
  }
  return result;
};

const polishLabels = (t: (key: string, params?: Record<string, string | number>) => string) => ({
  expandAll: t("media.tree.expandAll"),
  collapseAll: t("media.tree.collapseAll"),
  searchPlaceholder: t("media.tree.searchPlaceholder"),
  noFoldersYet: t("media.tree.noFoldersYet"),
  noSearchMatch: t("media.tree.noSearchMatch"),
  section: {
    quickFilters: t("media.tree.section.quickFilters"),
    folders: t("media.tree.section.folders"),
    shared: t("media.tree.section.shared"),
  },
  actions: {
    label: t("media.tree.actions.label"),
    info: t("media.tree.actions.info"),
    newSubfolder: t("media.tree.actions.newSubfolder"),
    rename: t("media.tree.actions.rename"),
    archive: t("media.tree.actions.archive"),
    archiveConfirm: t("media.tree.actions.archiveConfirm"),
  },
});

describe("MediaFolderTree (2026-09-18 polish)", () => {
  it("renders three section headings with the new polish labels", () => {
    render(
      <LocaleProvider locale="en">
        <MediaFolderTree
          basePath="/app/media"
          workspaceId="ws-1"
          workspaceName="Studio One"
          folders={fixtures()}
          activeFolderId={null}
          ancestors={[]}
          sharedOnly={false}
          canManage
          labels={{ ...baseLabels(baseT), polish: polishLabels(baseT) }}
        />
      </LocaleProvider>,
    );
    const nav = screen.getByTestId("media-folder-tree-nav");
    expect(within(nav).getByText("Quick filters")).toBeInTheDocument();
    expect(within(nav).getByText("Folders")).toBeInTheDocument();
    expect(within(nav).getByText("Shared")).toBeInTheDocument();
  });

  it("expand-all flips the chevrons and collapses-all resets them", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MediaFolderTree
          basePath="/app/media"
          workspaceId="ws-1"
          workspaceName="Studio One"
          folders={fixtures()}
          activeFolderId={null}
          ancestors={[]}
          sharedOnly={false}
          canManage
          labels={{ ...baseLabels(baseT), polish: polishLabels(baseT) }}
        />
      </LocaleProvider>,
    );
    await user.click(screen.getByTestId("folder-tree-expand-all"));
    // After expand-all, both descendants of "Posts" (2026 + September)
    // and the top-level "Brand Q4" user folder are visible.
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("September")).toBeInTheDocument();

    await user.click(screen.getByTestId("folder-tree-collapse-all"));
    expect(screen.queryByText("2026")).not.toBeInTheDocument();
    expect(screen.queryByText("September")).not.toBeInTheDocument();
  });

  it("renders a kebab with all four actions when canManage is true", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MediaFolderTree
          basePath="/app/media"
          workspaceId="ws-1"
          workspaceName="Studio One"
          folders={fixtures()}
          activeFolderId={null}
          ancestors={[]}
          sharedOnly={false}
          canManage
          labels={{ ...baseLabels(baseT), polish: polishLabels(baseT) }}
        />
      </LocaleProvider>,
    );
    const kebabs = screen.getAllByTestId("folder-row-kebab");
    expect(kebabs.length).toBeGreaterThan(0);
    const firstKebab = kebabs[0] as HTMLElement;
    await user.click(firstKebab);
    expect(screen.getByText("Folder info")).toBeInTheDocument();
    expect(screen.getByText("New subfolder")).toBeInTheDocument();
    expect(screen.getByText("Rename folder")).toBeInTheDocument();
    expect(screen.getByText("Archive folder")).toBeInTheDocument();
  });

  it("hides the kebab entirely when canManage is false", () => {
    render(
      <LocaleProvider locale="en">
        <MediaFolderTree
          basePath="/app/media"
          workspaceId="ws-1"
          workspaceName="Studio One"
          folders={fixtures()}
          activeFolderId={null}
          ancestors={[]}
          sharedOnly={false}
          canManage={false}
          labels={{ ...baseLabels(baseT), polish: polishLabels(baseT) }}
        />
      </LocaleProvider>,
    );
    expect(screen.queryByTestId("folder-row-kebab")).toBeNull();
  });

  it("search filter narrows the visible folders and surfaces ancestors", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MediaFolderTree
          basePath="/app/media"
          workspaceId="ws-1"
          workspaceName="Studio One"
          folders={fixtures()}
          activeFolderId={null}
          ancestors={[]}
          sharedOnly={false}
          canManage
          labels={{ ...baseLabels(baseT), polish: polishLabels(baseT) }}
        />
      </LocaleProvider>,
    );
    await user.type(screen.getByTestId("folder-tree-search"), "Brand");
    expect(screen.getByText("Brand Q4")).toBeInTheDocument();
    // The Posts root doesn't match, so it's hidden as well.
    expect(screen.queryByText("Posts")).not.toBeInTheDocument();
  });

  it("uses CSS variables for the depth indent on rendered rows", () => {
    render(
      <LocaleProvider locale="en">
        <MediaFolderTree
          basePath="/app/media"
          workspaceId="ws-1"
          workspaceName="Studio One"
          folders={fixtures()}
          activeFolderId={null}
          ancestors={[]}
          sharedOnly={false}
          canManage
          labels={{ ...baseLabels(baseT), polish: polishLabels(baseT) }}
        />
      </LocaleProvider>,
    );
    // The aside sets `--tree-indent` and `--tree-indent-step`. Rows
    // deeper than depth=1 reference those variables for their padding.
    const aside = screen.getByTestId("media-folder-tree");
    const style = aside.getAttribute("style") ?? "";
    expect(style).toContain("--tree-indent");
    expect(style).toContain("--tree-indent-step");
  });

  it("renders the empty-state copy when no folders exist", () => {
    render(
      <LocaleProvider locale="en">
        <MediaFolderTree
          basePath="/app/media"
          workspaceId="ws-1"
          workspaceName="Studio One"
          folders={[]}
          activeFolderId={null}
          ancestors={[]}
          sharedOnly={false}
          canManage
          labels={{ ...baseLabels(baseT), polish: polishLabels(baseT) }}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("Create your first folder")).toBeInTheDocument();
  });
});
