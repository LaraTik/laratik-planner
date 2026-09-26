"use client";

import * as React from "react";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Image as ImageIcon,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useImageDimensions } from "@/lib/preview/use-image-dimensions";
import {
  diagnoseAspectRatio,
  FEED_RATIOS,
  REEL_RATIOS,
  type AspectRatioSpec,
} from "@/lib/preview/instagram-aspect-ratios";
import { AspectRatioDiagnosticView } from "@/components/preview/aspect-ratio-diagnostic";
import { SafeAreaOverlay, type SafeAreaShape } from "@/components/preview/safe-area-overlay";
import { LinkifyText } from "@/components/ui/linkify-text";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { platformLabel } from "@/components/workspace/platform-icon";

/**
 * PlatformPreview — a recognisable, format-aware preview of a
 * social post. Not a pixel-perfect Instagram clone; the goal is
 * to let the planner see the shape of the post before it ships.
 *
 * The preview supports three Instagram-shaped formats (feed /
 * reel / story) and a generic "post" fallback for other
 * platforms. The user can switch formats inline and inspect the
 * same asset at Square, Portrait, or Story/Reel dimensions.
 *
 * Why not fetch a real preview from the platform API? The
 * platform's own OG image / embed requires the post to exist;
 * the planner needs the preview *before* publishing. So we
 * render a faithful stand-in.
 *
 * Phase 4 of the planning-workspace-v2 refactor (2026-08-30)
 * added:
 *   - **Aspect-ratio diagnostic** — the preview now measures
 *     the loaded image and reports whether it matches the
 *     destination's recommended shape. The diagnostic is
 *     rendered as a status pill below the media area; warnings
 *     carry a one-line recommendation (e.g. "Try 1080 × 1350
 *     for 4:5").
 *   - **Safe-area overlay** for Reels/Stories — toggle a
 *     translucent mask over the regions the Instagram UI
 *     typically covers (caption, profile, action buttons).
 *
 * Contract:
 *   - `<PlatformPreview />` is a Client Component because it
 *     owns format-switch state, but it takes plain serialisable
 *     props from the server.
 *   - Updates to the caption or thumbnail flow in via props; the
 *     preview re-renders. (Re-renders are cheap — the component
 *     is small.)
 */
export type PreviewFormat = "feed" | "reel" | "story" | "post";
type PreviewDimension = "square" | "portrait" | "vertical";

export interface PlatformPreviewProps {
  platform: string;
  accountName: string;
  caption: string;
  hashtags?: string[];
  thumbnailUrl?: string | null;
  /**
   * Stored intrinsic dimensions for the thumbnail. Sourced from
   * `storage_objects.width/height` (populated by the upload
   * validator). Used by the aspect-ratio diagnostic so we never
   * need a second client-side probe of the same URL. Optional
   * because legacy assets may have null dimensions.
   */
  thumbnailWidth?: number | null;
  thumbnailHeight?: number | null;
  /** When the platform is instagram, offer feed/reel/story;
   *  otherwise fall back to a single "post" view. */
  initialFormat?: PreviewFormat;
  className?: string;
  /**
   * Optional content format (e.g. "carousel", "short_form_video").
   * When "carousel", the dimension selector is limited to
   * square + 4:5 and shows a "carousel preview" label.
   */
  contentFormat?: string | null;
}

function formatOptionsFor(platform: string): PreviewFormat[] {
  switch (platform) {
    case "instagram":
    case "instagram_reel":
      return ["feed", "reel", "story"];
    case "tiktok":
      return ["reel", "post"];
    case "youtube":
      return ["post", "reel"];
    default:
      return ["post"];
  }
}

function safeAreaShapeFor(format: PreviewFormat): SafeAreaShape | null {
  if (format === "story") return "story";
  if (format === "reel") return "reel";
  if (format === "feed") return "feed";
  return null;
}

const DIMENSION_SPECS: Record<PreviewDimension, AspectRatioSpec> = {
  square: FEED_RATIOS[0]!,
  portrait: FEED_RATIOS[1]!,
  vertical: REEL_RATIOS[0]!,
};

const DIMENSION_ASPECT_CLASSES: Record<PreviewDimension, string> = {
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  vertical: "aspect-[9/16] max-h-[420px]",
};

const DIMENSION_LABEL_KEYS: Record<PreviewDimension, string> = {
  square: "contentDetail.preview.dimensionLabels.square",
  portrait: "contentDetail.preview.dimensionLabels.portrait",
  vertical: "contentDetail.preview.dimensionLabels.vertical",
};

function localizedPlatformLabel(t: ReturnType<typeof useLocaleT>, platform: string): string {
  const key = `contentDetail.publishForm.platformLabels.${platform}`;
  const value = t(key);
  return value === key ? platformLabel(platform) : value;
}

export function PlatformPreview({
  platform,
  accountName,
  caption,
  hashtags,
  thumbnailUrl,
  thumbnailWidth,
  thumbnailHeight,
  initialFormat,
  className,
  contentFormat,
}: PlatformPreviewProps) {
  const t = useLocaleT();
  const displayPlatform = localizedPlatformLabel(t, platform);
  const options = formatOptionsFor(platform);
  const [format, setFormat] = React.useState<PreviewFormat>(
    initialFormat && options.includes(initialFormat) ? initialFormat : options[0]!,
  );
  const availableDimensions: ReadonlyArray<PreviewDimension> =
    contentFormat === "carousel" ? ["square", "portrait"] : ["square", "portrait", "vertical"];
  const [dimension, setDimension] = React.useState<PreviewDimension>(
    initialFormat === "reel" || initialFormat === "story" ? "vertical" : "square",
  );
  const [compareAll, setCompareAll] = React.useState(false);
  const activeDimension = availableDimensions.includes(dimension)
    ? dimension
    : availableDimensions[0]!;
  const targetSpec = DIMENSION_SPECS[activeDimension];
  // Prefer the server-supplied intrinsic dimensions (sourced from
  // `storage_objects.width/height`, populated at upload time). Fall
  // back to the client-side probe only when those are unavailable
  // — for example on legacy assets where the upload validator did
  // not extract dimensions, or on URLs that don't go through the
  // media route. `useImageDimensions` already short-circuits URLs
  // without a recognised image extension, so the planning-detail
  // URL (`/api/media/assets/<uuid>`) never triggers a second fetch.
  const probeDims = useImageDimensions(thumbnailUrl);
  const imageDims: { width: number | null; height: number | null } =
    typeof thumbnailWidth === "number" &&
    typeof thumbnailHeight === "number" &&
    thumbnailWidth > 0 &&
    thumbnailHeight > 0
      ? { width: thumbnailWidth, height: thumbnailHeight }
      : { width: probeDims.width, height: probeDims.height };
  const diagnostic = React.useMemo(
    () => diagnoseAspectRatio(imageDims.width, imageDims.height, [targetSpec]),
    [imageDims.width, imageDims.height, targetSpec],
  );
  const safeAreaShape = safeAreaShapeFor(format);
  const selectFormat = (nextFormat: PreviewFormat) => {
    setFormat(nextFormat);
    setCompareAll(false);
    const nextDimension = nextFormat === "reel" || nextFormat === "story" ? "vertical" : "square";
    if (availableDimensions.includes(nextDimension)) setDimension(nextDimension);
  };
  const selectDimension = (nextDimension: PreviewDimension) => {
    setDimension(nextDimension);
    setCompareAll(false);
    const nextFormat =
      nextDimension === "vertical"
        ? options.includes("reel")
          ? "reel"
          : format
        : options.includes("feed")
          ? "feed"
          : format;
    setFormat(nextFormat);
  };
  const renderMedia = (
    targetDimension: PreviewDimension,
    targetFormat: PreviewFormat,
    testId: string,
  ) => (
    <div
      className={cn(
        "bg-surface-subtle relative flex items-center justify-center",
        DIMENSION_ASPECT_CLASSES[targetDimension],
      )}
      data-testid={testId}
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={t("contentDetail.preview.alt", { account: accountName })}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          // Emit intrinsic width/height only when both dimensions are
          // known — emitting one without the other misleads the
          // browser about the image's aspect ratio and triggers a
          // layout shift on load.
          {...(typeof thumbnailWidth === "number" &&
          thumbnailWidth > 0 &&
          typeof thumbnailHeight === "number" &&
          thumbnailHeight > 0
            ? { width: thumbnailWidth, height: thumbnailHeight }
            : {})}
          sizes="(min-width: 768px) 320px, 100vw"
        />
      ) : (
        <div
          className="text-fg-muted flex flex-col items-center gap-1"
          data-testid="platform-preview-empty"
        >
          {targetDimension === "vertical" || targetFormat === "reel" ? (
            <Play className="h-12 w-12" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-12 w-12" aria-hidden="true" />
          )}
          <p className="text-label">{t("contentDetail.preview.noMedia")}</p>
        </div>
      )}
      {targetFormat === "reel" ? (
        <span
          className="absolute end-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white"
          aria-hidden="true"
        >
          <Play className="h-3 w-3" />
          {t("contentDetail.preview.reelBadge")}
        </span>
      ) : null}
    </div>
  );
  const mediaBody = renderMedia(activeDimension, format, "platform-preview-media");

  return (
    <div
      className={cn(
        "border-border bg-canvas overflow-hidden rounded-[var(--radius-card)] border",
        className,
      )}
      data-testid="platform-preview"
      data-platform={platform}
      data-format={format}
      role="figure"
      aria-label={t("contentDetail.preview.ariaLabel", {
        account: accountName,
        platform: displayPlatform,
      })}
    >
      {options.length > 1 ? (
        <div
          className="border-border bg-surface-subtle flex items-center gap-1 border-b p-2"
          data-testid="platform-preview-format-toggle"
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => selectFormat(opt)}
              data-testid={`platform-preview-format-${opt}`}
              data-active={opt === format || undefined}
              className={cn(
                "text-label focus-visible:ring-focus-ring min-h-11 min-w-11 rounded-full px-2.5 py-1 font-semibold tracking-wide uppercase",
                opt === format
                  ? "bg-primary text-primary-foreground"
                  : "text-fg-secondary hover:text-fg-primary",
              )}
            >
              {t(`contentDetail.preview.formats.${opt}`)}
            </button>
          ))}
          {contentFormat === "carousel" ? (
            <span
              className="text-label text-fg-muted ms-auto inline-flex items-center gap-1 px-2 font-semibold tracking-wide uppercase"
              data-testid="platform-preview-carousel-label"
            >
              {t("contentDetail.preview.carouselLabel")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className="border-border bg-canvas flex flex-wrap items-center gap-2 border-b px-3 py-2"
        data-testid="platform-preview-dimensions"
        role="group"
        aria-label={t("contentDetail.preview.dimensionControlLabel")}
      >
        <span className="text-label text-fg-muted me-1 font-semibold">
          {t("contentDetail.preview.dimensionControlLabel")}
        </span>
        {availableDimensions.map((targetDimension) => {
          const spec = DIMENSION_SPECS[targetDimension];
          const isActive = !compareAll && targetDimension === activeDimension;
          return (
            <button
              key={targetDimension}
              type="button"
              onClick={() => selectDimension(targetDimension)}
              aria-pressed={isActive}
              data-testid={`platform-preview-dimension-${targetDimension}`}
              className={cn(
                "text-label focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-fg-secondary hover:bg-surface-subtle",
              )}
            >
              <span>{t(DIMENSION_LABEL_KEYS[targetDimension])}</span>
              <span className="opacity-75">{spec.label.split(" ").at(-1)}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCompareAll(true)}
          aria-pressed={compareAll}
          data-testid="platform-preview-dimension-all"
          className={cn(
            "text-label focus-visible:ring-focus-ring inline-flex min-h-11 items-center rounded-full border px-2.5 py-1 font-semibold transition-colors",
            compareAll
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-fg-secondary hover:bg-surface-subtle",
          )}
        >
          {t("contentDetail.preview.compareAllDimensions")}
        </button>
        {!compareAll ? (
          <span
            className="text-label text-fg-muted basis-full sm:ms-auto sm:basis-auto"
            data-testid="platform-preview-dimension-minimum"
          >
            {t("contentDetail.preview.minimumResolution", targetSpec.recommended)}
          </span>
        ) : null}
      </div>

      {/* Header */}
      <header className="flex items-center gap-2 p-3">
        <span
          className="border-border bg-primary-subtle inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
          aria-hidden="true"
        >
          {accountName.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-fg-primary truncate font-semibold">{accountName}</p>
          <p className="text-label text-fg-muted truncate">
            <bdi>{displayPlatform}</bdi>
          </p>
        </div>
        <MoreHorizontal className="text-fg-muted h-4 w-4" aria-hidden="true" />
      </header>

      {/* Media area — wrapped in the safe-area overlay for
          Reel/Story so the planner can see the regions the
          app's own UI covers. */}
      {compareAll ? (
        <div
          className="grid grid-cols-1 items-start gap-3 p-3 sm:grid-cols-3"
          data-testid="platform-preview-compare"
        >
          {availableDimensions.map((targetDimension) => {
            const spec = DIMENSION_SPECS[targetDimension];
            const comparisonDiagnostic = diagnoseAspectRatio(imageDims.width, imageDims.height, [
              spec,
            ]);
            return (
              <article
                key={targetDimension}
                className="border-border bg-surface-subtle min-w-0 overflow-hidden rounded-[var(--radius-control)] border"
                data-testid={`platform-preview-compare-${targetDimension}`}
              >
                <div className="px-2.5 py-2">
                  <h3 className="text-label text-fg-primary font-semibold">
                    {t(DIMENSION_LABEL_KEYS[targetDimension])}
                  </h3>
                  <p className="text-label text-fg-muted">
                    {t("contentDetail.preview.minimumResolution", spec.recommended)}
                  </p>
                </div>
                {renderMedia(
                  targetDimension,
                  targetDimension === "vertical" ? "reel" : "feed",
                  `platform-preview-compare-media-${targetDimension}`,
                )}
                {thumbnailUrl ? (
                  <div className="px-2 pb-2">
                    <AspectRatioDiagnosticView diagnostic={comparisonDiagnostic} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : safeAreaShape ? (
        <SafeAreaOverlay shape={safeAreaShape}>{mediaBody}</SafeAreaOverlay>
      ) : (
        mediaBody
      )}

      {/* Aspect-ratio diagnostic. The view hides itself when
          the image is still loading or the URL was a share
          page (no dimensions available). The diagnostic is
          the planner-facing signal: "this 1080×1920 image
          matches Reel 9:16" or "this 1920×1080 image is
          landscape — try 1080×566 for the feed". */}
      {thumbnailUrl && !compareAll ? (
        <div className="px-3 pt-2" data-testid="platform-preview-aspect-diagnostic">
          <AspectRatioDiagnosticView diagnostic={diagnostic} />
        </div>
      ) : null}

      {/* Actions + caption — same chrome across formats; stories
          collapse to just the caption. */}
      {format !== "story" ? (
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <Heart className="h-5 w-5" aria-hidden="true" />
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            <Send className="h-5 w-5" aria-hidden="true" />
          </div>
          <Bookmark className="h-5 w-5" aria-hidden="true" />
        </div>
      ) : null}

      <div className="px-3 pb-3">
        <div
          className="text-body text-fg-primary break-words whitespace-pre-wrap"
          data-testid="platform-preview-caption"
        >
          <span className="font-semibold">{accountName}</span>{" "}
          {caption ? (
            // LinkifyText renders URLs in the caption as
            // clickable links (no target=_self; rel=noopener;
            // user-generated content flagged with nofollow).
            // The wrapper inherits the parent text styling so
            // the link sits inside the same `<div>` paragraph
            // as the bold account name.
            <LinkifyText as="span" userGenerated testId="platform-preview-caption-text">
              {caption}
            </LinkifyText>
          ) : (
            <span className="text-fg-muted italic">
              {t("contentDetail.preview.captionPlaceholder")}
            </span>
          )}
        </div>
        {hashtags && hashtags.length > 0 ? (
          <p
            className="text-label text-primary mt-1"
            dir="auto"
            data-testid="platform-preview-hashtags"
          >
            {hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
          </p>
        ) : null}
        <p className="text-label text-fg-muted mt-2">{t("contentDetail.preview.justNow")}</p>
      </div>
    </div>
  );
}
