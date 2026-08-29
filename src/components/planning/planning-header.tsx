import * as React from "react";
import Link from "next/link";
import { Calendar, FileText, Hash, Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanFormat, humanStatus, statusBadgeVariant } from "@/lib/content/status";

/**
 * PlanningHeader — the compact, sticky, at-a-glance summary of
 * a content item's current state. Designed to answer the four
 * questions every planner asks when they open an item:
 *
 *  1. What is this?  — title, format, channels
 *  2. When is it going?  — planned publish date
 *  3. Where is it?  — workflow status (rendered in the
 *     WorkflowProgress component, but mirrored here as a
 *     one-line badge)
 *  4. What do I do?  — primary action button
 *
 * The header is a Server Component; the primary action is
 * a slot the parent fills with whatever button matches the
 * current state (Submit for review, Approve, etc.). The
 * header itself doesn't know the state machine.
 */

export interface PlanningHeaderProps {
  workspaceSlug: string;
  workspaceName: string;
  workspaceTimezone: string;
  contentItemId: string;
  title: string;
  format: string;
  status: string;
  channels: { platform: string; accountName: string }[];
  plannedPublishAt: string;
  owner?: { id: string; displayName: string } | null;
  /** Optional block: render alongside the title on the right. */
  primaryAction?: React.ReactNode;
  /** Optional secondary actions (overrides the more menu). */
  secondaryActions?: React.ReactNode;
  /** Optional extra metadata row (e.g. last edited time, # of comments). */
  meta?: React.ReactNode;
}

export function PlanningHeader({
  workspaceSlug,
  workspaceName,
  workspaceTimezone,
  contentItemId,
  title,
  format,
  status,
  channels,
  plannedPublishAt,
  owner,
  primaryAction,
  secondaryActions,
  meta,
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
            ← {workspaceName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CardTitle className="text-title-page text-fg-primary font-bold break-words">
              {title}
            </CardTitle>
            <Badge variant={statusBadgeVariant(status)} data-testid="planning-header-status">
              {humanStatus(status)}
            </Badge>
          </div>
          <div className="text-label text-fg-secondary mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5" data-testid="planning-header-format">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {humanFormat(format)}
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              data-testid="planning-header-channels"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {channels.length === 0
                ? "No channels"
                : channels.length === 1
                  ? channels[0]!.accountName
                  : `${channels.length} channels`}
            </span>
            <span className="inline-flex items-center gap-1.5" data-testid="planning-header-date">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {plannedPublishAt} <span className="text-fg-muted">· {workspaceTimezone}</span>
            </span>
            {owner ? (
              <span
                className="inline-flex items-center gap-1.5"
                data-testid="planning-header-owner"
              >
                <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                {owner.displayName}
              </span>
            ) : null}
          </div>
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          {primaryAction}
          {secondaryActions}
        </div>
      </div>
    </Card>
  );
}
