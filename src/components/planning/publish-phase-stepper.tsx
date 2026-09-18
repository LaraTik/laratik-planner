"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PublishPhaseStepperProps {
  /**
   * The id of the channel that's currently rendered (one of the
   * `channels[*].id` values). The stepper highlights "this is the
   * channel you're approving".
   */
  activeChannel: string;
  /**
   * All channels. Used to compute aggregate "X / Y channels have
   * any blocker" so the planner can see how close they are to a
   * network-wide publish.
   */
  channels: ReadonlyArray<{ id: string; socialChannelId: string }>;
  /**
   * Per-channel readiness — each entry's `blockerCount` drives the
   * phase state for the destination channel AND the aggregate
   * channel-health roll-up at the top.
   */
  channelsReadiness: ReadonlyArray<{ socialChannelId: string; blockerCount: number }>;
  /** The currently-selected channel's blocker count (for the badge). */
  currentReadinessBlockerCount: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}

interface Phase {
  id: "channels" | "copy" | "compliance" | "review";
  labelKey: string;
}

/**
 * PublishPhaseStepper — a horizontal progress strip that sits over
 * the Publish form so the planner can see which of the four logical
 * phases (`Channels` -> `Audience copy` -> `Compliance` ->
 * `Review`) currently has open work, without scrolling through the
 * 1300-line form to find the right card.
 *
 * The current phase is inferred from the readiness checklist for
 * the active channel (and the channel rollup), so the strip stays
 * in lockstep with the actual data — not a self-declared
 * counter the planner has to remember to update.
 */
export function PublishPhaseStepper({
  activeChannel,
  channels,
  channelsReadiness,
  currentReadinessBlockerCount,
  t,
}: PublishPhaseStepperProps) {
  const phases: ReadonlyArray<Phase> = React.useMemo(
    () => [
      { id: "channels", labelKey: "contentDetail.publishForm.phase.channels" },
      { id: "copy", labelKey: "contentDetail.publishForm.phase.copy" },
      { id: "compliance", labelKey: "contentDetail.publishForm.phase.compliance" },
      { id: "review", labelKey: "contentDetail.publishForm.phase.review" },
    ],
    [],
  );
  // Compute the rollup: how many channels have ANY blocker.
  const blockingChannels = React.useMemo(
    () => channelsReadiness.filter((c) => c.blockerCount > 0).length,
    [channelsReadiness],
  );
  // Each phase is "complete" only when both the active channel and
  // the network as a whole are clean for that step.
  function isComplete(phaseId: Phase["id"]): boolean {
    if (currentReadinessBlockerCount > 0) return false;
    if (blockingChannels > 0) return false;
    // Channels step is complete once a channel is selected and the
    // network has at least one reachable channel.
    if (phaseId === "channels") return activeChannel !== "" && channels.length > 0;
    // Compliance + Review sit downstream of copy being clean — we
    // don't introspect the underlying form state here; the readiness
    // checklist already gates approval eligibility.
    return currentReadinessBlockerCount === 0;
  }
  // The "current" phase is the EARLIEST one still open. After that,
  // the rest are "next" / grey.
  const currentPhaseIdx = phases.findIndex((p) => !isComplete(p.id));
  const totalBlockingCopyStep = blockingChannels > 0 || currentReadinessBlockerCount > 0;
  return (
    <div
      className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-2"
      data-testid="publish-phase-stepper"
      role="navigation"
      aria-label={t("contentDetail.publishForm.phaseNavLabel")}
    >
      <ol className="flex flex-wrap items-center gap-1">
        {phases.map((phase, idx) => {
          const complete = isComplete(phase.id);
          const isCurrent = idx === currentPhaseIdx && totalBlockingCopyStep;
          const isNext = idx > currentPhaseIdx;
          return (
            <li
              key={phase.id}
              className="flex flex-1 items-center gap-2"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div
                className={cn(
                  "border-border text-body flex h-7 min-w-7 items-center justify-center rounded-full border px-2 font-semibold",
                  complete && "border-success bg-success-subtle text-success",
                  isCurrent && "border-warning bg-warning-subtle text-warning",
                  isNext && "border-border bg-surface text-fg-muted",
                )}
                data-testid={`publish-phase-${phase.id}-icon`}
                data-state={complete ? "done" : isCurrent ? "current" : "todo"}
              >
                {complete ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <span aria-label={`Step ${idx + 1}`}>{idx + 1}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-body font-semibold",
                    isNext ? "text-fg-muted" : "text-fg-primary",
                  )}
                >
                  {t(phase.labelKey)}
                </p>
                {isCurrent && phase.id === "copy" ? (
                  <p className="text-label text-warning" data-testid="publish-phase-current-hint">
                    {currentReadinessBlockerCount > 0
                      ? t("contentDetail.publishForm.phaseActiveBlockers", {
                          count: currentReadinessBlockerCount,
                        })
                      : t("contentDetail.publishForm.phaseActiveNetworks", {
                          count: blockingChannels,
                        })}
                  </p>
                ) : null}
              </div>
              {idx < phases.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn("mx-1 h-px w-6 sm:w-10", complete ? "bg-success" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
