import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * UserAvatar — initials + optional image avatar used in the
 * Recent Updates table and any other brand-kit surface that needs
 * to identify the actor.
 *
 * Round 4 added this component to replace the previous hardcoded "M"
 * placeholder in the Recent Updates table. It joins the `user` row
 * via the `listRecentBrandUpdates` service call (added in the same
 * round) and renders the user's `image` URL when present, falling
 * back to a coloured initial chip when not.
 *
 * Accessibility:
 *   - When `image` is set, the `<img>` carries a meaningful `alt` so
 *     a screen reader announces the user's name.
 *   - When `image` is missing, the initials are wrapped in a
 *     `<span aria-label="...">` so the user's name is still
 *     announced (the visible initials are decoration).
 *   - The 32px size matches the master prompt's "control" dimension
 *     and is large enough to be tappable on touch.
 */
export interface UserAvatarProps {
  displayName: string;
  image?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
  "data-testid"?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]!.toUpperCase()).join("");
}

// Stable colour palette derived from the user's id (or name when no
// id) so the same user always shows the same colour across screens.
const PALETTE = [
  "bg-primary-subtle text-primary",
  "bg-success-subtle text-success",
  "bg-warning-subtle text-warning",
  "bg-info-subtle text-info",
  "bg-danger-subtle text-danger",
];

function colourFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

export function UserAvatar({
  displayName,
  image,
  size = "sm",
  className,
  "data-testid": dataTestId,
}: UserAvatarProps) {
  const sizeClass =
    size === "xs"
      ? "h-5 w-5 text-[10px]"
      : size === "md"
        ? "h-8 w-8 text-[13px]"
        : "h-6 w-6 text-[11px]";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={displayName}
        width={size === "md" ? 32 : size === "sm" ? 24 : 20}
        height={size === "md" ? 32 : size === "sm" ? 24 : 20}
        data-testid={dataTestId}
        className={cn("inline-block rounded-full object-cover", sizeClass, className)}
      />
    );
  }
  return (
    <span
      data-testid={dataTestId}
      role="img"
      aria-label={displayName}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold",
        sizeClass,
        colourFor(displayName),
        className,
      )}
    >
      {initialsOf(displayName)}
    </span>
  );
}
