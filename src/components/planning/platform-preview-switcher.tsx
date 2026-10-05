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
  /**
   * Stored intrinsic dimensions of the thumbnail (from
   * `storage_objects.width/height`). Forwarded to PlatformPreview
   * so the aspect-ratio diagnostic does not need a second client-side
   * fetch of the same image bytes.
   */
  thumbnailWidth?: number | null;
  thumbnailHeight?: number | null;
  initialFormat?: PreviewFormat;
  /**
   * Channel the host page has already selected. When present this
   * component renders a pure preview of that channel and hides its own
   * chip strip, because the host (the Publish tab's channel tab row) is
   * the single owner of channel selection. When absent the component
   * keeps its own switcher so the standalone preview panel can still
   * change channel on its own.
   */
  activeChannelId?: string;
  /** Catalog key prefix for the platform labels (e.g. "contentDetail.publishForm.platformLabels"). */
  platformLabelCatalogPrefix?: string;
}

/**
 * PlatformPreviewSwitcher — renders `PlatformPreview` for one channel.
 *
 * This component used to draw its own channel chip strip above the
 * preview. Inside the Publish tab that strip was a straight duplicate
 * of the channel tab row directly above it, two identical lists on one
 * screen: the operator could not tell which one selected the editor, and
 * the two could drift out of sync when a tab's blocker count changed.
 * Channel selection now has exactly one owner — the tab row — so this
 * component only resolves the active channel and hands it to the
 * preview. The surface switcher (Feed / Reel / Story) stays inside
 * `PlatformPreview`, where it changes the *rendering* of the active
 * channel rather than which channel is active.
 *
 * The caption / hashtags shown follow the same priority as the old
 * server-rendered preview:
 *   1. per-channel `platformPayload.caption` / `hashtags` (override)
 *   2. shared `formatPayload` caption / hashtags
 */
export function PlatformPreviewSwitcher({
  channels,
  sharedCaption,
  sharedHashtags,
  thumbnailUrl,
  thumbnailWidth,
  thumbnailHeight,
  initialFormat,
  activeChannelId,
}: PlatformPreviewSwitcherProps) {
  /*
    Controlled when the host page owns channel selection (the Publish
    tab passes `activeChannelId` so the preview follows the editor
    tabs), uncontrolled otherwise so the standalone `#preview` panel
    still switches channels on its own.
  */
  const [internalId, setInternalId] = React.useState<string | null>(channels[0]?.id ?? null);
  const activeId = activeChannelId ?? internalId;
  if (channels.length === 0 || activeId === null) return null;
  const active = channels.find((c) => c.id === activeId) ?? channels[0]!;
  const caption = active.payload?.caption ?? sharedCaption;
  const hashtags = active.payload?.hashtags ?? sharedHashtags;
  return (
    <div className="space-y-3" data-testid="platform-preview-switcher">
      {/*
        Only rendered when this component is the standalone preview
        panel and therefore the sole way to change channel. In the
        Publish tab the tab row above owns selection, so repeating it
        here would be the duplicate strip.
      */}
      {activeChannelId === undefined && channels.length > 1 ? (
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
                onClick={() => setInternalId(channel.id)}
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
        {...(thumbnailWidth !== undefined ? { thumbnailWidth } : {})}
        {...(thumbnailHeight !== undefined ? { thumbnailHeight } : {})}
        {...(initialFormat !== undefined ? { initialFormat } : {})}
        {...(active.contentFormat !== undefined ? { contentFormat: active.contentFormat } : {})}
        {...(hashtags ? { hashtags } : {})}
      />
    </div>
  );
}
