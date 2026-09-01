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
  /**
   * Optional translator. When provided, every health label and the
   * inline "{count} day(s) overdue" / "{count} approval(s) pending"
   * string render from the active locale; when omitted, the stored
   * English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

const HEALTH_LABEL_KEY: Record<HealthSnapshot, string> = {
  ready: "common.healthReady",
  overdue: "common.healthOverdue",
  at_risk: "common.healthAtRisk",
  blocked: "common.healthBlocked",
  needs_review: "common.healthNeedsReview",
  in_progress: "common.healthInDesign",
  not_started: "common.healthNotStarted",
  published: "common.healthPublished",
  cancelled: "common.healthCancelled",
  scheduled: "common.healthScheduled",
};
const HEALTH_LABEL_FALLBACK: Record<HealthSnapshot, string> = {
  ready: "Ready",
  overdue: "Overdue",
  at_risk: "At risk",
  blocked: "Blocked",
  needs_review: "Needs review",
  in_progress: "In design",
  not_started: "Not started",
  published: "Published",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
};

function visualProps(
  health: HealthSnapshot,
  t?: ReadinessIndicatorProps["t"],
): {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  tone: "success" | "warning" | "danger" | "muted" | "info";
  label: string;
} {
  const label = t ? t(HEALTH_LABEL_KEY[health]) : HEALTH_LABEL_FALLBACK[health];
  switch (health) {
    case "ready":
      return { icon: CheckCircle2, tone: "success", label };
    case "overdue":
      return { icon: AlertTriangle, tone: "warning", label };
    case "at_risk":
      return { icon: AlertTriangle, tone: "warning", label };
    case "blocked":
      return { icon: AlertTriangle, tone: "danger", label };
    case "needs_review":
      return { icon: Eye, tone: "info", label };
    case "in_progress":
      return { icon: Clock, tone: "info", label };
    case "not_started":
      return { icon: Clock, tone: "muted", label };
    case "published":
      return { icon: CheckCircle2, tone: "success", label };
    case "cancelled":
      return { icon: AlertTriangle, tone: "muted", label };
    case "scheduled":
      return { icon: Clock, tone: "muted", label };
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
  t,
}: ReadinessIndicatorProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  const v = visualProps(health, t);
  const Icon = v.icon;
  const tone = TONE_CLASS[v.tone];
  // Build the inline label. Overdue + past-due count wins over the
  // generic bucket label so the user sees "3 days overdue" rather
  // than the bucket alone.
  let label = v.label;
  if ((health === "overdue" || health === "at_risk") && overdueDays > 0) {
    label = tr(
      overdueDays === 1 ? "common.healthDaysOverdueOne" : "common.healthDaysOverdueMany",
      `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
      { count: overdueDays },
    );
  }
  if (
    openApprovalCount > 0 &&
    (health === "ready" || health === "in_progress" || health === "needs_review")
  ) {
    label = tr(
      openApprovalCount === 1
        ? "common.healthApprovalsPendingOne"
        : "common.healthApprovalsPendingMany",
      `${openApprovalCount} approval${openApprovalCount === 1 ? "" : "s"} pending`,
      { count: openApprovalCount },
    );
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
