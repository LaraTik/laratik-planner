import type { ContentStatus } from "@/lib/content/status";
import type { WorkspaceRole } from "@/lib/auth/invitation-command";

/**
 * UI-language explanation of each workflow step. Translates the
 * permission model into language a planner / designer / reviewer
 * can act on without needing to know the underlying role names.
 *
 * Used by the Workflow bar (M2.3) and any future surface that
 * needs to render a workflow legend (design queue, calendar,
 * approval timelines, etc.).
 */

export type StepExplanation = {
  /** Short label for the step. */
  label: string;
  /**
   * Plain-English description of what this step means, who acts
   * on it, and what happens after.
   */
  description: string;
  /**
   * The roles that may move the item FORWARD from this state.
   * Rendered as a chip list, not as raw enum values.
   */
  responsibleRoles: { role: WorkspaceRole; label: string }[];
  /**
   * What happens once the step is approved. Lets a planner see
   * the "next" state without having to read the workflow engine.
   */
  next: string;
};

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  workspace_manager: "Workspace manager",
  content_planner: "Content planner",
  designer: "Designer",
  internal_reviewer: "Internal reviewer",
  client_reviewer: "Client reviewer",
  publisher: "Publisher",
  viewer: "Viewer",
};

const PUBLIC_ROLES: Record<WorkspaceRole, { role: WorkspaceRole; label: string }> =
  Object.fromEntries(
    (Object.keys(ROLE_LABEL) as WorkspaceRole[]).map((r) => [r, { role: r, label: ROLE_LABEL[r] }]),
  ) as Record<WorkspaceRole, { role: WorkspaceRole; label: string }>;

function r(role: WorkspaceRole) {
  return PUBLIC_ROLES[role];
}

/**
 * Single source of truth for "what does this status mean" and
 * "who is responsible". The keys match the `ContentStatus` enum
 * exactly; the values are tuned for the Just Halal workspace's
 * tone (calm, direct, role-naming visible).
 */
export const STEP_EXPLANATIONS: Record<ContentStatus, StepExplanation> = {
  draft: {
    label: "Idea drafted",
    description:
      "A planner wrote the brief. Nothing has been submitted yet. The item lives here until it's ready for review.",
    responsibleRoles: [r("workspace_manager"), r("content_planner")],
    next: "Submit for content review when the brief is ready.",
  },
  content_review: {
    label: "Awaiting content review",
    description:
      "An internal reviewer is checking the brief against the brand voice and the brief's acceptance criteria.",
    responsibleRoles: [r("internal_reviewer"), r("workspace_manager")],
    next: "Approve to move to design, or request changes to send it back to the planner.",
  },
  changes_requested: {
    label: "Changes requested",
    description:
      "A reviewer left feedback. The planner updates the brief and resubmits for another review pass.",
    responsibleRoles: [r("workspace_manager"), r("content_planner")],
    next: "Resubmit once the changes are in.",
  },
  approved_for_design: {
    label: "Approved for design",
    description:
      "The brief is locked in. A designer can claim this item, or a manager can assign one.",
    responsibleRoles: [r("designer"), r("workspace_manager")],
    next: "A designer claims the task and starts the design pass.",
  },
  in_design: {
    label: "In design",
    description:
      "A designer is working on the visual. Once they submit a delivery, the item moves into creative review.",
    responsibleRoles: [r("designer"), r("workspace_manager")],
    next: "Submit a delivery version when the design is ready.",
  },
  creative_review: {
    label: "Creative review",
    description:
      "An internal reviewer (and the client for client-facing work) is checking the design against the brief.",
    responsibleRoles: [r("internal_reviewer"), r("client_reviewer")],
    next: "Approve to mark it ready for publishing, or request changes to send it back to design.",
  },
  ready_to_publish: {
    label: "Ready to publish",
    description:
      "All approvals are in. A publisher or manager can record per-channel publication outcomes once the item is live.",
    responsibleRoles: [r("publisher"), r("workspace_manager")],
    next: "Publish on each channel, then record the outcome (published / skipped / failed) here.",
  },
  partially_published: {
    label: "Partially published",
    description:
      "Some channels have gone live; the rest are still pending. Once every channel is recorded, the item moves to fully published.",
    responsibleRoles: [r("publisher"), r("workspace_manager")],
    next: "Record the remaining channels.",
  },
  published: {
    label: "Published",
    description:
      "Every channel is live. The item is read-only for archival purposes; analytics are tracked in the dashboard.",
    responsibleRoles: [r("publisher"), r("workspace_manager")],
    next: "View live performance in the workspace dashboard.",
  },
  blocked: {
    label: "Blocked",
    description:
      "A manager parked this item because something is preventing progress. The reason is shown next to the status.",
    responsibleRoles: [r("workspace_manager")],
    next: "Resolve the blocker, then unblock to resume the workflow.",
  },
  cancelled: {
    label: "Cancelled",
    description:
      "This item is no longer being worked on. The cancellation reason is shown next to the status.",
    responsibleRoles: [r("workspace_manager")],
    next: "Re-create the item if it should be revived.",
  },
};

export function explainStatus(status: ContentStatus): StepExplanation {
  return STEP_EXPLANATIONS[status];
}
