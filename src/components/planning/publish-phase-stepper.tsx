"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { phaseBlockerCounts } from "@/lib/publishing/blocker-targets";

export interface PublishPhaseStepperProps {
  /**
   * The id of the channel that's currently rendered (one of the
   * `channels[*].id` values). The stepper highlights "this is the
   * channel you're approving".
   */
  activeChannel: string;
  /**
   * All channels. Used to compute the network-wide phase progress so
   * the planner can see how close they are to a publish across every
   * destination, not just the one on screen.
   */
  channels: ReadonlyArray<{ id: string; socialChannelId: string }>;
  /**
   * Every blocker path in the report, across all channels. Each path is
   * bucketed into the phase that owns it, which is what lets a phase
   * read as done while another phase still has work.
   */
  blockerIssues: ReadonlyArray<{ path: string; severity?: string }>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

interface Phase {
  id: "destination" | "content" | "compliance" | "review";
  labelKey: string;
}

/**
 * PublishPhaseStepper — a horizontal progress strip that sits over
 * the Publish form so the planner can see which of the four logical
 * phases currently has open work, without scrolling through the
 * 1300-line form to find the right card.
 *
 * The four phases are the *preparation* gates, in the order the
 * operator actually works them: pick a Destination, write the
 * Content, clear Compliance, then get Review & approval. Recording a
 * publication Outcome is deliberately NOT one of them — it happens
 * after the item is live and already owns its own collapsible panel
 * below the form, so putting it on this strip would invite the
 * operator to "finish publishing setup" by recording an outcome for
 * something that has not shipped yet.
 *
 * The current phase is inferred from the readiness checklist for
 * the active channel (and the channel rollup), so the strip stays
 * in lockstep with the actual data — not a self-declared
 * counter the planner has to remember to update.
 */
export function PublishPhaseStepper({
  activeChannel,
  channels,
  blockerIssues,
  t,
}: PublishPhaseStepperProps) {
  const phases: ReadonlyArray<Phase> = React.useMemo(
    () => [
      { id: "destination", labelKey: "contentDetail.publishForm.phase.destination" },
      { id: "content", labelKey: "contentDetail.publishForm.phase.content" },
      { id: "compliance", labelKey: "contentDetail.publishForm.phase.compliance" },
      { id: "review", labelKey: "contentDetail.publishForm.phase.review" },
    ],
    [],
  );
  // Bucket every blocker by the phase that owns it. A phase is done when
  // it owns no blockers, which is what lets the strip show real progress
  // instead of mirroring the aggregate count.
  const phaseBlockers = React.useMemo(() => phaseBlockerCounts(blockerIssues), [blockerIssues]);
  const firstBlockingPhaseIdx = React.useMemo(
    () => phases.findIndex((p) => phaseBlockers[p.id] > 0),
    [phases, phaseBlockers],
  );
  // The "current" phase is the earliest one still open, except that
  // Destination is only open when there is genuinely no destination to
  // work from. With a channel selected and a caption still missing, the
  // operator is standing on Content, not on Destination.
  const firstIncompletePhaseIdx =
    firstBlockingPhaseIdx === -1
      ? phases.length - 1
      : activeChannel === "" || channels.length === 0
        ? 0
        : Math.max(firstBlockingPhaseIdx, 1);
  const currentPhaseIdx = firstIncompletePhaseIdx;

  function isComplete(phaseId: Phase["id"]): boolean {
    // No destination means no phase is meaningfully done, whatever the
    // blocker tally says.
    if (channels.length === 0 || activeChannel === "") return false;
    if (phaseId === "destination") return phaseBlockers.destination === 0;
    // A phase is only done when it owns no blockers AND every phase
    // before it is done. A later phase reading "done" while an earlier
    // one is open is what made the old strip lie.
    const idx = phases.findIndex((p) => p.id === phaseId);
    return (
      phases.slice(0, idx).every((p) => phaseBlockers[p.id] === 0) && phaseBlockers[phaseId] === 0
    );
  }

  const phaseHref: Record<Phase["id"], string> = {
    destination: "#publish-destination",
    content: "#publish-caption",
    compliance: "#publish-compliance",
    review: "#publish-approval",
  };
  return (
    <div
      className="border-border bg-surface rounded-[var(--radius-control)] border px-2 py-1.5"
      data-testid="publish-phase-stepper"
      role="navigation"
      aria-label={t("contentDetail.publishForm.phaseNavLabel")}
      aria-describedby="publish-phase-stepper-description"
    >
      {/*
        Labelled and described, not just styled. This is a four-step
        preparation strip for ONE channel, and the workspace's right
        rail is a six-stage lifecycle — two horizontal step-looking
        things on one screen is how a user ends up unsure which one to
        follow. The heading names it explicitly; the rail owns "what
        happens to this item next", this owns "is this channel ready".
      */}
      <p className="sr-only" data-testid="publish-phase-stepper-title">
        {t("contentDetail.publishForm.phaseStepsTitle")}
      </p>
      <p className="sr-only" id="publish-phase-stepper-description">
        {t("contentDetail.publishForm.phaseStepsDescription")}
      </p>
      <ol className="flex flex-wrap items-center gap-0.5">
        {phases.map((phase, idx) => {
          const complete = isComplete(phase.id);
          const isCurrent = idx === currentPhaseIdx;
          const isNext = idx > currentPhaseIdx;
          return (
            <li
              key={phase.id}
              className="flex min-w-0 flex-1 items-center gap-1"
              aria-current={isCurrent ? "step" : undefined}
            >
              <a
                href={phaseHref[phase.id]}
                className="focus-visible:ring-focus-ring hover:bg-surface flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] p-1 outline-none focus-visible:ring-2"
              >
                <div
                  className={cn(
                    "text-label flex h-7 w-7 shrink-0 items-center justify-center rounded-full border px-1.5 font-semibold",
                    complete && "border-success bg-success text-success-foreground",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isNext && "border-border bg-surface-subtle text-fg-muted",
                  )}
                  data-testid={`publish-phase-${phase.id}-icon`}
                  data-state={complete ? "done" : isCurrent ? "current" : "todo"}
                >
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span aria-label={`Step ${idx + 1}`}>{idx + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-label font-semibold",
                      isNext ? "text-fg-muted" : "text-fg-primary",
                    )}
                  >
                    {t(phase.labelKey)}
                  </p>
                  {isCurrent && phaseBlockers[phase.id] > 0 ? (
                    /*
                      The hint counts the blockers *this* phase owns, not
                      the channel's total. "2 open blockers on this channel"
                      next to a Content step, when both blockers are
                      approval and disclosure checks, tells the operator
                      nothing about where to look.
                    */
                    <p className="text-label text-warning" data-testid="publish-phase-current-hint">
                      {t(
                        phaseBlockers[phase.id] === 1
                          ? "contentDetail.publishForm.phaseActiveBlockerOne"
                          : "contentDetail.publishForm.phaseActiveBlockersMany",
                        { count: phaseBlockers[phase.id] },
                      )}
                    </p>
                  ) : null}
                </div>
              </a>
              {idx < phases.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn("mx-0.5 h-px w-3 sm:w-8", complete ? "bg-success" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
