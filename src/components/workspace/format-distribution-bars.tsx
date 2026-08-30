import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { KpiContentFormat } from "@/lib/dashboard/kpis";

/**
 * FormatDistributionBars — horizontal distribution visualization for
 * the Plan Coverage card. Replaces the pre-refactor "tiny text
 * dots" legend: each non-zero format is a labelled bar with
 * `count` and `percentage`, and each row is a link to the planning
 * list filtered by that format.
 *
 * Per the master prompt §7 ("Format Breakdown"):
 *   - "Do not render format counts as tiny text dots."
 *   - "Each format may be clickable: Story 13 → Planning?format=story."
 *   - "Show: count, percentage where useful."
 *
 * The component is presentation-only. The page wires the
 * `buildHref(format)` callback so the same component works in the
 * dashboard, the planning list, and any other surface that wants a
 * per-format breakdown.
 */
export interface FormatDistributionBar {
  format: KpiContentFormat;
  label: string;
  count: number;
}

export interface FormatDistributionBarsProps {
  bars: FormatDistributionBar[];
  /** Returns a URL for a given format (e.g. `/app/w/.../planning?format=story`). */
  buildHref: (format: KpiContentFormat) => string;
  /** Optional total — used to compute percentages. Defaults to sum of counts. */
  total?: number;
  /** Cap the rendered rows (others are hidden, not aggregated). */
  maxRows?: number;
  /** Optional className for layout overrides. */
  className?: string;
  /** Optional data-testid for E2E hooks. */
  "data-testid"?: string;
}

const ROW_BAR = "bg-primary";
const ROW_BAR_ALT = "bg-tertiary-container";

function formatColor(index: number): string {
  // Stable palette so the same format always renders the same colour
  // across the dashboard and the planning list.
  return index % 2 === 0 ? ROW_BAR : ROW_BAR_ALT;
}

export function FormatDistributionBars({
  bars,
  buildHref,
  total,
  maxRows = 8,
  className,
  "data-testid": testId,
}: FormatDistributionBarsProps) {
  const visible = bars.filter((b) => b.count > 0).slice(0, maxRows);
  const computedTotal = total ?? visible.reduce((s, b) => s + b.count, 0);

  if (computedTotal === 0 || visible.length === 0) {
    return (
      <p className="text-body text-fg-muted" data-testid={testId ?? "format-distribution-empty"}>
        No items this month.
      </p>
    );
  }

  // Scale the bar widths so the largest bar fills the row. The
  // percent shown next to the label is the *share* (count / total),
  // not the bar width — the bar is a relative comparator.
  const maxCount = Math.max(...visible.map((b) => b.count));

  return (
    <ul className={cn("space-y-2", className)} data-testid={testId ?? "format-distribution"}>
      {visible.map((b, i) => {
        const sharePct = Math.round((b.count / computedTotal) * 100);
        const widthPct = maxCount ? (b.count / maxCount) * 100 : 0;
        return (
          <li key={b.format}>
            <Link
              href={buildHref(b.format)}
              className="focus-visible:ring-focus-ring hover:bg-surface-subtle grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[var(--radius-control)] p-1 transition-colors focus:outline-none focus-visible:ring-2"
              aria-label={`${b.label}: ${b.count} items, ${sharePct} percent of the month`}
            >
              <span className="text-label text-fg-secondary w-20 truncate font-semibold">
                {b.label}
              </span>
              <span
                className="bg-surface-container-low relative h-2 w-full overflow-hidden rounded-full"
                role="presentation"
              >
                <span
                  className={cn("h-full rounded-full", formatColor(i))}
                  style={{ width: `${widthPct}%` }}
                />
              </span>
              <span className="text-label text-fg-primary w-20 text-right font-semibold tabular-nums">
                {b.count} <span className="text-fg-muted font-normal">· {sharePct}%</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
