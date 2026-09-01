import * as React from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { cn } from "@/lib/utils";

/**
 * AttentionBanner — the top-of-overview banner that summarises
 * actionable exceptions in a single glance.
 *
 * Pre-refactor the banner always showed a generic yellow
 * "X at-risk items" line — even on workspaces where at-risk was
 * the norm (turning a warning into background noise). The new
 * banner:
 *
 *   - Hides entirely when no item needs attention (zero noise on
 *     healthy workspaces).
 *   - Picks a SEVERITY tier (critical / warning / info) based on
 *     whether blocked or overdue items exist. Critical = blocked
 *     present; warning = overdue present; info = approaching
 *     deadlines only.
 *   - Surfaces up to three signals: at-risk count, blocked count,
 *     approvals waiting, deadlines approaching.
 *   - Provides a single primary action ("Review attention items")
 *     and a contextual secondary action ("Open approvals") only
 *     when approvals are pending.
 *
 * Translation: the banner accepts an optional `t` prop (the active
 * locale's translator). When provided, severity titles, body copy,
 * and CTA labels render from the workspaceOverview.attention.*
 * catalog. When omitted, the stored English copy is used.
 */
export type AttentionSeverity = "critical" | "warning" | "info";

export interface AttentionBannerProps {
  atRiskCount: number;
  blockedCount: number;
  approachingCount: number;
  approvalsCount?: number;
  /** Primary CTA — review the attention list. */
  reviewHref: string;
  /** Secondary CTA — open approvals. Required only when approvalsCount > 0. */
  approvalsHref?: string;
  /**
   * Optional translator. When provided, all user-visible strings
   * render from the workspaceOverview.attention.* catalog; when
   * omitted, the stored English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

const SEVERITY_ICON: Record<AttentionSeverity, React.ComponentType<{ className?: string }>> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASS: Record<AttentionSeverity, string> = {
  critical: "border-danger/30 bg-danger-subtle text-fg-primary",
  warning: "border-warning/30 bg-warning-subtle text-fg-primary",
  info: "border-info/30 bg-info-subtle text-fg-primary",
};

const SEVERITY_ICON_CLASS: Record<AttentionSeverity, string> = {
  critical: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
};

const SEVERITY_TITLE_KEY: Record<AttentionSeverity, string> = {
  critical: "workspaceOverview.attention.criticalTitle",
  warning: "workspaceOverview.attention.warningTitle",
  info: "workspaceOverview.attention.infoTitle",
};
const SEVERITY_TITLE_FALLBACK: Record<AttentionSeverity, string> = {
  critical: "Critical attention",
  warning: "Needs attention",
  info: "Heads up",
};

const SEVERITY_BODY_KEY: Record<AttentionSeverity, string> = {
  critical: "workspaceOverview.attention.criticalBody",
  warning: "workspaceOverview.attention.warningBody",
  info: "workspaceOverview.attention.infoBody",
};
const SEVERITY_BODY_FALLBACK: Record<AttentionSeverity, string> = {
  critical: "Blocked items are stuck on someone. Open the list to resolve them.",
  warning: "These are slipping past their planned publish date.",
  info: "Upcoming deadlines within the next 7 days.",
};

export function AttentionBanner({
  atRiskCount,
  blockedCount,
  approachingCount,
  approvalsCount = 0,
  reviewHref,
  approvalsHref,
  t,
}: AttentionBannerProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  const total = atRiskCount + blockedCount + approachingCount + approvalsCount;
  if (total === 0) return null;

  const severity: AttentionSeverity =
    blockedCount > 0 ? "critical" : atRiskCount > 5 ? "warning" : "info";

  const Icon = SEVERITY_ICON[severity];

  const parts: string[] = [];
  if (blockedCount > 0)
    parts.push(
      tr("workspaceOverview.attention.blocked", `${blockedCount} blocked`, { count: blockedCount }),
    );
  if (atRiskCount > 0)
    parts.push(
      tr(
        atRiskCount === 1
          ? "workspaceOverview.attention.atRiskOne"
          : "workspaceOverview.attention.atRiskMany",
        `${atRiskCount} item${atRiskCount === 1 ? "" : "s"} at risk`,
        { count: atRiskCount },
      ),
    );
  if (approachingCount > 0)
    parts.push(
      tr(
        approachingCount === 1
          ? "workspaceOverview.attention.approachingOne"
          : "workspaceOverview.attention.approachingMany",
        `${approachingCount} approaching deadline${approachingCount === 1 ? "" : "s"}`,
        { count: approachingCount },
      ),
    );
  if (approvalsCount > 0)
    parts.push(
      tr(
        approvalsCount === 1
          ? "workspaceOverview.attention.approvalsWaitingOne"
          : "workspaceOverview.attention.approvalsWaitingMany",
        `${approvalsCount} approval${approvalsCount === 1 ? "" : "s"} waiting for you`,
        { count: approvalsCount },
      ),
    );

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="workspace-overview-attention"
      data-severity={severity}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3",
        SEVERITY_CLASS[severity],
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)]",
          SEVERITY_ICON_CLASS[severity],
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">
          {tr(SEVERITY_TITLE_KEY[severity], SEVERITY_TITLE_FALLBACK[severity])} —{" "}
          {parts.join(" · ")}
        </p>
        <p className="text-label text-fg-muted">
          {tr(SEVERITY_BODY_KEY[severity], SEVERITY_BODY_FALLBACK[severity])}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={reviewHref}
          className={cn(
            "text-label inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold",
            severity === "critical"
              ? "border-danger/40 text-danger hover:bg-danger/10"
              : severity === "warning"
                ? "border-warning/40 text-warning hover:bg-warning/10"
                : "border-info/40 text-info hover:bg-info/10",
          )}
        >
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {tr("workspaceOverview.attention.reviewCta", "Review attention items")}
          <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        {approvalsCount > 0 && approvalsHref ? (
          <Link
            href={approvalsHref}
            className={cn(
              "text-label inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold",
              severity === "critical"
                ? "border-danger/40 text-danger hover:bg-danger/10"
                : severity === "warning"
                  ? "border-warning/40 text-warning hover:bg-warning/10"
                  : "border-info/40 text-info hover:bg-info/10",
            )}
          >
            {tr("workspaceOverview.attention.approvalsCta", "Approvals")}
            <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
