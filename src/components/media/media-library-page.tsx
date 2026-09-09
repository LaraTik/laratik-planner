import Link from "next/link";
import { FileText, Grid2X2, Image as ImageIcon, List, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaAssetActions } from "./media-asset-actions";
import { MediaFolderSidebar } from "./media-folder-sidebar";
import { MediaSourcePicker } from "./media-source-picker";
import type { MediaKind, MediaSourceType } from "@/lib/media/contract";
import type { listMediaAssets } from "@/lib/media/service";

type MediaRow = Awaited<ReturnType<typeof listMediaAssets>>[number];

export function MediaLibraryPage({
  title,
  description,
  rows,
  workspaceOptions,
  folderWorkspaceOptions,
  folderOptionsByWorkspace,
  basePath,
  selectedWorkspaceId,
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
}: {
  title: string;
  description: string;
  rows: MediaRow[];
  workspaceOptions: { id: string; name: string }[];
  folderWorkspaceOptions: { id: string; name: string }[];
  folderOptionsByWorkspace: Record<
    string,
    { id: string; name: string; parentId?: string | null }[]
  >;
  basePath: string;
  selectedWorkspaceId: string;
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
  pageInfo: { page: number; pageSize: number; hasPreviousPage: boolean; hasNextPage: boolean };
  initialSource?: "device" | "link";
  t: (key: string, params?: Record<string, string | number>) => string;
  storageSummary: {
    mode: "managed" | "agency_owned";
    bucket: string | null;
    keyPrefix: string;
  };
}) {
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
    <div className="space-y-6" data-testid="media-library">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-label text-fg-muted">{t("media.privateStorage")}</p>
          <h1 className="text-title-page text-fg-primary font-semibold text-balance break-words">
            {title}
          </h1>
          <p className="text-body text-fg-secondary mt-1 max-w-3xl text-pretty">{description}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {canUpload ? (
            <a
              href="#media-upload"
              className="bg-primary hover:bg-primary-hover focus-visible:ring-focus-ring text-button inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-4 font-semibold text-white focus:outline-none focus-visible:ring-2"
            >
              {t("media.upload")}
            </a>
          ) : null}
        </div>
      </header>
      <Card variant="subtle" padding="md" data-testid="media-storage-destination">
        <div className="min-w-0">
          <h2 className="text-title-card text-fg-primary font-semibold">
            {t("media.storageDestinationTitle")}
          </h2>
          <p className="text-label text-fg-secondary mt-1 max-w-3xl">
            {t("media.storageDestinationDescription")}
          </p>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-label text-fg-muted">{t("media.storageMode")}</dt>
            <dd className="text-body text-fg-primary mt-1 font-semibold">
              {storageSummary.mode === "agency_owned"
                ? t("storage.ownedMode")
                : t("storage.managedMode")}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-label text-fg-muted">{t("media.storageBucket")}</dt>
            <dd className="text-body text-fg-primary mt-1 font-semibold break-all" dir="ltr">
              {storageSummary.bucket ?? t("storage.notConfiguredShort")}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-label text-fg-muted">{t("media.storagePrefix")}</dt>
            <dd className="text-body text-fg-primary mt-1 font-mono text-sm break-all" dir="ltr">
              {storageSummary.keyPrefix}
            </dd>
          </div>
        </dl>
        <p className="text-label text-fg-muted mt-4">{t("media.storageFileNameRule")}</p>
      </Card>
      {canUpload ? (
        <div id="media-upload" className="scroll-mt-4">
          <MediaSourcePicker
            workspaceOptions={workspaceOptions}
            folderOptionsByWorkspace={folderOptionsByWorkspace}
            initialSource={initialSource}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid gap-3 lg:w-56 lg:shrink-0">
          {folderWorkspaceOptions.map((workspace) => (
            <MediaFolderSidebar
              key={workspace.id}
              basePath={basePath}
              preserveParams={preserveParams}
              workspaceId={workspace.id}
              workspaceName={workspace.name}
              folders={folderOptionsByWorkspace[workspace.id] ?? []}
              activeFolder={selectedWorkspaceId === workspace.id ? selectedFolderId : ""}
              sharedOnly={selectedWorkspaceId === workspace.id && sharedOnly}
              canManage={managerWorkspaceIds.includes(workspace.id)}
              labels={{
                folders: t("media.folders"),
                allMedia: t("media.allMedia"),
                unfiled: t("media.unfiled"),
                agencyShared: t("media.agencySharedFilter"),
                newFolder: t("media.newFolder"),
                folderName: t("media.folderName"),
                folderPlaceholder: t("media.folderNamePlaceholder"),
                createFolder: t("media.createFolder"),
                newSubfolder: t("media.newSubfolder"),
                parentFolder: t("media.parentFolder"),
                rootFolder: t("media.rootFolder"),
                folderError: t("media.folderError"),
                renameFolder: t("media.renameFolder"),
                archiveFolder: t("media.archiveFolder"),
                archiveConfirm: t("media.archiveConfirm"),
              }}
            />
          ))}
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
              {rows.map((row) => (
                <MediaCard
                  key={row.asset.id}
                  row={row}
                  t={t}
                  canManage={managerWorkspaceIds.includes(row.asset.ownerWorkspaceId)}
                  folderOptions={folderOptionsByWorkspace[row.asset.ownerWorkspaceId] ?? []}
                />
              ))}
            </div>
          ) : (
            <div className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border">
              <ul className="divide-border divide-y">
                {rows.map((row) => (
                  <MediaListRow
                    key={row.asset.id}
                    row={row}
                    t={t}
                    canManage={managerWorkspaceIds.includes(row.asset.ownerWorkspaceId)}
                    folderOptions={folderOptionsByWorkspace[row.asset.ownerWorkspaceId] ?? []}
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
}: {
  row: MediaRow;
  t: (key: string, params?: Record<string, string | number>) => string;
  canManage: boolean;
  folderOptions: { id: string; name: string; parentId?: string | null }[];
}) {
  const kind = row.object.kind as MediaKind;
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;
  const downloadable = row.asset.status === "ready";
  const statusLabel = mediaStatusLabel(row, t);
  const thumbnail =
    downloadable && kind === "image" ? (
      <>
        <span className="sr-only">{t("media.download")}</span>
        {/* The media route is private. A browser request keeps the session
            cookie available; next/image's optimizer cannot authenticate it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/assets/${encodeURIComponent(row.asset.id)}`}
          alt={row.asset.altText ?? row.asset.title}
          loading="lazy"
          decoding="async"
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
          <div className="min-w-0">
            <h2 className="text-title-card text-fg-primary truncate font-semibold">
              {row.asset.title}
            </h2>
            <p className="text-label text-fg-muted mt-1 truncate">
              {row.object.originalName ?? "—"}
            </p>
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
}: {
  row: MediaRow;
  t: (key: string, params?: Record<string, string | number>) => string;
  canManage: boolean;
  folderOptions: { id: string; name: string; parentId?: string | null }[];
}) {
  const kind = row.object.kind as MediaKind;
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;
  const downloadable = row.asset.status === "ready";
  const statusLabel = mediaStatusLabel(row, t);
  const thumbnail =
    downloadable && kind === "image" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/media/assets/${encodeURIComponent(row.asset.id)}`}
        alt={row.asset.altText ?? row.asset.title}
        loading="lazy"
        decoding="async"
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
