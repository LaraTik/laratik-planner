import type { ContentStatus } from "@/lib/content/status";

export type WorkspaceRole =
  | "workspace_manager"
  | "content_planner"
  | "designer"
  | "internal_reviewer"
  | "client_reviewer"
  | "publisher"
  | "viewer";
export type ApprovalGate = "content" | "creative_internal" | "creative_client";
export type WorkflowAction =
  | "submit_content_review"
  | "approve_content"
  | "request_content_changes"
  | "resubmit_content"
  | "assign_designer"
  | "submit_delivery"
  | "approve_internal_creative"
  | "request_creative_changes"
  | "approve_client_creative"
  | "record_published"
  | "cancel"
  | "block"
  | "unblock";

export type DomainErrorCode =
  "unauthorized" | "invalid_transition" | "validation_failed" | "conflict" | "not_found";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type WorkflowTransitionInput = {
  action: WorkflowAction;
  currentStatus: ContentStatus;
  actorRoles: WorkspaceRole[];
  reason?: string;
  statusReturnTarget?: ContentStatus | null;
};

type WorkflowRule = {
  roles: readonly WorkspaceRole[];
  from: readonly ContentStatus[];
  to: ContentStatus;
  requiresReason?: boolean;
};

export const WORKFLOW_RULES: Record<Exclude<WorkflowAction, "unblock">, WorkflowRule> = {
  submit_content_review: {
    roles: ["workspace_manager", "content_planner"],
    from: ["draft"],
    to: "content_review",
  },
  approve_content: {
    roles: ["workspace_manager", "internal_reviewer"],
    from: ["content_review"],
    to: "approved_for_design",
  },
  request_content_changes: {
    roles: ["internal_reviewer"],
    from: ["content_review"],
    to: "changes_requested",
    requiresReason: true,
  },
  resubmit_content: {
    roles: ["workspace_manager", "content_planner"],
    from: ["changes_requested"],
    to: "content_review",
  },
  assign_designer: {
    roles: ["workspace_manager"],
    from: ["approved_for_design"],
    to: "in_design",
  },
  submit_delivery: {
    roles: ["workspace_manager", "designer"],
    from: ["in_design", "changes_requested"],
    to: "creative_review",
  },
  approve_internal_creative: {
    roles: ["internal_reviewer"],
    from: ["creative_review"],
    to: "ready_to_publish",
  },
  request_creative_changes: {
    roles: ["internal_reviewer", "client_reviewer"],
    from: ["creative_review"],
    to: "changes_requested",
    requiresReason: true,
  },
  approve_client_creative: {
    roles: ["client_reviewer"],
    from: ["creative_review"],
    to: "ready_to_publish",
  },
  record_published: {
    roles: ["workspace_manager", "publisher"],
    from: ["ready_to_publish", "partially_published"],
    to: "published",
  },
  cancel: {
    roles: ["workspace_manager"],
    from: [
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
      "blocked",
    ],
    to: "cancelled",
    requiresReason: true,
  },
  block: {
    roles: ["workspace_manager"],
    from: [
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
    ],
    to: "blocked",
    requiresReason: true,
  },
};

const SAFE_RETURN_TARGETS = new Set<ContentStatus>([
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
]);

export function resolveWorkflowTransition(input: WorkflowTransitionInput): {
  to: ContentStatus;
  changeRequestGate?: ApprovalGate | null;
  statusReturnTarget?: ContentStatus | null;
  blockedReason?: string | null;
  cancellationReason?: string | null;
} {
  if (input.action === "unblock") {
    if (input.currentStatus !== "blocked") {
      throw new DomainError("invalid_transition", `Cannot unblock from ${input.currentStatus}`);
    }
    if (!input.actorRoles.includes("workspace_manager")) {
      throw new DomainError("unauthorized", "Workspace manager role required");
    }
    const target =
      input.statusReturnTarget && SAFE_RETURN_TARGETS.has(input.statusReturnTarget)
        ? input.statusReturnTarget
        : "draft";
    return {
      to: target,
      blockedReason: null,
      statusReturnTarget: null,
      changeRequestGate: null,
    };
  }

  const rule = WORKFLOW_RULES[input.action];
  if (!rule.from.includes(input.currentStatus)) {
    throw new DomainError(
      "invalid_transition",
      `Cannot ${input.action} from ${input.currentStatus}`,
    );
  }
  if (!rule.roles.some((role) => input.actorRoles.includes(role))) {
    throw new DomainError("unauthorized", `Not authorized to ${input.action}`);
  }
  const reason = input.reason?.trim();
  if (rule.requiresReason && !reason) {
    throw new DomainError("validation_failed", `${input.action} requires a reason`);
  }

  if (input.action === "request_content_changes") {
    return {
      to: "changes_requested",
      changeRequestGate: "content",
      statusReturnTarget: "content_review",
    };
  }
  if (input.action === "request_creative_changes") {
    const gate: ApprovalGate = input.actorRoles.includes("client_reviewer")
      ? "creative_client"
      : "creative_internal";
    return {
      to: "changes_requested",
      changeRequestGate: gate,
      statusReturnTarget: "in_design",
    };
  }
  if (input.action === "block") {
    return {
      to: "blocked",
      blockedReason: reason!,
      statusReturnTarget: input.currentStatus,
      changeRequestGate: null,
    };
  }
  if (input.action === "cancel") {
    return {
      to: "cancelled",
      cancellationReason: reason!,
      statusReturnTarget: null,
      changeRequestGate: null,
    };
  }

  return {
    to: rule.to,
    changeRequestGate: null,
    statusReturnTarget: null,
    blockedReason: null,
  };
}
