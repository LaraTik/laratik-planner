import Link from "next/link";
import { Calendar, FileText, Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { humanFormat, humanStatus, statusBadgeVariant } from "@/lib/content/status";

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
}: PlanningHeaderProps) {
  return (
    <Card padding="md" data-testid="planning-header" data-content-item-id={contentItemId}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={`/app/w/${workspaceSlug}/planning`}
            className="text-label text-fg-muted hover:text-fg-secondary inline-flex items-center gap-1"
            data-testid="planning-header-breadcrumb"
          >
            <DirAwareArrowLeft className="h-3.5 w-3.5" />
            {backLabel ?? `Back to ${workspaceName}`}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CardTitle className="text-title-page text-fg-primary font-bold break-words">
              {title}
            </CardTitle>
            <Badge variant={statusBadgeVariant(status)} data-testid="planning-header-status">
              {statusLabel ?? humanStatus(status)}
            </Badge>
          </div>
          <div className="text-label text-fg-secondary mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5" data-testid="planning-header-format">
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
            <span className="inline-flex items-center gap-1.5" data-testid="planning-header-date">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {plannedPublishAt} <span className="text-fg-muted">· {workspaceTimezone}</span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
