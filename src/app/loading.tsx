import { Skeleton } from "@/components/ui/skeleton";

/**
 * Top-level loading state (Next.js 13+ App Router).
 *
 * Shown while the root layout's data fetches. Keeps the layout shell
 * visible (sidebar + topbar) and only skeletons the page content so the
 * UI never feels frozen.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
