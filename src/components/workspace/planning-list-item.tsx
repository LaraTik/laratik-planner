import * as React from "react";
import Link from "next/link";
import {
  FileText,
  Image as ImageIcon,
  Film,
  BookOpen,
  Radio,
  Newspaper,
  MessageCircle,
  Paperclip,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { humanFormat } from "@/lib/content/status";
import { formatOperationalDate } from "@/lib/dashboard/format-date";
import type { EnrichedContentItem } from "@/lib/content/enriched-list";
import { PeopleCell } from "@/components/workspace/people-cell";
import { ChannelIcons } from "@/components/workspace/channel-icons";
import { StagePill } from "@/components/workspace/stage-pill";
import { ReadinessIndicator } from "@/components/workspace/readiness-indicator";
import { NextActionChip } from "@/components/workspace/next-action-chip";

/**
 * PlanningListItem — the enriched row for `/app/w/[slug]/planning`.
 *
 * Replaces the old `ListItem` row that exposed only title, format,
 * date, and status. The enriched row is the operational surface:
 * a planner can understand the state of the month's content without
 * opening every item.
 *
 * Layout (responsive, mobile-first, then 2-col on tablet, then 5-col on desktop):
 *
 *   Mobile (< 768px)  Stacked:
 *                     [format icon]  Title · Status badge
 *                     Owner  ·  Channels
 *                     Schedule  ·  Health
 *                     Workflow mini  ·  Next action
 *                     💬 2  📎 3  ⋯
 *
 *   Tablet (768-1279) 2-col grid:
 *                     Row 1: title (truncate) | status badge
 *                     Row 2: format · schedule · owner · channels | health + next
 *                     Row 3: workflow mini full width
 *                     Row 4: counters + actions
 *
 *   Desktop (>= 1280) 5-col grid:
 *                     Title (truncate) | Schedule | Owner | Workflow | Health/Next
 *
 * RSC safety: NO function props on the rendered DOM tree. The row
 * itself is a `<Link>` (server component compatible), the channel /
 * comment / asset counters are regular `<a>` deep-links to the
 * matching detail-page tab, and the action menu is a separate
 * client component that the page wires in. The previous RSC #441
 * defect came from this exact pattern (function closure on a
 * server-rendered `<td>`); this row must never regress.
 *
 * Density: `comfortable` (default) = 76px row. `compact` = 60px.
 */

const FORMAT_ICON: Record<
  string,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  static_post: ImageIcon,
  carousel: FileText,
  story: Film,
  short_form_video: Film,
  long_form_video: Film,
  live_content: Radio,
  article: Newspaper,
  other: BookOpen,
};

export interface PlanningListItemProps {
  item: EnrichedContentItem;
  workspaceSlug: string;
  workspaceTimezone: string;
  density?: "comfortable" | "compact";
  now: Date;
  /** Optional right-aligned slot for the quick-actions menu. The
   *  page wires a DropdownMenu in here. The component itself
   *  doesn't render a menu to keep the row presentational. */
  actions?: React.ReactNode;
  /**
   * Optional translator. When provided, the row's column
   * screen-reader labels (Schedule / People / Stage) and the
   * comment / asset counter aria-labels render from
   * `workspaceOverviewDashboard.row*` keys; when omitted, the
   * stored English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

function FormatIcon({ format }: { format: string }) {
  const Icon = FORMAT_ICON[format] ?? FileText;
  return (
    <span
      className="border-border bg-surface-container text-fg-secondary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border"
      aria-hidden="true"
      data-format={format}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className="border-border bg-surface text-label text-fg-secondary inline-flex items-center rounded-full border px-2 py-0.5 font-semibold"
      data-testid="row-status-chip"
      data-status={status}
    >
      {humanFormat(status)}
    </span>
  );
}

export function PlanningListItem({
  item,
  workspaceSlug,
  workspaceTimezone,
  density = "comfortable",
  now,
  actions,
  t,
}: PlanningListItemProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  const detailHref = `/app/w/${workspaceSlug}/planning/${item.id}`;
  const opDate = formatOperationalDate(item.plannedPublishAt, now, workspaceTimezone);
  const padding = density === "compact" ? "py-2" : "py-3";

  return (
    <li
      className={cn(
        "hover:bg-surface-subtle focus-within:bg-surface-subtle group transition-colors",
      )}
      data-testid="planning-list-item"
      data-density={density}
      data-status={item.status}
      data-health={item.health}
    >
      <div
        className={cn(
          "flex flex-col gap-2 px-4",
          padding,
          // Desktop (>= 1280): switch to a 5-column grid. Below
          // 1280, the row stacks naturally — the title is the
          // anchor, secondary metadata flows under it.
          "lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_auto] lg:items-center lg:gap-4",
        )}
      >
        {/* IDENTITY */}
        <div className="flex min-w-0 items-center gap-3">
          <FormatIcon format={item.format} />
          <div className="min-w-0 flex-1">
            <Link
              href={detailHref}
              className={cn(
                "text-body text-fg-primary block truncate font-semibold",
                "focus-visible:ring-focus-ring rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset",
                "group-hover:underline group-hover:underline-offset-2",
              )}
              data-testid="row-title"
            >
              {item.title}
            </Link>
            <div className="text-label text-fg-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{humanFormat(item.format)}</span>
              <span aria-hidden="true">·</span>
              <ChannelIcons channels={item.channels} max={3} />
            </div>
          </div>
          <div className="hidden shrink-0 lg:block">
            <StatusChip status={item.status} />
          </div>
        </div>

        {/* SCHEDULE */}
        <div className="text-label flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0.5">
          <span className="text-fg-muted font-semibold tracking-wide uppercase lg:sr-only">
            {tr("workspaceOverviewDashboard.rowScheduleAria", "Schedule")}
          </span>
          <span
            className={cn(
              "text-fg-primary font-medium",
              opDate.relative === "past" &&
                item.health !== "published" &&
                item.health !== "cancelled"
                ? "text-warning"
                : "",
            )}
            title={opDate.title}
            data-testid="row-schedule"
            data-relative={opDate.relative}
            data-overdue-days={opDate.overdueDays}
          >
            {opDate.label}
          </span>
        </div>

        {/* PEOPLE — owner + designer, role-labelled (AGENTS.md §C).
            The same column width as the previous single owner badge;
            stacking vertically keeps the row's horizontal footprint
            stable on tablet. */}
        <div className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0.5">
          <span className="text-fg-muted text-label hidden font-semibold tracking-wide uppercase lg:inline">
            {tr("workspaceOverviewDashboard.rowPeopleAria", "People")}
          </span>
          <span className="text-fg-muted font-semibold tracking-wide uppercase lg:sr-only">
            {tr("workspaceOverviewDashboard.rowOwnerDesignerAria", "Owner + Designer")}
          </span>
          <PeopleCell owner={item.owner} designer={item.designer} {...(t ? { t } : {})} />
        </div>

        {/* WORKFLOW — stage pill replaces the full inline stepper.
            The full stepper is one click away in the detail page's
            workflow inspector. See AGENTS.md §B + §C for the rule. */}
        <div className="text-label flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0.5">
          <span className="text-fg-muted font-semibold tracking-wide uppercase lg:sr-only">
            {tr("workspaceOverviewDashboard.rowStageAria", "Stage")}
          </span>
          <StagePill status={item.status} {...(t ? { t } : {})} />
        </div>

        {/* HEALTH + NEXT ACTION */}
        <div className="text-label flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2">
          <ReadinessIndicator
            health={item.health}
            overdueDays={opDate.overdueDays}
            openApprovalCount={item.openApprovalCount}
            {...(t ? { t } : {})}
          />
          <NextActionChip action={item.nextAction} detailHref={detailHref} />
        </div>

        {/* COUNTERS + ACTIONS (mobile / tablet) */}
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <div className="text-label text-fg-muted flex items-center gap-3">
            {item.commentCount > 0 ? (
              <Link
                href={`${detailHref}#activity`}
                className="hover:text-fg-primary inline-flex items-center gap-1"
                aria-label={tr(
                  "workspaceOverviewDashboard.rowCommentsAria",
                  `${item.commentCount} comments`,
                  { count: item.commentCount },
                )}
                data-testid="row-comment-count"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{item.commentCount}</span>
              </Link>
            ) : null}
            {item.assetCount > 0 ? (
              <Link
                href={`${detailHref}#content`}
                className="hover:text-fg-primary inline-flex items-center gap-1"
                aria-label={tr(
                  "workspaceOverviewDashboard.rowAssetsAria",
                  `${item.assetCount} assets`,
                  { count: item.assetCount },
                )}
                data-testid="row-asset-count"
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{item.assetCount}</span>
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <StatusChip status={item.status} />
            {actions}
          </div>
        </div>

        {/* COUNTERS + ACTIONS (desktop, last column) */}
        <div className="hidden items-center justify-end gap-3 lg:flex">
          <div className="text-label text-fg-muted flex items-center gap-3">
            {item.commentCount > 0 ? (
              <Link
                href={`${detailHref}#activity`}
                className="hover:text-fg-primary inline-flex items-center gap-1"
                aria-label={tr(
                  "workspaceOverviewDashboard.rowCommentsAria",
                  `${item.commentCount} comments`,
                  { count: item.commentCount },
                )}
                data-testid="row-comment-count"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{item.commentCount}</span>
              </Link>
            ) : null}
            {item.assetCount > 0 ? (
              <Link
                href={`${detailHref}#content`}
                className="hover:text-fg-primary inline-flex items-center gap-1"
                aria-label={tr(
                  "workspaceOverviewDashboard.rowAssetsAria",
                  `${item.assetCount} assets`,
                  { count: item.assetCount },
                )}
                data-testid="row-asset-count"
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{item.assetCount}</span>
              </Link>
            ) : null}
          </div>
          {actions ? (
            <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Convenience export so the page can render the surrounding card. */
export function PlanningListItemList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-card)] border",
        className,
      )}
      data-testid="planning-list"
    >
      {children}
    </ul>
  );
}

// Re-export the "no actions" affordance marker so callers can render a
// placeholder when the quick-actions menu is not yet wired in.
export const MoreIcon = MoreHorizontal;
