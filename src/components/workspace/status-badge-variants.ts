import type { BadgeProps } from "@/components/ui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** Shared visual mapping for content workflow states. */
export function contentStatusBadgeVariant(status: string): BadgeVariant {
  if (status === "published" || status === "ready_to_publish") return "success";
  if (status === "blocked" || status === "cancelled") return "danger";
  if (status === "changes_requested") return "warning";
  if (status === "in_design" || status === "creative_review" || status === "content_review") {
    return "info";
  }
  if (status === "partially_published" || status === "approved_for_design") return "primary";
  return "default";
}

/** Shared visual mapping for task workflow states. */
export function taskStatusBadgeVariant(status: string): BadgeVariant {
  if (status === "done") return "success";
  if (status === "blocked" || status === "cancelled") return "danger";
  if (status === "in_review") return "warning";
  if (status === "in_progress") return "info";
  return "default";
}

/** Shared visual mapping for task priority levels. */
export function priorityBadgeVariant(priority: string): BadgeVariant {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "info";
  return "default";
}
