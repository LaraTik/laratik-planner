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

const STAGE_KEY: Record<Stage, string> = {
  planning: "common.stagePlanning",
  review: "common.stageReview",
  design: "common.stageDesign",
  publish: "common.stagePublish",
};
const STAGE_FALLBACK: Record<Stage, string> = {
  planning: "Planning",
  review: "Review",
  design: "Design",
  publish: "Publish",
};

const STAGE_ORDER: readonly { stage: Stage; position: number }[] = [
  { stage: "planning", position: 1 },
  { stage: "review", position: 2 },
  { stage: "design", position: 3 },
  { stage: "publish", position: 4 },
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
  t,
}: {
  status: ContentStatus;
  className?: string;
  testId?: string;
  /**
   * Optional translator. When provided, the stage label
   * (Planning / Review / Design / Publish) and the
   * `Current stage: ...` title render from the active locale;
   * when omitted, the stored English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  const stage = stageForStatus(status);
  const entry = STAGE_ORDER.find((s) => s.stage === stage) ?? STAGE_ORDER[0]!;
  const label = tr(STAGE_KEY[entry.stage], STAGE_FALLBACK[entry.stage]);
  return (
    <span
      data-testid={testId}
      data-stage={entry.stage}
      data-status={status}
      className={cn(
        "text-label text-fg-primary inline-flex items-center gap-1.5 font-semibold",
        className,
      )}
      title={tr(
        "common.stageCurrentTitle",
        `Current stage: ${label} (${entry.position} of ${TOTAL_STAGES})`,
        { label, position: entry.position, total: TOTAL_STAGES },
      )}
    >
      <span aria-hidden="true" className="bg-primary h-1.5 w-1.5 rounded-full" />
      <span>{label}</span>
      <span className="text-fg-muted font-normal">
        {entry.position}/{TOTAL_STAGES}
      </span>
    </span>
  );
}
