"use client";

import * as React from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/content/status";

/**
 * Workflow stepper — compact 4-stage visualization of the
 * content workflow.
 *
 * The 11-state backend machine maps to four user-facing stages:
 *
 *   Draft   →   Review   →   Design   →   Publish
 *
 * The detailed status (e.g. `content_review`,
 * `approved_for_design`, `in_design`) is shown next to the
 * stepper as a single labelled chip; special non-linear states
 * (`changes_requested`, `blocked`, `cancelled`, `partially_published`)
 * are surfaced as a separate "Current state" pill so the user
 * never mistakes them for sequential steps.
 *
 * The component is a Server Component compatible (no event
 * handlers, no client hooks). The `data-stage` and
 * `data-status` attributes are the test contract.
 *
 * A11y: status is communicated via text + colour, never colour
 * alone (the step labels are always rendered). The current step
 * gets `aria-current="step"`.
 */
export type WorkflowStage = "draft" | "review" | "design" | "publish";

const STAGES: ReadonlyArray<{ id: WorkflowStage; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "review", label: "Review" },
  { id: "design", label: "Design" },
  { id: "publish", label: "Publish" },
];

/**
 * Map a detailed `ContentStatus` to its 4-stage representation.
 *
 * Linear statuses fold into the canonical stage. Non-linear
 * states map to the closest canonical stage with a `variant`
 * flag that the stepper renders as a separate chip.
 */
export function stageForStatus(status: ContentStatus | string): {
  stage: WorkflowStage;
  /** Detailed status label, for the secondary pill. */
  detailed: string;
  /** Linear (the stepper progresses normally) vs special. */
  variant: "linear" | "changes_requested" | "blocked" | "cancelled" | "partially";
} {
  switch (status) {
    case "draft":
      return { stage: "draft", detailed: "Draft", variant: "linear" };
    case "content_review":
      return { stage: "review", detailed: "In review", variant: "linear" };
    case "changes_requested":
      return { stage: "review", detailed: "Changes requested", variant: "changes_requested" };
    case "approved_for_design":
      return { stage: "design", detailed: "Approved for design", variant: "linear" };
    case "in_design":
      return { stage: "design", detailed: "In design", variant: "linear" };
    case "creative_review":
      return { stage: "design", detailed: "Creative review", variant: "linear" };
    case "ready_to_publish":
      return { stage: "publish", detailed: "Ready to publish", variant: "linear" };
    case "partially_published":
      return { stage: "publish", detailed: "Partially published", variant: "partially" };
    case "published":
      return { stage: "publish", detailed: "Published", variant: "linear" };
    case "blocked":
      return { stage: "draft", detailed: "Blocked", variant: "blocked" };
    case "cancelled":
      return { stage: "draft", detailed: "Cancelled", variant: "cancelled" };
    default:
      return { stage: "draft", detailed: "Draft", variant: "linear" };
  }
}

export interface WorkflowStepperProps {
  status: ContentStatus | string;
  /** Compact = single-line pill row; full = full-size bar with labels. */
  size?: "compact" | "full";
  className?: string;
}

export function WorkflowStepper({ status, size = "full", className }: WorkflowStepperProps) {
  const { stage, detailed, variant } = stageForStatus(status);
  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const isNonLinear = variant !== "linear";

  if (size === "compact") {
    return (
      <div
        className={cn("flex flex-wrap items-center gap-1.5", className)}
        data-testid="workflow-stepper-compact"
        data-status={status}
        data-stage={stage}
      >
        {STAGES.map((s, i) => {
          const past = i < stageIndex;
          const current = i === stageIndex && !isNonLinear;
          return (
            <span
              key={s.id}
              className={cn(
                "text-label inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
                current
                  ? "border-primary bg-primary-subtle text-primary"
                  : past
                    ? "border-success/30 bg-success-subtle text-success"
                    : "border-border bg-surface text-fg-muted",
              )}
              data-stage-id={s.id}
              data-active={current || undefined}
              data-past={past || undefined}
            >
              {past ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
              {s.label}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn("space-y-2", className)}
      data-testid="workflow-stepper"
      data-status={status}
      data-stage={stage}
    >
      <ol
        className="flex items-center gap-1"
        role="list"
        aria-label="Workflow stages"
        data-testid="workflow-stepper-rail"
      >
        {STAGES.map((s, i) => {
          const past = i < stageIndex;
          const current = i === stageIndex;
          return (
            <li
              key={s.id}
              className="flex flex-1 items-center"
              data-stage-id={s.id}
              data-active={current || undefined}
              data-past={past || undefined}
            >
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : past
                      ? "border-success/40 bg-success-subtle text-success"
                      : "border-border bg-surface text-fg-muted",
                )}
                aria-current={current ? "step" : undefined}
                aria-label={`${s.label}${past ? " — done" : current ? " — current" : " — upcoming"}`}
              >
                {past ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={cn(
                  "ms-2 text-sm font-semibold",
                  current ? "text-fg-primary" : past ? "text-fg-secondary" : "text-fg-muted",
                )}
              >
                {s.label}
              </span>
              {i < STAGES.length - 1 ? (
                <span
                  className={cn("mx-2 h-px flex-1", i < stageIndex ? "bg-success/40" : "bg-border")}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <p
        className="text-label text-fg-secondary inline-flex flex-wrap items-center gap-1.5"
        data-testid="workflow-stepper-current"
      >
        <span className="text-fg-muted">Current:</span>
        {isNonLinear ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
              variant === "blocked"
                ? "border-danger/30 bg-danger-subtle text-danger"
                : variant === "cancelled"
                  ? "border-fg-muted/30 bg-surface text-fg-secondary"
                  : variant === "changes_requested"
                    ? "border-warning/30 bg-warning-subtle text-warning"
                    : "border-info/30 bg-info-subtle text-info",
            )}
            data-testid="workflow-stepper-special-state"
            data-variant={variant}
          >
            {variant === "blocked" || variant === "cancelled" ? (
              <Loader2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Circle className="h-3 w-3" aria-hidden="true" />
            )}
            {detailed}
          </span>
        ) : (
          <span className="text-fg-primary font-semibold">{detailed}</span>
        )}
      </p>
    </div>
  );
}
