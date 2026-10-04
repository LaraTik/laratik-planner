import Link from "next/link";
import { Calendar, FileText, Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { humanFormat, humanStatus, statusBadgeVariant } from "@/lib/content/status";
import { PlanningHeaderActions } from "./planning-header-actions";

/**
 * PlanningHeader — the compact, sticky, at-a-glance summary of
 * a content item's current state. Designed to answer the four
 * questions every planner asks when they open an item:
 *
 *  1. What is this?  — title, format, channels
 *  2. When is it going?  — planned publish date
 *  3. What is its current state? — one status badge
 *
 * Lifecycle, ownership, readiness, and actions belong to the
 * workflow rail or their owning workspace destination.
 */

export interface PlanningHeaderProps {
  workspaceSlug: string;
  workspaceName: string;
  workspaceTimezone: string;
  contentItemId: string;
  title: string;
  /** Locale-resolved breadcrumb label. */
  backLabel?: string;
  format: string;
  /** Locale-resolved format label from the page's active catalog. */
  formatLabel?: string;
  status: string;
  /** Locale-resolved status label from the page's active catalog. */
  statusLabel?: string;
  channels: { platform: string; accountName: string }[];
  /** Locale-resolved channel summary. */
  channelsSummary?: string;
  plannedPublishAt: string;
  /** ISO-8601 string for the planned publish instant. Drives the
   *  kebab's "Reschedule" date picker. */
  plannedPublishAtIso: string;
  /** Permission flags for the kebab menu. */
  canEdit: boolean;
  canTrash: boolean;
  /** Href to the legacy `/edit/[id]` form. */
  editHref: string;
  /** Optional signed preview for the compact content thumbnail. */
  thumbnailUrl?: string | null;
}

export function PlanningHeader({
  workspaceSlug,
  workspaceName,
  workspaceTimezone,
  contentItemId,
  title,
  backLabel,
  format,
  formatLabel,
  status,
  statusLabel,
  channels,
  channelsSummary,
  plannedPublishAt,
  plannedPublishAtIso,
  canEdit,
  canTrash,
  editHref,
  thumbnailUrl = null,
}: PlanningHeaderProps) {
  return (
    <Card
      padding="md"
      className="rounded-b-none border-b-0 shadow-none"
      data-testid="planning-header"
      data-content-item-id={contentItemId}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={`/app/w/${workspaceSlug}/planning`}
            className="text-label text-fg-muted hover:text-fg-secondary focus-visible:ring-focus-ring inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-[var(--radius-control)] px-1 focus:outline-none focus-visible:ring-2"
            data-testid="planning-header-breadcrumb"
          >
            <DirAwareArrowLeft className="h-3.5 w-3.5" />
            {backLabel ?? `Back to ${workspaceName}`}
          </Link>
          <div className="mt-2 flex min-w-0 items-center gap-3">
            {thumbnailUrl ? (
              <div className="border-border bg-surface-subtle relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] border">
                {/* R2 signed URLs are intentionally not in next.config image
                    remotePatterns; this is the same direct-preview path used
                    by the rest of the media surfaces. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  data-testid="planning-header-thumbnail"
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-title-page text-fg-primary max-w-4xl break-words">
                  {title}
                </CardTitle>
                <Badge variant={statusBadgeVariant(status)} data-testid="planning-header-status">
                  {statusLabel ?? humanStatus(status)}
                </Badge>
              </div>
              <div className="text-label text-fg-secondary mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="inline-flex items-center gap-1.5"
                  data-testid="planning-header-format"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatLabel ?? humanFormat(format)}
                </span>
                <span
                  className="inline-flex items-center gap-1.5"
                  data-testid="planning-header-channels"
                >
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  {channelsSummary ??
                    (channels.length === 0
                      ? "No channels"
                      : channels.length === 1
                        ? channels[0]!.accountName
                        : `${channels.length} channels`)}
                </span>
                <span
                  className="inline-flex items-center gap-1.5"
                  data-testid="planning-header-date"
                >
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  {plannedPublishAt} <span className="text-fg-muted">· {workspaceTimezone}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <PlanningHeaderActions
          workspaceSlug={workspaceSlug}
          contentItemId={contentItemId}
          canEdit={canEdit}
          canTrash={canTrash}
          editHref={editHref}
          plannedPublishAtIso={plannedPublishAtIso}
          workspaceTimezone={workspaceTimezone}
          status={status}
        />
      </div>
    </Card>
  );
}
