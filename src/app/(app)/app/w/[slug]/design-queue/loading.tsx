import { Skeleton } from "@/components/ui/skeleton";

/**
 * UX-08 (GAP-FULL-REVIEW-2026-08-25) — the design queue is a 3-col
 * card grid (one card per unassigned item), not a list of rows. The
 * shared loading.tsx rendered 3 h-12 bars which the user perceived
 * as a list while waiting.
 *
 * This skeleton mirrors the real layout:
 *   - page header
 *   - 6 card placeholders in the same 1/2/3 col grid as the live page
 *   - each card has a title + meta line + status pill placeholder
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, cardIndex) => (
          <div
            key={cardIndex}
            className="border-border bg-surface space-y-3 rounded-[var(--radius-card)] border p-4"
          >
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
