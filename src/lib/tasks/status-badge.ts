import type { BadgeProps } from "@/components/ui/badge";
import type { TaskPriority } from "@/lib/tasks/service";
import type { TaskStatus } from "@/lib/tasks/workflow";

/**
 * Map a task status → shadcn Badge variant.
 *
 * Mirrors the colour logic in `task-status-badge.tsx` but returns a
 * Badge variant so the calendar / agency-overview surfaces can reuse
 * the same swatch set as content statuses (success / warning /
 * danger / info / default). Status is rendered as **text + colour
 * (never colour alone)** per master prompt §3 — every consumer is
 * expected to render the humanized label next to the swatch.
 */
export function taskBadgeVariant(s: string): NonNullable<BadgeProps["variant"]> {
  if (s === "done") return "success";
  if (s === "blocked" || s === "cancelled") return "danger";
  if (s === "in_review") return "warning";
  if (s === "in_progress") return "info";
  // "backlog" + unknown → default (neutral surface).
  return "default";
}

/**
 * Map a task priority → shadcn Badge variant.
 *
 * Used by the agency-overview calendar so admins can spot
 * urgent / high-priority tasks in a dense month grid without
 * reading each card. `urgent` and `high` carry semantic colour;
 * `low` is muted; `normal` and unknown values fall back to the
 * neutral default.
 */
export function priorityBadgeVariant(p: string): NonNullable<BadgeProps["variant"]> {
  if (p === "urgent") return "danger";
  if (p === "high") return "warning";
  if (p === "low") return "info";
  // "normal" + unknown → default (neutral surface).
  return "default";
}

/**
 * Type-narrowing helper: re-export the union types so consumers can
 * import both the variants and the unions from one place. This
 * avoids a 2-import churn at every call site.
 */
export type { TaskStatus, TaskPriority };
