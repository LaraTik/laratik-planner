import { Ban, CheckCircle2, Circle, CircleDot, Eye, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/tasks/service";

const styles: Record<TaskStatus, string> = {
  backlog: "border-border bg-surface-subtle text-fg-secondary",
  in_progress: "border-info/30 bg-info-subtle text-info",
  blocked: "border-danger/30 bg-danger-subtle text-danger",
  in_review: "border-warning/30 bg-warning-subtle text-warning",
  done: "border-success/30 bg-success-subtle text-success",
  cancelled: "border-border bg-surface-subtle text-fg-muted",
};

const icons = {
  backlog: Circle,
  in_progress: CircleDot,
  blocked: OctagonAlert,
  in_review: Eye,
  done: CheckCircle2,
  cancelled: Ban,
};

export function TaskStatusBadge({ status, label }: { status: TaskStatus; label: string }) {
  const Icon = icons[status];
  return (
    <span
      className={cn(
        "text-label inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 font-semibold",
        styles[status],
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
