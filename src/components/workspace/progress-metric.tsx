import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ProgressMetric — a labelled percentage with a thin progress bar.
 * Used on the Workspace Overview ("Monthly health") card. When
 * `value` is null, the bar is hidden and a placeholder hint is shown
 * (e.g. "Set a monthly target" before the user has configured one).
 */
export interface ProgressMetricProps {
  label: string;
  value: number | null;
  /** Suffix appended to the displayed value (defaults to "%"). */
  suffix?: string;
  /** Hint shown when value is null. */
  empty?: string;
  className?: string;
}

export function ProgressMetric({
  label,
  value,
  suffix = "%",
  empty,
  className,
}: ProgressMetricProps) {
  const isEmpty = value === null;
  const width = isEmpty ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={cn("border-border rounded-[var(--radius-control)] border p-4", className)}>
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-page text-fg-primary mt-2 font-semibold">
        {isEmpty ? "—" : `${value}${suffix}`}
      </p>
      {isEmpty ? (
        empty ? (
          <p className="text-label text-fg-secondary mt-1">{empty}</p>
        ) : null
      ) : (
        <div className="bg-surface-subtle mt-3 h-2 overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full" style={{ width: `${width}%` }} />
        </div>
      )}
    </div>
  );
}
