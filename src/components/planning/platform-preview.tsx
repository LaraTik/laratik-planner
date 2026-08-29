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

export function PlatformPreview({
  platform,
  accountName,
  caption,
  hashtags,
  thumbnailUrl,
  initialFormat,
  className,
}: PlatformPreviewProps) {
  const options = formatOptionsFor(platform);
  const [format, setFormat] = React.useState<PreviewFormat>(
    initialFormat && options.includes(initialFormat) ? initialFormat : options[0]!,
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
      aria-label={`Preview for ${accountName} on ${platform}`}
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
                "text-label rounded-full px-2.5 py-1 font-semibold tracking-wide uppercase",
                opt === format
                  ? "bg-primary text-primary-foreground"
                  : "text-fg-secondary hover:text-fg-primary",
              )}
            >
              {opt}
            </button>
          ))}
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
          <p className="text-label text-fg-muted truncate">{platform}</p>
        </div>
        <MoreHorizontal className="text-fg-muted h-4 w-4" aria-hidden="true" />
      </header>

      {/* Media area */}
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
            alt={`${accountName} preview`}
            className="h-full w-full object-cover"
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
            <p className="text-label">No media yet</p>
          </div>
        )}
        {format === "reel" ? (
          <span
            className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            <Play className="h-3 w-3" />
            Reel
          </span>
        ) : null}
      </div>

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
        <p
          className="text-body text-fg-primary break-words whitespace-pre-wrap"
          data-testid="platform-preview-caption"
        >
          <span className="font-semibold">{accountName}</span>{" "}
          {caption || (
            <span className="text-fg-muted italic">Caption preview will appear here.</span>
          )}
        </p>
        {hashtags && hashtags.length > 0 ? (
          <p className="text-label text-primary mt-1" data-testid="platform-preview-hashtags">
            {hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
          </p>
        ) : null}
        <p className="text-label text-fg-muted mt-2">Just now</p>
      </div>
    </div>
  );
}
