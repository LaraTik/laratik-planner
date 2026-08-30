import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Attention banner — concise, actionable summary shown at the
 * top of the workspace Overview when the at-risk / blocked /
 * overdue counts warrant a single-glance signal.
 *
 * The §15 guidance is to "not invent metrics that are not
 * available" and to "keep the banner concise and actionable."
 * We surface exactly three numbers we already compute today:
 *
 *   1. at-risk items (overdue + not-yet-shipped)
 *   2. blocked items
 *   3. deadlines approaching (next 7 days, not yet shipped)
 *
 * The banner is hidden entirely when none of these are > 0 —
 * a green workspace shouldn't shout at its operator. The
 * threshold for "approaching deadline" is 7 days; the threshold
 * for "at risk" is 1 item.
 */
export function AttentionBanner({
  atRiskCount,
  blockedCount,
  approachingCount,
  reviewHref,
  atRiskHref,
}: {
  atRiskCount: number;
  blockedCount: number;
  approachingCount: number;
  reviewHref: string;
  atRiskHref: string;
}) {
  if (atRiskCount === 0 && blockedCount === 0 && approachingCount === 0) return null;

  const parts: string[] = [];
  if (atRiskCount > 0) {
    parts.push(`${atRiskCount} at-risk item${atRiskCount === 1 ? "" : "s"}`);
  }
  if (blockedCount > 0) {
    parts.push(`${blockedCount} blocked`);
  }
  if (approachingCount > 0) {
    parts.push(`${approachingCount} approaching deadline${approachingCount === 1 ? "" : "s"}`);
  }

  const headline = parts.join(" · ");
  const tone = atRiskCount > 5 || blockedCount > 0 ? "warning" : "info";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="workspace-overview-attention"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3",
        tone === "warning"
          ? "border-warning/30 bg-warning-subtle text-fg-primary"
          : "border-info/30 bg-info-subtle text-fg-primary",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)]",
          tone === "warning" ? "bg-warning/10 text-warning" : "bg-info/10 text-info",
        )}
        aria-hidden="true"
      >
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">{headline}</p>
        <p className="text-label text-fg-muted">
          Review the at-risk list or jump straight to approvals.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={atRiskHref}
          className={cn(
            "text-label inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold",
            tone === "warning"
              ? "border-warning/40 text-warning hover:bg-warning/10"
              : "border-info/40 text-info hover:bg-info/10",
          )}
        >
          At-risk list
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <Link
          href={reviewHref}
          className={cn(
            "text-label inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold",
            tone === "warning"
              ? "border-warning/40 text-warning hover:bg-warning/10"
              : "border-info/40 text-info hover:bg-info/10",
          )}
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Approvals
        </Link>
      </div>
    </div>
  );
}
