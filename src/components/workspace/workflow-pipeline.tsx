import * as React from "react";
import Link from "next/link";
import { FileEdit, ClipboardCheck, Paintbrush, Send } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "./dashboard-panel";
import type { WorkflowStage } from "@/lib/dashboard/kpis";

/**
 * WorkflowPipeline — the refactored "Workflow" panel on the workspace
 * Overview. Replaces the pre-refactor 8-tile "Status Pipeline" grid
 * (which was a row of stat cards, not a workflow).
 *
 * The new component renders a 4-stage horizontal flow matching the
 * planner vocabulary used on the detail page:
 *   Planning → Review → Design → Publish
 *
 * Each stage is:
 *   - A clickable card (drill-down into Planning filtered by stage).
 *   - A bar showing the relative count vs the largest stage.
 *   - A label, a count, and a chevron pointing to the next stage.
 *
 * The "Total" tile from the pre-refactor pipeline is intentionally
 * removed (per master prompt §12 — "Total is not a workflow state";
 * the executive summary KPI strip already shows it).
 */
export interface WorkflowPipelineProps {
  stages: { stage: WorkflowStage; label: string; count: number }[];
  /** Build the drill-down URL for a stage. */
  buildHref: (stage: WorkflowStage) => string;
  /** Optional className override. */
  className?: string;
  /**
   * Optional translator. When provided, the panel renders
   * `workspaceOverviewDashboard.workflow.{title,eyebrow,description}`;
   * when omitted, the hard-coded English copy is used (this is the
   * pre-bilingual default; tests + non-bilingual surfaces still
   * work without threading `t` through the parent).
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

const STAGE_ICON: Record<WorkflowStage, React.ComponentType<{ className?: string }>> = {
  planning: FileEdit,
  review: ClipboardCheck,
  design: Paintbrush,
  publish: Send,
};

const STAGE_TONE: Record<WorkflowStage, string> = {
  planning: "text-info",
  review: "text-warning",
  design: "text-tertiary",
  publish: "text-success",
};

export function WorkflowPipeline({ stages, buildHref, className, t }: WorkflowPipelineProps) {
  const total = stages.reduce((s, x) => s + x.count, 0);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);

  return (
    <DashboardPanel
      title={tr("workspaceOverviewDashboard.workflow.title", "Workflow")}
      eyebrow={tr("workspaceOverviewDashboard.workflow.eyebrow", "Where work is concentrated")}
      description={tr(
        "workspaceOverviewDashboard.workflow.description",
        "Click any stage to see the items sitting in it.",
      )}
      data-testid="workflow-pipeline"
      className={className}
    >
      <ol
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Workflow stages"
      >
        {stages.map((s) => {
          const Icon = STAGE_ICON[s.stage];
          const widthPct = Math.round((s.count / maxCount) * 100);
          const sharePct = total ? Math.round((s.count / total) * 100) : 0;
          return (
            <li key={s.stage} className="relative">
              <Link
                href={buildHref(s.stage)}
                className={cn(
                  "border-border bg-surface focus-visible:ring-focus-ring group hover:border-primary flex h-full flex-col gap-3 rounded-[var(--radius-card)] border p-4 transition-colors focus:outline-none focus-visible:ring-2",
                )}
                aria-label={`${s.label} stage: ${s.count} items, ${sharePct} percent of the workflow`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(STAGE_TONE[s.stage])}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-label text-fg-primary font-semibold tracking-wide uppercase">
                      {s.label}
                    </span>
                  </div>
                  <DirAwareArrowRight
                    className="text-fg-muted h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-title-page text-fg-primary text-3xl leading-none font-bold tabular-nums">
                    {s.count}
                  </span>
                  <span className="text-label text-fg-muted tabular-nums">{sharePct}%</span>
                </div>
                <div
                  className="bg-surface-container-low relative h-1.5 w-full overflow-hidden rounded-full"
                  role="presentation"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500",
                      STAGE_TONE[s.stage]?.replace("text-", "bg-") ?? "bg-primary",
                    )}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </DashboardPanel>
  );
}
