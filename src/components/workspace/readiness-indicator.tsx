import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthSnapshot } from "@/lib/dashboard/health";

/**
 * ReadinessIndicator — one-glance health chip for the planning-list row.
 *
 * Surfaces the same HealthSnapshot that drives the KPI tile and the
 * "Needs attention" view, so the row never disagrees with the page
 * summary. The vocabulary is the detail page's: ✓ Ready, ⚠ 2 blockers,
 * ⚠ 3 days overdue. We never show every readiness section; the
 * indicator is a summary, not a duplicate of the detail panel.
 *
 * Pure presentational, server-renderable.
 */
export interface ReadinessIndicatorProps {
  health: HealthSnapshot;
  /** Past-due day count. Only used when health is overdue/at_risk. */
  overdueDays?: number;
  /** Open approval count. Shown alongside ready_to_publish when > 0. */
  openApprovalCount?: number;
  className?: string;
}

function visualProps(health: HealthSnapshot): {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  tone: "success" | "warning" | "danger" | "muted" | "info";
  label: string;
} {
  switch (health) {
    case "ready":
      return { icon: CheckCircle2, tone: "success", label: "Ready" };
    case "overdue":
      return { icon: AlertTriangle, tone: "warning", label: "Overdue" };
    case "at_risk":
      return { icon: AlertTriangle, tone: "warning", label: "At risk" };
    case "blocked":
      return { icon: AlertTriangle, tone: "danger", label: "Blocked" };
    case "needs_review":
      return { icon: Eye, tone: "info", label: "Needs review" };
    case "in_progress":
      return { icon: Clock, tone: "info", label: "In design" };
    case "not_started":
      return { icon: Clock, tone: "muted", label: "Not started" };
    case "published":
      return { icon: CheckCircle2, tone: "success", label: "Published" };
    case "cancelled":
      return { icon: AlertTriangle, tone: "muted", label: "Cancelled" };
    case "scheduled":
      return { icon: Clock, tone: "muted", label: "Scheduled" };
  }
}

const TONE_CLASS: Record<
  "success" | "warning" | "danger" | "muted" | "info",
  { ring: string; text: string; bg: string }
> = {
  success: { ring: "text-success", text: "text-success", bg: "bg-success-subtle" },
  warning: { ring: "text-warning", text: "text-warning", bg: "bg-warning-subtle" },
  danger: { ring: "text-danger", text: "text-danger", bg: "bg-danger-subtle" },
  info: { ring: "text-info", text: "text-info", bg: "bg-info-subtle" },
  muted: { ring: "text-fg-muted", text: "text-fg-secondary", bg: "bg-surface-subtle" },
};

export function ReadinessIndicator({
  health,
  overdueDays = 0,
  openApprovalCount = 0,
  className,
}: ReadinessIndicatorProps) {
  const v = visualProps(health);
  const Icon = v.icon;
  const tone = TONE_CLASS[v.tone];
  // Build the inline label. Overdue + past-due count wins over the
  // generic bucket label so the user sees "3 days overdue" rather
  // than the bucket alone.
  let label = v.label;
  if ((health === "overdue" || health === "at_risk") && overdueDays > 0) {
    label = `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }
  if (
    openApprovalCount > 0 &&
    (health === "ready" || health === "in_progress" || health === "needs_review")
  ) {
    label = `${openApprovalCount} approval${openApprovalCount === 1 ? "" : "s"} pending`;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone.bg,
        tone.text,
        "border-current/20",
        className,
      )}
      data-testid="readiness-indicator"
      data-health={health}
      data-overdue-days={overdueDays}
      data-open-approvals={openApprovalCount}
      aria-label={label}
    >
      <Icon className={cn("h-3 w-3", tone.ring)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
