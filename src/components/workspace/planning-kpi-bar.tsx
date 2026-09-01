import * as React from "react";
import { ClipboardCheck, Clock, FileEdit, ListTodo, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Planning KPI Bar — 5 compact tiles shown above the planning list,
 * per the Stitch design (project 5403097764334458790, Monthly Planning
 * List). Each tile surfaces one number + a short label:
 *
 *  - Total Planned — all non-cancelled items in the current month
 *  - At Risk — past-due, still in flight (NOT including drafts or blocked; see
 *    ADR-0006 for the strict-overdue definition)
 *  - Needs Review — items in content_review / creative_review / changes_requested
 *  - Ready — items in ready_to_publish / partially_published
 *  - Not started — items still in `draft` (the new tile, 2026-08-30)
 *
 * Numbers link to the planning list with the matching filter pre-applied
 * (status param + risk=at_risk for the At Risk tile, status=draft for Not started).
 */
export interface PlanningKpiBarProps {
  total: number;
  atRisk: number;
  needsReview: number;
  ready: number;
  notStarted: number;
  baseHref: string;
  currentQuery: URLSearchParams;
  /**
   * Optional translator. When provided, the section aria-label renders
   * from `workspaceOverviewDashboard.planningKpiAria`; when omitted,
   * the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

function buildHref(
  baseHref: string,
  currentQuery: URLSearchParams,
  overrides: Record<string, string | null>,
): string {
  const params = new URLSearchParams(currentQuery.toString());
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${baseHref}?${qs}` : baseHref;
}

export function PlanningKpiBar({
  total,
  atRisk,
  needsReview,
  ready,
  notStarted,
  baseHref,
  currentQuery,
  t,
}: PlanningKpiBarProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  // The label is locale-dependent so the E2E hook derives from a
  // stable `id` rather than the translated label. This keeps the
  // data-testid consistent across English and Arabic sessions.
  const tiles: {
    id: string;
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    accent: "default" | "warning" | "info" | "success" | "muted";
  }[] = [
    {
      id: "total",
      label: tr("workspaceOverviewDashboard.planningKpiTotal", "Total Planned"),
      value: total,
      icon: ListTodo,
      href: buildHref(baseHref, currentQuery, { risk: null }),
      accent: "default",
    },
    {
      id: "at-risk",
      label: tr("workspaceOverviewDashboard.planningKpiAtRisk", "At Risk"),
      value: atRisk,
      icon: Clock,
      href: buildHref(baseHref, currentQuery, { risk: "at_risk" }),
      accent: "warning",
    },
    {
      id: "needs-review",
      label: tr("workspaceOverviewDashboard.planningKpiNeedsReview", "Needs Review"),
      value: needsReview,
      icon: ClipboardCheck,
      href: buildHref(baseHref, currentQuery, { status: "content_review" }),
      accent: "info",
    },
    {
      id: "ready",
      label: tr("workspaceOverviewDashboard.planningKpiReady", "Ready"),
      value: ready,
      icon: Rocket,
      href: buildHref(baseHref, currentQuery, { status: "ready_to_publish" }),
      accent: "success",
    },
    {
      id: "not-started",
      label: tr("workspaceOverviewDashboard.planningKpiNotStarted", "Not started"),
      value: notStarted,
      icon: FileEdit,
      href: buildHref(baseHref, currentQuery, { status: "draft" }),
      accent: "muted",
    },
  ];

  return (
    <section
      aria-label={tr("workspaceOverviewDashboard.planningKpiAria", "Planning KPIs")}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <a
            key={tile.id}
            href={tile.href}
            className={cn(
              "border-border bg-surface hover:border-primary focus-visible:ring-focus-ring flex flex-col gap-2 rounded-[var(--radius-card)] border p-4 transition-colors focus:outline-none focus-visible:ring-2",
            )}
            data-testid={`planning-kpi-${tile.id}`}
          >
            <div
              className={cn(
                "flex items-center gap-2",
                tile.accent === "warning" && "text-warning",
                tile.accent === "info" && "text-info",
                tile.accent === "success" && "text-success",
                tile.accent === "default" && "text-primary",
                tile.accent === "muted" && "text-fg-muted",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
                {tile.label}
              </span>
            </div>
            <p className="text-title-page text-fg-primary text-3xl leading-none font-bold">
              {tile.value}
            </p>
          </a>
        );
      })}
    </section>
  );
}
