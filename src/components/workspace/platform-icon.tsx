import * as React from "react";
import {
  Camera,
  Facebook,
  Linkedin,
  Music2,
  PlayCircle,
  Twitter,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PlatformIcon — maps a `social_platform` enum value to a recognizable
 * lucide icon. Used in the channels table and any content row that
 * displays a target channel.
 *
 * Stitch uses Material Symbols (`photo_camera`, `music_note`, etc.).
 * We map to lucide because that's the project's icon library. The
 * mapping is intentionally loose — visual parity, not byte parity.
 */
const PLATFORM_ICONS: Record<string, LucideIcon> = {
  instagram: Camera,
  facebook: Facebook,
  tiktok: Music2,
  linkedin: Linkedin,
  youtube: PlayCircle,
  x: Twitter,
  pinterest: Camera,
  threads: Twitter,
  snapchat: Camera,
  other: PlayCircle,
};

export interface PlatformIconProps extends React.SVGAttributes<SVGSVGElement> {
  platform: string;
  /** When true, render the icon in a coloured tile background like Stitch. */
  tile?: boolean;
  className?: string;
}

export function PlatformIcon({ platform, tile, className, ...props }: PlatformIconProps) {
  const Icon = PLATFORM_ICONS[platform] ?? PlayCircle;
  if (tile) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "border-border bg-surface-container text-fg-primary inline-flex h-8 w-8 items-center justify-center rounded-lg border",
          className,
        )}
      >
        <Icon className="h-[18px] w-[18px]" {...props} />
      </span>
    );
  }
  return <Icon aria-hidden="true" className={cn("h-4 w-4", className)} {...props} />;
}

/**
 * Human-friendly platform label for table cells. Falls back to the raw
 * enum value when the platform isn't in the dictionary.
 */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X (Twitter)",
  pinterest: "Pinterest",
  threads: "Threads",
  snapchat: "Snapchat",
  other: "Custom",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}
