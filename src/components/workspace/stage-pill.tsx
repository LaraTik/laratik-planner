import * as React from "react";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/content/status";

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
 * label ("Design"), with the position as a small secondary badge
 * ("3 / 5"). The full stepper lives in the detail page's workflow
 * inspector (`src/components/planning/workflow-rail.tsx`).
 *
 * Vocabulary: "Planning" / "Review" / "Design" / "Publish" — the
 * same 4 stages WorkflowMiniProgress already used (they match the
 * planner's mental model better than the engine's 13 status values).
 * The position is 1-based (1 / 4 is Planning; 4 / 4 is Publish).
 *
 * Statuses that don't map cleanly to a stage (blocked, cancelled)
 * still get a label + position so the row never shows nothing.
 */
type Stage = "planning" | "review" | "design" | "publish";

const STAGE_ORDER: readonly { stage: Stage; label: string; position: number }[] = [
  { stage: "planning", label: "Planning", position: 1 },
  { stage: "review", label: "Review", position: 2 },
  { stage: "design", label: "Design", position: 3 },
  { stage: "publish", label: "Publish", position: 4 },
] as const;

const TOTAL_STAGES = STAGE_ORDER.length;

function stageForStatus(status: ContentStatus): Stage {
  // The same status-to-stage mapping WorkflowMiniProgress used.
  // Blocked and cancelled still resolve to a stage so the row
  // shows something; cancelled lands on the last stage, blocked
  // is treated as "Review" (the most common block point).
  if (status === "blocked") return "review";
  if (status === "cancelled") return "publish";
  if (status === "published") return "publish";
  if (status === "draft" || status === "content_review" || status === "changes_requested") {
    return "planning";
  }
  if (status === "approved_for_design" || status === "in_design") return "design";
  if (status === "creative_review") return "design";
  if (status === "ready_to_publish" || status === "partially_published") return "publish";
  // Default: land on Planning. A new status added to the enum
  // will surface here, which is a hint to extend the mapping.
  return "planning";
}

export function StagePill({
  status,
  className,
  testId = "stage-pill",
}: {
  status: ContentStatus;
  className?: string;
  testId?: string;
}) {
  const stage = stageForStatus(status);
  const entry = STAGE_ORDER.find((s) => s.stage === stage) ?? STAGE_ORDER[0]!;
  return (
    <span
      data-testid={testId}
      data-stage={entry.stage}
      data-status={status}
      className={cn(
        "text-label text-fg-primary inline-flex items-center gap-1.5 font-semibold",
        className,
      )}
      title={`Current stage: ${entry.label} (${entry.position} of ${TOTAL_STAGES})`}
    >
      <span aria-hidden="true" className="bg-primary h-1.5 w-1.5 rounded-full" />
      <span>{entry.label}</span>
      <span className="text-fg-muted font-normal">
        {entry.position}/{TOTAL_STAGES}
      </span>
    </span>
  );
}
