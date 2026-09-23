export const TASK_STATUSES = [
  "backlog",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TASK_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ["in_progress", "cancelled"],
  in_progress: ["blocked", "in_review", "done", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  in_review: ["in_progress", "done", "cancelled"],
  done: ["in_progress"],
  cancelled: ["backlog"],
};

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TASK_STATUS_TRANSITIONS[from].includes(to);
}
