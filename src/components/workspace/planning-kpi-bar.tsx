import * as React from "react";
import { ClipboardCheck, Clock, ListTodo, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Planning KPI Bar — 4 compact tiles shown above the planning list,
 * per the Stitch design (project 5403097764334458790, Monthly Planning
 * List). Each tile surfaces one number + a short label:
 *
 *  - Total Planned — all non-cancelled items in the current month
 *  - At Risk — overdue, in-flight (not done, not cancelled, not blocked)
 *  - Needs Review — items waiting on the user (content_review /
 *    creative_review / changes_requested)
 *  - Ready — items in ready_to_publish / partially_published
 *
 * Numbers link to the planning list with the matching filter pre-applied
 * (status param + risk=at_risk for the At Risk tile).
 */
export interface PlanningKpiBarProps {
  total: number;
  atRisk: number;
  needsReview: number;
  ready: number;
  baseHref: string;
  currentQuery: URLSearchParams;
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
  baseHref,
  currentQuery,
}: PlanningKpiBarProps) {
  const tiles: {
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    accent: "default" | "warning" | "info" | "success";
  }[] = [
    {
      label: "Total Planned",
      value: total,
      icon: ListTodo,
      href: buildHref(baseHref, currentQuery, { risk: null }),
      accent: "default",
    },
    {
      label: "At Risk",
      value: atRisk,
      icon: Clock,
      href: buildHref(baseHref, currentQuery, { risk: "at_risk" }),
      accent: "warning",
    },
    {
      label: "Needs Review",
      value: needsReview,
      icon: ClipboardCheck,
      href: buildHref(baseHref, currentQuery, { status: "content_review" }),
      accent: "info",
    },
    {
      label: "Ready",
      value: ready,
      icon: Rocket,
      href: buildHref(baseHref, currentQuery, { status: "ready_to_publish" }),
      accent: "success",
    },
  ];

  return (
    <section aria-label="Planning KPIs" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <a
            key={tile.label}
            href={tile.href}
            className={cn(
              "border-border bg-surface hover:border-primary focus-visible:ring-focus-ring flex flex-col gap-2 rounded-[var(--radius-card)] border p-4 transition-colors focus:outline-none focus-visible:ring-2",
            )}
            data-testid={`planning-kpi-${tile.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div
              className={cn(
                "flex items-center gap-2",
                tile.accent === "warning" && "text-warning",
                tile.accent === "info" && "text-info",
                tile.accent === "success" && "text-success",
                tile.accent === "default" && "text-primary",
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
