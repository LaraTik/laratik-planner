import Link from "next/link";
import { Calendar, CalendarPlus, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/content/status-badge";

/**
 * Minimal shape the Recent items card needs. The page pre-shapes
 * the DB row (Date → string, etc.) and passes only the fields we render.
 */
export type RecentItem = {
  id: string;
  title: string;
  status: string;
  plannedPublishAt: Date | string;
};

export interface RecentItemsCardProps {
  items: readonly RecentItem[];
  workspaceSlug: string;
  /** Link to the full planning list, shown next to the card title. */
  viewAllHref: string;
  /** Optional link to the quick-create flow; shows in the empty state. */
  createHref?: string;
}

/**
 * RecentItemsCard — the "Recent items" panel on the workspace overview.
 * Shows up to 8 items as a compact list (icon + title + date + status
 * badge) with a "View all" link in the header. When the list is empty,
 * falls back to a guided empty state.
 *
 * Extracted from `w/[slug]/page.tsx` so the same list-row shape is
 * available to the future mobile workspace overview (Stitch
 * `02f2d2b8_studioflow---workspace-overview---mobile`) and to the
 * designer review surface.
 */
export function RecentItemsCard({
  items,
  workspaceSlug,
  viewAllHref,
  createHref,
}: RecentItemsCardProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title-card text-fg-primary font-semibold">Recent items</h2>
        <Link
          href={viewAllHref}
          className="text-label text-primary rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline"
        >
          View all →
        </Link>
      </div>
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
        <ul className="divide-border divide-y">
          {items.map((it) => {
            const date =
              it.plannedPublishAt instanceof Date
                ? it.plannedPublishAt
                : new Date(it.plannedPublishAt);
            return (
              <li key={it.id} className="text-body flex items-center gap-3 py-2">
                <FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />
                <Link
                  href={`/app/w/${workspaceSlug}/planning/${it.id}`}
                  className="text-fg-primary flex-1 truncate font-semibold"
                >
                  {it.title}
                </Link>
                <span className="text-label text-fg-muted inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {date.toLocaleDateString()}
                </span>
                <StatusBadge status={it.status} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
