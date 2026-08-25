import { Skeleton } from "@/components/ui/skeleton";

/**
 * UX-08 (GAP-FULL-REVIEW-2026-08-25) — the calendar is a 7-col
 * weekday grid (Sun-Sat) with 5-6 rows of day cells. The shared
 * loading.tsx rendered a 3-bar list, which the user perceived as the
 * "wrong page" while waiting.
 *
 * This skeleton mirrors the real layout:
 *   - 7 weekday headers
 *   - 6 rows × 7 cols of empty day cells
 *   - the same page-header skeleton as the shared one
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
      <div className="space-y-3">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, dayIndex) => (
            <Skeleton key={dayIndex} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, dayIndex) => (
              <Skeleton key={dayIndex} className="h-20 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
