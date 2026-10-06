"use client";

import Image from "next/image";
import { useState } from "react";
import { Images, Play, SquarePlay } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PostThumbnail — the preview image for an observed post.
 *
 * A client leaf so it can hold a real failed-load state. Both callers are
 * fine with that: the Observed content inventory is already a client
 * component, and the Command Center panel is a Server Component that renders
 * this as a small client boundary leaf.
 *
 * Three constraints shaped this component:
 *
 * 1. **Never assume a URL.** `social_post_observation.thumbnail_url` is null
 *    for every row written before the column existed and for any post the
 *    provider returned no image for, so the placeholder is a first-class
 *    state, not an error case. It keeps the platform mark so the row still
 *    identifies its source without an image.
 *
 * 2. **No layout shift.** The box is a fixed square with explicit
 *    width/height on the `Image`, so the space is reserved before the bytes
 *    arrive. An image appearing must never push the metrics in the same row
 *    around.
 *
 * 3. **One appropriately sized request.** `sizes` matches the rendered width,
 *    so the optimizer serves a single appropriate file instead of the
 *    full-resolution original, and `loading="lazy"` keeps off-screen cards
 *    from competing with the visible ones.
 *
 * Provider CDN links are short-lived and can 403 once expired, so a failed
 * load degrades to the same placeholder rather than a broken-image glyph.
 */
/** Media-type glyph for the placeholder tile. Stays neutral: the Channel
 * column already carries the coloured brand mark. */
function MediaGlyph({ mediaType }: { mediaType: PostThumbnailProps["mediaType"] }) {
  if (mediaType === "reel" || mediaType === "video") {
    return <Play className="h-5 w-5 fill-current" aria-hidden="true" />;
  }
  if (mediaType === "story") {
    return <SquarePlay className="h-5 w-5" aria-hidden="true" />;
  }
  return <Images className="h-5 w-5" aria-hidden="true" />;
}

export interface PostThumbnailProps {
  src: string | null;
  mediaType: "image" | "video" | "carousel" | "reel" | "story" | "unknown";
  /** Rendered edge length in px; drives both the box and `sizes`. */
  size?: number;
  className?: string;
}

const MEDIA_LABEL: Record<PostThumbnailProps["mediaType"], string> = {
  image: "Image",
  video: "Video",
  carousel: "Carousel",
  reel: "Reel",
  story: "Story",
  unknown: "Post",
};

export function PostThumbnail({ src, mediaType, size = 44, className }: PostThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        "border-border bg-surface-container relative shrink-0 overflow-hidden rounded-[var(--radius-control)] border",
        className,
      )}
      style={{ width: size, height: size }}
      data-testid={showImage ? "post-thumbnail" : "post-thumbnail-placeholder"}
      data-media-type={mediaType}
      // Decorative: the adjacent account name and caption identify the post.
      aria-hidden="true"
    >
      {showImage ? (
        <Image
          src={src as string}
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          loading="lazy"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-fg-muted absolute inset-0 flex items-center justify-center">
          <MediaGlyph mediaType={mediaType} />
        </span>
      )}
      {mediaType === "reel" || mediaType === "video" ? (
        <span className="bg-fg-primary/85 absolute bottom-1 left-1 inline-flex items-center rounded p-0.5">
          <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
          <span className="sr-only">{MEDIA_LABEL[mediaType]}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Compact post caption with a stable line count.
 *
 * Clamping to two lines keeps every row the same height, which is what makes
 * the table scannable. The full text stays in the DOM for assistive tech and
 * is available on hover as a native tooltip — truncation happens here at
 * render time, never in the database.
 */
export function PostCaption({
  caption,
  className,
}: {
  caption: string | null;
  className?: string;
}) {
  if (!caption) return null;
  return (
    <span
      title={caption}
      className={cn("text-label text-fg-secondary line-clamp-2", className)}
      data-testid="post-caption"
    >
      {caption}
    </span>
  );
}
