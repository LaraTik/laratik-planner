import * as React from "react";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { cn } from "@/lib/utils";
import type { EnrichedChannel } from "@/lib/content/enriched-list";

/**
 * ChannelIcons — compact platform icon strip for the planning-list row.
 *
 * Renders the first `max` channel icons with a "+N" overflow chip
 * when more channels exist. Tooltips expose the full platform name
 * (Instagram, Facebook, …) so the icon is not the only signal.
 *
 * Pure presentational component, server-renderable.
 */
export interface ChannelIconsProps {
  channels: EnrichedChannel[];
  /** Max icons to render before falling back to a "+N" overflow chip. Default 3. */
  max?: number;
  /** Tailwind class additions for the surrounding <span>. */
  className?: string;
}

export function ChannelIcons({ channels, max = 3, className }: ChannelIconsProps) {
  if (channels.length === 0) {
    return (
      <span
        className={cn("text-label text-fg-muted", className)}
        data-testid="channel-icons"
        data-empty="true"
        aria-label="No channels"
      >
        No channels
      </span>
    );
  }
  const visible = channels.slice(0, max);
  const overflow = Math.max(0, channels.length - visible.length);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-testid="channel-icons"
      data-count={channels.length}
    >
      {visible.map((c) => (
        <span
          key={c.id}
          title={platformLabel(c.platform)}
          aria-label={platformLabel(c.platform)}
          className="inline-flex"
        >
          <PlatformIcon platform={c.platform} />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex h-5 items-center rounded-full border px-1.5 text-[10px] font-semibold"
          title={channels
            .slice(max)
            .map((c) => platformLabel(c.platform))
            .join(", ")}
          data-testid="channel-overflow"
        >
          +{overflow}
        </span>
      ) : null}
      <span className="sr-only">{channels.map((c) => platformLabel(c.platform)).join(", ")}</span>
    </span>
  );
}
