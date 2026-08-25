import { Skeleton } from "@/components/ui/skeleton";

/**
 * UX-08 (GAP-FULL-REVIEW-2026-08-25) — the channels page is a
 * DataTable (Platform / Account / Profile URL / State / Owner /
 * Last updated) with row actions, not a list of cards. The shared
 * loading.tsx rendered 3 h-12 bars which the user perceived as a
 * list while waiting.
 *
 * This skeleton mirrors the real layout:
 *   - page header
 *   - 5 column-header placeholders
 *   - 5 table-row placeholders, each with the same column count as
 *     the live DataTable so the user sees a table loading, not a list
 */
const COLUMNS = ["Platform", "Account", "URL", "State", "Owner"];

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="border-border bg-surface space-y-3 rounded-[var(--radius-card)] border p-3">
        <div className="grid grid-cols-5 gap-3 px-2">
          {COLUMNS.map((column) => (
            <Skeleton key={column} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-5 items-center gap-3 px-2 py-2">
            {COLUMNS.map((column) => (
              <Skeleton key={column} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
