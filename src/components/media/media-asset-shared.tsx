import { FileText, Image as ImageIcon, Video } from "lucide-react";
import type { MediaKind } from "@/lib/media/contract";
import type { listMediaAssets } from "@/lib/media/service";

/**
 * Renders the glyph for a media kind.
 *
 * A component rather than a `kind -> Component` lookup: the repo's
 * `react-hooks/static-components` rule rejects creating a component during
 * render, and picking a component out of an object inside a component body is
 * exactly that. Branching inside a stable component keeps the icon a module
 * constant.
 */
export function MediaKindIcon({
  kind,
  className,
}: {
  kind: MediaKind | string;
  className?: string;
}) {
  if (kind === "image") return <ImageIcon className={className} aria-hidden="true" />;
  if (kind === "video") return <Video className={className} aria-hidden="true" />;
  return <FileText className={className} aria-hidden="true" />;
}

/**
 * The library grid's row type, shared by the server-rendered page, the grid
 * tile, and the lightbox. It lives here rather than in `media-library-page.tsx`
 * so the client components can import it without pulling the page in.
 */
export type MediaLibraryRow = Awaited<ReturnType<typeof listMediaAssets>>[number] & {
  /**
   * Short-lived R2 signed URL pointing directly at the preview variant. When
   * present the tile and viewer emit it so the bytes flow R2 → browser without
   * the Next.js proxy hop. Null when the asset has no preview yet (legacy
   * asset, or the generator failed at upload time), or when signing failed —
   * callers then fall back to the authenticated proxy route.
   */
  signedPreviewUrl?: string | null;
};

/** Aspect ratio used when an asset has no usable stored dimensions. */
const FALLBACK_ASPECT_RATIO = 4 / 3;

/**
 * Extreme ratios are clamped so one panorama or one ultra-tall screenshot
 * cannot produce a 4px sliver or a 2000px column and break the rhythm of the
 * gallery. 9:16 (0.5625) sits inside the range, so vertical reels and stories
 * still render uncropped — which is the whole point of the masonry.
 */
const MIN_ASPECT_RATIO = 0.5;
const MAX_ASPECT_RATIO = 2;

/**
 * The asset's true width / height, clamped for layout.
 *
 * This is the fix for the "images display incorrectly" complaint in grid view:
 * the old card forced `aspect-[4/3]` with `object-cover`, which centre-cropped
 * every 9:16 reel down to a horizontal sliver. Matching the container's aspect
 * to the asset's own means `object-cover` now has nothing left to crop.
 */
export function assetAspectRatio(row: MediaLibraryRow): number {
  const width = row.object.width;
  const height = row.object.height;
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return FALLBACK_ASPECT_RATIO;
  }
  const ratio = width / height;
  return Math.min(Math.max(ratio, MIN_ASPECT_RATIO), MAX_ASPECT_RATIO);
}

/**
 * Preferred image source: the signed edge URL when available, otherwise the
 * authenticated proxy route. Assets that never got a preview variant fall back
 * to the original object, which is correct but heavy — those are the rows that
 * make a page feel slow, so they are worth backfilling.
 */
export function mediaAssetSrc(row: MediaLibraryRow): string {
  if (row.signedPreviewUrl) return row.signedPreviewUrl;
  const hasPreview =
    typeof row.object.previewStorageObjectId === "string" &&
    row.object.previewStorageObjectId.length > 0;
  return hasPreview
    ? `/api/media/assets/${encodeURIComponent(row.asset.id)}/preview`
    : `/api/media/assets/${encodeURIComponent(row.asset.id)}`;
}

export function mediaAssetAltText(row: MediaLibraryRow): string {
  return row.asset.altText ?? row.asset.title;
}

export function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * Walks a folder's ancestor chain to build its display path. Guards against a
 * cycle in folder data with a visited set rather than trusting the tree.
 */
export function resolveFolderPath(
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
