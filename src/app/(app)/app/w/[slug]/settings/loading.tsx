import { Skeleton } from "@/components/ui/skeleton";

/**
 * UX-08 (GAP-FULL-REVIEW-2026-08-25) — the settings page is a long
 * form (Lifecycle / Lead times / Assignment defaults / Approval
 * mode / AI assistance), not a list of cards. The shared loading
 * shipped 3 h-12 bars which the user perceived as a 3-row list.
 *
 * This skeleton mirrors the real layout:
 *   - page header (eyebrow + title + action button)
 *   - 4 section cards, each with a card-header + 3 form-row
 *     placeholders (label + control + helper text)
 *   - the same page-header skeleton as the shared one for a
 *     seamless transition
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
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <div
          key={sectionIndex}
          className="border-border bg-surface space-y-4 rounded-[var(--radius-card)] border p-6"
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          {Array.from({ length: 3 }).map((_, fieldIndex) => (
            <div key={fieldIndex} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-56" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
