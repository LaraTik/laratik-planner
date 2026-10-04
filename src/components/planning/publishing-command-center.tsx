import { CheckCircle2, CircleAlert, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PublishingBlockers } from "@/components/planning/publishing-blockers";
import type { ReadinessIssue } from "@/lib/publishing/readiness";

type Translator = (key: string, params?: Record<string, string | number>) => string;

export interface PublishingCommandCenterProps {
  channelCount: number;
  readyChannelCount: number;
  blockerCount: number;
  publishingSetupReady: boolean;
  outcomesRecorded: number;
  /**
   * The aggregate readiness issues, rendered as this component's
   * expandable body.
   *
   * The command center is the single status surface for the Publishing
   * tab: it already shows the blocker count, so the per-channel
   * checklist that used to sit full-width above the editor was a
   * second copy of the same number plus the same list. Each row here
   * resolves through `blocker-targets`, so a Fix link either reaches
   * the control that resolves it, reaches another panel, or renders an
   * explicit manual-dispatch state — never a dead link to `#publishing`.
   */
  issues?: ReadinessIssue[];
  /**
   * Whether the global workflow has reached Publishing setup.
   *
   * The workspace's right rail publishes its own canonical next action
   * (`planningPresentation.nextAction`), and while the item is still at
   * Planning that is "Submit for review". The Publishing tab must not
   * present a lifecycle-advancing action of its own at the same time —
   * two primary buttons describing different lifecycle levels is how a
   * user ends up advancing the wrong thing. Below this gate the panel
   * still offers its package-level actions (save, fix a blocker) but
   * never "Mark setup ready".
   */
  workflowAtPublishingSetup?: boolean;
  /** Compact warning/status strip used at the top of the Publish workspace. */
  compact?: boolean;
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
  issues = [],
  workflowAtPublishingSetup = true,
  compact = false,
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
          : workflowAtPublishingSetup
            ? {
                href: "#publish-package",
                label: t("contentDetail.publishCommandCenter.actionConfirmSetup"),
              }
            : {
                // Package is clean, but the global workflow has not
                // reached publishing setup yet. Do not invite a
                // lifecycle advance the rail is not ready for.
                href: "#publish-package",
                label: t("contentDetail.publishCommandCenter.actionReviewSetup"),
              };
  const summary = t("contentDetail.publishCommandCenter.summary", {
    ready: readyChannelCount,
    total: channelCount,
    recorded: outcomesRecorded,
  });

  return (
    <section
      className={cn(
        "border-border bg-surface rounded-[var(--radius-card)] border shadow-[var(--shadow-card)]",
        compact ? "p-3" : "p-4 sm:p-5",
      )}
      aria-labelledby="publishing-command-center-title"
      data-testid="publishing-command-center"
    >
      {compact ? (
        <h2 id="publishing-command-center-title" className="sr-only">
          {t("contentDetail.publishCommandCenter.title")}
        </h2>
      ) : (
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
      )}

      <div
        className={cn(
          "flex items-start gap-2 rounded-[var(--radius-control)] border p-3",
          compact ? "mt-0" : "mt-4",
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

      {!compact && issues.length > 0 ? <PublishingBlockers issues={issues} /> : null}
    </section>
  );
}
