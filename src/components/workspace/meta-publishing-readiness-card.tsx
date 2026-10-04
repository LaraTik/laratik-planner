import { AlertCircle, CheckCircle2, ChevronDown, LockKeyhole, ShieldCheck } from "lucide-react";
import type { MetaPublishingReadiness } from "@/lib/db/schema";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

type ReadinessCopy = {
  title: string;
  description: string;
  statusLabel: string;
  statusDescription: string;
  analyticsLabel: string;
  analyticsDescription: string;
  publishingLabel: string;
  publishingDescription: string;
  nextStepLabel: string;
  nextStepDescription: string;
};

const STATUS_STYLE: Record<
  MetaPublishingReadiness["status"],
  { icon: typeof CheckCircle2; container: string; iconClass: string }
> = {
  ready: {
    icon: CheckCircle2,
    container: "border-success/40 bg-success-subtle",
    iconClass: "text-success",
  },
  not_configured: {
    icon: LockKeyhole,
    container: "border-warning/40 bg-warning-subtle",
    iconClass: "text-warning",
  },
  analytics_only: {
    icon: ShieldCheck,
    container: "border-info/40 bg-info-subtle",
    iconClass: "text-info",
  },
  not_enabled: {
    icon: LockKeyhole,
    container: "border-border bg-surface-subtle",
    iconClass: "text-fg-muted",
  },
  app_review_pending: {
    icon: ShieldCheck,
    container: "border-warning/40 bg-warning-subtle",
    iconClass: "text-warning",
  },
  business_verification_pending: {
    icon: ShieldCheck,
    container: "border-warning/40 bg-warning-subtle",
    iconClass: "text-warning",
  },
  needs_reauth: {
    icon: AlertCircle,
    container: "border-danger/40 bg-danger-subtle",
    iconClass: "text-danger",
  },
  no_destinations: {
    icon: LockKeyhole,
    container: "border-border bg-surface-subtle",
    iconClass: "text-fg-muted",
  },
};

/**
 * States that need nothing from a human collapse to one line.
 *
 * Direct provider publishing is out of scope for this product,
 * so `ready` and `analytics_only` both mean the same thing to a
 * planner: the connection is fine and publishing stays off.
 * Neither justifies four paragraphs of chrome on the publish
 * page. Every status that still asks something of the operator
 * — `not_configured` above all, plus the pending / reauth /
 * no-destination states — stays fully expanded so the next step
 * is visible without a click.
 */
function isHealthy(status: MetaPublishingReadiness["status"]): boolean {
  return status === "ready" || status === "analytics_only";
}

export function MetaPublishingReadinessCard({
  readiness,
  copy,
  testId = "meta-publishing-readiness-card",
}: {
  readiness: MetaPublishingReadiness;
  copy: ReadinessCopy;
  testId?: string;
}) {
  const style = STATUS_STYLE[readiness.status];
  const Icon = style.icon;
  const collapsed = isHealthy(readiness.status);

  // The status block. The icon is decorative — the status is
  // carried by `statusLabel` in text, never by colour alone.
  const statusBlock = (
    <div
      className={`flex items-start gap-3 rounded-[var(--radius-control)] border p-3 ${style.container}`}
      data-testid={`${testId}-status`}
      role="status"
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-body text-fg-primary font-semibold">{copy.statusLabel}</p>
        <p className="text-label text-fg-secondary mt-1">{copy.statusDescription}</p>
      </div>
    </div>
  );

  const capabilityBlocks = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="border-border bg-surface rounded-[var(--radius-control)] border p-3">
        <p className="text-label text-fg-muted font-semibold">{copy.analyticsLabel}</p>
        <p className="text-body text-fg-primary mt-1">{copy.analyticsDescription}</p>
      </div>
      <div className="border-border bg-surface rounded-[var(--radius-control)] border p-3">
        <p className="text-label text-fg-muted font-semibold">{copy.publishingLabel}</p>
        <p className="text-body text-fg-primary mt-1">{copy.publishingDescription}</p>
      </div>
    </div>
  );

  /* Next step. In the expanded (action-needed) branch it wears
     the status treatment so `not_configured` promotes itself;
     inside the healthy disclosure it stays a quiet footnote. */
  const nextStep = (emphasised: boolean) => (
    <div
      className={
        emphasised
          ? `flex items-start gap-3 rounded-[var(--radius-control)] border p-3 ${style.container}`
          : "border-border flex items-start gap-2 border-t pt-3"
      }
      data-testid={`${testId}-next-step`}
    >
      <p className="text-label text-fg-primary shrink-0 font-semibold">{copy.nextStepLabel}</p>
      <p className="text-label text-fg-secondary">{copy.nextStepDescription}</p>
    </div>
  );

  if (collapsed) {
    /* One compact line: icon + card title + status summary.
       `<details>`/`<summary>` is keyboard operable natively and
       expands in place, so the disclosure needs no client state
       and no extra "show details" copy. */
    return (
      <Card padding="lg" data-testid={testId}>
        <details className="group" data-testid={`${testId}-details`}>
          <summary
            className={`focus-visible:ring-focus-ring flex cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] border p-3 ${style.container}`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
            <span className="text-body text-fg-primary min-w-0 flex-1 font-semibold">
              {copy.title}
            </span>
            <span className="text-label text-fg-secondary">{copy.statusLabel}</span>
            <ChevronDown
              className="text-fg-muted h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-label text-fg-secondary">{copy.description}</p>
            {statusBlock}
            {capabilityBlocks}
            {nextStep(false)}
          </div>
        </details>
      </Card>
    );
  }

  return (
    <Card padding="lg" data-testid={testId}>
      <div className="space-y-4">
        <div>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription className="mt-1">{copy.description}</CardDescription>
        </div>

        {statusBlock}
        {capabilityBlocks}
        {nextStep(true)}
      </div>
    </Card>
  );
}

export type { ReadinessCopy as MetaPublishingReadinessCopy };
