import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * PlanningListSkeleton — loading placeholders for the enriched row.
 *
 * Per Goal 33 #24: the loading state should match the enriched
 * layout, not a generic spinner. Five-column desktop, two-column
 * tablet, single-column mobile, mirroring the row's responsive
 * grid. Rendered inside a `<ul>` with `aria-busy` so screen readers
 * announce the loading state.
 */
export interface PlanningListSkeletonProps {
  rows?: number;
  density?: "comfortable" | "compact";
  className?: string;
}

export function PlanningListSkeleton({
  rows = 5,
  density = "comfortable",
  className,
}: PlanningListSkeletonProps) {
  const padding = density === "compact" ? "py-2" : "py-3";
  return (
    <ul
      className={cn(
        "border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-card)] border",
        className,
      )}
      data-testid="planning-list-skeleton"
      aria-busy="true"
      aria-label="Loading planning list"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className={cn("flex flex-col gap-2 px-4", padding)}>
          <div className="flex items-center gap-3">
            <div className="bg-surface-subtle h-8 w-8 animate-pulse rounded-[var(--radius-control)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="bg-surface-subtle h-4 w-2/3 animate-pulse rounded" />
              <div className="bg-surface-subtle h-3 w-1/3 animate-pulse rounded" />
            </div>
          </div>
          <div className="bg-surface-subtle h-3 w-1/2 animate-pulse rounded" />
          <div className="flex items-center gap-2">
            <div className="bg-surface-subtle h-5 w-20 animate-pulse rounded-full" />
            <div className="bg-surface-subtle h-3 w-24 animate-pulse rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}
