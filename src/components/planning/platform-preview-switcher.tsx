"use client";

import * as React from "react";
import { PlatformPreview, type PreviewFormat } from "@/components/planning/platform-preview";
import { platformLabel } from "@/components/workspace/platform-icon";
import { cn } from "@/lib/utils";

export interface PreviewChannel {
  id: string;
  socialChannelId: string;
  platform: string;
  accountName: string;
  /** Per-channel override payload from the Publishing tab. */
  payload?: { caption?: string; hashtags?: string[] } | null;
  /** Optional content format (e.g. "carousel", "short_form_video"). */
  contentFormat?: string | null;
}

export interface PlatformPreviewSwitcherProps {
  channels: ReadonlyArray<PreviewChannel>;
  /**
   * The shared copy from the planner — caption / hashtags derived
   * from `formatPayload`. Used as the per-channel fallback when
   * the channel does not have an override.
   */
  sharedCaption: string;
  sharedHashtags?: string[];
  thumbnailUrl?: string | null;
  initialFormat?: PreviewFormat;
  /** Catalog key prefix for the platform labels (e.g. "contentDetail.publishForm.platformLabels"). */
  platformLabelCatalogPrefix?: string;
}

/**
 * PlatformPreviewSwitcher — wraps `PlatformPreview` with a thin
 * chip-strip channel switcher above it. With 4 IG accounts and 1
 * FB account, the planner previously had to refresh the page to
 * see each one. Now they click through.
 *
 * The caption / hashtags shown for each channel follow the same
 * priority as the old server-rendered preview:
 *   1. per-channel `platformPayload.caption` / `hashtags` (override)
 *   2. shared `formatPayload` caption / hashtags
 *   3. brief (caption fallback only)
 */
export function PlatformPreviewSwitcher({
  channels,
  sharedCaption,
  sharedHashtags,
  thumbnailUrl,
  initialFormat,
}: PlatformPreviewSwitcherProps) {
  const [activeId, setActiveId] = React.useState<string | null>(channels[0]?.id ?? null);
  if (channels.length === 0 || activeId === null) return null;
  const active = channels.find((c) => c.id === activeId) ?? channels[0]!;
  const caption = active.payload?.caption ?? sharedCaption;
  const hashtags = active.payload?.hashtags ?? sharedHashtags;
  return (
    <div className="space-y-3" data-testid="platform-preview-switcher">
      {channels.length > 1 ? (
        <div
          role="tablist"
          aria-label="Channel preview switcher"
          className="flex flex-wrap items-center gap-1.5"
          data-testid="platform-preview-channel-strip"
        >
          {channels.map((channel) => {
            const isActive = channel.id === activeId;
            return (
              <button
                key={channel.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(channel.id)}
                data-testid={`platform-preview-channel-${channel.socialChannelId}`}
                className={cn(
                  "text-label focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-fg-secondary hover:bg-surface-subtle",
                )}
              >
                <span aria-hidden="true">{platformLabel(channel.platform)}</span>
                <span className={isActive ? "" : "text-fg-muted"}>·</span>
                <span>{channel.accountName}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <PlatformPreview
        platform={active.platform}
        accountName={active.accountName}
        caption={caption}
        {...(thumbnailUrl !== undefined ? { thumbnailUrl } : {})}
        {...(initialFormat !== undefined ? { initialFormat } : {})}
        {...(active.contentFormat !== undefined ? { contentFormat: active.contentFormat } : {})}
        {...(hashtags ? { hashtags } : {})}
      />
    </div>
  );
}
