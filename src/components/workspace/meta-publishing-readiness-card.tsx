import { AlertCircle, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
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

  return (
    <Card padding="lg" data-testid={testId}>
      <div className="space-y-4">
        <div>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription className="mt-1">{copy.description}</CardDescription>
        </div>

        <div
          className={`flex items-start gap-3 rounded-[var(--radius-control)] border p-3 ${style.container}`}
        >
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-body text-fg-primary font-semibold">{copy.statusLabel}</p>
            <p className="text-label text-fg-secondary mt-1">{copy.statusDescription}</p>
          </div>
        </div>

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

        <div className="border-border flex items-start gap-2 border-t pt-3">
          <p className="text-label text-fg-muted shrink-0 font-semibold">{copy.nextStepLabel}</p>
          <p className="text-label text-fg-secondary">{copy.nextStepDescription}</p>
        </div>
      </div>
    </Card>
  );
}

export type { ReadinessCopy as MetaPublishingReadinessCopy };
