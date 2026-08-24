import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One row in the Plan Coverage card's Format Breakdown bar. Each
 * non-zero format is rendered as a colored segment whose width is
 * `count / total * 100%`. Zero-count formats are simply not rendered.
 */
function formatSegmentColor(index: number): string {
  const palette = [
    "bg-primary",
    "bg-tertiary-container",
    "bg-surface-variant",
    "bg-secondary-container",
    "bg-info-subtle",
  ];
  return palette[index % palette.length] ?? "bg-primary";
}

export interface PlanCoverageCardProps {
  total: number;
  monthlyTarget: number | null;
  coveragePercent: number | null;
  formatBreakdown: { format: string; label: string; count: number }[];
}

/**
 * Plan Coverage — first of the two cards in the Stitch overview's
 * "Health & Coverage" row. Shows the X / Y items + coverage badge,
 * the per-format breakdown bar, and (below the bar) a small legend
 * with the count per format. When the workspace has no target set,
 * the badge shows "No target" instead of a percentage.
 */
export function PlanCoverageCard({
  total,
  monthlyTarget,
  coveragePercent,
  formatBreakdown,
}: PlanCoverageCardProps) {
  const nonZero = formatBreakdown.filter((b) => b.count > 0);
  const totalForBar = nonZero.reduce((s, b) => s + b.count, 0);

  return (
    <section
      aria-label="Plan coverage"
      className="border-border bg-surface rounded-[var(--radius-card)] border p-6"
    >
      <h2 className="text-title-card text-fg-primary mb-4 font-semibold">Plan Coverage</h2>

      <div className="mb-6 flex items-end gap-3">
        <span className="text-title-page text-fg-primary text-4xl leading-none font-bold">
          {total}
        </span>
        {monthlyTarget ? (
          <span className="text-body text-fg-secondary pb-1 font-medium">
            / {monthlyTarget} items
          </span>
        ) : (
          <span className="text-body text-fg-muted pb-1 font-medium">/ — items</span>
        )}
        {coveragePercent !== null ? (
          <span
            className={cn(
              "mb-1 ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold",
              coveragePercent >= 100
                ? "bg-success-subtle text-success"
                : "bg-warning-subtle text-warning",
            )}
          >
            {coveragePercent}%
          </span>
        ) : (
          <span className="text-label text-fg-muted mb-1 ml-2 font-semibold">No target</span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-label text-fg-secondary mb-1 font-medium">Format Breakdown</div>
          <div
            className="bg-surface-container-low flex h-2 w-full overflow-hidden rounded-full"
            role="img"
            aria-label="Format breakdown bar"
          >
            {nonZero.length === 0 ? (
              <div className="bg-surface-variant h-full w-full" aria-hidden="true" />
            ) : (
              nonZero.map((b, i) => (
                <div
                  key={b.format}
                  className={cn("h-full", formatSegmentColor(i))}
                  style={{ width: `${totalForBar ? (b.count / totalForBar) * 100 : 0}%` }}
                  title={`${b.label}: ${b.count}`}
                />
              ))
            )}
          </div>
          <ul className="text-label text-fg-secondary mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {nonZero.length === 0 ? (
              <li className="text-fg-muted">No items yet this month.</li>
            ) : (
              nonZero.map((b, i) => (
                <li key={b.format} className="flex items-center gap-1">
                  <span
                    className={cn("h-2 w-2 rounded-full", formatSegmentColor(i))}
                    aria-hidden="true"
                  />
                  {b.label} ({b.count})
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
