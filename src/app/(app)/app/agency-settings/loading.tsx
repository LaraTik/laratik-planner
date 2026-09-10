export default function AgencySettingsLoading() {
  return (
    <div className="max-w-6xl space-y-6" aria-busy="true" aria-live="polite" role="status">
      <div className="space-y-2" aria-hidden="true">
        <div className="bg-surface-subtle h-4 w-28 animate-pulse rounded" />
        <div className="bg-surface-subtle h-9 w-64 animate-pulse rounded" />
        <div className="bg-surface-subtle h-5 w-full max-w-2xl animate-pulse rounded" />
      </div>
      <div className="grid gap-4 md:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="border-border bg-surface min-h-64 animate-pulse rounded-[var(--radius-card)] border"
          />
        ))}
      </div>
      <div
        className="border-border bg-surface min-h-72 animate-pulse rounded-[var(--radius-card)] border"
        aria-hidden="true"
      />
    </div>
  );
}
