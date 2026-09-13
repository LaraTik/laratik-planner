import type { WorkspaceRole } from "@/lib/auth/invitation-command";
import type { ContentStatus } from "@/lib/content/status";
import { responsibleRolesForStatus, type ApprovalGate } from "@/lib/content/workflow";
import type { ReadinessIssue, ReadinessReport } from "@/lib/publishing/readiness";

/** The six user-facing lifecycle stages shared by Planning surfaces. */
export const PLANNING_WORKFLOW_STAGES = [
  "planning",
  "content_review",
  "creative_production",
  "creative_approval",
  "publishing_setup",
  "published",
] as const;

export type PlanningWorkflowStage = (typeof PLANNING_WORKFLOW_STAGES)[number];
export type PlanningCondition = "normal" | "blocked" | "cancelled";

/** Stable ids used by detail tabs and resolver links. */
export type PlanningTabId =
  "overview" | "content" | "copy" | "delivery" | "publishing" | "preview" | "activity";

export type PlanningNextActionType =
  | "submit_content_review"
  | "approve_content"
  | "resubmit_content"
  | "assign_designer"
  | "submit_delivery"
  | "approve_internal_creative"
  | "approve_client_creative"
  | "record_published"
  | "unblock"
  | "cancelled"
  | "none";

export type ApprovalPresentationState = "pending" | "approved" | "changes_requested" | "cancelled";

export interface ApprovalPresentation {
  gate: ApprovalGate;
  state: ApprovalPresentationState;
  gateLabelKey: string;
  statusLabelKey: string;
  reviewerName?: string;
  deliveryVersionId?: string | null;
}

export interface PlanningReadiness {
  currentBlockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  futureRequirements: ReadinessIssue[];
  completed: number;
  required: number;
}

export interface PlanningPresentation {
  workflow: {
    internalStatus: ContentStatus;
    stage: PlanningWorkflowStage | null;
    condition: PlanningCondition;
    labelKey: string;
    descriptionKey: string;
  };
  nextAction: {
    type: PlanningNextActionType;
    headlineKey: string;
    descriptionKey?: string;
    responsibleRole?: WorkspaceRole;
    destinationTab?: PlanningTabId;
    destinationAnchor?: string;
    ctaKey?: string;
    blockedReason?: string;
  };
  readiness: PlanningReadiness;
  approval: {
    creative?: ApprovalPresentation;
    copy?: ApprovalPresentation;
  };
}

export interface PlanningPresentationApprovalInput {
  gate: ApprovalGate;
  status: ApprovalPresentationState;
  reviewerName?: string;
  deliveryVersionId?: string | null;
}

export type PlanningReadinessInput = Pick<
  ReadinessReport,
  "issues" | "requiredCompleted" | "requiredTotal" | "blockers" | "recommendations" | "canPublish"
>;

export interface BuildPlanningPresentationInput {
  status: ContentStatus;
  actorRoles?: readonly WorkspaceRole[];
  blockedReason?: string | null;
  cancellationReason?: string | null;
  readiness: PlanningReadinessInput;
  approvals?: readonly PlanningPresentationApprovalInput[];
  now?: Date;
}

const STAGE_INDEX: Record<PlanningWorkflowStage, number> = {
  planning: 0,
  content_review: 1,
  creative_production: 2,
  creative_approval: 3,
  publishing_setup: 4,
  published: 5,
};

const STAGE_LABEL_KEY: Record<PlanningWorkflowStage, string> = {
  planning: "contentDetail.workflow.railStageLabels.planning",
  content_review: "contentDetail.workflow.railStageLabels.content_review",
  creative_production: "contentDetail.workflow.railStageLabels.creative_production",
  creative_approval: "contentDetail.workflow.railStageLabels.creative_approval",
  publishing_setup: "contentDetail.workflow.railStageLabels.publishing_setup",
  published: "contentDetail.workflow.railStageLabels.published",
};

const STATUS_TO_STAGE: Partial<Record<ContentStatus, PlanningWorkflowStage>> = {
  draft: "planning",
  content_review: "content_review",
  changes_requested: "content_review",
  approved_for_design: "creative_production",
  in_design: "creative_production",
  creative_review: "creative_approval",
  ready_to_publish: "publishing_setup",
  partially_published: "publishing_setup",
  published: "published",
};

/** Status buckets used by list/board stage filters. */
export const PLANNING_STAGE_STATUSES: Record<PlanningWorkflowStage, readonly ContentStatus[]> = {
  planning: ["draft"],
  content_review: ["content_review", "changes_requested"],
  creative_production: ["approved_for_design", "in_design"],
  creative_approval: ["creative_review"],
  publishing_setup: ["ready_to_publish", "partially_published"],
  published: ["published"],
};

/** Accept historical URL values while resolving them to the canonical stage bucket. */
const LEGACY_STAGE_ALIASES: Record<string, PlanningWorkflowStage> = {
  draft: "planning",
  review: "content_review",
  design: "creative_production",
  publish: "publishing_setup",
  approved_for_design: "creative_production",
  creative_review: "creative_approval",
  ready_to_publish: "publishing_setup",
};

export function statusesForPlanningStage(stage: string): readonly ContentStatus[] | null {
  const canonical = (PLANNING_WORKFLOW_STAGES as readonly string[]).includes(stage)
    ? (stage as PlanningWorkflowStage)
    : LEGACY_STAGE_ALIASES[stage];
  return canonical ? PLANNING_STAGE_STATUSES[canonical] : null;
}

const ACTION_BY_STATUS: Record<ContentStatus, PlanningNextActionType> = {
  draft: "submit_content_review",
  content_review: "approve_content",
  changes_requested: "resubmit_content",
  approved_for_design: "assign_designer",
  in_design: "submit_delivery",
  creative_review: "approve_internal_creative",
  ready_to_publish: "record_published",
  partially_published: "record_published",
  published: "none",
  blocked: "unblock",
  cancelled: "cancelled",
};

const CTA_KEY_BY_ACTION: Partial<Record<PlanningNextActionType, string>> = {
  submit_content_review: "contentDetail.workflow.submitForReview",
  approve_content: "contentDetail.workflow.approveContent",
  resubmit_content: "contentDetail.workflow.resubmitForReview",
  assign_designer: "contentDetail.workflow.assignDesigner",
  unblock: "contentDetail.workflow.unblock",
};

function destinationForStatus(status: ContentStatus): {
  tab: PlanningTabId;
  anchor: string;
} | null {
  switch (status) {
    case "draft":
      return { tab: "content", anchor: "brief" };
    case "changes_requested":
      return { tab: "content", anchor: "brief" };
    case "ready_to_publish":
    case "partially_published":
    case "published":
      return { tab: "publishing", anchor: "publishing" };
    case "approved_for_design":
    case "in_design":
      return { tab: "overview", anchor: "workflow" };
    case "content_review":
    case "creative_review":
    case "blocked":
    case "cancelled":
      return { tab: "overview", anchor: "workflow" };
  }
}

export function planningStageForStatus(status: ContentStatus): PlanningWorkflowStage | null {
  return STATUS_TO_STAGE[status] ?? null;
}

function conditionForStatus(status: ContentStatus): PlanningCondition {
  if (status === "blocked") return "blocked";
  if (status === "cancelled") return "cancelled";
  return "normal";
}

function issueStageForPath(path: string): PlanningWorkflowStage {
  const lower = path.toLowerCase();
  if (
    lower.startsWith("content") ||
    lower.startsWith("brief") ||
    lower.startsWith("format") ||
    lower.startsWith("objective") ||
    lower.startsWith("audience")
  ) {
    // Authoring is part of the Planning stage. A missing brief field is
    // actionable for a draft even though the next gate is content review.
    return "planning";
  }
  if (lower.startsWith("delivery") || lower.startsWith("approval")) {
    return "creative_approval";
  }
  if (
    lower.startsWith("channels") ||
    lower.startsWith("publish") ||
    lower.startsWith("disclosure") ||
    lower.startsWith("schedule")
  ) {
    return "publishing_setup";
  }
  return "planning";
}

function presentReadiness(status: ContentStatus, input: PlanningReadinessInput): PlanningReadiness {
  const stage = planningStageForStatus(status);
  const currentStageIndex = stage === null ? Number.POSITIVE_INFINITY : STAGE_INDEX[stage];
  const currentBlockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const futureRequirements: ReadinessIssue[] = [];

  for (const issue of input.issues) {
    const isFuture =
      stage !== null && STAGE_INDEX[issueStageForPath(issue.path)] > currentStageIndex;
    if (isFuture) {
      futureRequirements.push(issue);
    } else if (issue.severity === "blocker") {
      currentBlockers.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  return {
    currentBlockers,
    warnings,
    futureRequirements,
    completed: input.requiredCompleted,
    required: input.requiredTotal,
  };
}

function approvalPresentation(input: PlanningPresentationApprovalInput): ApprovalPresentation {
  return {
    gate: input.gate,
    state: input.status,
    gateLabelKey: `contentDetail.workflow.approvalGates.${input.gate}`,
    statusLabelKey: `contentDetail.workflow.approvalStatuses.${input.status}`,
    ...(input.reviewerName ? { reviewerName: input.reviewerName } : {}),
    ...(input.deliveryVersionId !== undefined
      ? { deliveryVersionId: input.deliveryVersionId }
      : {}),
  };
}

function presentApprovals(approvals: readonly PlanningPresentationApprovalInput[]) {
  const presentation: PlanningPresentation["approval"] = {};
  const copy = approvals.find((approval) => approval.gate === "content");
  const creative = [...approvals]
    .reverse()
    .find(
      (approval) => approval.gate === "creative_internal" || approval.gate === "creative_client",
    );
  if (copy) presentation.copy = approvalPresentation(copy);
  if (creative) presentation.creative = approvalPresentation(creative);
  return presentation;
}

function responsibleRoleFor(status: ContentStatus, actorRoles: readonly WorkspaceRole[]) {
  const responsibleRoles = responsibleRolesForStatus(status);
  return actorRoles.find((role) => responsibleRoles.includes(role)) ?? responsibleRoles[0];
}

export function buildPlanningPresentation(
  input: BuildPlanningPresentationInput,
): PlanningPresentation {
  const { status } = input;
  const stage = planningStageForStatus(status);
  const condition = conditionForStatus(status);
  const destination = destinationForStatus(status);
  const actionType = ACTION_BY_STATUS[status];
  const actorRoles = input.actorRoles ?? [];
  const responsibleRole = responsibleRoleFor(status, actorRoles);
  const nextAction: PlanningPresentation["nextAction"] = {
    type: actionType,
    headlineKey: `planning.nextAction.${status}`,
    descriptionKey: `contentDetail.workflow.explanations.${status}.next`,
    ...(responsibleRole ? { responsibleRole } : {}),
    ...(destination
      ? { destinationTab: destination.tab, destinationAnchor: destination.anchor }
      : {}),
    ...(CTA_KEY_BY_ACTION[actionType] ? { ctaKey: CTA_KEY_BY_ACTION[actionType] } : {}),
  };
  if (condition === "blocked" && input.blockedReason) {
    nextAction.blockedReason = input.blockedReason;
  }

  return {
    workflow: {
      internalStatus: status,
      stage,
      condition,
      labelKey:
        stage === null ? `contentDetail.workflow.statusLabels.${status}` : STAGE_LABEL_KEY[stage],
      descriptionKey: `contentDetail.workflow.explanations.${status}.description`,
    },
    nextAction,
    readiness: presentReadiness(status, input.readiness),
    approval: presentApprovals(input.approvals ?? []),
  };
}
