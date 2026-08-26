import { Skeleton } from "@/components/ui/skeleton";

/**
 * Brand-kit route loading skeleton (Next.js 16 App Router).
 *
 * The brand-kit page is a server component that runs 6+ DB queries
 * in parallel. On a slow connection or a workspace with thousands
 * of brand rows, the page can take 1-2s to render. Without this
 * file the user sees a blank page for the duration of the
 * `Promise.all`. The skeleton mirrors the row structure of the
 * real page (Bento grid) so the layout shift on hydration is
 * minimal.
 *
 * Skeleton layout (mirrors `page.tsx`):
 *   row 1 — full-bleed hero
 *   row 2 — Logo (8) + Color (4)
 *   row 3 — Typography (12)
 *   row 4 — Voice (6) + Pillars (6)
 *   row 5 — Publishing (4) + Linked (4)
 *   row 6 — Recent Updates (12)
 */
export default function BrandKitLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <Skeleton className="h-11 w-full" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-6">
        {/* Row 1 — hero */}
        <Skeleton className="h-44 lg:col-span-12" />

        {/* Row 2 — Logo (8) + Color (4) */}
        <Skeleton className="h-64 lg:col-span-8" />
        <Skeleton className="h-64 lg:col-span-4" />

        {/* Row 3 — Typography (12) */}
        <Skeleton className="h-48 lg:col-span-12" />

        {/* Row 4 — Voice (6) + Pillars (6) */}
        <Skeleton className="h-56 lg:col-span-6" />
        <Skeleton className="h-56 lg:col-span-6" />

        {/* Row 5 — Publishing (4) + Linked (4) */}
        <Skeleton className="h-56 lg:col-span-4" />
        <Skeleton className="h-56 lg:col-span-4" />

        {/* Row 6 — Recent Updates (12) */}
        <Skeleton className="h-64 lg:col-span-12" />
      </div>
    </div>
  );
}
