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
  CAROUSEL_RATIOS,
  FEED_RATIOS,
  REEL_RATIOS,
  type AspectRatioSpec,
} from "@/lib/preview/instagram-aspect-ratios";
import { AspectRatioDiagnosticView } from "@/components/preview/aspect-ratio-diagnostic";
import { SafeAreaOverlay, type SafeAreaShape } from "@/components/preview/safe-area-overlay";
import { LinkifyText } from "@/components/ui/linkify-text";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * PlatformPreview — a recognisable, format-aware preview of a
 * social post. Not a pixel-perfect Instagram clone; the goal is
 * to let the planner see the shape of the post before it ships.
 *
 * The preview supports three Instagram-shaped formats (feed /
 * reel / story) and a generic "post" fallback for other
 * platforms. The user can switch formats inline so the preview
 * matches the platform's actual treatment.
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

export interface PlatformPreviewProps {
  platform: string;
  accountName: string;
  caption: string;
  hashtags?: string[];
  thumbnailUrl?: string | null;
  /** When the platform is instagram, offer feed/reel/story;
   *  otherwise fall back to a single "post" view. */
  initialFormat?: PreviewFormat;
  className?: string;
  /**
   * Optional content format (e.g. "carousel", "short_form_video").
   * When "carousel" the preview swaps the feed candidates for
   * the carousel candidate set (square + 4:5) and shows a
   * "carousel preview" label.
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

function candidatesFor(
  format: PreviewFormat,
  contentFormat: string | null | undefined,
): ReadonlyArray<AspectRatioSpec> {
  if (contentFormat === "carousel") return CAROUSEL_RATIOS;
  if (format === "reel" || format === "story") return REEL_RATIOS;
  return FEED_RATIOS;
}

function safeAreaShapeFor(format: PreviewFormat): SafeAreaShape | null {
  if (format === "story") return "story";
  if (format === "reel") return "reel";
  if (format === "feed") return "feed";
  return null;
}

export function PlatformPreview({
  platform,
  accountName,
  caption,
  hashtags,
  thumbnailUrl,
  initialFormat,
  className,
  contentFormat,
}: PlatformPreviewProps) {
  const t = useLocaleT();
  const options = formatOptionsFor(platform);
  const [format, setFormat] = React.useState<PreviewFormat>(
    initialFormat && options.includes(initialFormat) ? initialFormat : options[0]!,
  );
  const candidates = candidatesFor(format, contentFormat);
  const imageDims = useImageDimensions(thumbnailUrl);
  const diagnostic = React.useMemo(
    () => diagnoseAspectRatio(imageDims.width, imageDims.height, candidates),
    [imageDims.width, imageDims.height, candidates],
  );
  const safeAreaShape = safeAreaShapeFor(format);
  const mediaBody = (
    <div
      className={cn(
        "bg-surface-subtle relative flex items-center justify-center",
        format === "story" ? "aspect-[9/16] max-h-[420px]" : "aspect-square",
      )}
      data-testid="platform-preview-media"
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={t("contentDetail.preview.alt", { account: accountName })}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className="text-fg-muted flex flex-col items-center gap-1"
          data-testid="platform-preview-empty"
        >
          {format === "reel" ? (
            <Play className="h-12 w-12" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-12 w-12" aria-hidden="true" />
          )}
          <p className="text-label">{t("contentDetail.preview.noMedia")}</p>
        </div>
      )}
      {format === "reel" ? (
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
        platform,
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
              onClick={() => setFormat(opt)}
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
            <bdi>{platform}</bdi>
          </p>
        </div>
        <MoreHorizontal className="text-fg-muted h-4 w-4" aria-hidden="true" />
      </header>

      {/* Media area — wrapped in the safe-area overlay for
          Reel/Story so the planner can see the regions the
          app's own UI covers. */}
      {safeAreaShape ? (
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
      {thumbnailUrl ? (
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
          <p className="text-label text-primary mt-1" data-testid="platform-preview-hashtags">
            {hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
          </p>
        ) : null}
        <p className="text-label text-fg-muted mt-2">{t("contentDetail.preview.justNow")}</p>
      </div>
    </div>
  );
}
