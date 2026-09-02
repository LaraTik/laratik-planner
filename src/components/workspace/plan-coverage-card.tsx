import * as React from "react";
import Link from "next/link";
import { Target, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "./dashboard-panel";
import { FormatDistributionBars, type FormatDistributionBar } from "./format-distribution-bars";
import type { KpiContentFormat } from "@/lib/dashboard/kpis";

/**
 * PlanCoverageCard — the refactored "Plan coverage" panel on the
 * workspace Overview.
 *
 * Pre-refactor the card displayed the same "27 / — items · No
 * target" number twice and the format breakdown was a row of
 * tiny dots that the operator could not visually compare. The
 * refactor (ADR-0007) gives the card four concrete jobs:
 *
 *   1. Show the planned count prominently.
 *   2. Show coverage vs target (when set) with a progress bar.
 *   3. Show "No target" as an ACTIONABLE state, not a passive
 *      label — the operator gets a "Set target" CTA pointing
 *      at the workspace settings page.
 *   4. Show the format mix as a horizontal distribution of bars,
 *      each clickable into a filtered Planning view.
 */
export interface PlanCoverageCardProps {
  total: number;
  monthlyTarget: number | null;
  coveragePercent: number | null;
  formatBreakdown: FormatDistributionBar[];
  /** Returns a URL for a given format (e.g. `/app/w/.../planning?format=story`). */
  buildFormatHref: (format: KpiContentFormat) => string;
  /** Where "Set target" / "Edit target" points. */
  settingsHref: string;
  /**
   * Optional translator. When provided, the panel renders
   * `workspaceOverviewDashboard.planCoverage.*`; when omitted, the
   * hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

export function PlanCoverageCard({
  total,
  monthlyTarget,
  coveragePercent,
  formatBreakdown,
  buildFormatHref,
  settingsHref,
  t,
}: PlanCoverageCardProps) {
  const hasTarget = monthlyTarget !== null && monthlyTarget > 0;
  const remaining = hasTarget ? Math.max(0, monthlyTarget - total) : null;
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;

  return (
    <DashboardPanel
      title={tr("workspaceOverviewDashboard.planCoverage.title", "Plan coverage")}
      eyebrow={tr("workspaceOverviewDashboard.planCoverage.eyebrow", "How much have we planned")}
      data-testid="plan-coverage"
      headerAction={
        <Link
          href={settingsHref}
          className="text-label text-primary inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline"
          aria-label={
            hasTarget
              ? tr("workspaceOverviewDashboard.planCoverage.editTargetAria", "Edit monthly target")
              : tr("workspaceOverviewDashboard.planCoverage.setTargetAria", "Set a monthly target")
          }
        >
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {hasTarget
            ? tr("workspaceOverviewDashboard.planCoverage.editTarget", "Edit target")
            : tr("workspaceOverviewDashboard.planCoverage.setTarget", "Set target")}
        </Link>
      }
    >
      <div className="space-y-5">
        {/* Headline count + coverage progress */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-title-page text-fg-primary text-4xl leading-none font-bold tabular-nums">
              {total}
            </span>
            <span className="text-body text-fg-secondary font-medium">
              {hasTarget
                ? tr("workspaceOverviewDashboard.planCoverage.plannedProgress", `planned`, {
                    target: monthlyTarget,
                  })
                : tr(
                    "workspaceOverviewDashboard.planCoverage.plannedThisMonth",
                    "planned this month",
                  )}
            </span>
          </div>
          {hasTarget ? (
            <CoverageBar
              coveragePercent={coveragePercent ?? 0}
              remaining={remaining ?? 0}
              met={total >= (monthlyTarget ?? 0)}
              {...(t ? { t } : {})}
            />
          ) : (
            <NoTargetCallout settingsHref={settingsHref} {...(t ? { t } : {})} />
          )}
        </div>

        {/* Format mix */}
        <div>
          <p className="text-label text-fg-muted mb-2 font-semibold tracking-wide uppercase">
            {tr("workspaceOverviewDashboard.planCoverage.formatMix", "Format mix")}
          </p>
          <FormatDistributionBars bars={formatBreakdown} buildHref={buildFormatHref} />
        </div>
      </div>
    </DashboardPanel>
  );
}

function CoverageBar({
  coveragePercent,
  remaining,
  met,
  t,
}: {
  coveragePercent: number;
  remaining: number;
  met: boolean;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  return (
    <div className="mt-3 space-y-1.5">
      <div
        className="bg-surface-container-low relative h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={coveragePercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={tr(
          "workspaceOverviewDashboard.planCoverage.coverageAria",
          `${coveragePercent} percent of monthly target`,
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            met ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, Math.max(0, coveragePercent))}%` }}
        />
      </div>
      <p className={cn("text-label font-semibold", met ? "text-success" : "text-fg-secondary")}>
        {met
          ? tr(
              "workspaceOverviewDashboard.planCoverage.targetMet",
              `Target met (${coveragePercent}%)`,
              { percent: coveragePercent },
            )
          : tr(
              `workspaceOverviewDashboard.planCoverage.coverageRemaining${remaining === 1 ? "One" : "Many"}`,
              `${coveragePercent}% coverage · ${remaining} item${remaining === 1 ? "" : "s"} to go`,
              { percent: coveragePercent, remaining },
            )}
      </p>
    </div>
  );
}

function NoTargetCallout({
  settingsHref,
  t,
}: {
  settingsHref: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  return (
    <div className="border-border bg-surface-subtle mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-dashed px-3 py-2">
      <div className="flex items-center gap-2">
        <Target className="text-fg-muted h-4 w-4" aria-hidden="true" />
        <p className="text-body text-fg-secondary">
          <span className="font-semibold">
            {tr("workspaceOverviewDashboard.planCoverage.noMonthlyTarget", "No monthly target")}
          </span>{" "}
          —{" "}
          {tr(
            "workspaceOverviewDashboard.planCoverage.setTargetHint",
            "set one to see coverage progress.",
          )}
        </p>
      </div>
      <Link
        href={settingsHref}
        className="bg-primary text-label text-button inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold text-white"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {tr("workspaceOverviewDashboard.planCoverage.setTarget", "Set target")}
      </Link>
    </div>
  );
}
