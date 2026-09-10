import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading UI for media filtering and folder navigation. */
export function MediaLibraryLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite" role="status">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-32" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Skeleton className="h-64 w-full lg:w-56" />
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-72 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
