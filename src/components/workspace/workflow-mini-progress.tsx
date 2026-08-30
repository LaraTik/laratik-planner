import * as React from "react";
import { Check, Circle, Ban, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/content/status";

/**
 * WorkflowMiniProgress — compact 4-stage stepper for the planning-list
 * row. The 4 stages are: Planning, Review, Design, Publish. They map
 * to the workflow engine's status flow but use the planner-friendly
 * vocabulary from the existing WorkflowProgress component (which
 * already speaks in these 4 stages on the detail page).
 *
 * Visual states:
 *   - completed: green check, muted line to the next stage
 *   - current:   brand-colored filled circle, brighter line forward
 *   - future:    outline circle
 *   - blocked:   overrides everything (Ban icon in red, current stage
 *                replaced)
 *
 * Pure presentational, server-renderable. NO function props on DOM
 * elements (the prior RSC #441 lesson): if the row ever needs a
 * clickable stepper, the parent must wrap it in a client Link, not
 * pass an onClick.
 */

type MiniStage = "planning" | "review" | "design" | "publish";

const STAGE_ORDER: readonly ContentStatus[][] = [
  ["draft", "content_review", "changes_requested"], // planning
  ["content_review", "changes_requested"], // review (overlaps with planning because of changes_requested)
  ["approved_for_design", "in_design", "creative_review"], // design
  ["creative_review", "ready_to_publish", "partially_published", "published"], // publish
];

const STAGE_LABEL: Record<MiniStage, string> = {
  planning: "Planning",
  review: "Review",
  design: "Design",
  publish: "Publish",
};

function stageForStatus(
  status: ContentStatus,
): { current: MiniStage; stage: "planning" | "review" | "design" | "publish" } | null {
  // Special terminal-ish states.
  if (status === "blocked") {
    return { current: "planning", stage: "review" };
  }
  if (status === "cancelled") {
    return { current: "publish", stage: "publish" };
  }
  if (status === "published") {
    return { current: "publish", stage: "publish" };
  }
  // Walk the stage order; the first stage whose bucket contains the
  // status is the current stage. When in doubt, default to the
  // stage that is most natural for the planner.
  if ((STAGE_ORDER[0] as readonly ContentStatus[]).includes(status)) {
    return {
      current: "planning",
      stage: status === "content_review" || status === "changes_requested" ? "review" : "planning",
    };
  }
  if ((STAGE_ORDER[1] as readonly ContentStatus[]).includes(status)) {
    return { current: "review", stage: "review" };
  }
  if ((STAGE_ORDER[2] as readonly ContentStatus[]).includes(status)) {
    return { current: "design", stage: "design" };
  }
  if ((STAGE_ORDER[3] as readonly ContentStatus[]).includes(status)) {
    return { current: "publish", stage: "publish" };
  }
  return null;
}

const STAGES: readonly MiniStage[] = ["planning", "review", "design", "publish"];

export interface WorkflowMiniProgressProps {
  status: ContentStatus;
  /** Tailwind class additions. */
  className?: string;
}

export function WorkflowMiniProgress({ status, className }: WorkflowMiniProgressProps) {
  const s = stageForStatus(status);
  if (!s) {
    return null;
  }
  const currentIdx = STAGES.indexOf(s.current);
  const isBlocked = status === "blocked";
  const isCancelled = status === "cancelled";

  return (
    <ol
      className={cn("flex items-center gap-1.5", className)}
      data-testid="workflow-mini-progress"
      data-status={status}
      data-current={s.current}
      aria-label={`Workflow: ${STAGE_LABEL[s.current]}`}
    >
      {STAGES.map((stage, idx) => {
        const isCompleted = !isCancelled && idx < currentIdx;
        const isCurrent = !isCancelled && idx === currentIdx;
        const isFuture = !isCancelled && idx > currentIdx;
        return (
          <li
            key={stage}
            className="inline-flex items-center gap-1.5"
            data-stage={stage}
            data-state={
              isBlocked && isCurrent
                ? "blocked"
                : isCancelled
                  ? "cancelled"
                  : isCompleted
                    ? "completed"
                    : isCurrent
                      ? "current"
                      : "future"
            }
          >
            {isBlocked && isCurrent ? (
              <Lock className="text-danger h-3.5 w-3.5" aria-hidden="true" />
            ) : isCancelled ? (
              <Ban className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
            ) : isCompleted ? (
              <Check className="text-success h-3.5 w-3.5" aria-hidden="true" />
            ) : isCurrent ? (
              <Circle
                className="text-primary fill-primary h-3.5 w-3.5"
                aria-hidden="true"
                strokeWidth={3}
              />
            ) : (
              <Circle className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span
              className={cn(
                "text-label font-medium",
                isCompleted && "text-fg-secondary",
                isCurrent && !isBlocked && "text-primary",
                isBlocked && isCurrent && "text-danger",
                isFuture && "text-fg-muted",
                isCancelled && "text-fg-muted line-through",
              )}
            >
              {STAGE_LABEL[stage]}
            </span>
            {idx < STAGES.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-1 inline-block h-px w-3",
                  isCompleted ? "bg-success" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
