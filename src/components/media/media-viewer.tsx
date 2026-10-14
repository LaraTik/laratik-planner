"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { MediaAssetActions } from "./media-asset-actions";
import { mediaAssetAltText, MediaKindIcon, mediaAssetSrc } from "./media-asset-shared";
import type { MediaLibraryRow } from "./media-asset-shared";
import { workspaceBasePath } from "@/lib/urls";

type ViewerContextValue = {
  openIndex: number | null;
  open: (index: number) => void;
};

const ViewerContext = React.createContext<ViewerContextValue>({
  openIndex: null,
  open: () => {},
});

export function useMediaViewer() {
  return React.useContext(ViewerContext);
}

/**
 * MediaViewer — the single lightbox for the library grid.
 *
 * The grid deliberately shows very little per tile (see `media-asset-tile`),
 * because a media library is browsed visually. Everything the tiles hide —
 * byte size, folder path, linked posts, and the full action menu — lives here,
 * so compacting the grid never removes capability.
 *
 * Owns its own open index and installs arrow-key navigation. Tiles stay
 * server-renderable data; only this subtree is a client component.
 */
export function MediaViewer({
  rows,
  folderOptionsById,
  managerWorkspaceIds,
  totalLabel,
  children,
}: {
  rows: MediaLibraryRow[];
  /** Flat folder list used to resolve a nested folder path for the caption. */
  folderOptionsById: { id: string; name: string; parentId?: string | null }[];
  managerWorkspaceIds: string[];
  totalLabel: string;
  /** The gallery itself. Rendered inside the viewer context so every tile can
   *  open the lightbox without each tile owning dialog state. */
  children: React.ReactNode;
}) {
  const t = useLocaleT();
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  // The grid re-renders when filters change, so an index that outlived its row
  // would point at the wrong asset. Clamp during render rather than in an
  // effect: a stale index simply resolves to a closed viewer, with no
  // cascading re-render and no flash of the wrong asset.
  const activeIndex = openIndex !== null && rows[openIndex] ? openIndex : null;
  const active = activeIndex === null ? null : rows[activeIndex];

  const go = React.useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null || rows.length === 0) return current;
        return (current + delta + rows.length) % rows.length;
      });
    },
    [rows.length],
  );

  React.useEffect(() => {
    if (activeIndex === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, go]);

  const contextValue = React.useMemo(
    () => ({ openIndex: activeIndex, open: (index: number) => setOpenIndex(index) }),
    [activeIndex],
  );

  return (
    <ViewerContext.Provider value={contextValue}>
      {children}
      {active ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setOpenIndex(null);
          }}
        >
          <DialogContent
            className="max-w-6xl"
            closeAriaLabel={t("common.close")}
            data-testid="media-viewer"
          >
            <DialogHeader>
              <DialogTitle dir="auto">{active.asset.title}</DialogTitle>
              <DialogDescription>
                {t("media.viewerCounter", {
                  current: (activeIndex ?? 0) + 1,
                  count: rows.length,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="bg-surface-subtle relative flex min-h-[min(60dvh,640px)] items-center justify-center overflow-hidden rounded-[var(--radius-control)] p-3">
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute start-3 z-10 shadow-sm"
                    aria-label={t("media.viewerPrevious")}
                    onClick={() => go(-1)}
                  >
                    <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                ) : null}
                <ViewerStage row={active} />
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute end-3 z-10 shadow-sm"
                    aria-label={t("media.viewerNext")}
                    onClick={() => go(1)}
                  >
                    <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <dl className="text-label text-fg-secondary grid gap-x-6 gap-y-1">
                  <ViewerFact label={t("media.kind")} value={t(mediaAssetKindLabel(active))} />
                  <ViewerFact label={t("media.size")} value={formatBytes(active.object.byteSize)} />
                  <ViewerFact label={t("media.source")} value={active.workspaceName} />
                  <ViewerFact
                    label={t("media.folder")}
                    value={resolveFolderPath(
                      active.asset.folderId,
                      folderOptionsById,
                      t("media.unfiled"),
                    )}
                  />
                </dl>
                <div className="flex items-center gap-2">
                  <Badge variant={mediaAssetStatusVariant(active.asset.status)}>
                    {t(mediaAssetStatusLabel(active))}
                  </Badge>
                  {active.asset.status === "ready" ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/api/media/assets/${encodeURIComponent(active.asset.id)}?download=1`}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("media.download")}
                      </a>
                    </Button>
                  ) : null}
                  <MediaAssetActions
                    assetId={active.asset.id}
                    title={active.asset.title}
                    kind={active.object.kind as "image" | "video" | "document"}
                    trashed={active.asset.status === "trashed"}
                    visibility={active.asset.visibility as "workspace" | "agency"}
                    folderId={active.asset.folderId}
                    folderOptions={folderOptionsById}
                    canManage={managerWorkspaceIds.includes(active.asset.ownerWorkspaceId)}
                  />
                </div>
              </div>
              {active.relatedContentItems.length > 0 ? (
                <div className="border-border bg-surface-subtle rounded-[var(--radius-control)] border px-3 py-2">
                  <p className="text-label text-fg-muted mb-1">
                    {t(
                      active.relatedContentItems.length === 1
                        ? "media.relatedPost"
                        : "media.relatedPosts",
                    )}
                  </p>
                  <ul className="grid gap-1">
                    {active.relatedContentItems.slice(0, 5).map((post) => (
                      <li key={post.contentItemId}>
                        <Link
                          href={`${workspaceBasePath(post.workspaceAgencySlug, post.workspaceSlug)}/planning/${post.contentItemId}#delivery`}
                          className="text-label text-primary focus-visible:ring-focus-ring inline-flex min-h-8 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] font-semibold hover:underline focus:outline-none focus-visible:ring-2"
                        >
                          <span className="min-w-0 truncate" dir="auto">
                            {post.title}
                          </span>
                          <span className="shrink-0 text-xs font-normal uppercase" dir="ltr">
                            {post.format.replaceAll("_", " ")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <p className="text-label text-fg-muted">{totalLabel}</p>
          </DialogContent>
        </Dialog>
      ) : null}
    </ViewerContext.Provider>
  );
}

/**
 * The hero surface. Images render at full fidelity inside a contained box
 * rather than cropped into a grid cell — this is the detail view, so the
 * whole frame has to be visible.
 */
function ViewerStage({ row }: { row: MediaLibraryRow }) {
  const kind = row.object.kind as "image" | "video" | "document";
  if (row.asset.status !== "ready") {
    return (
      <div
        className="text-fg-muted flex flex-col items-center gap-2"
        role="status"
        aria-label={row.asset.title}
      >
        <MediaKindIcon kind={kind} className="h-12 w-12" />
      </div>
    );
  }
  if (kind === "video") {
    return (
      <video
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="max-h-[56dvh] max-w-full"
        aria-label={mediaAssetAltText(row)}
      >
        <source src={mediaAssetSrc(row)} type={row.object.mimeType} />
      </video>
    );
  }
  if (kind === "document") {
    return (
      <div className="text-fg-muted flex flex-col items-center gap-2">
        <FileText className="h-12 w-12" aria-hidden="true" />
        <a
          href={`/api/media/assets/${encodeURIComponent(row.asset.id)}?download=1`}
          className="text-primary text-button font-semibold underline-offset-4 hover:underline"
        >
          {row.object.originalName ?? row.asset.title}
        </a>
      </div>
    );
  }
  return (
    // The media route is private and authenticates with the browser session,
    // so next/image's optimizer cannot fetch it. Raw <img> is the correct tool.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaAssetSrc(row)}
      alt={mediaAssetAltText(row)}
      className="max-h-[56dvh] max-w-full object-contain"
      decoding="async"
    />
  );
}

function ViewerFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="text-fg-muted">{label}:</dt>
      <dd className="text-fg-secondary min-w-0 truncate" dir="auto">
        {value}
      </dd>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function resolveFolderPath(
  folderId: string | null | undefined,
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

function mediaAssetKindLabel(row: MediaLibraryRow): string {
  if (row.object.kind === "image") return "media.images";
  if (row.object.kind === "video") return "media.videos";
  return "media.documents";
}

function mediaAssetStatusLabel(row: MediaLibraryRow): string {
  if (row.asset.sourceType === "legacy") return "media.legacy";
  if (row.asset.status === "ready") return "media.ready";
  if (row.asset.status === "processing") return "media.processing";
  if (row.asset.status === "failed") return "media.failed";
  if (row.asset.status === "trashed") return "media.trashed";
  return "media.deleted";
}

function mediaAssetStatusVariant(status: string): "success" | "warning" | "outline" {
  if (status === "ready") return "success";
  if (status === "failed") return "warning";
  return "outline";
}
