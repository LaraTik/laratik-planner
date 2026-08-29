"use client";

import * as React from "react";
import { AlertTriangle, X, CheckCircle2 } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { humanFormat, type ContentStatus } from "@/lib/content/status";

/**
 * ReadinessPanel — visible / actionable blocker list.
 *
 * Surfaces the same blockers the publish-side readiness
 * report does, but in user-friendly language and grouped by
 * *what the user can do about them*. The issues are translated
 * from the technical `path.code.severity.message` shape into
 * concrete next steps with optional deep-links to the
 * affected section.
 *
 * "Link to section" support: when an issue has a known anchor
 * (e.g. `delivery.primary` → the Delivery section), the row
 * renders a `Fix` link that scrolls / jumps to the section.
 * Without that, the row renders the human message only.
 */

export interface ReadinessIssueView {
  /** Machine path from the readiness service. Not shown. */
  path: string;
  /** Stable issue code. Drives the friendly translation. */
  code: string;
  /** Severity for grouping / icon. */
  severity: "blocker" | "recommendation";
  /** Already-friendly issue message from the service. */
  message: string;
  /**
   * Optional anchor target. When set, the issue row renders
   * a "Fix" link with this `href`. The href should be a
   * fragment that the planning detail page resolves (e.g.
   * `#channels`, `#delivery`).
   */
  href?: string;
}

export interface ReadinessPanelProps {
  /** True when the underlying readiness report says
   *  the item is fully ready. The panel renders a small
   *  success state instead of a blocker list. */
  ready: boolean;
  /** Total blocker count. The badge in the header is the
   *  at-a-glance summary even when the issues array is
   *  empty (e.g. a status-level blocker not represented
   *  in the issues array). */
  blockers: number;
  /** Total recommendation count. */
  recommendations: number;
  /** The issues list. Translated before render. */
  issues: ReadinessIssueView[];
  /** Called when the user clicks a Fix link. The parent
   *  typically scrolls to the section. The anchor href
   *  is also rendered so the browser's native in-page
   *  navigation works without JS. */
  onFix?: (href: string) => void;
}

function translate(code: string, fallback: string): string {
  // The readiness service emits codes like `delivery_missing`,
  // `disclosure_missing`, `hashtag_required`, etc. The
  // translation is intentionally a simple lookup — the
  // service's own message is the source of truth, this
  // just adds a small human label next to the code when
  // the user wants to know *which* check failed.
  const map: Record<string, string> = {
    delivery_missing: "Upload a delivery version",
    disclosure_missing: "Add the required disclosure",
    accessibility_alt_text_missing: "Add alt text for accessibility",
    first_comment_required: "Write the first comment",
    caption_required: "Add a caption",
    hashtag_required: "Add the required hashtag",
  };
  return map[code] ?? fallback;
}

export function ReadinessPanel({
  ready,
  blockers,
  recommendations,
  issues,
  onFix,
}: ReadinessPanelProps) {
  // Empty success state: only when no blockers AND no
  // recommendations. The "ready" prop is a hint from the
  // service; the actual count is the source of truth.
  if (ready && blockers === 0 && recommendations === 0) {
    return (
      <Card padding="md" data-testid="readiness-panel" data-ready="true">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-success h-5 w-5" aria-hidden="true" />
          <div>
            <CardTitle className="text-body text-fg-primary font-semibold">
              Ready for publishing
            </CardTitle>
            <CardDescription>
              No blockers, no recommendations. This item can go live.
            </CardDescription>
          </div>
        </div>
      </Card>
    );
  }

  // Group issues: blockers first, recommendations second.
  // Within each group, keep the order from the service
  // (the service orders them by path so the UI is stable).
  const grouped = {
    blocker: issues.filter((i) => i.severity === "blocker"),
    recommendation: issues.filter((i) => i.severity === "recommendation"),
  };

  return (
    <Card padding="md" data-testid="readiness-panel" data-blockers={blockers} data-ready="false">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={blockers > 0 ? "text-danger" : "text-warning"}
            aria-hidden="true"
          />
          <div>
            <CardTitle className="text-body text-fg-primary font-semibold">
              {blockers > 0
                ? `${blockers} blocker${blockers === 1 ? "" : "s"} before publishing`
                : "A few small things to polish"}
            </CardTitle>
            <CardDescription>
              {blockers > 0
                ? "Resolve these before this item can be published."
                : "Optional improvements — the item can still go live without them."}
              {recommendations > 0
                ? ` ${recommendations} recommendation${
                    recommendations === 1 ? "" : "s"
                  } also below.`
                : null}
            </CardDescription>
          </div>
        </div>
        {blockers > 0 ? (
          <Badge variant="danger">
            {blockers} blocker{blockers === 1 ? "" : "s"}
          </Badge>
        ) : (
          <Badge variant="warning">
            {recommendations} tip{recommendations === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {grouped.blocker.length > 0 ? (
        <ul
          className="border-border bg-canvas mt-3 space-y-1.5 rounded-[var(--radius-control)] border p-2"
          data-testid="readiness-blockers"
        >
          {grouped.blocker.map((i, idx) => (
            <ReadinessRow
              key={`blocker-${i.code}-${idx}`}
              issue={i}
              variant="blocker"
              {...(onFix ? { onFix } : {})}
            />
          ))}
        </ul>
      ) : null}

      {grouped.recommendation.length > 0 ? (
        <ul
          className="border-border bg-canvas mt-2 space-y-1 rounded-[var(--radius-control)] border p-2"
          data-testid="readiness-recommendations"
        >
          {grouped.recommendation.map((i, idx) => (
            <ReadinessRow
              key={`reco-${i.code}-${idx}`}
              issue={i}
              variant="recommendation"
              {...(onFix ? { onFix } : {})}
            />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function ReadinessRow({
  issue,
  variant,
  onFix,
}: {
  issue: ReadinessIssueView;
  variant: "blocker" | "recommendation";
  onFix?: (href: string) => void;
}) {
  const friendly = translate(issue.code, issue.message);
  const anchorHref = issue.href;
  return (
    <li
      className={cn("flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] px-2 py-1.5")}
      data-issue-code={issue.code}
      data-severity={issue.severity}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          variant === "blocker" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning",
        )}
        aria-hidden="true"
      >
        <X className="h-2.5 w-2.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-body text-fg-primary block font-semibold">{friendly}</span>
        <span className="text-label text-fg-muted block break-words">{issue.message}</span>
      </span>
      {anchorHref ? (
        onFix ? (
          <button
            type="button"
            onClick={() => onFix(anchorHref)}
            className="text-label text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid={`readiness-fix-${issue.code}`}
          >
            Fix
          </button>
        ) : (
          <Link
            href={anchorHref}
            className="text-label text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid={`readiness-fix-${issue.code}`}
          >
            Fix
          </Link>
        )
      ) : null}
    </li>
  );
}

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// A human label for a content status. Re-exported from
// `lib/content/status` for convenience — the panel uses it
// when a `path` includes a status segment (e.g. the readiness
// service sometimes references the status in the path).
void humanFormat;
void (null as unknown as ContentStatus);
