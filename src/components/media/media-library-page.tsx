import Link from "next/link";
import Image from "next/image";
import { FileText, Grid2X2, Image as ImageIcon, List, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaAssetActions } from "./media-asset-actions";
import { MediaSourcePicker } from "./media-source-picker";
import type { MediaKind, MediaSourceType } from "@/lib/media/contract";
import type { listMediaAssets } from "@/lib/media/service";

type MediaRow = Awaited<ReturnType<typeof listMediaAssets>>[number];

export function MediaLibraryPage({
  title,
  description,
  rows,
  workspaceOptions,
  canUpload,
  managerWorkspaceIds,
  includeTrashed,
  view,
  search,
  kind,
  t,
}: {
  title: string;
  description: string;
  rows: MediaRow[];
  workspaceOptions: { id: string; name: string }[];
  canUpload: boolean;
  managerWorkspaceIds: string[];
  includeTrashed: boolean;
  view: "grid" | "list";
  search: string;
  kind: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const hasFilters = Boolean(search || kind || includeTrashed);
  const viewHref = (nextView: "grid" | "list") => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (kind) params.set("kind", kind);
    if (includeTrashed) params.set("trash", "1");
    params.set("view", nextView);
    return `?${params.toString()}`;
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
      {canUpload ? (
        <div id="media-upload" className="scroll-mt-4">
          <MediaSourcePicker workspaceOptions={workspaceOptions} />
        </div>
      ) : null}
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
        <label
          className="text-body text-fg-primary inline-flex min-h-11 items-center gap-2 font-semibold"
          htmlFor="media-trash"
        >
          <Checkbox id="media-trash" name="trash" value="1" defaultChecked={includeTrashed} />
          {t("media.showTrashed")}
        </label>
        <input type="hidden" name="view" value={view} />
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
            description={hasFilters ? t("media.noResultsDescription") : t("media.emptyDescription")}
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
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MediaCard({
  row,
  t,
  canManage,
}: {
  row: MediaRow;
  t: (key: string, params?: Record<string, string | number>) => string;
  canManage: boolean;
}) {
  const kind = row.object.kind as MediaKind;
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;
  const downloadable = row.asset.status === "ready";
  const statusLabel = mediaStatusLabel(row, t);
  const thumbnail =
    downloadable && kind === "image" ? (
      <>
        <span className="sr-only">{t("media.download")}</span>
        <Image
          src={`/api/media/assets/${encodeURIComponent(row.asset.id)}`}
          alt={row.asset.altText ?? row.asset.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover"
          unoptimized
        />
      </>
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
      {downloadable ? (
        <a
          href={`/api/media/assets/${encodeURIComponent(row.asset.id)}?download=1`}
          className={`${thumbnailClassName} focus-visible:outline-none`}
          aria-label={`${t("media.download")}: ${row.asset.title}`}
        >
          {thumbnail}
        </a>
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
        </div>
        <MediaAssetActions
          assetId={row.asset.id}
          title={row.asset.title}
          trashed={row.asset.status === "trashed"}
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

function MediaListRow({
  row,
  t,
  canManage,
}: {
  row: MediaRow;
  t: (key: string, params?: Record<string, string | number>) => string;
  canManage: boolean;
}) {
  const kind = row.object.kind as MediaKind;
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;
  const downloadable = row.asset.status === "ready";
  const statusLabel = mediaStatusLabel(row, t);
  const thumbnail =
    downloadable && kind === "image" ? (
      <Image
        src={`/api/media/assets/${encodeURIComponent(row.asset.id)}`}
        alt={row.asset.altText ?? row.asset.title}
        fill
        sizes="56px"
        className="rounded-[var(--radius-control)] object-cover"
        unoptimized
      />
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
      {downloadable ? (
        <a
          href={`/api/media/assets/${encodeURIComponent(row.asset.id)}?download=1`}
          className={`${thumbnailClassName} focus-visible:ring-focus-ring focus:outline-none focus-visible:ring-2`}
          aria-label={`${t("media.download")}: ${row.asset.title}`}
        >
          {thumbnail}
        </a>
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
      </div>
      <Badge variant={mediaStatusVariant(row.asset.status)}>{statusLabel}</Badge>
      <MediaAssetActions
        assetId={row.asset.id}
        title={row.asset.title}
        trashed={row.asset.status === "trashed"}
        canManage={canManage}
      />
    </li>
  );
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
