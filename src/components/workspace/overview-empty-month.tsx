import * as React from "react";
import Link from "next/link";
import { CalendarDays, Plus, Target } from "lucide-react";

import { SectionEmptyState } from "./section-empty-state";

/**
 * OverviewEmptyMonth — the explicit "this month has nothing in it" state.
 *
 * WHY THIS EXISTS
 *
 * Switching the Overview to a month with no content used to render a page of
 * hard zeros: five KPI tiles at 0, Plan Coverage at "0 planned", an empty
 * workflow pipeline, and an empty needs-attention list. Every number was
 * arithmetically correct and the page still read as broken — and because a
 * future month is empty by construction (nobody has planned it yet), an
 * operator flipping between this month and next saw a *pixel-identical* page.
 * That is indistinguishable from a broken month switcher.
 *
 * The distinction the operator actually needs is "this month is empty" versus
 * "this month exists but is unhealthy". Saying it in words — and pairing it
 * with the coverage gap when a target is set — turns a dead page into the
 * single most actionable prompt the Overview has: go plan this month.
 *
 * Copy varies by phase because the action does:
 *   future — planning has not started; the CTA is "plan it".
 *   past   — nothing was ever scheduled here; this is a historical gap.
 *   current— the month is running and empty, which is the worst case.
 */
export interface OverviewEmptyMonthProps {
  /** Pre-formatted, locale-aware month label (e.g. "November 2026"). */
  monthLabel: string;
  /** `"past" | "current" | "future"` — drives the wording and the CTA. */
  monthPhase: "past" | "current" | "future";
  /** Items scheduled in the month. Always 0 where this renders, but passed
   *  explicitly so the copy can never claim a number the query did not return. */
  total: number;
  /** Workspace monthly target, or null when unset. */
  monthlyTarget: number | null;
  /** Where "create content" points. */
  createHref: string;
  /** Where "set a monthly target" points. */
  settingsHref: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
}

export function OverviewEmptyMonth({
  monthLabel,
  monthPhase,
  total,
  monthlyTarget,
  createHref,
  settingsHref,
  t,
}: OverviewEmptyMonthProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;

  const hasTarget = monthlyTarget !== null && monthlyTarget > 0;
  const gap = hasTarget ? Math.max(0, monthlyTarget - total) : 0;

  const description = hasTarget
    ? tr(
        "workspaceOverviewDashboard.emptyMonth.withTarget",
        `Your monthly target is ${monthlyTarget} items — ${gap} still to plan for ${monthLabel}.`,
        { target: monthlyTarget, gap, month: monthLabel },
      )
    : monthPhase === "past"
      ? tr(
          "workspaceOverviewDashboard.emptyMonth.noTargetPast",
          `Nothing was ever scheduled for ${monthLabel}.`,
          { month: monthLabel },
        )
      : tr(
          "workspaceOverviewDashboard.emptyMonth.noTarget",
          `Nothing is scheduled for ${monthLabel} yet.`,
          { month: monthLabel },
        );

  return (
    <section
      aria-labelledby="overview-empty-month-title"
      data-testid="overview-empty-month"
      data-month-phase={monthPhase}
      className="border-border bg-surface rounded-[var(--radius-panel)] border p-6"
    >
      <SectionEmptyState
        icon={CalendarDays}
        testId="overview-empty-month-inner"
        title={tr(
          "workspaceOverviewDashboard.emptyMonth.title",
          `Nothing planned for ${monthLabel}`,
          { month: monthLabel },
        )}
        description={description}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href={createHref}
              className="bg-primary text-label text-button inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-4 py-2 font-semibold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tr("workspaceOverviewDashboard.emptyMonth.createCta", "Plan this month")}
            </Link>
            {!hasTarget ? (
              <Link
                href={settingsHref}
                className="border-border bg-surface text-label text-fg-primary inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border px-4 py-2 font-semibold"
              >
                <Target className="h-4 w-4" aria-hidden="true" />
                {tr("workspaceOverviewDashboard.emptyMonth.setTargetCta", "Set a monthly target")}
              </Link>
            ) : null}
          </div>
        }
      />
      {/* The section heading keeps the empty state reachable by screen-reader
          landmark navigation, which a bare EmptyState would not provide. */}
      <h2 id="overview-empty-month-title" className="sr-only">
        {tr("workspaceOverviewDashboard.emptyMonth.regionLabel", "Empty month")}
      </h2>
    </section>
  );
}
