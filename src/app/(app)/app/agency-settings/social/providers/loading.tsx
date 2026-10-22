import { Skeleton } from "@/components/ui/skeleton";

function ProviderCardSkeleton() {
  return (
    <div
      className="border-border bg-surface space-y-4 rounded-[var(--radius-card)] border p-4"
      data-testid="provider-config-loading-card"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-4 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="space-y-1.5" key={index}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-24" />
      </div>
    </div>
  );
}

export default function AgencySocialProvidersLoading() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-live="polite"
      role="status"
      data-testid="agency-providers-loading"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <Skeleton className="h-11 w-36" />
      </header>

      <section className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ProviderCardSkeleton />
          <ProviderCardSkeleton />
        </div>
      </section>

      <section
        className="border-border bg-surface space-y-4 rounded-[var(--radius-card)] border p-4"
        data-testid="provider-readiness-loading"
      >
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="border-border space-y-2 rounded-md border p-3" key={index}>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-4 w-full" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            className="border-border bg-surface space-y-3 rounded-[var(--radius-card)] border p-4"
            data-testid="analytics-probe-loading-card"
            key={index}
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-11 w-36" />
          </div>
        ))}
      </section>
    </div>
  );
}
