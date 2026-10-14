import Link from "next/link";
import { Briefcase, Grid2X2, Image as ImageIcon, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { ListPagination } from "@/components/ui/list-pagination";
import { PageHeader } from "@/components/workspace/page-header";
import { MediaAssetSelectionCheckbox, MediaSelectionToolbar } from "./media-selection-controls";
import { MediaAssetActions } from "./media-asset-actions";
import { MediaAssetTile } from "./media-asset-tile";
import { MediaFolderTree } from "./media-folder-tree";
import { MediaBreadcrumb } from "./media-breadcrumb";
import { MediaBulkToolbar } from "./media-bulk-toolbar";
import { MediaBulkHeader } from "./media-bulk-header";
import { MediaSelectionProvider } from "@/lib/media/selection-store";
import { MediaLibraryActions } from "./media-library-actions";
import { MediaStorageSummary } from "./media-storage-summary";
import { MediaViewer, useMediaViewer } from "./media-viewer";
import {
  formatBytes,
  MediaKindIcon,
  resolveFolderPath,
  type MediaLibraryRow,
} from "./media-asset-shared";
import type { MediaFolderTreeRow } from "@/lib/media/service";
import type { MediaKind, MediaSourceType } from "@/lib/media/contract";

type WorkspaceOption = { id: string; name: string; slug: string };

export type MediaLibraryMode = "workspace" | "agency";

export function MediaLibraryPage({
  mode,
  workspace,
  agencyWorkspaces,
  rows,
  basePath,
  selectedFolderId,
  sharedOnly,
  preserveParams,
  canUpload,
  managerWorkspaceIds,
  includeTrashed,
  view,
  search,
  kind,
  sort,
  pageInfo,
  initialSource = "device",
  t,
  storageSummary,
  folderTree,
  ancestors,
  activeFolderLabel,
}: {
  mode: MediaLibraryMode;
  workspace: WorkspaceOption | null;
  agencyWorkspaces: WorkspaceOption[];
  rows: MediaLibraryRow[];
  basePath: string;
  selectedFolderId: string;
  sharedOnly: boolean;
  preserveParams: Record<string, string>;
  canUpload: boolean;
  managerWorkspaceIds: string[];
  includeTrashed: boolean;
  view: "grid" | "list";
  search: string;
  kind: string;
  sort: "name" | "uploadedAt" | "updatedAt";
  pageInfo: {
    page: number;
    pageSize: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
    total: number;
  };
  initialSource?: "device" | "link";
  t: (key: string, params?: Record<string, string | number>) => string;
  storageSummary: {
    mode: "managed" | "agency_owned";
    bucket: string | null;
    keyPrefix: string;
  };
  folderTree?: MediaFolderTreeRow[];
  ancestors?: ReadonlyArray<{ id: string; name: string }>;
  activeFolderLabel?: string;
}) {
  const selectedWorkspaceId = workspace?.id ?? "";
  const hasFilters = Boolean(search || kind || includeTrashed || selectedFolderId || sharedOnly);
  const folderOptions = (folderTree ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }));
  const canManageActive = managerWorkspaceIds.includes(selectedWorkspaceId);

  const viewHref = (nextView: "grid" | "list") => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (kind) params.set("kind", kind);
    if (includeTrashed) params.set("trash", "1");
    if (selectedWorkspaceId) params.set("workspace", selectedWorkspaceId);
    if (selectedFolderId) params.set("folder", selectedFolderId);
    if (sharedOnly) params.set("shared", "1");
    if (sort !== "name") params.set("sort", sort);
    if (pageInfo.page > 1) params.set("page", String(pageInfo.page));
    params.set("view", nextView);
    return `?${params.toString()}`;
  };
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams(preserveParams);
    if (selectedWorkspaceId) params.set("workspace", selectedWorkspaceId);
    if (selectedFolderId) params.set("folder", selectedFolderId);
    if (sharedOnly) params.set("shared", "1");
    if (sort !== "name") params.set("sort", sort);
    if (view !== "grid") params.set("view", view);
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    return `${basePath}?${params.toString()}`;
  };

  // Range math for the shared ListPagination strip. Derived from the server's
  // `total` so the copy stays honest when the last page is partial.
  const totalPages = Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize));
  const rangeFrom = pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1;
  const rangeTo =
    pageInfo.total === 0 ? 0 : Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total);

  return (
    <div className="flex flex-col gap-6" data-testid="media-library">
      <PageHeader
        eyebrow={t("media.privateStorage")}
        title={workspace?.name ?? t("media.title")}
        description={
          workspace && activeFolderLabel ? (
            <MediaBreadcrumb
              basePath={basePath}
              workspaceId={selectedWorkspaceId}
              workspaceName={workspace.name}
              ancestors={ancestors ?? []}
              currentLabel={activeFolderLabel}
            />
          ) : undefined
        }
        action={
          <MediaLibraryActions
            mode={mode}
            canUpload={canUpload}
            workspace={
              workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null
            }
            agencyWorkspaces={agencyWorkspaces.map((workspaceOption) => ({
              id: workspaceOption.id,
              name: workspaceOption.name,
              slug: workspaceOption.slug,
            }))}
            basePath={basePath}
            preserveParams={preserveParams}
            workspaceOptions={mode === "agency" ? agencyWorkspaces : workspace ? [workspace] : []}
            folderOptionsByWorkspace={workspace ? { [workspace.id]: folderOptions } : {}}
            initialSource={initialSource}
          />
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid gap-3 lg:w-72 lg:shrink-0 xl:w-80">
          <MediaStorageSummary
            mode={storageSummary.mode}
            bucket={storageSummary.bucket}
            keyPrefix={storageSummary.keyPrefix}
          />
          {workspace && folderTree ? (
            <MediaFolderTree
              basePath={basePath}
              workspaceId={selectedWorkspaceId}
              workspaceName={workspace.name}
              folders={folderTree}
              activeFolderId={
                selectedFolderId === "unfiled" || !selectedFolderId ? null : selectedFolderId
              }
              sharedOnly={sharedOnly}
              ancestors={ancestors ?? []}
              canManage={canManageActive}
              labels={{
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
                info: t("media.tree.info"),
                openInfo: t("media.tree.openInfo"),
                polish: {
                  expandAll: t("media.tree.expandAll"),
                  collapseAll: t("media.tree.collapseAll"),
                  searchPlaceholder: t("media.tree.searchPlaceholder"),
                  noFoldersYet: t("media.tree.noFoldersYet"),
                  noSearchMatch: t("media.tree.noSearchMatch"),
                  kind: {
                    postsRoot: t("media.tree.kind.postsRoot"),
                    brandRoot: t("media.tree.kind.brandRoot"),
                    system: t("media.tree.kind.system"),
                  },
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
                },
              }}
            />
          ) : mode === "agency" ? (
            <Card padding="md" data-testid="agency-workspace-picker-card">
              <h2 className="text-title-card text-fg-primary font-semibold">
                {t("media.workspacePickerTitle")}
              </h2>
              <p className="text-label text-fg-secondary mt-1 max-w-3xl">
                {t("media.workspacePickerDescription")}
              </p>
              <ul className="m-0 mt-3 list-none p-0">
                {agencyWorkspaces.length === 0 ? (
                  <li className="text-body text-fg-muted py-2">
                    {t("media.workspacePickerEmpty")}
                  </li>
                ) : (
                  agencyWorkspaces.map((option) => (
                    <li key={option.id}>
                      <Link
                        href={`${basePath}?workspace=${option.id}`}
                        className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 font-semibold focus:outline-none focus-visible:ring-2"
                      >
                        <Briefcase className="text-fg-muted h-4 w-4" aria-hidden="true" />
                        <span className="min-w-0 truncate">{option.name}</span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <form
            method="get"
            className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <label
              className="text-body text-fg-primary min-w-0 flex-1 font-semibold"
              htmlFor="media-search"
            >
              {t("media.searchPlaceholder")}
              <input
                id="media-search"
                name="q"
                type="search"
                defaultValue={search}
                placeholder={t("media.searchPlaceholder")}
                dir="auto"
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
              />
            </label>
            <label className="text-body text-fg-primary font-semibold" htmlFor="media-kind">
              {t("media.allTypes")}
              <select
                id="media-kind"
                name="kind"
                defaultValue={kind}
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
              >
                <option value="">{t("media.allTypes")}</option>
                <option value="image">{t("media.images")}</option>
                <option value="video">{t("media.videos")}</option>
                <option value="document">{t("media.documents")}</option>
              </select>
            </label>
            <label className="text-body text-fg-primary font-semibold" htmlFor="media-sort">
              {t("media.sortBy")}
              <select
                id="media-sort"
                name="sort"
                defaultValue={sort}
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
              >
                <option value="name">{t("media.sortName")}</option>
                <option value="uploadedAt">{t("media.sortUploadedAt")}</option>
                <option value="updatedAt">{t("media.sortUpdatedAt")}</option>
              </select>
            </label>
            <label
              className="text-body text-fg-primary inline-flex min-h-11 items-center gap-2 font-semibold"
              htmlFor="media-trash"
            >
              <Checkbox id="media-trash" name="trash" value="1" defaultChecked={includeTrashed} />
              {t("media.showTrashed")}
            </label>
            <input type="hidden" name="view" value={view} />
            {selectedWorkspaceId ? (
              <input type="hidden" name="workspace" value={selectedWorkspaceId} />
            ) : null}
            {selectedFolderId ? (
              <input type="hidden" name="folder" value={selectedFolderId} />
            ) : null}
            {sharedOnly ? <input type="hidden" name="shared" value="1" /> : null}
            <button
              type="submit"
              className="bg-primary hover:bg-primary-hover focus-visible:ring-focus-ring text-button text-primary-foreground inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-4 font-semibold focus:outline-none focus-visible:ring-2"
            >
              {t("media.searchPlaceholder")}
            </button>
            {hasFilters ? (
              <Link
                href="."
                className="text-primary focus-visible:ring-focus-ring text-button inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-3 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
              >
                {t("media.clearFilters")}
              </Link>
            ) : null}
          </form>

          {/* Result count and the view switch share one bar so each strip has a
              single job: how much is here, and how it is arranged. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-label text-fg-secondary" data-testid="media-result-count">
              {t("media.resultsCount", { count: pageInfo.total })}
            </p>
            <div className="flex items-center gap-1" aria-label={t("media.viewOptions")}>
              <Link
                href={viewHref("grid")}
                aria-current={view === "grid" ? "page" : undefined}
                aria-label={t("media.gridView")}
                className={`focus-visible:ring-focus-ring inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] px-2 focus:outline-none focus-visible:ring-2 ${view === "grid" ? "bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface-subtle"}`}
              >
                <Grid2X2 className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={viewHref("list")}
                aria-current={view === "list" ? "page" : undefined}
                aria-label={t("media.listView")}
                className={`focus-visible:ring-focus-ring inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] px-2 focus:outline-none focus-visible:ring-2 ${view === "list" ? "bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface-subtle"}`}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <MediaSelectionToolbar />
          {folderTree ? (
            <MediaSelectionProvider canWrite={canManageActive}>
              <MediaBulkToolbar
                workspaceId={selectedWorkspaceId}
                folders={folderTree}
                canWrite={canManageActive}
                hasTrashedSelected={includeTrashed}
                pageAssetIds={rows.map((row) => row.asset.id)}
                total={pageInfo.total}
                pageSize={pageInfo.pageSize}
              />
            </MediaSelectionProvider>
          ) : null}
          {folderTree && rows.length > 0 ? (
            <MediaSelectionProvider canWrite={canManageActive}>
              <MediaBulkHeader
                pageAssetIds={rows.map((row) => row.asset.id)}
                total={pageInfo.total}
                pageSize={pageInfo.pageSize}
                canWrite={canManageActive}
              />
            </MediaSelectionProvider>
          ) : null}

          {rows.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                icon={<ImageIcon className="h-8 w-8" aria-hidden="true" />}
                title={hasFilters ? t("media.noResultsTitle") : t("media.emptyTitle")}
                description={
                  hasFilters ? t("media.noResultsDescription") : t("media.emptyDescription")
                }
              />
            </Card>
          ) : view === "grid" ? (
            // Masonry via CSS multi-column: the only layout that preserves each
            // asset's true aspect ratio with zero measurement JavaScript and no
            // crop. `break-inside-avoid` on the tile keeps a tile intact.
            // Column flow is column-major, which is the standard trade-off for
            // a visual gallery; operators who need row order switch to list view.
            <MediaViewer
              rows={rows}
              folderOptionsById={folderOptions}
              managerWorkspaceIds={managerWorkspaceIds}
              totalLabel={t("media.resultsCount", { count: pageInfo.total })}
            >
              <div
                className="columns-2 gap-3 md:columns-3 xl:columns-4"
                data-testid="media-masonry"
              >
                {rows.map((row, index) => (
                  <MediaAssetTile
                    key={row.asset.id}
                    row={row}
                    index={index}
                    folderOptions={folderOptions}
                    // Eager only the first two rows of tiles; everything else
                    // stays lazy so a 24-tile page is not an eager burst of
                    // edge requests on a cold cache.
                    priority={index < 8}
                  />
                ))}
              </div>
            </MediaViewer>
          ) : (
            <div className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border">
              <ul className="divide-border divide-y">
                {rows.map((row, index) => (
                  <MediaListRow
                    key={row.asset.id}
                    row={row}
                    index={index}
                    t={t}
                    canManage={managerWorkspaceIds.includes(row.asset.ownerWorkspaceId)}
                    folderOptions={folderOptions}
                    priority={index < 4}
                  />
                ))}
              </ul>
            </div>
          )}

          {rows.length > 0 ? (
            <ListPagination
              testId="media-pagination"
              page={pageInfo.page}
              totalPages={totalPages}
              total={pageInfo.total}
              from={rangeFrom}
              to={rangeTo}
              prevHref={pageInfo.hasPreviousPage ? pageHref(pageInfo.page - 1) : null}
              nextHref={pageInfo.hasNextPage ? pageHref(pageInfo.page + 1) : null}
              counterLabel={t("media.paginationAll", {
                from: rangeFrom,
                to: rangeTo,
                total: pageInfo.total,
              })}
              ariaLabel={t("media.paginationAria")}
              prevLabel={t("media.paginationPrev")}
              nextLabel={t("media.paginationNext")}
              pageIndicator={t("media.paginationPageOf", {
                page: pageInfo.page,
                total: totalPages,
              })}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * List view — the scan path. Keeps names and facts permanently visible for
 * operators who are looking for a specific file rather than browsing.
 *
 * Like the tile, it never mounts a `<video>` element: videos show the same
 * play affordance as the grid and play in the lightbox.
 */
function MediaListRow({
  row,
  index,
  t,
  canManage,
  folderOptions,
  priority = false,
}: {
  row: MediaLibraryRow;
  index: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  canManage: boolean;
  folderOptions: { id: string; name: string; parentId?: string | null }[];
  priority?: boolean;
}) {
  const { open } = useMediaViewer();
  const kind = row.object.kind as MediaKind;
  const ready = row.asset.status === "ready";
  const statusLabel = mediaStatusLabel(row, t);
  const hasPreview =
    typeof row.object.previewStorageObjectId === "string" &&
    row.object.previewStorageObjectId.length > 0;
  const thumbSrc =
    row.signedPreviewUrl ??
    (hasPreview
      ? `/api/media/assets/${encodeURIComponent(row.asset.id)}/preview`
      : `/api/media/assets/${encodeURIComponent(row.asset.id)}`);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <button
        type="button"
        onClick={() => open(index)}
        aria-label={t("media.openAsset", { name: row.asset.title })}
        className="bg-surface-subtle text-fg-muted focus-visible:ring-focus-ring relative flex h-14 w-14 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2"
      >
        {ready && kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt={row.asset.altText ?? row.asset.title}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            {...(priority ? { fetchPriority: "high" as const } : {})}
            className="h-full w-full object-cover"
          />
        ) : (
          <MediaKindIcon kind={kind} className="h-6 w-6" />
        )}
      </button>
      {ready ? (
        <MediaAssetSelectionCheckbox assetId={row.asset.id} title={row.asset.title} />
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-body text-fg-primary truncate font-semibold" dir="auto">
          {row.asset.title}
        </h2>
        <p className="text-label text-fg-muted truncate" dir="auto">
          {row.object.originalName ?? "—"}
        </p>
      </div>
      <div className="text-label text-fg-secondary flex flex-wrap gap-x-3 gap-y-1 sm:max-w-xs sm:justify-end">
        <span>{formatBytes(row.object.byteSize)}</span>
        <span>{row.workspaceName}</span>
        <span>
          <span className="sr-only">{t("media.source")}: </span>
          {mediaSourceLabel(row.asset.sourceType as MediaSourceType, t)}
        </span>
        <span>
          <span className="sr-only">{t("media.folder")}: </span>
          <span dir="auto">
            {resolveFolderPath(row.asset.folderId, folderOptions, t("media.unfiled"))}
          </span>
        </span>
      </div>
      <Badge variant={mediaStatusVariant(row.asset.status)}>{statusLabel}</Badge>
      <MediaAssetActions
        assetId={row.asset.id}
        title={row.asset.title}
        kind={kind as "image" | "video" | "document"}
        trashed={row.asset.status === "trashed"}
        visibility={row.asset.visibility as "workspace" | "agency"}
        folderId={row.asset.folderId}
        folderOptions={folderOptions}
        canManage={canManage}
      />
    </li>
  );
}

function mediaStatusVariant(status: string): "success" | "warning" | "outline" {
  if (status === "ready") return "success";
  if (status === "failed") return "warning";
  return "outline";
}

function mediaStatusLabel(
  row: MediaLibraryRow,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (row.asset.sourceType === "legacy") return t("media.legacy");
  if (row.asset.status === "ready") return t("media.ready");
  if (row.asset.status === "processing") return t("media.processing");
  if (row.asset.status === "failed") return t("media.failed");
  if (row.asset.status === "trashed") return t("media.trashed");
  return t("media.deleted");
}

function mediaSourceLabel(
  sourceType: MediaSourceType,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (sourceType) {
    case "google_drive":
      return t("media.sourceGoogleDrive");
    case "onedrive":
      return t("media.sourceOneDrive");
    case "external_url":
      return t("media.sourceDirectLink");
    case "legacy":
      return t("media.sourceLegacy");
    default:
      return t("media.sourceBrowser");
  }
}
