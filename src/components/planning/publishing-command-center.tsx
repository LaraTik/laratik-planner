import { CheckCircle2, CircleAlert, ListChecks, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Translator = (key: string, params?: Record<string, string | number>) => string;

export interface PublishingCommandCenterProps {
  channelCount: number;
  readyChannelCount: number;
  blockerCount: number;
  publishingSetupReady: boolean;
  outcomesRecorded: number;
  t: Translator;
}

/**
 * A small command center for the publishing tab. The publishing form is
 * intentionally detailed, but the page should still answer three questions
 * before the user starts editing: where am I, what is blocking me, and what
 * happens after this step.
 */
export function PublishingCommandCenter({
  channelCount,
  readyChannelCount,
  blockerCount,
  publishingSetupReady,
  outcomesRecorded,
  t,
}: PublishingCommandCenterProps) {
  const hasBlockers = blockerCount > 0;
  const statusLabel = hasBlockers
    ? t(
        blockerCount === 1
          ? "contentDetail.publishCommandCenter.blockersOne"
          : "contentDetail.publishCommandCenter.blockersMany",
        { count: blockerCount },
      )
    : publishingSetupReady
      ? t("contentDetail.publishCommandCenter.confirmed")
      : t("contentDetail.publishCommandCenter.readyToConfirm");

  return (
    <section
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] sm:p-5"
      aria-labelledby="publishing-command-center-title"
      data-testid="publishing-command-center"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-primary font-semibold tracking-wide uppercase">
            {t("contentDetail.publishCommandCenter.eyebrow")}
          </p>
          <h2
            id="publishing-command-center-title"
            className="text-title-card text-fg-primary mt-1 font-semibold"
          >
            {t("contentDetail.publishCommandCenter.title")}
          </h2>
          <p className="text-body text-fg-secondary mt-1 max-w-2xl">
            {t("contentDetail.publishCommandCenter.description")}
          </p>
        </div>
        <Badge variant={hasBlockers ? "warning" : "success"}>{statusLabel}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <CommandStep
          number="1"
          icon={ListChecks}
          title={t("contentDetail.publishCommandCenter.steps.packageTitle")}
          description={t("contentDetail.publishCommandCenter.steps.packageDescription", {
            count: channelCount,
          })}
          statusLabel={t(
            hasBlockers
              ? "contentDetail.publishCommandCenter.inProgress"
              : "contentDetail.publishCommandCenter.complete",
          )}
          href="#publish-package"
          actionLabel={t("contentDetail.publishCommandCenter.steps.packageAction")}
          t={t}
        />
        <CommandStep
          number="2"
          icon={CheckCircle2}
          title={t("contentDetail.publishCommandCenter.steps.reviewTitle")}
          description={t("contentDetail.publishCommandCenter.steps.reviewDescription", {
            ready: readyChannelCount,
            total: channelCount,
          })}
          statusLabel={t(
            publishingSetupReady
              ? "contentDetail.publishCommandCenter.complete"
              : hasBlockers
                ? "contentDetail.publishCommandCenter.upcoming"
                : "contentDetail.publishCommandCenter.readyToConfirm",
          )}
          href="#publish-package"
          actionLabel={t("contentDetail.publishCommandCenter.steps.reviewAction")}
          t={t}
        />
        <CommandStep
          number="3"
          icon={Send}
          title={t("contentDetail.publishCommandCenter.steps.outcomesTitle")}
          description={t("contentDetail.publishCommandCenter.steps.outcomesDescription")}
          statusLabel={t(
            outcomesRecorded > 0
              ? "contentDetail.publishCommandCenter.inProgress"
              : "contentDetail.publishCommandCenter.upcoming",
          )}
          href="#publish-outcomes"
          actionLabel={t("contentDetail.publishCommandCenter.steps.outcomesAction")}
          t={t}
        />
      </div>

      <div
        className={cn(
          "mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3",
          hasBlockers
            ? "border-warning/40 bg-warning-subtle"
            : "border-success/40 bg-success-subtle",
        )}
        role="status"
        data-testid="publishing-command-center-status"
      >
        {hasBlockers ? (
          <CircleAlert className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <p className="text-label text-fg-secondary">
          {hasBlockers
            ? t("contentDetail.publishCommandCenter.statusBlocked")
            : publishingSetupReady
              ? t("contentDetail.publishCommandCenter.statusConfirmed")
              : t("contentDetail.publishCommandCenter.statusReady")}
        </p>
      </div>
    </section>
  );
}

function CommandStep({
  number,
  icon: Icon,
  title,
  description,
  statusLabel,
  href,
  actionLabel,
  t,
}: {
  number: string;
  icon: typeof ListChecks;
  title: string;
  description: string;
  statusLabel: string;
  href: string;
  actionLabel: string;
  t: Translator;
}) {
  return (
    <div className="border-border bg-surface-subtle flex min-w-0 flex-col rounded-[var(--radius-control)] border p-3">
      <div className="flex items-start gap-3">
        <span className="bg-primary-subtle text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-body text-fg-primary font-semibold">{title}</h3>
            <Icon className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
          </div>
          <p className="text-label text-fg-secondary mt-1">{description}</p>
        </div>
      </div>
      <div className="border-border/70 mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-label text-fg-muted">{statusLabel}</span>
        <a
          href={href}
          className="text-label text-primary rounded-[var(--radius-control)] px-1 py-1 font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {actionLabel}
          <span className="sr-only">{t("contentDetail.publishCommandCenter.openStep")}</span>
        </a>
      </div>
    </div>
  );
}
