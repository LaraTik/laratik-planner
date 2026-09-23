import Link from "next/link";
import { Briefcase, FileText, Grid2X2, Image as ImageIcon, List, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaAssetActions } from "./media-asset-actions";
import { MediaAssetSelectionCheckbox, MediaSelectionToolbar } from "./media-selection-controls";
import { MediaFolderTree } from "./media-folder-tree";
import { MediaBreadcrumb } from "./media-breadcrumb";
import { MediaBulkToolbar } from "./media-bulk-toolbar";
import { MediaBulkHeader } from "./media-bulk-header";
import { MediaSelectionProvider } from "@/lib/media/selection-store";
import { MediaLibraryActions } from "./media-library-actions";
import { MediaStorageSummary } from "./media-storage-summary";
import type { MediaKind, MediaSourceType } from "@/lib/media/contract";
import type { listMediaAssets, MediaFolderTreeRow } from "@/lib/media/service";

type MediaRow = Awaited<ReturnType<typeof listMediaAssets>>[number] & {
  /**
   * PR 3 / Tier 3 (perf/media): short-lived R2 signed URL pointing
   * directly at the preview variant. When present, the `<img>` uses
   * it so the bytes flow R2 → browser without the Next.js proxy hop.
   * Null when the asset has no preview yet (legacy asset or the
   * generator failed at upload time) or the sign helper failed; the
   * component falls back to `/api/media/assets/<id>/preview` in that
   * case.
   */
  signedPreviewUrl?: string | null;
};

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
  rows: MediaRow[];
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
  return (
    <div className="flex flex-col gap-6" data-testid="media-library">
      <header className="order-1 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          {mode === "agency" ? (
            <>
              <p className="text-label text-fg-muted">{t("media.privateStorage")}</p>
              <h1 className="text-title-page text-fg-primary font-semibold text-balance break-words">
                {workspace?.name ?? t("media.library")}
              </h1>
              {activeFolderLabel && workspace ? (
                <MediaBreadcrumb
                  basePath={basePath}
                  workspaceId={selectedWorkspaceId}
                  workspaceName={workspace.name}
                  ancestors={ancestors ?? []}
                  currentLabel={activeFolderLabel}
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-label text-fg-muted">{t("media.privateStorage")}</p>
              <h1 className="text-title-page text-fg-primary font-semibold text-balance break-words">
                {workspace?.name ?? t("media.title")}
              </h1>
              {activeFolderLabel && workspace ? (
                <MediaBreadcrumb
                  basePath={basePath}
                  workspaceId={selectedWorkspaceId}
                  workspaceName={workspace.name}
                  ancestors={ancestors ?? []}
                  currentLabel={activeFolderLabel}
                />
              ) : null}
            </>
          )}
          <MediaStorageSummary
            mode={storageSummary.mode}
            bucket={storageSummary.bucket}
            keyPrefix={storageSummary.keyPrefix}
          />
          <p className="text-body text-fg-secondary mt-2 max-w-3xl text-pretty">
            {t("media.description")}
          </p>
        </div>
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
          folderOptionsByWorkspace={
            workspace
              ? {
                  [workspace.id]: (folderTree ?? []).map((f) => ({
                    id: f.id,
                    name: f.name,
                    parentId: f.parentId,
                  })),
                }
              : {}
          }
          initialSource={initialSource}
        />
      </header>
      <div className="order-2 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid gap-3 lg:w-72 lg:shrink-0 xl:w-80">
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
              canManage={managerWorkspaceIds.includes(selectedWorkspaceId)}
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
              className="bg-primary hover:bg-primary-hover focus-visible:ring-focus-ring text-button inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-4 font-semibold text-white focus:outline-none focus-visible:ring-2"
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
          <div className="flex justify-end" aria-label={t("media.viewOptions")}>
            <div className="border-border bg-surface inline-flex rounded-[var(--radius-control)] border p-1">
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
            <MediaSelectionProvider canWrite={managerWorkspaceIds.includes(selectedWorkspaceId)}>
              <MediaBulkToolbar
                workspaceId={selectedWorkspaceId}
                folders={folderTree}
                canWrite={managerWorkspaceIds.includes(selectedWorkspaceId)}
                hasTrashedSelected={includeTrashed}
                pageAssetIds={rows.map((row) => row.asset.id)}
                total={pageInfo.total}
                pageSize={pageInfo.pageSize}
              />
            </MediaSelectionProvider>
          ) : null}
          {folderTree && rows.length > 0 ? (
            <MediaSelectionProvider canWrite={managerWorkspaceIds.includes(selectedWorkspaceId)}>
              <MediaBulkHeader
                pageAssetIds={rows.map((row) => row.asset.id)}
                total={pageInfo.total}
                pageSize={pageInfo.pageSize}
                canWrite={managerWorkspaceIds.includes(selectedWorkspaceId)}
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row, index) => (
                <MediaCard
                  key={row.asset.id}
                  row={row}
                  t={t}
                  canManage={managerWorkspaceIds.includes(row.asset.ownerWorkspaceId)}
                  folderOptions={(folderTree ?? []).map((f) => ({
                    id: f.id,
                    name: f.name,
                    parentId: f.parentId,
                  }))}
                  // Prioritise only the first viewport's worth of previews:
                  // three cards on wide screens plus one small-screen buffer.
                  // Anything past that stays lazy.
                  // The remaining cards stay lazy so a 24-item page does not
                  // turn into an eager burst of Cloudflare requests.
                  priority={index < 4}
                  // Grid thumb is 1 of 3 columns at xl (~33vw), 1 of 2
                  // at sm (~50vw), and full-width on mobile. Used by
                  // browsers that pick a `srcset` density; we have no
                  // variant today but wiring `sizes` now keeps the
                  // PR 2 thumbnail pipeline a one-line change away.
                  sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              ))}
            </div>
          ) : (
            <div className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border">
              <ul className="divide-border divide-y">
                {rows.map((row, index) => (
                  <MediaListRow
                    key={row.asset.id}
                    row={row}
                    t={t}
                    canManage={managerWorkspaceIds.includes(row.asset.ownerWorkspaceId)}
                    folderOptions={(folderTree ?? []).map((f) => ({
                      id: f.id,
                      name: f.name,
                      parentId: f.parentId,
                    }))}
                    priority={index < 4}
                    sizes="56px"
                  />
                ))}
              </ul>
            </div>
          )}
          <nav
            className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border p-3"
            aria-label={t("common.paginationAria")}
          >
            <span className="text-label text-fg-secondary">
              {t("media.pageSummary", { page: pageInfo.page })}
            </span>
            <div className="flex gap-2">
              {pageInfo.hasPreviousPage ? (
                <Link
                  href={pageHref(pageInfo.page - 1)}
                  className="border-border text-button focus-visible:ring-focus-ring hover:bg-surface-subtle inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
                >
                  {t("media.previousPage")}
                </Link>
              ) : null}
              {pageInfo.hasNextPage ? (
                <Link
                  href={pageHref(pageInfo.page + 1)}
                  className="border-border text-button focus-visible:ring-focus-ring hover:bg-surface-subtle inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
                >
                  {t("media.nextPage")}
                </Link>
              ) : null}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

function MediaCard({
  row,
  t,
  canManage,
  folderOptions,
  priority = false,
  sizes = "100vw",
}: {
  row: MediaRow;
  t: (key: string, params?: Record<string, string | number>) => string;
  canManage: boolean;
  folderOptions: { id: string; name: string; parentId?: string | null }[];
  priority?: boolean;
  sizes?: string;
}) {
  const kind = row.object.kind as MediaKind;
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;
  const downloadable = row.asset.status === "ready";
  const statusLabel = mediaStatusLabel(row, t);
  // Width/height come from `storage_objects` populated by the upload
  // validator (`validateStoredMediaObject`). They are null for legacy
  // assets where extraction failed; in that case we omit the attrs so
  // the browser falls back to layout-driven sizing (the parent already
  // reserves `aspect-[4/3]`).
  const intrinsicWidth =
    typeof row.object.width === "number" && row.object.width > 0 ? row.object.width : undefined;
  const intrinsicHeight =
    typeof row.object.height === "number" && row.object.height > 0 ? row.object.height : undefined;
  // PR 3 / Tier 3 (perf/media): when the parent page issued a signed
  // R2 URL for the preview variant, render it directly. Otherwise
  // fall back to the proxy route that PR 2 shipped (`/preview`); the
  // legacy `<id>` route is the last resort for assets that never had
  // a preview generated. The signed URL is the cheapest path — R2's
  // Cloudflare edge serves the bytes without our Node process in
  // the loop. See `getSignedPreviewUrl` in `src/lib/media/thumbnails.ts`
  // for the auth gate that produces the URL.
  const hasPreview =
    typeof row.object.previewStorageObjectId === "string" &&
    row.object.previewStorageObjectId.length > 0;
  const thumbnailSrc =
    row.signedPreviewUrl ??
    (hasPreview
      ? `/api/media/assets/${encodeURIComponent(row.asset.id)}/preview`
      : `/api/media/assets/${encodeURIComponent(row.asset.id)}`);
  const thumbnail =
    downloadable && kind === "image" ? (
      <>
        <span className="sr-only">{t("media.download")}</span>
        {/* The media route is private. A browser request keeps the session
            cookie available; next/image's optimizer cannot authenticate it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailSrc}
          alt={row.asset.altText ?? row.asset.title}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // `fetchpriority` is the modern equivalent of `priority` on
          // next/image; it tells the browser to compete for bandwidth
          // on first paint for the above-the-fold cards. Browsers
          // without support (Safari < 17.4) ignore the attribute.
          // Emit intrinsic width/height only when BOTH are present —
          // a half-known dimension misleads the browser about the
          // aspect ratio and triggers a layout shift on load.
          {...(intrinsicWidth !== undefined && intrinsicHeight !== undefined
            ? { width: intrinsicWidth, height: intrinsicHeight }
            : {})}
          {...(priority ? { fetchPriority: "high" as const } : {})}
          sizes={sizes}
          className="h-full w-full object-cover"
        />
      </>
    ) : downloadable && kind === "video" ? (
      <video
        controls
        playsInline
        preload="metadata"
        aria-label={row.asset.altText ?? row.asset.title}
        className="h-full w-full object-cover"
      >
        <source
          src={`/api/media/assets/${encodeURIComponent(row.asset.id)}`}
          type={row.object.mimeType}
        />
      </video>
    ) : (
      <>
        <Icon className="h-12 w-12" aria-hidden="true" />
        {!downloadable ? <span className="sr-only">{statusLabel}</span> : null}
      </>
    );
  const thumbnailClassName =
    "bg-surface-subtle text-fg-muted focus-visible:ring-focus-ring relative flex aspect-[4/3] items-center justify-center focus-visible:ring-2";
  return (
    <article className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border">
      {downloadable && kind !== "video" ? (
        <a
          href={`/api/media/assets/${encodeURIComponent(row.asset.id)}?download=1`}
          className={`${thumbnailClassName} focus-visible:outline-none`}
          aria-label={`${t("media.download")}: ${row.asset.title}`}
        >
          {thumbnail}
        </a>
      ) : downloadable && kind === "video" ? (
        <div className={thumbnailClassName}>{thumbnail}</div>
      ) : (
        <div className={thumbnailClassName} role="status" aria-label={statusLabel}>
          {thumbnail}
        </div>
      )}
      <div className="grid gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {downloadable ? (
              <MediaAssetSelectionCheckbox assetId={row.asset.id} title={row.asset.title} />
            ) : null}
            <div className="min-w-0">
              <h2 className="text-title-card text-fg-primary truncate font-semibold">
                {row.asset.title}
              </h2>
              <p className="text-label text-fg-muted mt-1 truncate">
                {row.object.originalName ?? "—"}
              </p>
            </div>
          </div>
          <Badge variant={mediaStatusVariant(row.asset.status)}>{statusLabel}</Badge>
        </div>
        <div className="text-label text-fg-secondary flex flex-wrap gap-x-2 gap-y-1">
          <span>{formatBytes(row.object.byteSize)}</span>
          <span>{row.workspaceName}</span>
          <span>
            <span className="sr-only">{t("media.source")}: </span>
            {mediaSourceLabel(row.asset.sourceType as MediaSourceType, t)}
          </span>
          <span>
            {row.asset.visibility === "agency" ? t("media.agencyShared") : t("media.workspaceOnly")}
          </span>
          <span>
            <span className="sr-only">{t("media.folder")}: </span>
            <span dir="auto">
              {formatFolderPath(row.folder?.id, folderOptions, t("media.unfiled"))}
            </span>
          </span>
        </div>
        <RelatedPosts row={row} t={t} />
        <MediaAssetActions
          assetId={row.asset.id}
          title={row.asset.title}
          kind={kind}
          trashed={row.asset.status === "trashed"}
          visibility={row.asset.visibility as "workspace" | "agency"}
          folderId={row.asset.folderId}
          folderOptions={folderOptions}
          canManage={canManage}
        />
      </div>
    </article>
  );
}

function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function RelatedPosts({
  row,
  t,
}: {
  row: MediaRow;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const related = row.relatedContentItems;
  if (related.length === 0) {
    return <p className="text-label text-fg-muted">{t("media.notLinkedToPost")}</p>;
  }
  return (
    <div className="border-border bg-surface-subtle rounded-[var(--radius-control)] border px-3 py-2">
      <p className="text-label text-fg-muted mb-1">
        {t(related.length === 1 ? "media.relatedPost" : "media.relatedPosts")}
      </p>
      <div className="grid gap-1">
        {related.slice(0, 3).map((post) => (
          <Link
            key={post.contentItemId}
            href={`/app/w/${post.workspaceSlug}/planning/${post.contentItemId}#delivery`}
            className="text-label text-primary focus-visible:ring-focus-ring inline-flex min-h-8 items-center justify-between gap-2 rounded-[var(--radius-control)] font-semibold hover:underline focus:outline-none focus-visible:ring-2"
          >
            <span className="min-w-0 truncate" dir="auto">
              {post.title}
            </span>
            <span className="shrink-0 text-xs font-normal uppercase" dir="ltr">
              {post.format.replaceAll("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MediaListRow({
  row,
  t,
  canManage,
  folderOptions,
  priority = false,
  sizes = "100vw",
}: {
  row: MediaRow;
  t: (key: string, params?: Record<string, string | number>) => string;
  canManage: boolean;
  folderOptions: { id: string; name: string; parentId?: string | null }[];
  priority?: boolean;
  sizes?: string;
}) {
  const kind = row.object.kind as MediaKind;
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;
  const downloadable = row.asset.status === "ready";
  const statusLabel = mediaStatusLabel(row, t);
  // List-view thumb is rendered at 56×56 (h-14 w-14). We still pass
  // intrinsic width/height so the browser reserves layout space and
  // skips a full-pixel decode for legacy assets that ship without
  // a stored dimension.
  const intrinsicWidth =
    typeof row.object.width === "number" && row.object.width > 0 ? row.object.width : undefined;
  const intrinsicHeight =
    typeof row.object.height === "number" && row.object.height > 0 ? row.object.height : undefined;
  // PR 3: same signed-URL preference as the grid card above. List-view
  // thumbs render at 56x56 px so the byte savings are particularly
  // stark — the variant drops the typical asset from ~2 MB to ~25 KB.
  const hasPreview =
    typeof row.object.previewStorageObjectId === "string" &&
    row.object.previewStorageObjectId.length > 0;
  const thumbnailSrc =
    row.signedPreviewUrl ??
    (hasPreview
      ? `/api/media/assets/${encodeURIComponent(row.asset.id)}/preview`
      : `/api/media/assets/${encodeURIComponent(row.asset.id)}`);
  const thumbnail =
    downloadable && kind === "image" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailSrc}
        alt={row.asset.altText ?? row.asset.title}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...(intrinsicWidth !== undefined && intrinsicHeight !== undefined
          ? { width: intrinsicWidth, height: intrinsicHeight }
          : {})}
        {...(priority ? { fetchPriority: "high" as const } : {})}
        sizes={sizes}
        className="h-full w-full rounded-[var(--radius-control)] object-cover"
      />
    ) : downloadable && kind === "video" ? (
      <video
        controls
        playsInline
        preload="metadata"
        aria-label={row.asset.altText ?? row.asset.title}
        className="h-full w-full rounded-[var(--radius-control)] object-cover"
      >
        <source
          src={`/api/media/assets/${encodeURIComponent(row.asset.id)}`}
          type={row.object.mimeType}
        />
      </video>
    ) : (
      <>
        <Icon className="h-6 w-6" aria-hidden="true" />
        {!downloadable ? <span className="sr-only">{statusLabel}</span> : null}
      </>
    );
  const thumbnailClassName =
    "bg-surface-subtle text-fg-muted relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-control)]";
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      {downloadable && kind !== "video" ? (
        <a
          href={`/api/media/assets/${encodeURIComponent(row.asset.id)}?download=1`}
          className={`${thumbnailClassName} focus-visible:ring-focus-ring focus:outline-none focus-visible:ring-2`}
          aria-label={`${t("media.download")}: ${row.asset.title}`}
        >
          {thumbnail}
        </a>
      ) : downloadable && kind === "video" ? (
        <div className={thumbnailClassName}>{thumbnail}</div>
      ) : (
        <div className={thumbnailClassName} role="status" aria-label={statusLabel}>
          {thumbnail}
        </div>
      )}
      {downloadable ? (
        <MediaAssetSelectionCheckbox assetId={row.asset.id} title={row.asset.title} />
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-body text-fg-primary truncate font-semibold">{row.asset.title}</h2>
        <p className="text-label text-fg-muted truncate">{row.object.originalName ?? "—"}</p>
      </div>
      <div className="text-label text-fg-secondary flex flex-wrap gap-x-3 gap-y-1 sm:max-w-xs sm:justify-end">
        <span>{formatBytes(row.object.byteSize)}</span>
        <span>{row.workspaceName}</span>
        <span>
          <span className="sr-only">{t("media.source")}: </span>
          {mediaSourceLabel(row.asset.sourceType as MediaSourceType, t)}
        </span>
        <span>
          {row.asset.visibility === "agency" ? t("media.agencyShared") : t("media.workspaceOnly")}
        </span>
        <span>
          <span className="sr-only">{t("media.folder")}: </span>
          <span dir="auto">
            {formatFolderPath(row.folder?.id, folderOptions, t("media.unfiled"))}
          </span>
        </span>
      </div>
      <div className="w-full sm:w-auto sm:min-w-52">
        <RelatedPosts row={row} t={t} />
      </div>
      <Badge variant={mediaStatusVariant(row.asset.status)}>{statusLabel}</Badge>
      <MediaAssetActions
        assetId={row.asset.id}
        title={row.asset.title}
        kind={kind}
        trashed={row.asset.status === "trashed"}
        visibility={row.asset.visibility as "workspace" | "agency"}
        folderId={row.asset.folderId}
        folderOptions={folderOptions}
        canManage={canManage}
      />
    </li>
  );
}

function formatFolderPath(
  folderId: string | undefined,
  folders: { id: string; name: string; parentId?: string | null }[],
  unfiledLabel: string,
): string {
  if (!folderId) return unfiledLabel;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = folderId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) break;
    names.unshift(folder.name);
    currentId = folder.parentId ?? undefined;
  }
  return names.length > 0 ? names.join(" / ") : unfiledLabel;
}

function mediaStatusLabel(
  row: MediaRow,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (row.asset.sourceType === "legacy") return t("media.legacy");
  if (row.asset.status === "ready") return t("media.ready");
  if (row.asset.status === "processing") return t("media.processing");
  if (row.asset.status === "failed") return t("media.failed");
  if (row.asset.status === "trashed") return t("media.trashed");
  return t("media.deleted");
}

function mediaStatusVariant(status: string): "success" | "warning" | "outline" {
  if (status === "ready") return "success";
  if (status === "failed") return "warning";
  return "outline";
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
