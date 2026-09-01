import * as React from "react";
import Link from "next/link";
import { differenceInDays, format } from "date-fns";
import { AlertOctagon, AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "./dashboard-panel";
import type { KpiContentFormat, KpiContentStatus } from "@/lib/dashboard/kpis";
import { CONTENT_FORMAT_LABELS } from "@/lib/dashboard/kpis";
import { StatusBadge } from "@/components/content/status-badge";

/**
 * NeedsAttentionList — the refactored "Needs attention" panel on
 * the workspace Overview. Replaces the pre-refactor
 * `AtRiskMilestonesCard`, which only showed a date and a title.
 *
 * The new component surfaces:
 *   - severity icon (critical = blocked, warning = overdue, info = on deck)
 *   - item title (linked to detail)
 *   - status badge + format chip
 *   - owner chip
 *   - relative deadline ("4 days overdue", "Due in 3 days", "Due Aug 31")
 *   - per-row "Open" affordance
 *
 * Severity ordering (per master prompt §14):
 *   1. blocked (critical)
 *   2. overdue (warning)
 *   3. other
 */
export interface NeedsAttentionItem {
  id: string;
  title: string;
  status: KpiContentStatus;
  format: KpiContentFormat;
  plannedPublishAt: Date | string;
  daysOverdue: number;
  ownerName: string | null;
}

export interface NeedsAttentionListProps {
  items: NeedsAttentionItem[];
  workspaceSlug: string;
  now: Date;
  viewAllHref: string;
  /**
   * Optional translator. When provided, the panel renders
   * `workspaceOverviewDashboard.needsAttention.*`; when omitted,
   * the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

function severityTone(input: {
  status: KpiContentStatus;
  daysOverdue: number;
}): "critical" | "warning" | "info" {
  if (input.status === "blocked") return "critical";
  if (input.daysOverdue > 0) return "warning";
  return "info";
}

const SEVERITY_ICON: Record<
  "critical" | "warning" | "info",
  React.ComponentType<{ className?: string }>
> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Clock,
};

const SEVERITY_CLASS: Record<"critical" | "warning" | "info", string> = {
  critical: "text-danger bg-danger-subtle border-danger/30",
  warning: "text-warning bg-warning-subtle border-warning/30",
  info: "text-info bg-info-subtle border-info/30",
};

function formatDeadline(input: {
  plannedPublishAt: Date;
  now: Date;
  daysOverdue: number;
  t?: (key: string, params?: Record<string, string | number>) => string;
}): string {
  const { plannedPublishAt, now, daysOverdue, t } = input;
  const absolute = format(plannedPublishAt, "MMM d");
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  if (daysOverdue > 0) {
    return tr(
      "workspaceOverviewDashboard.needsAttention.deadlineOverdue",
      `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue · ${absolute}`,
      { days: daysOverdue, plural: daysOverdue === 1 ? "" : "s", date: absolute },
    );
  }
  const daysUntil = -differenceInDays(plannedPublishAt, now);
  if (daysUntil === 0)
    return tr(
      "workspaceOverviewDashboard.needsAttention.deadlineToday",
      `Due today · ${absolute}`,
      { date: absolute },
    );
  if (daysUntil === 1)
    return tr(
      "workspaceOverviewDashboard.needsAttention.deadlineTomorrow",
      `Due tomorrow · ${absolute}`,
      { date: absolute },
    );
  if (daysUntil <= 7)
    return tr(
      "workspaceOverviewDashboard.needsAttention.deadlineInDays",
      `Due in ${daysUntil} days · ${absolute}`,
      { days: daysUntil, date: absolute },
    );
  return tr("workspaceOverviewDashboard.needsAttention.deadlineAbsolute", `Due ${absolute}`, {
    date: absolute,
  });
}

export function NeedsAttentionList({
  items,
  workspaceSlug,
  now,
  viewAllHref,
  t,
}: NeedsAttentionListProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  return (
    <DashboardPanel
      title={tr("workspaceOverviewDashboard.needsAttention.title", "Needs attention")}
      eyebrow={tr("workspaceOverviewDashboard.needsAttention.eyebrow", "Top priority items")}
      data-testid="needs-attention"
      footer={
        <Link
          href={viewAllHref}
          className="text-label text-primary inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 py-0.5 font-semibold underline-offset-4 hover:underline"
        >
          {tr("workspaceOverviewDashboard.needsAttention.viewAll", "View all attention items →")}
        </Link>
      }
    >
      {items.length === 0 ? (
        <div className="border-success/30 bg-success-subtle flex items-start gap-3 rounded-[var(--radius-control)] border p-3">
          <ShieldAlert className="text-success mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-body text-fg-primary font-semibold">
              {tr(
                "workspaceOverviewDashboard.needsAttention.everythingOnTrack",
                "Everything is on track.",
              )}
            </p>
            <p className="text-label text-fg-secondary">
              {tr(
                "workspaceOverviewDashboard.needsAttention.nothingOverdue",
                "No overdue or blocked items this month.",
              )}
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-border divide-y" aria-label="Attention items">
          {items.map((it) => {
            const date =
              it.plannedPublishAt instanceof Date
                ? it.plannedPublishAt
                : new Date(it.plannedPublishAt);
            const tone = severityTone({ status: it.status, daysOverdue: it.daysOverdue });
            const Icon = SEVERITY_ICON[tone];
            const deadline = formatDeadline({
              plannedPublishAt: date,
              now,
              daysOverdue: it.daysOverdue,
              ...(t ? { t } : {}),
            });
            return (
              <li key={it.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border",
                      SEVERITY_CLASS[tone],
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Link
                        href={`/app/w/${workspaceSlug}/planning/${it.id}`}
                        className="text-body text-fg-primary hover:text-primary truncate font-semibold"
                      >
                        {it.title}
                      </Link>
                      <span className="text-label text-fg-muted">·</span>
                      <span className="text-label text-fg-muted font-semibold tracking-wide uppercase">
                        {CONTENT_FORMAT_LABELS[it.format]}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "text-label mt-0.5 font-medium",
                        tone === "critical"
                          ? "text-danger"
                          : tone === "warning"
                            ? "text-warning"
                            : "text-fg-secondary",
                      )}
                    >
                      {deadline}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={it.status} />
                      {it.ownerName ? (
                        <span className="text-label text-fg-muted inline-flex items-center gap-1">
                          <span aria-hidden="true">·</span>
                          {it.ownerName}
                        </span>
                      ) : (
                        <span className="text-label text-fg-muted">
                          {tr(
                            "workspaceOverviewDashboard.needsAttention.unassigned",
                            "· Unassigned",
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/app/w/${workspaceSlug}/planning/${it.id}`}
                    className="text-label text-primary inline-flex items-center gap-1 self-center rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline"
                    aria-label={`Open ${it.title}`}
                  >
                    {tr("workspaceOverviewDashboard.needsAttention.open", "Open →")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}
