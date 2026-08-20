import * as React from "react";
import Link from "next/link";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { differenceInDays } from "date-fns";

/**
 * At-Risk Milestones — compact list of the up-to-5 oldest overdue
 * items in the current month (per the Stitch overview). Each row
 * shows the title (linked to the item detail), a relative due
 * indicator ("X days overdue" or "Due today"), and a warning icon.
 */
export interface AtRiskMilestonesCardProps {
  items: {
    id: string;
    title: string;
    plannedPublishAt: Date;
  }[];
  workspaceSlug: string;
  now: Date;
  emptyState?: React.ReactNode;
}

export function AtRiskMilestonesCard({
  items,
  workspaceSlug,
  now,
  emptyState,
}: AtRiskMilestonesCardProps) {
  return (
    <section
      aria-label="At-risk milestones"
      className="border-border bg-surface rounded-[var(--radius-card)] border p-6"
    >
      <h2 className="text-title-card text-fg-primary mb-4 font-semibold">At-Risk Milestones</h2>
      {items.length === 0 ? (
        (emptyState ?? (
          <p className="text-body text-fg-muted flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            No overdue work. Everything is on track this month.
          </p>
        ))
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const overdueDays = differenceInDays(now, item.plannedPublishAt);
            return (
              <li key={item.id} className="flex items-start gap-3">
                <CalendarClock
                  className="text-warning mt-0.5 h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/w/${workspaceSlug}/planning/${item.id}`}
                    className="text-body text-fg-primary hover:text-primary truncate font-semibold"
                  >
                    {item.title}
                  </Link>
                  <p className="text-label text-fg-muted mt-0.5">
                    {overdueDays <= 0
                      ? "Due today"
                      : overdueDays === 1
                        ? "Due: 1 day overdue"
                        : `Due: ${overdueDays} days overdue`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
