import { Skeleton } from "@/components/ui/skeleton";

export type ScreenLoadingVariant =
  | "overview"
  | "planning"
  | "content-detail"
  | "reviews"
  | "analytics"
  | "table"
  | "form"
  | "client-review"
  | "publish";

function LoadingHeader({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
        {Array.from({ length: actions }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-28 sm:h-9" />
        ))}
      </div>
    </div>
  );
}

function LoadingCard({ className = "h-48" }: { className?: string }) {
  return (
    <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className={className} />
      </div>
    </div>
  );
}

function LoadingTable() {
  return (
    <div className="border-border bg-surface space-y-3 rounded-[var(--radius-card)] border p-3">
      <div className="grid grid-cols-4 gap-3 px-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-4 items-center gap-3 px-2 py-3">
          {Array.from({ length: 4 }).map((_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

function LoadingFormSections({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, sectionIndex) => (
        <div
          key={sectionIndex}
          className="border-border bg-surface space-y-5 rounded-[var(--radius-card)] border p-5 sm:p-6"
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          {Array.from({ length: 2 }).map((__, fieldIndex) => (
            <div key={fieldIndex} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-3 w-56" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function OverviewLoading() {
  return (
    <>
      <LoadingHeader actions={1} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingCard key={index} className="h-12" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <LoadingCard className="h-64 lg:col-span-8 lg:h-72" />
        <LoadingCard className="h-64 lg:col-span-4 lg:h-72" />
        <LoadingCard className="h-56 lg:col-span-6" />
        <LoadingCard className="h-56 lg:col-span-6" />
      </div>
    </>
  );
}

function PlanningLoading() {
  return (
    <>
      <LoadingHeader actions={1} />
      <Skeleton className="h-11 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingCard key={index} className="h-8" />
        ))}
      </div>
      <div className="border-border bg-surface space-y-3 rounded-[var(--radius-card)] border p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="border-border grid gap-3 border-b pb-3 last:border-0 sm:grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr]"
          >
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
    </>
  );
}

function ContentDetailLoading() {
  return (
    <>
      <LoadingHeader actions={2} />
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-4 lg:grid-cols-12">
        <LoadingCard className="h-60 lg:col-span-8 lg:h-72" />
        <LoadingCard className="h-60 lg:col-span-4 lg:h-72" />
        <LoadingCard className="h-72 lg:col-span-7" />
        <LoadingCard className="h-72 lg:col-span-5" />
      </div>
    </>
  );
}

function ReviewsLoading() {
  return (
    <>
      <LoadingHeader />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <LoadingCard key={index} className="h-8" />
        ))}
      </div>
      <LoadingTable />
    </>
  );
}

function AnalyticsLoading() {
  return (
    <>
      <LoadingHeader actions={1} />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-full sm:w-48" />
        <Skeleton className="h-11 w-full sm:w-40" />
        <Skeleton className="h-11 w-full sm:w-36" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <LoadingCard key={index} className="h-10" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <LoadingCard className="h-72 lg:col-span-8" />
        <LoadingCard className="h-72 lg:col-span-4" />
      </div>
    </>
  );
}

function ClientReviewLoading() {
  return (
    <>
      <LoadingHeader />
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <LoadingCard key={index} className="h-48" />
        ))}
      </div>
    </>
  );
}

function PublishLoading() {
  return (
    <>
      <LoadingHeader actions={1} />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-12">
        <LoadingCard className="h-80 lg:col-span-7" />
        <LoadingCard className="h-80 lg:col-span-5" />
      </div>
    </>
  );
}

export function ScreenLoading({ variant }: { variant: ScreenLoadingVariant }) {
  const content = {
    overview: <OverviewLoading />,
    planning: <PlanningLoading />,
    "content-detail": <ContentDetailLoading />,
    reviews: <ReviewsLoading />,
    analytics: <AnalyticsLoading />,
    table: (
      <>
        <LoadingHeader actions={1} />
        <LoadingTable />
      </>
    ),
    form: (
      <>
        <LoadingHeader actions={1} />
        <LoadingFormSections />
      </>
    ),
    "client-review": <ClientReviewLoading />,
    publish: <PublishLoading />,
  }[variant];

  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite" role="status">
      {content}
    </div>
  );
}
