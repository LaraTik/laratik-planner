"use client";

import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MediaAssetSelectionCheckbox } from "./media-selection-controls";
import { useMediaViewer } from "./media-viewer";
import {
  assetAspectRatio,
  formatBytes,
  mediaAssetAltText,
  MediaKindIcon,
  mediaAssetSrc,
  resolveFolderPath,
  type MediaLibraryRow,
} from "./media-asset-shared";
import { useLocaleT } from "@/components/i18n/locale-provider";
import type { MediaKind } from "@/lib/media/contract";

/**
 * One tile in the masonry gallery.
 *
 * Design intent (per `design-system.md` + the product-UI track): the gallery is
 * the work surface, so it carries almost nothing per tile. Browsing is visual,
 * so the tile shows the asset at its own aspect ratio; everything else — byte
 * size, folder path, linked posts, the action menu — lives in the lightbox.
 * Keeping tiles light is what makes 24 of them feel like a gallery rather than
 * the wall of boxes the old card grid produced.
 *
 * Two deliberate omissions:
 * - No `<video>` element. The old grid mounted a player per video row, so a
 *   page of mixed media opened up to 24 video elements, each with controls and
 *   its own range request. A video is now a still tile with a play glyph; the
 *   lightbox is the single player.
 * - No `object-cover` cropping. The container's `aspect-ratio` is set from the
 *   asset's stored width/height, so cover has nothing to crop and 9:16 reels
 *   survive intact.
 */
export function MediaAssetTile({
  row,
  index,
  folderOptions,
  priority = false,
}: {
  row: MediaLibraryRow;
  index: number;
  folderOptions: { id: string; name: string; parentId?: string | null }[];
  /** Eager-load the first viewport only; everything else stays lazy. */
  priority?: boolean;
}) {
  const t = useLocaleT();
  const { open } = useMediaViewer();
  const kind = row.object.kind as MediaKind;
  const ready = row.asset.status === "ready";
  const ratio = assetAspectRatio(row);
  const title = row.asset.title;

  const caption = [
    kind === "video"
      ? t("media.videos")
      : kind === "image"
        ? t("media.images")
        : t("media.documents"),
    formatBytes(row.object.byteSize),
    resolveFolderPath(row.asset.folderId, folderOptions, t("media.unfiled")),
  ].join(" · ");

  return (
    <figure className="group/media relative mb-3 break-inside-avoid">
      <button
        type="button"
        onClick={() => open(index)}
        aria-label={t("media.openAsset", { name: title })}
        className="border-border bg-surface focus-visible:ring-focus-ring block w-full cursor-zoom-in overflow-hidden rounded-[var(--radius-card)] border text-start transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_2px_8px_-2px_rgba(0,0,0,0.10)] focus:outline-none focus-visible:ring-2"
        style={{ aspectRatio: String(ratio) }}
      >
        {ready && kind === "image" ? (
          // The media route is private and authenticates with the browser
          // session cookie; next/image's optimizer cannot authenticate it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaAssetSrc(row)}
            alt={mediaAssetAltText(row)}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            {...(priority ? { fetchPriority: "high" as const } : {})}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-fg-muted flex h-full w-full flex-col items-center justify-center gap-2">
            <MediaKindIcon kind={kind} className="h-8 w-8" />
            {kind === "video" && ready ? <Play className="h-5 w-5" aria-hidden="true" /> : null}
          </span>
        )}

        {/* Hover/focus caption. `aria-hidden` because the button's own
            accessible name already carries the title; this is the visual
            affordance, not a second reading of the same thing. */}
        <span
          aria-hidden="true"
          className="from-surface/95 pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t to-transparent p-3 pt-8 opacity-0 transition-opacity duration-150 group-focus-within/media:opacity-100 group-hover/media:opacity-100"
        >
          <span className="text-label text-fg-primary truncate font-semibold" dir="auto">
            {title}
          </span>
          <span className="text-label text-fg-secondary truncate" dir="auto">
            {caption}
          </span>
        </span>
      </button>

      {!ready ? (
        <span
          className="pointer-events-none absolute start-2 top-2"
          data-testid="media-tile-status"
        >
          <Badge variant={row.asset.status === "failed" ? "warning" : "outline"}>
            {t(
              row.asset.status === "processing"
                ? "media.processing"
                : row.asset.status === "failed"
                  ? "media.failed"
                  : row.asset.status === "trashed"
                    ? "media.trashed"
                    : "media.deleted",
            )}
          </Badge>
        </span>
      ) : null}

      {/* Selection is the only control that belongs on the tile. The full action
          panel (`MediaAssetActions`) is a card-footer component — roughly a
          rename form plus visibility, move, share and trash controls — and
          absolutely positioning it over a tile buried the tile's own click
          target under a 300px panel. Actions live in the lightbox, which has
          room for them; the tile's one job is to open it.

          `pointer-events-none` matters here: `opacity-0` alone still
          hit-tests, so the hidden checkbox swallowed clicks on the corner of
          every tile. Keyboard users are unaffected — tabbing moves focus
          without the pointer, and `focus-within` hands the pointer back. */}
      {ready ? (
        <span className="pointer-events-none absolute start-1 top-1 opacity-0 transition-opacity duration-150 group-hover/media:pointer-events-auto group-hover/media:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          <MediaAssetSelectionCheckbox assetId={row.asset.id} title={row.asset.title} />
        </span>
      ) : null}
    </figure>
  );
}
