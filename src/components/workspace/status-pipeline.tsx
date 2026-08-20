import * as React from "react";
import {
  CheckCircle2,
  CircleDashed,
  ClipboardEdit,
  FileEdit,
  ListTodo,
  PaintBucket,
  PauseCircle,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Icon per status in the Status Pipeline. Picked to match the
 * canonical Material Symbols the Stitch design uses (`list_alt`,
 * `draft`, `pending_actions`, `rate_review`, `check`, etc.) but
 * using lucide-react so we don't pull in another icon dep.
 */
const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  draft: FileEdit,
  approved_for_design: PaintBucket,
  in_design: PaintBucket,
  creative_review: ClipboardEdit,
  content_review: ClipboardEdit,
  changes_requested: PauseCircle,
  ready_to_publish: Send,
  published: CheckCircle2,
};

export interface StatusPipelineProps {
  /** Total non-cancelled items, used as the "Total" tile. */
  total: number;
  pipeline: { status: string; label: string; count: number }[];
  className?: string;
}

/**
 * Status Pipeline — 8 status tiles (Total + 7 workflow states) shown
 * in a responsive grid (2-col mobile, 4-col tablet, 8-col desktop),
 * matching the Stitch overview.
 */
export function StatusPipeline({ total, pipeline, className }: StatusPipelineProps) {
  return (
    <section aria-label="Status pipeline" className={className}>
      <h2 className="text-title-section text-fg-primary mb-3 font-semibold">Status Pipeline</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <PipelineTile label="Total" count={total} icon={ListTodo} />
        {pipeline.map((s) => {
          const Icon = STATUS_ICON[s.status] ?? CircleDashed;
          return <PipelineTile key={s.status} label={s.label} count={s.count} icon={Icon} />;
        })}
      </div>
    </section>
  );
}

function PipelineTile({
  label,
  count,
  icon: Icon,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="border-border bg-surface flex flex-col items-center justify-center rounded-[var(--radius-control)] border p-3 text-center">
      <Icon className="text-fg-muted mb-1 h-4 w-4" aria-hidden="true" />
      <span className="text-title-card text-fg-primary text-xl font-bold">{count}</span>
      <span className={cn("text-label text-fg-muted mt-1 font-semibold tracking-wide uppercase")}>
        {label}
      </span>
    </div>
  );
}
