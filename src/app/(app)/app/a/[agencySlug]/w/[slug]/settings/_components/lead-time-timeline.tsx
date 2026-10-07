import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * LeadTimeTimeline — visualises the 4 lead times as a stacked
 * horizontal bar so the planner can see the cumulative cycle
 * time at a glance. Each segment's width is proportional to its
 * share of the total. The total days are shown under the bar.
 *
 * The component is purely visual; it does not read or write to
 * the DOM outside the bar. It's a sibling of the LeadTimesForm
 * (no client/server boundary in between) so the same render
 * pass updates both the form values and the bar.
 */
export function LeadTimeTimeline({
  values,
  className,
}: {
  values: {
    contentApprovalLeadDays: number;
    designCompleteLeadDays: number;
    creativeApprovalLeadDays: number;
    readyToPublishLeadDays: number;
  };
  className?: string;
}) {
  const stages = [
    { key: "content", label: "Content", days: values.contentApprovalLeadDays },
    { key: "design", label: "Design", days: values.designCompleteLeadDays },
    { key: "creative", label: "Creative", days: values.creativeApprovalLeadDays },
    { key: "publish", label: "Publish", days: values.readyToPublishLeadDays },
  ];
  const total = stages.reduce((sum, s) => sum + s.days, 0);

  return (
    <div
      className={cn("space-y-2", className)}
      role="img"
      aria-label={`Workflow timeline: ${stages.map((s) => `${s.label} ${s.days} days`).join(", ")}, total ${total} days.`}
      data-testid="lead-time-timeline"
    >
      <div className="bg-surface-subtle flex h-3 w-full overflow-hidden rounded-full">
        {stages.map((stage, i) => {
          const widthPct = total > 0 ? (stage.days / total) * 100 : 25;
          return (
            <div
              key={stage.key}
              className={cn(
                "h-full transition-all",
                i === 0 && "rounded-s-full",
                i === stages.length - 1 && "rounded-e-full",
                // Subtle palette by stage so the planner can read
                // the bar at a glance without a legend.
                i === 0 && "bg-primary/70",
                i === 1 && "bg-primary/50",
                i === 2 && "bg-primary/35",
                i === 3 && "bg-primary/20",
              )}
              style={{ width: `${widthPct}%` }}
              data-testid={`lead-time-timeline-${stage.key}`}
              title={`${stage.label}: ${stage.days} days`}
            />
          );
        })}
      </div>
      <ul className="text-label text-fg-muted flex flex-wrap gap-x-4 gap-y-1">
        {stages.map((stage) => (
          <li key={stage.key} className="inline-flex items-center gap-1">
            <span className="text-fg-primary font-semibold">{stage.label}</span>
            <span>{stage.days}d</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
