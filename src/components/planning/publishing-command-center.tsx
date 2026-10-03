import { CheckCircle2, CircleAlert, Send } from "lucide-react";
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
 * A small command center for the publishing tab. The detailed form remains
 * below, but the page exposes only the one action that matters next. This
 * keeps readiness checks visible without turning them into a manual checklist.
 */
export function PublishingCommandCenter({
  channelCount,
  readyChannelCount,
  blockerCount,
  publishingSetupReady,
  outcomesRecorded,
  t,
}: PublishingCommandCenterProps) {
  const hasNoChannels = channelCount === 0;
  const hasBlockers = blockerCount > 0 || hasNoChannels;
  const outcomesComplete = channelCount > 0 && outcomesRecorded >= channelCount;
  const statusLabel = hasNoChannels
    ? t("contentDetail.publishCommandCenter.noChannels")
    : hasBlockers
      ? t(
          blockerCount === 1
            ? "contentDetail.publishCommandCenter.blockersOne"
            : "contentDetail.publishCommandCenter.blockersMany",
          { count: blockerCount },
        )
      : outcomesComplete
        ? t("contentDetail.publishCommandCenter.allRecorded")
        : publishingSetupReady
          ? t("contentDetail.publishCommandCenter.readyToRecord")
          : t("contentDetail.publishCommandCenter.readyToConfirm");
  const statusMessage = hasNoChannels
    ? t("contentDetail.publishCommandCenter.statusNoChannels")
    : blockerCount > 0
      ? t("contentDetail.publishCommandCenter.statusBlocked")
      : outcomesComplete
        ? t("contentDetail.publishCommandCenter.statusAllRecorded")
        : publishingSetupReady
          ? t("contentDetail.publishCommandCenter.statusRecord")
          : t("contentDetail.publishCommandCenter.statusConfirm");
  const action = hasNoChannels
    ? {
        href: "#overview",
        label: t("contentDetail.publishCommandCenter.actionAddChannel"),
      }
    : blockerCount > 0
      ? {
          href: "#publish-package",
          label: t("contentDetail.publishCommandCenter.actionReviewBlockers"),
        }
      : outcomesComplete
        ? {
            href: "#publish-outcomes",
            label: t("contentDetail.publishCommandCenter.actionViewOutcomes"),
          }
        : publishingSetupReady
          ? {
              href: "#publish-outcomes",
              label: t("contentDetail.publishCommandCenter.actionRecordOutcomes"),
            }
          : {
              href: "#publish-package",
              label: t("contentDetail.publishCommandCenter.actionConfirmSetup"),
            };
  const summary = t("contentDetail.publishCommandCenter.summary", {
    ready: readyChannelCount,
    total: channelCount,
    recorded: outcomesRecorded,
  });

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
        <Badge variant={hasBlockers ? "warning" : outcomesComplete ? "success" : "info"}>
          {statusLabel}
        </Badge>
      </div>

      <div
        className={cn(
          "mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3",
          blockerCount > 0 || hasNoChannels
            ? "border-warning/40 bg-warning-subtle"
            : outcomesComplete
              ? "border-success/40 bg-success-subtle"
              : "border-primary/30 bg-primary-subtle/30",
        )}
        role="status"
        data-testid="publishing-command-center-status"
      >
        {blockerCount > 0 || hasNoChannels ? (
          <CircleAlert className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : outcomesComplete ? (
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <Send className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-label text-fg-secondary">{statusMessage}</p>
          <p className="text-label text-fg-muted mt-1">{summary}</p>
        </div>
        <a
          href={action.href}
          className="text-label text-primary shrink-0 rounded-[var(--radius-control)] px-1 py-1 font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          data-testid="publishing-command-center-action"
        >
          {action.label}
        </a>
      </div>
    </section>
  );
}
