"use client";

import * as React from "react";
import { Check, Circle, Ban, Play, Lock, X } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import {
  STEP_EXPLANATIONS,
  explainStatus,
  type StepExplanation,
} from "@/lib/content/workflow-explanations";
import { humanize } from "@/lib/content/status";
import { cn } from "@/lib/utils";

/**
 * WorkflowProgress — compact, scannable view of where a content
 * item is in the workflow. Replaces the old "row of pills" with
 * a structured stepper that shows:
 *
 *  - The current step in plain English
 *  - The previous completed steps (collapsed by default, expanded
 *    via a "Show history" link)
 *  - The next expected step
 *  - The role(s) responsible for the current step
 *  - Any blockers (cancelled / blocked / changes_requested) with
 *    the reason inline
 *
 * The compact form is the default; users can expand into the
 * full ladder via the "Show all steps" disclosure.
 */

export interface WorkflowProgressProps {
  status: string;
  blockedReason?: string | null;
  cancellationReason?: string | null;
  /**
   * The actor's role flags. Used to show the "Awaiting X" hint
   * when the current step is held by another role.
   */
  roles: {
    isManager: boolean;
    isPlanner: boolean;
    isDesigner: boolean;
    isInternalReviewer: boolean;
    isClientReviewer: boolean;
    isPublisher: boolean;
  };
  /** Optional primary-action slot. The parent decides what the
   *  action button does (e.g. "Submit for review"). */
  primaryAction?: React.ReactNode;
}

const ORDER = [
  "draft",
  "content_review",
  "changes_requested",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "published",
] as const;

const ROLE_TO_FLAG: Record<string, keyof WorkflowProgressProps["roles"]> = {
  workspace_manager: "isManager",
  content_planner: "isPlanner",
  designer: "isDesigner",
  internal_reviewer: "isInternalReviewer",
  client_reviewer: "isClientReviewer",
  publisher: "isPublisher",
};

const TERMINAL_STATUSES = new Set(["published", "cancelled", "blocked"]);

function currentIndex(status: string): number {
  return ORDER.indexOf(status as (typeof ORDER)[number]);
}

function nextStatus(status: string): string | null {
  const idx = currentIndex(status);
  if (idx < 0 || idx >= ORDER.length - 1) return null;
  return ORDER[idx + 1] ?? null;
}

function eligibleRolesFor(status: string): (keyof WorkflowProgressProps["roles"])[] {
  switch (status) {
    case "draft":
    case "changes_requested":
      return ["isManager", "isPlanner"];
    case "content_review":
      return ["isInternalReviewer", "isManager"];
    case "approved_for_design":
    case "in_design":
      return ["isManager", "isDesigner"];
    case "creative_review":
      return ["isInternalReviewer", "isClientReviewer", "isManager"];
    case "ready_to_publish":
    case "partially_published":
    case "published":
      return ["isManager", "isPublisher"];
    default:
      return [];
  }
}

export function WorkflowProgress({
  status,
  blockedReason,
  cancellationReason,
  roles,
  primaryAction,
}: WorkflowProgressProps) {
  const [expanded, setExpanded] = React.useState(false);
  const step: StepExplanation | null = (() => {
    try {
      return explainStatus(status as Parameters<typeof explainStatus>[0]);
    } catch {
      return null;
    }
  })();
  const eligible = eligibleRolesFor(status);
  const canAct = eligible.some((r) => roles[r]);
  const next = nextStatus(status);

  return (
    <Card data-testid="workflow-progress" data-status={status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-body text-fg-primary font-semibold">
              {step?.label ?? humanize(status)}
            </CardTitle>
            {step ? (
              <Badge variant={canAct ? "primary" : "outline"}>
                {canAct
                  ? "You can act on this"
                  : TERMINAL_STATUSES.has(status)
                    ? status === "published"
                      ? "Published"
                      : status === "cancelled"
                        ? "Cancelled"
                        : "Blocked"
                    : "Awaiting another role"}
              </Badge>
            ) : null}
          </div>
          {step ? <CardDescription className="mt-1.5">{step.description}</CardDescription> : null}

          {/* Compact stepper — past, current, next */}
          <ol
            className="mt-3 flex flex-wrap items-center gap-1.5"
            aria-label="Workflow steps"
            data-testid="workflow-progress-stepper"
          >
            {ORDER.map((s, i) => {
              const idx = currentIndex(status);
              const isCurrent = s === status;
              const isPast = idx >= 0 && i < idx;
              const isFuture = idx >= 0 && i > idx;
              const Icon = isCurrent ? Play : isPast ? Check : Circle;
              return (
                <li
                  key={s}
                  className={cn(
                    "text-label inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold",
                    isCurrent
                      ? "border-primary bg-primary-subtle text-primary"
                      : isPast
                        ? "border-success/30 bg-success-subtle text-success"
                        : "border-border bg-surface text-fg-muted",
                    isFuture && "opacity-80",
                  )}
                  data-status={s}
                  data-current={isCurrent ? "true" : undefined}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {humanize(s)}
                </li>
              );
            })}
          </ol>

          {/* Inline next-step cue */}
          {next && !TERMINAL_STATUSES.has(status) ? (
            <p className="text-label text-fg-muted mt-2 inline-flex items-center gap-1.5">
              <DirAwareArrowRight className="h-3 w-3" aria-hidden="true" />
              Next: <span className="text-fg-secondary font-semibold">{humanize(next)}</span> · held
              by{" "}
              <span className="text-fg-secondary font-semibold">
                {(STEP_EXPLANATIONS[next as keyof typeof STEP_EXPLANATIONS]?.responsibleRoles ?? [])
                  .map((r) => r.label)
                  .join(" / ") || "—"}
              </span>
            </p>
          ) : null}

          {/* Blocked / cancelled explanation */}
          {status === "blocked" && blockedReason ? (
            <p
              className="text-body text-danger mt-2 inline-flex items-center gap-1.5"
              data-testid="workflow-blocked-reason"
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Blocked: {blockedReason}
            </p>
          ) : null}
          {status === "cancelled" && cancellationReason ? (
            <p
              className="text-body text-danger mt-2 inline-flex items-center gap-1.5"
              data-testid="workflow-cancelled-reason"
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Cancelled: {cancellationReason}
            </p>
          ) : null}

          {/* Responsible roles for the current step */}
          {step && step.responsibleRoles.length > 0 ? (
            <div className="text-label text-fg-secondary mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-fg-muted">Responsible:</span>
              {step.responsibleRoles.map((r) => (
                <Badge
                  key={r.role}
                  variant={roles[ROLE_TO_FLAG[r.role] ?? "isManager"] ? "primary" : "info"}
                >
                  {r.label}
                </Badge>
              ))}
            </div>
          ) : null}

          {/* "Awaiting X" detail when the actor doesn't hold the role */}
          {step && eligible.length > 0 && !canAct && !TERMINAL_STATUSES.has(status) ? (
            <p
              className="text-label text-fg-muted mt-2 inline-flex items-center gap-1.5"
              data-testid="workflow-awaiting-others"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Awaiting{" "}
              {step.responsibleRoles
                .filter((r) => !roles[ROLE_TO_FLAG[r.role] ?? "isManager"])
                .map((r) => r.label)
                .join(" / ")}
              .
            </p>
          ) : null}
        </div>

        {primaryAction ? <div className="flex items-center gap-2">{primaryAction}</div> : null}
      </div>

      {/* Optional disclosure of the full ladder (for power users
          who want to see "what comes after next") */}
      <button
        type="button"
        className="text-label text-primary focus-visible:ring-focus-ring mt-3 inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 py-0.5 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        data-testid="workflow-progress-toggle"
      >
        {expanded ? "Hide detail" : "Show all steps"}
      </button>
      {expanded ? (
        <ul
          className="border-border bg-canvas text-label mt-2 space-y-1 rounded-[var(--radius-control)] border p-2"
          data-testid="workflow-progress-detail"
        >
          {ORDER.map((s) => {
            const explanation = STEP_EXPLANATIONS[s];
            return (
              <li
                key={s}
                className={cn(
                  "flex items-start gap-2 px-2 py-1.5",
                  s === status && "text-fg-primary font-semibold",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    s === status ? "border-primary bg-primary-subtle" : "border-border bg-surface",
                  )}
                >
                  {s === status ? (
                    <Play className="text-primary h-2.5 w-2.5" aria-hidden="true" />
                  ) : currentIndex(status) > currentIndex(s) ? (
                    <Check className="text-success h-2.5 w-2.5" aria-hidden="true" />
                  ) : (
                    <X className="text-fg-muted h-2.5 w-2.5" aria-hidden="true" />
                  )}
                </span>
                <span>
                  <span>{explanation.label}</span>
                  <span className="text-fg-muted ms-1.5">
                    · {explanation.responsibleRoles.map((r) => r.label).join(" / ")}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
