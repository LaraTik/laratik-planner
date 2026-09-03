"use client";

import * as React from "react";
import { AlertTriangle, X, CheckCircle2 } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useLocaleT } from "@/components/i18n/locale-provider";

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
  /** Optional scoped translator for callers that already own one. */
  t?: Translator;
}

type Translator = (key: string, params?: Record<string, string | number>) => string;

function translateIssue(t: Translator, code: string, fallback: string): string {
  // The readiness service emits codes like `delivery_missing`,
  // `disclosure_missing`, `hashtag_required`, etc. The
  // translation is intentionally a simple lookup — the
  // service's own message is the source of truth, this
  // just adds a small human label next to the code when
  // the user wants to know *which* check failed.
  const localized = t(`contentDetail.readinessPanel.issue.${code}`);
  return localized.startsWith(`[contentDetail.readinessPanel.issue.${code}]`)
    ? fallback
    : localized;
}

function translateIssueDetail(t: Translator, code: string, fallback: string): string {
  const key = `contentDetail.readinessPanel.issueDetails.${code}`;
  const localized = t(key);
  return localized.startsWith(`[${key}]`) ? fallback : localized;
}

export function ReadinessPanel({
  ready,
  blockers,
  recommendations,
  issues,
  onFix,
  t: tProp,
}: ReadinessPanelProps) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
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
              {t("contentDetail.readinessPanel.readyTitle")}
            </CardTitle>
            <CardDescription>{t("contentDetail.readinessPanel.readyDescription")}</CardDescription>
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
                ? t(
                    blockers === 1
                      ? "contentDetail.readinessPanel.blockersBeforePublishingOne"
                      : "contentDetail.readinessPanel.blockersBeforePublishingMany",
                    { count: blockers },
                  )
                : t("contentDetail.readinessPanel.polishTitle")}
            </CardTitle>
            <CardDescription>
              {blockers > 0
                ? t("contentDetail.readinessPanel.resolveBeforePublishing")
                : t("contentDetail.readinessPanel.optionalImprovements")}
              {recommendations > 0
                ? ` ${t(
                    recommendations === 1
                      ? "contentDetail.readinessPanel.recommendationsAlsoOne"
                      : "contentDetail.readinessPanel.recommendationsAlsoMany",
                    { count: recommendations },
                  )}`
                : null}
            </CardDescription>
          </div>
        </div>
        {blockers > 0 ? (
          <Badge variant="danger">
            {t(
              blockers === 1
                ? "contentDetail.readinessPanel.blockerOne"
                : "contentDetail.readinessPanel.blockerMany",
              { count: blockers },
            )}
          </Badge>
        ) : (
          <Badge variant="warning">
            {t(
              recommendations === 1
                ? "contentDetail.readinessPanel.tipOne"
                : "contentDetail.readinessPanel.tipMany",
              { count: recommendations },
            )}
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
              t={t}
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
              t={t}
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
  t,
}: {
  issue: ReadinessIssueView;
  variant: "blocker" | "recommendation";
  onFix?: (href: string) => void;
  t: Translator;
}) {
  const friendly = translateIssue(t, issue.code, issue.message);
  const detail = translateIssueDetail(t, issue.code, issue.message);
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
        <span className="text-label text-fg-muted block break-words">{detail}</span>
      </span>
      {anchorHref ? (
        onFix ? (
          <button
            type="button"
            onClick={() => onFix(anchorHref)}
            className="text-label text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid={`readiness-fix-${issue.code}`}
          >
            {t("contentDetail.readinessPanel.fix")}
          </button>
        ) : (
          <Link
            href={anchorHref}
            className="text-label text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid={`readiness-fix-${issue.code}`}
          >
            {t("contentDetail.readinessPanel.fix")}
          </Link>
        )
      ) : null}
    </li>
  );
}

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
