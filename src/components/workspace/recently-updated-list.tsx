import * as React from "react";
import Link from "next/link";
import { CalendarPlus, FileText } from "lucide-react";
import { DashboardPanel } from "./dashboard-panel";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/content/status-badge";
import type { KpiContentFormat, KpiContentStatus } from "@/lib/dashboard/kpis";
import { CONTENT_FORMAT_LABELS } from "@/lib/dashboard/kpis";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * RecentlyUpdatedList — the refactored "Recently updated" panel on
 * the workspace Overview. Replaces the pre-refactor
 * `RecentItemsCard`, which was too narrow and only showed a date +
 * status. The new component:
 *
 *   - uses the full 4-col / 12-col space the dashboard grid gives it
 *   - shows format + status + planned date + owner on every row
 *   - widens the title so operators can read it
 *   - links each row to the detail page
 *
 * "Recently updated" is intentionally a stable name (per master
 * prompt §16) rather than the older "Recent items" — it makes the
 * ordering semantics explicit.
 */
export interface RecentlyUpdatedItem {
  id: string;
  title: string;
  status: KpiContentStatus;
  format: KpiContentFormat;
  /**
   * When the row was last touched. The panel sorts by this
   * DESC and renders the relative time as the primary date
   * signal. `plannedPublishAt` is kept on the type so the
   * "View all" deep link + future cross-filters still have
   * access to it; the row no longer shows it directly
   * because it was misleading users into thinking the
   * panel was sorted by publish date.
   */
  updatedAt: Date | string;
  plannedPublishAt: Date | string;
  ownerName: string | null;
}

export interface RecentlyUpdatedListProps {
  items: RecentlyUpdatedItem[];
  workspaceSlug: string;
  viewAllHref: string;
  createHref?: string;
}

export function RecentlyUpdatedList({
  items,
  workspaceSlug,
  viewAllHref,
  createHref,
}: RecentlyUpdatedListProps) {
  return (
    <DashboardPanel
      title="Recently updated"
      eyebrow="Latest activity"
      data-testid="recently-updated"
      footer={
        <Link
          href={viewAllHref}
          className="text-label text-primary inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 py-0.5 font-semibold underline-offset-4 hover:underline"
        >
          View all →
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No content yet"
          description="Once someone in this workspace creates a draft, it'll show up here."
          action={
            createHref ? (
              <Link
                href={createHref}
                className="bg-primary text-button inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold text-white"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                New content
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-border divide-y" aria-label="Recently updated content">
          {items.map((it) => {
            // The row's primary date signal is the relative
            // "last touched" stamp ("12m ago", "2h ago", "3d
            // ago"). The exact timestamp lives in a tooltip
            // for users who need to audit it. The previous
            // design used `format(plannedPublishAt, "MMM d")`
            // which made the panel's name a lie — items were
            // sorted by plannedPublishAt, so an item with a
            // future publish date floated to the top regardless
            // of how stale it was. P3.1 in the master prompt.
            const updatedAt = it.updatedAt instanceof Date ? it.updatedAt : new Date(it.updatedAt);
            const exactTimestamp = updatedAt.toLocaleString();
            return (
              <li key={it.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={`/app/w/${workspaceSlug}/planning/${it.id}`}
                  className="hover:bg-surface-subtle -mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] px-2 py-1 transition-colors"
                >
                  <span className="text-label text-fg-muted shrink-0 font-semibold tracking-wide uppercase">
                    {CONTENT_FORMAT_LABELS[it.format]}
                  </span>
                  <span className="text-body text-fg-primary min-w-0 flex-1 truncate font-semibold">
                    {it.title}
                  </span>
                  <span
                    className="text-label text-fg-muted shrink-0 tabular-nums"
                    data-testid="recently-updated-relative"
                    title={`Last updated ${exactTimestamp}`}
                  >
                    {formatRelativeDate(updatedAt)}
                  </span>
                  <StatusBadge status={it.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}
