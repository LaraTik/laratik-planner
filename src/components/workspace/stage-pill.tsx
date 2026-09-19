import * as React from "react";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/content/status";
import {
  PLANNING_WORKFLOW_STAGES,
  planningStageForStatus,
  type PlanningWorkflowStage,
} from "@/lib/planning/presentation";

/**
 * StagePill — the inline "current stage" indicator for the planning
 * list row (and any other list/board surface that needs to know
 * "where in the workflow is this item?").
 *
 * The previous implementation (WorkflowMiniProgress) rendered the
 * full 4-stage stepper inside every row. That was the biggest
 * source of visual noise in the list — five competing status
 * indicators fighting for the same row.
 *
 * The new contract: a row shows the current stage as a single text
 * label ("Creative production"), with the position as a small
 * secondary badge ("3 / 6"). The full stepper lives in the detail
 * page's workflow inspector (`src/components/planning/workflow-rail.tsx`).
 *
 * Vocabulary is the shared six-stage planning model. The position is
 * 1-based and is intentionally absent for condition-only states.
 *
 * Statuses that don't map cleanly to a stage (blocked, cancelled)
 * get an explicit condition label and never claim a lifecycle stage.
 */
const STAGE_KEY: Record<PlanningWorkflowStage, string> = {
  planning: "contentDetail.workflow.railStageLabels.planning",
  content_review: "contentDetail.workflow.railStageLabels.content_review",
  creative_production: "contentDetail.workflow.railStageLabels.creative_production",
  creative_approval: "contentDetail.workflow.railStageLabels.creative_approval",
  publishing_setup: "contentDetail.workflow.railStageLabels.publishing_setup",
  published: "contentDetail.workflow.railStageLabels.published",
};
const STAGE_FALLBACK: Record<PlanningWorkflowStage, string> = {
  planning: "Planning",
  content_review: "Content review",
  creative_production: "Creative production",
  creative_approval: "Creative approval",
  publishing_setup: "Publishing setup",
  published: "Published",
};

export function StagePill({
  status,
  className,
  testId = "stage-pill",
  t,
  scenario,
}: {
  status: ContentStatus;
  className?: string;
  testId?: string;
  /**
   * Optional translator. When provided, the stage label
   * shared six-stage label and the `Current stage: ...` title render
   * from the active locale;
   * when omitted, the stored English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
  /**
   * Optional workflow scenario. When omitted the pill falls back to
   * the canonical 6-stage model (no filter). Pass the workspace's
   * active scenario's `stages` to hide omitted chips from the rail /
   * stepper position counter.
   */
  scenario?: { stages: ReadonlyArray<PlanningWorkflowStage> } | null;
}) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  const stage = planningStageForStatus(status, scenario ?? null);
  const condition = status === "blocked" || status === "cancelled" ? status : null;
  const totalStages = scenario?.stages.length ?? PLANNING_WORKFLOW_STAGES.length;
  const position =
    stage && scenario
      ? scenario.stages.indexOf(stage) + 1
      : stage
        ? PLANNING_WORKFLOW_STAGES.indexOf(stage) + 1
        : null;
  const label = stage
    ? tr(STAGE_KEY[stage], STAGE_FALLBACK[stage])
    : tr(
        `planningFilters.statusLabels.${status}`,
        condition === "blocked" ? "Blocked" : "Cancelled",
      );
  return (
    <span
      data-testid={testId}
      data-stage={stage ?? undefined}
      data-condition={condition ?? undefined}
      data-status={status}
      className={cn(
        "text-label text-fg-primary inline-flex items-center gap-1.5 font-semibold",
        className,
      )}
      {...(stage && position
        ? {
            title: tr(
              "common.stageCurrentTitle",
              `Current stage: ${label} (${position} of ${totalStages})`,
              { label, position, total: totalStages },
            ),
          }
        : {})}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          condition === "blocked"
            ? "bg-danger"
            : condition === "cancelled"
              ? "bg-fg-muted"
              : "bg-primary",
        )}
      />
      <span>{label}</span>
      {position ? (
        <span className="text-fg-muted font-normal">
          {position}/{totalStages}
        </span>
      ) : null}
    </span>
  );
}
