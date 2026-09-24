# ADR 0016 — Agency tasks and global calendar

## Status

Implemented; release evidence is pending at the exact clean commit.

## Context

The planner needs lightweight operational work that may be related to a
workspace but is not owned by one. A workspace calendar alone cannot provide
an agency-wide view of work, and reusing content-item fields would make task
permissions, lifecycle, and attachments ambiguous.

## Decision

- Store tasks in an agency-scoped `agency_task` table. `workspace_id` is
  nullable and is constrained to the same agency when present.
- Let every active agency member create and view active tasks. The creator or
  assignee can edit task content and progress; an agency admin can reassign,
  archive, restore, and edit any task.
- Use an explicit lifecycle: `backlog → in_progress → blocked/in_review →
done`, with cancellation from active work and a controlled reopen path.
  Every mutation writes an append-only `task_activity_event` row in the same
  transaction.
- Record `started_at` automatically on the first transition into
  `in_progress` and use `completed_at - started_at` as the displayed time to
  complete. This is intentionally cycle time, not a claim about active effort;
  a future work-session timer can be added without changing this contract.
- Store task files in `task_attachment` and upload them directly to the
  agency's configured R2 storage after a server-authorized, size/type-bound
  signed intent. The database row is pending until exact object metadata is
  verified, and only ready objects are downloadable.
- Build the global calendar from both agency tasks with due dates and planned
  content items. Non-admins see plans from workspaces where they are active
  members; agency admins see all agency plans. The agency timezone defines the
  month boundary and event day. The calendar provides a Today jump, highlights
  the current day, and supports workspace, task-assignee, task-status, and
  independent Plans/Tasks visibility filters. An unscheduled-task section keeps
  tasks without due dates visible instead of silently dropping them.

## Consequences

This is additive and preserves existing workspace content, attachment, and
activity contracts. Task attachments do not use the legacy workspace-bound
`attachment` table because an unassigned task has no workspace. Calendar
queries need agency and workspace membership checks, and task lists require
pagination plus server-side filters to remain bounded.

## Rollback and data safety

Migrations `0050_happy_praxagora.sql` and `0051_low_human_torch.sql` are
additive. An application image can be
rolled back while leaving the new tables in place. Removing the tables is a
destructive rollback and requires a verified backup plus a separately reviewed
forward-fix; task files must be retained or explicitly garbage-collected with
an operator-approved retention decision.
