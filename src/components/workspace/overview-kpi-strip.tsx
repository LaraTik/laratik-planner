import * as React from "react";
import Link from "next/link";
import { ClipboardCheck, FileEdit, ListTodo, Rocket, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * OverviewKpiStrip — compact 5-tile executive summary strip shown
 * at the top of the workspace Overview.
 *
 * Per master prompt §5 ("Executive summary metrics"):
 *   - Each tile is interactive (drill-down into the Planning list
 *     with the matching filter pre-applied).
 *   - The labels are planner-language: Planned, On track, At risk,
 *     Needs review, Published.
 *   - The strip is COMPACT — 5 tiles on a 12-col dashboard, not
 *     oversized "stat cards". Numbers are large enough to scan,
 *     labels are muted, no decorative chrome.
 *
 * The component takes pre-shaped numbers + URLs from the page; it
 * does not own routing or data access.
 */
export interface OverviewKpiStripTile {
  label: string;
  value: number;
  href: string;
  /** Lucide icon. */
  icon: React.ComponentType<{ className?: string }>;
  /** Visual tone — drives left-border + icon colour. */
  tone: "default" | "warning" | "info" | "success" | "muted";
  /** Optional tooltip / aria-label override. */
  description?: string;
  /** Optional data-testid override. */
  testId?: string;
}

export interface OverviewKpiStripProps {
  tiles: OverviewKpiStripTile[];
  className?: string;
}

const TONE_BORDER: Record<OverviewKpiStripTile["tone"], string> = {
  default: "border-s-primary",
  warning: "border-s-warning",
  info: "border-s-info",
  success: "border-s-success",
  muted: "border-s-fg-muted",
};

const TONE_ICON: Record<OverviewKpiStripTile["tone"], string> = {
  default: "text-primary",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
  muted: "text-fg-muted",
};

export function OverviewKpiStrip({ tiles, className }: OverviewKpiStripProps) {
  return (
    <section
      aria-label="Workspace KPIs"
      data-testid="overview-kpi-strip"
      className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}
    >
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.label}
            href={t.href}
            data-testid={t.testId ?? `overview-kpi-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn(
              "border-border bg-surface hover:border-primary focus-visible:ring-focus-ring flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-s-4 p-3.5 transition-colors focus:outline-none focus-visible:ring-2",
              TONE_BORDER[t.tone],
            )}
            aria-label={`${t.label}: ${t.value}. ${t.description ?? ""}`.trim()}
          >
            <div className={cn("flex items-center gap-2", TONE_ICON[t.tone])}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
                {t.label}
              </span>
            </div>
            <p className="text-title-page text-fg-primary text-3xl leading-none font-bold tabular-nums">
              {t.value}
            </p>
          </Link>
        );
      })}
    </section>
  );
}

/**
 * Convenience exports — the canonical tile set used by the workspace
 * overview. The page builds the hrefs from the workspace slug, but
 * the icon + tone + label set is the same everywhere.
 */
export const OVERVIEW_KPI_ICONS = {
  planned: ListTodo,
  onTrack: Rocket,
  atRisk: ShieldAlert,
  needsReview: ClipboardCheck,
  published: FileEdit,
} as const;
