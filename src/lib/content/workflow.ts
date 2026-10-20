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

/**
 * The six rail stages that a workspace's workflow scenario can include
 * or omit. These are the user-facing stages rendered by the rail /
 * board / stepper; the backend `ContentStatus` enum remains the
 * source of truth for persisted state.
 *
 * The scenario layer decides which stages are reachable, and the
 * engine filters the transition table accordingly via
 * `effectiveTransitions()`.
 */
export type WorkflowScenarioStage =
  | "planning"
  | "content_review"
  | "creative_production"
  | "creative_approval"
  | "publishing_setup"
  | "published";

export type WorkflowScenarioId = "standard" | "lightweight" | "two_gate_client" | "self_publish";

export type WorkflowScenarioApprovalMode = "single" | "two_gate" | null;

/**
 * A scenario's contract for a workspace. Read from
 * `workspace_settings.workflow_scenario` (via `getActiveScenario`),
 * passed into `effectiveTransitions()` /
 * `resolveWorkflowTransition()` to decide which transitions and
 * stages are reachable.
 */
export interface ScenarioSpec {
  id: WorkflowScenarioId;
  /** Ordered rail stages this scenario includes. */
  stages: ReadonlyArray<WorkflowScenarioStage>;
  /**
   * `single` forces `approvalMode = "simple"` on apply;
   * `two_gate` forces `approvalMode = "internal_then_client"`;
   * `null` defers to the workspace's existing approvalMode setting
   * (used by `standard`).
   */
  approvalMode: WorkflowScenarioApprovalMode;
  /**
   * Whether the publishing-setup stage is a real stop the workspace
   * must pass through, or is collapsed into the creative-approval
   * step. `false` means the scenario skips publishing setup entirely.
   */
  publishingSetupRequired: boolean;
}

/**
 * In-memory mirror of the `workflow_scenario` catalog shipped by
 * migration 0048. Kept in code so the engine runs without a DB round
 * trip on every transition and so unit tests can pin the contract.
 * Field shapes match the SQL catalog 1:1; update both together.
 */
export const WORKFLOW_SCENARIOS: Readonly<Record<WorkflowScenarioId, ScenarioSpec>> = {
  standard: {
    id: "standard",
    stages: [
      "planning",
      "content_review",
      "creative_production",
      "creative_approval",
      "publishing_setup",
      "published",
    ],
    approvalMode: null,
    publishingSetupRequired: true,
  },
  lightweight: {
    id: "lightweight",
    stages: [
      "planning",
      "creative_production",
      "creative_approval",
      "publishing_setup",
      "published",
    ],
    approvalMode: "single",
    publishingSetupRequired: true,
  },
  two_gate_client: {
    id: "two_gate_client",
    stages: [
      "planning",
      "content_review",
      "creative_production",
      "creative_approval",
      "publishing_setup",
      "published",
    ],
    approvalMode: "two_gate",
    publishingSetupRequired: true,
  },
  self_publish: {
    id: "self_publish",
    stages: [
      "planning",
      "content_review",
      "creative_production",
      "creative_approval",
      "publishing_setup",
      "published",
    ],
    approvalMode: "single",
    /**
     * `publishing_setup` is *included* in the rail so an item can
     * still land in `ready_to_publish` after creative approval —
     * the scenario just removes the *gate* that forces the
     * planner to run an explicit validation pass before the
     * publisher can push the button. Publishers publish directly
     * from the approval screen.
     */
    publishingSetupRequired: false,
  },
};

/**
 * Default scenario used when a caller does not pass `scenario` into
 * `resolveWorkflowTransition()`. Matches the pre-scenario layer
 * behaviour so older call sites and tests keep working.
 */
export const DEFAULT_SCENARIO: ScenarioSpec = WORKFLOW_SCENARIOS.standard;

/**
 * `getActiveScenario` — resolve the workspace's settings row into a
 * `ScenarioSpec`. Unknown ids fall back to `standard` (defensive;
 * the SQL `CHECK` constraint should already prevent this in
 * production but tests / pre-migration rows need a graceful path).
 */
export function getActiveScenario(input: {
  workflowScenario: string | null | undefined;
  approvalMode?: string | null;
}): ScenarioSpec {
  const id = (input.workflowScenario ?? "standard") as WorkflowScenarioId;
  const base = WORKFLOW_SCENARIOS[id] ?? DEFAULT_SCENARIO;
  // `standard` defers to the workspace's own approvalMode setting —
  // scenarios that *force* a mode override on apply but the engine
  // still reads the workspace's live setting so a manager who flips
  // approvalMode on the existing approvals card picks it up
  // immediately for standard workspaces.
  return base;
}

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
  /**
   * Optional scenario override. When omitted the engine defaults to
   * `DEFAULT_SCENARIO` (`standard`), which preserves the pre-scenario
   * behaviour. Pass the workspace's live `getActiveScenario(...)`
   * result to filter transitions against the workspace's chosen
   * spine.
   */
  scenario?: ScenarioSpec;
};

/**
 * Statuses that are rail *stages* (mapped by the scenario layer).
 * `blocked` and `cancelled` are *conditions* — they are always
 * reachable from any active workflow state, regardless of scenario.
 */
const CONDITION_STATUSES: ReadonlySet<ContentStatus> = new Set(["blocked", "cancelled"]);

/**
 * `changes_requested` is a DERIVED status: it does not own a stage of
 * its own, it records that work went back to a gate
 * (`statusReturnTarget` = `content_review` for a content-gate
 * revision, `in_design` for a creative-gate one). `STATUS_TO_STAGE`
 * maps it to `content_review` for rail-display purposes only.
 *
 * Gating it on that fixed mapping would break two real paths:
 *  - a creative-gate revision could not be re-submitted in a
 *    workspace that skips content review;
 *  - a creative-gate revision could not even be REQUESTED, because
 *    the target status would be judged against a stage the scenario
 *    omits.
 *
 * So it is exempt from the scenario stage checks in both directions.
 */
const DERIVED_STATUSES: ReadonlySet<ContentStatus> = new Set(["changes_requested"]);

/**
 * Map a `ContentStatus` to its scenario `WorkflowScenarioStage`.
 * Multi-status stages (e.g. `content_review` covers both
 * `content_review` and `changes_requested`) follow the
 * `presentation.ts` `STATUS_TO_STAGE` mapping so the engine and
 * the rail stay in sync.
 */
const STATUS_TO_STAGE: Partial<Record<ContentStatus, WorkflowScenarioStage>> = {
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

/** True when the active scenario includes the stage this status maps to. */
export function stageIncluded(status: ContentStatus, spec: ScenarioSpec): boolean {
  const stage = STATUS_TO_STAGE[status];
  if (stage === undefined) return true; // unknown / condition -> always reachable
  return spec.stages.includes(stage);
}

/**
 * When a scenario omits a stage, the GATE that stage represents is
 * SKIPPED rather than blocking the item.
 *
 * `lightweight` omits `content_review` — its product copy promises
 * "Planning → Design → Creative approval → Publishing setup →
 * Published" with "No pre-design content review". `approve_content`
 * is the only rule that reaches `approved_for_design`, so simply
 * filtering `submit_content_review` out of the transition table would
 * strand every lightweight item at `draft`. ADR 0014 requires the
 * opposite: "a scenario switch can never trap an in-flight item".
 *
 * So an action whose target stage the scenario omits lands on the
 * bypass target instead of being rejected. The action's role set is
 * unchanged — under `lightweight` the submitter is the one who
 * hands the item to design, which is exactly what "no pre-design
 * content review" means.
 */
const SCENARIO_STAGE_BYPASS: Partial<Record<ContentStatus, ContentStatus>> = {
  content_review: "approved_for_design",
};

/**
 * `effectiveTransitions` — filter `WORKFLOW_RULES` down to the
 * transitions that the active scenario allows.
 *
 * Filtering rule (per plan §2):
 *   - Keep rule iff `rule.from.includes(status)` (the rule applies
 *     to the current status).
 *   - AND the rule's `to` stage is in `scenario.stages`.
 *   - Conditions (`blocked`, `cancelled`) are always reachable; the
 *     `cancel` / `block` rules bypass the filter.
 *
 * Returns the rule list keyed by action so `resolveWorkflowTransition`
 * can index into it directly.
 */
export function effectiveTransitions(
  status: ContentStatus,
  spec: ScenarioSpec,
): ReadonlyArray<{ action: Exclude<WorkflowAction, "unblock">; rule: WorkflowRule }> {
  const out: { action: Exclude<WorkflowAction, "unblock">; rule: WorkflowRule }[] = [];
  for (const [action, rule] of Object.entries(WORKFLOW_RULES) as Array<
    [Exclude<WorkflowAction, "unblock">, WorkflowRule]
  >) {
    if (!rule.from.includes(status)) continue;
    if (CONDITION_STATUSES.has(rule.to) || DERIVED_STATUSES.has(rule.to)) {
      out.push({ action, rule });
      continue;
    }
    if (!stageIncluded(rule.to, spec)) {
      // A stage the scenario omits is SKIPPED, not blocked: the
      // action lands on the bypass target instead of being
      // unreachable. See `SCENARIO_STAGE_BYPASS`.
      const bypass = SCENARIO_STAGE_BYPASS[rule.to];
      if (!bypass || !stageIncluded(bypass, spec)) continue;
    }
    out.push({ action, rule });
  }
  return out;
}

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
    roles: ["internal_reviewer"],
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

/**
 * Returns the roles that own an actionable transition from a status.
 *
 * This is intentionally derived from WORKFLOW_RULES so presentation code
 * does not maintain a second copy of the workflow permission table. The
 * result is descriptive only; transition authorization still happens in
 * resolveWorkflowTransition and the server service.
 *
 * The DESTRUCTIVE rules (`cancel`, `block`) are excluded on purpose.
 * They are legal from almost every status and their only role is the
 * workspace manager, so including them made EVERY status report the
 * manager as the role that owns the next step — which is how a manager
 * ended up shown as "you can act" on a content-review row whose actual
 * action belongs to the internal reviewer. Cancelling an item is always
 * available to a manager; it is not the step the item is waiting on.
 */
export function responsibleRolesForStatus(status: ContentStatus): WorkspaceRole[] {
  if (status === "approved_for_design") return ["workspace_manager", "designer"];
  if (status === "blocked") return ["workspace_manager"];
  const roles = new Set<WorkspaceRole>();
  for (const [action, rule] of Object.entries(WORKFLOW_RULES)) {
    if (action === "cancel" || action === "block") continue;
    if (rule.from.includes(status)) {
      for (const role of rule.roles) roles.add(role);
    }
  }
  return [...roles];
}

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
  const scenario = input.scenario ?? DEFAULT_SCENARIO;
  if (input.action === "unblock") {
    if (input.currentStatus !== "blocked") {
      throw new DomainError("invalid_transition", `Cannot unblock from ${input.currentStatus}`);
    }
    if (!input.actorRoles.includes("workspace_manager")) {
      throw new DomainError("unauthorized", "Workspace manager role required");
    }
    const target =
      input.statusReturnTarget &&
      SAFE_RETURN_TARGETS.has(input.statusReturnTarget) &&
      stageIncluded(input.statusReturnTarget, scenario)
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
  if (!rule) {
    throw new DomainError("invalid_transition", `Unknown workflow action ${input.action}`);
  }
  if (!rule.from.includes(input.currentStatus)) {
    throw new DomainError(
      "invalid_transition",
      `Cannot ${input.action} from ${input.currentStatus}`,
    );
  }
  // Scenario filter — on the TARGET only.
  //
  // The target's stage must be in the active scenario. When the
  // scenario omits that stage the gate it represents is SKIPPED and
  // the action lands on the bypass target instead of being rejected
  // (see `SCENARIO_STAGE_BYPASS`).
  //
  // There is deliberately NO source-stage check. A source-stage check
  // looks like it is protecting something, but it is what TRAPS an
  // item: a workspace switched to `lightweight` while an item sits in
  // `content_review` (a stage the new scenario omits) would reject
  // EVERY action out of that status — including `cancel` and
  // `block`, which are exactly the escape hatches. ADR 0014 requires
  // the opposite: "a scenario switch can never trap an in-flight
  // item."
  //
  // With the target-only filter, such an item is FINISHED rather
  // than trapped:
  //   - `approve_content` lands on `approved_for_design` (included),
  //   - `cancel` / `block` land on conditions (always reachable),
  //   - `request_content_changes` lands on the derived
  //     `changes_requested`, whose `statusReturnTarget` says where
  //     the work goes back to.
  // The only thing the filter still refuses is a move INTO a stage
  // the scenario omits, which is the rule that matters.
  let resolvedTo = rule.to;
  if (
    !CONDITION_STATUSES.has(rule.to) &&
    !DERIVED_STATUSES.has(rule.to) &&
    !stageIncluded(rule.to, scenario)
  ) {
    const bypass = SCENARIO_STAGE_BYPASS[rule.to];
    if (!bypass || !stageIncluded(bypass, scenario)) {
      throw new DomainError(
        "invalid_transition",
        `Action ${input.action} targets stage excluded by scenario ${scenario.id}`,
      );
    }
    resolvedTo = bypass;
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
    to: resolvedTo,
    changeRequestGate: null,
    statusReturnTarget: null,
    blockedReason: null,
  };
}
