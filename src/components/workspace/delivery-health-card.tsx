import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ShieldAlert, CircleSlash } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "./dashboard-panel";

/**
 * DeliveryHealthCard — the refactored "Delivery health" panel on
 * the workspace Overview.
 *
 * Pre-refactor the card showed a donut labelled "4% AT RISK" while
 * the at-risk count next to it was 23 of 27 (≈ 85%). The two
 * numbers were visually self-contradictory, and the audit found
 * the math was actually `completed / total` — a "% complete"
 * value wearing the wrong label.
 *
 * The refactor (ADR-0007) replaces the donut with a stacked
 * horizontal bar that shows the three mutually-exclusive health
 * buckets in one glance: on-track (green) · at-risk (amber) ·
 * blocked (red). The headline number is the dominant segment's
 * percentage, and the per-bucket counts underneath agree with the
 * bar visually — so 4% and 23-at-risk can no longer fight for the
 * same headline.
 */
export interface DeliveryHealthCardProps {
  total: number;
  onTrackCount: number;
  onTrackPercent: number;
  atRiskCount: number;
  atRiskPercent: number;
  blockedCount: number;
  blockedPercent: number;
  /** Optional "Why at risk" breakdown — labels + counts. Rendered
   *  below the stacked bar when at-least-one item is at risk. */
  riskReasons: { label: string; count: number; href: string }[];
  /** Optional URL for the at-risk count row's "open" action. */
  atRiskHref: string;
  /** Optional URL for the on-track count row's "open" action. */
  onTrackHref: string;
  /** Optional URL for the blocked count row's "open" action. */
  blockedHref: string;
  /** Optional URL for "View all" in the footer. */
  viewAllHref: string;
  /**
   * Optional translator. When provided, the panel renders
   * `workspaceOverviewDashboard.deliveryHealth.*`; when omitted,
   * the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

export function DeliveryHealthCard({
  total,
  onTrackCount,
  onTrackPercent,
  atRiskCount,
  atRiskPercent,
  blockedCount,
  blockedPercent,
  riskReasons,
  atRiskHref,
  onTrackHref,
  blockedHref,
  viewAllHref,
  t,
}: DeliveryHealthCardProps) {
  // The stacked-bar segments sum to 100 (or 0 when the workspace
  // has no items). We render the bar with three flex children; the
  // flex-basis is the segment's percent.
  const hasAny = total > 0;
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;

  return (
    <DashboardPanel
      title={tr("workspaceOverviewDashboard.deliveryHealth.title", "Delivery health")}
      eyebrow={tr(
        "workspaceOverviewDashboard.deliveryHealth.eyebrow",
        "Are items on track to ship",
      )}
      data-testid="delivery-health"
    >
      <div className="space-y-5">
        {/* Headline number — the largest bucket's percent. NEVER a
            misleading "X% at risk" when atRiskCount is 0 or
            "Y% complete" when nothing is complete. The number here
            is `onTrackPercent` (the dominant "is this OK?" signal)
            and the legend below spells out the breakdown. */}
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-title-page text-fg-primary text-4xl leading-none font-bold tabular-nums",
              atRiskPercent > 50 && "text-warning",
              blockedPercent > 0 && atRiskPercent <= 50 && "text-danger",
            )}
            aria-label={tr(
              "workspaceOverviewDashboard.deliveryHealth.percentAria",
              `${onTrackPercent} percent on track`,
              { percent: onTrackPercent },
            )}
          >
            {onTrackPercent}%
          </span>
          <span className="text-body text-fg-secondary font-medium">
            {tr(
              "workspaceOverviewDashboard.deliveryHealth.onTrackThisMonth",
              "on track this month",
            )}
          </span>
        </div>

        {/* Stacked health bar */}
        <div
          className="bg-surface-container-low flex h-3 w-full overflow-hidden rounded-full"
          role="img"
          aria-label={tr(
            "workspaceOverviewDashboard.deliveryHealth.percentOnTrackAria",
            `On track ${onTrackCount} of ${total}, at risk ${atRiskCount}, blocked ${blockedCount}`,
            { onTrack: onTrackCount, total, atRisk: atRiskCount, blocked: blockedCount },
          )}
        >
          {!hasAny ? (
            <div className="bg-surface-variant h-full w-full" aria-hidden="true" />
          ) : (
            <>
              {onTrackPercent > 0 ? (
                <div
                  className="bg-success h-full"
                  style={{ width: `${onTrackPercent}%` }}
                  aria-label={tr(
                    "workspaceOverviewDashboard.deliveryHealth.bucketOnTrackAria",
                    `On track: ${onTrackCount}`,
                    { count: onTrackCount },
                  )}
                />
              ) : null}
              {atRiskPercent > 0 ? (
                <div
                  className="bg-warning h-full"
                  style={{ width: `${atRiskPercent}%` }}
                  aria-label={tr(
                    "workspaceOverviewDashboard.deliveryHealth.bucketAtRiskAria",
                    `At risk: ${atRiskCount}`,
                    { count: atRiskCount },
                  )}
                />
              ) : null}
              {blockedPercent > 0 ? (
                <div
                  className="bg-danger h-full"
                  style={{ width: `${blockedPercent}%` }}
                  aria-label={tr(
                    "workspaceOverviewDashboard.deliveryHealth.bucketBlockedAria",
                    `Blocked: ${blockedCount}`,
                    { count: blockedCount },
                  )}
                />
              ) : null}
            </>
          )}
        </div>

        {/* Per-bucket counts (clickable drill-downs) */}
        <ul className="grid grid-cols-3 gap-2">
          <HealthBucket
            tone="success"
            icon={CheckCircle2}
            label={tr("workspaceOverviewDashboard.deliveryHealth.onTrackBucket", "On track")}
            count={onTrackCount}
            href={onTrackHref}
            {...(t ? { t } : {})}
          />
          <HealthBucket
            tone="warning"
            icon={ShieldAlert}
            label={tr("workspaceOverviewDashboard.deliveryHealth.atRiskBucket", "At risk")}
            count={atRiskCount}
            href={atRiskHref}
            {...(t ? { t } : {})}
          />
          <HealthBucket
            tone="danger"
            icon={CircleSlash}
            label={tr("workspaceOverviewDashboard.deliveryHealth.blockedBucket", "Blocked")}
            count={blockedCount}
            href={blockedHref}
            {...(t ? { t } : {})}
          />
        </ul>

        {/* Why items are at risk (only when at least one is at risk) */}
        {atRiskCount > 0 ? (
          <div>
            <p className="text-label text-fg-muted mb-2 font-semibold tracking-wide uppercase">
              {tr("workspaceOverviewDashboard.deliveryHealth.whyAtRisk", "Why at risk")}
            </p>
            <ul className="space-y-1.5">
              {riskReasons.length === 0 ? (
                <li className="text-body text-fg-secondary">
                  {tr(
                    "workspaceOverviewDashboard.deliveryHealth.allAtRiskPastDue",
                    "All at-risk items are past due.",
                  )}
                </li>
              ) : (
                riskReasons.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3">
                    <Link
                      href={r.href}
                      className="text-body text-fg-primary hover:text-primary flex-1 truncate font-semibold underline-offset-4 hover:underline"
                    >
                      {r.label}
                    </Link>
                    <span className="text-body text-fg-secondary tabular-nums">{r.count}</span>
                  </li>
                ))
              )}
            </ul>
            <Link
              href={viewAllHref}
              className="text-label text-primary mt-3 inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 py-0.5 font-semibold underline-offset-4 hover:underline"
            >
              {tr(
                "workspaceOverviewDashboard.deliveryHealth.viewAllAtRisk",
                "View all at-risk items →",
              )}
            </Link>
          </div>
        ) : null}
      </div>
    </DashboardPanel>
  );
}

function HealthBucket({
  tone,
  icon: Icon,
  label,
  count,
  href,
  t,
}: {
  tone: "success" | "warning" | "danger";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  href: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  const toneClass = {
    success: "border-success/30 bg-success-subtle text-success",
    warning: "border-warning/30 bg-warning-subtle text-warning",
    danger: "border-danger/30 bg-danger-subtle text-danger",
  }[tone];
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "focus-visible:ring-focus-ring flex flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border p-3 text-center transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2",
          toneClass,
        )}
        aria-label={tr(
          "workspaceOverviewDashboard.deliveryHealth.bucketAria",
          `${label}: ${count} items, click to view`,
          { label, count },
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-title-card text-2xl leading-none font-bold tabular-nums">
          {count}
        </span>
        <span className="text-label font-semibold tracking-wide uppercase">{label}</span>
      </Link>
    </li>
  );
}
