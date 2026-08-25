import { Skeleton } from "@/components/ui/skeleton";

/**
 * UX-08 (GAP-FULL-REVIEW-2026-08-25) — the workflow board is a 7-col
 * kanban, not a 3-row list. The shared `(app)/loading.tsx` rendered
 * 3 h-12 bars for every authenticated route, which disoriented users
 * on a slow network: they saw "list" while waiting for a board.
 *
 * This skeleton mirrors the real layout:
 *   - 7 column headers (rounded labels)
 *   - 3 placeholder cards per column (the average column density
 *     observed in M3.5 production seed)
 *   - the same page-header skeleton as the shared one so the
 *     transition to the live page is seamless
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, columnIndex) => (
          <div
            key={columnIndex}
            className="border-border bg-surface-subtle space-y-2 rounded-[var(--radius-card)] border p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
