/**
 * Next-action derivation — turn a content item's current status + the
 * actor's role into a one-line "what to do next" hint for the
 * planning-list row.
 *
 * Single source of truth: the human-language string is taken from
 * `STEP_EXPLANATIONS[status].next` (already maintained for the
 * workflow rail on the detail page). The `canCurrentUserAct` flag is
 * derived from the workflow engine's role gate — when true, the row
 * shows the action as a subtle CTA rather than as a passive label.
 *
 * This is a list-safe derivation. It does NOT call the readiness
 * service. "Next: Resolve 2 blockers" comes from the row's Health
 * column when `blockers > 0`, not from a per-row readiness call.
 */

import { explainStatus, type StepExplanation } from "@/lib/content/workflow-explanations";
import type { HealthSnapshot } from "@/lib/dashboard/health";
import type { ContentStatus } from "@/lib/content/status";
import type { WorkspaceRole } from "@/lib/auth/invitation-command";

/**
 * The role set the current user holds in the workspace that owns this
 * row. Empty array = viewer / unauthenticated / no role.
 */
export type ActorRoles = readonly WorkspaceRole[];

const REVIEW_STATUSES: ReadonlySet<ContentStatus> = new Set([
  "content_review",
  "creative_review",
  "changes_requested",
]);

const IN_PROGRESS_STATUSES: ReadonlySet<ContentStatus> = new Set([
  "approved_for_design",
  "in_design",
]);

/**
 * Roles that can move the item forward from a given status. Mirrors
 * the workflow engine (`WORKFLOW_RULES`) but is read-only — it does
 * not transition state, it only answers "could the actor push this?".
 *
 * This intentionally duplicates the role table from `workflow.ts`
 * because the workflow table also encodes `from` state and the
 * `requiresReason` flag, neither of which the next-action hint
 * needs. Keeping the role subset inline lets this file stay
 * testable without importing the workflow module's transition
 * resolver (which throws on invalid input).
 */
function rolesThatCanActForStatus(status: ContentStatus): ReadonlySet<WorkspaceRole> {
  switch (status) {
    case "draft":
    case "changes_requested":
      return new Set<WorkspaceRole>(["workspace_manager", "content_planner"]);
    case "content_review":
      return new Set<WorkspaceRole>(["internal_reviewer", "workspace_manager"]);
    case "approved_for_design":
    case "in_design":
      return new Set<WorkspaceRole>(["workspace_manager", "designer"]);
    case "creative_review":
      return new Set<WorkspaceRole>(["internal_reviewer", "client_reviewer", "workspace_manager"]);
    case "ready_to_publish":
    case "partially_published":
      return new Set<WorkspaceRole>(["workspace_manager", "publisher"]);
    case "blocked":
      return new Set<WorkspaceRole>(["workspace_manager"]);
    case "published":
    case "cancelled":
      // Terminal — no next action.
      return new Set<WorkspaceRole>();
  }
}

export interface NextAction {
  /** One-line label suitable for a row (≤ 36 chars where possible). */
  label: string;
  /**
   * True when at least one of the actor's roles can perform the
   * action implied by the current status. When false, the row
   * shows the label passively (no subtle CTA).
   */
  canCurrentUserAct: boolean;
  /**
   * The detail-tab anchor the action effectively takes the user to.
   * Lets the row's NextAction cell become a deep-link to the right
   * tab on the detail page (workflow / publishing / etc.).
   */
  tab: "workflow" | "publishing" | "content" | "activity" | null;
}

/**
 * Derive the row's "Next: …" hint from the current status, the row's
 * health rollup, and the actor's roles.
 *
 * Resolution order:
 *   1. Blocked status (manager-only) → "Resolve blocker"
 *   2. Blockers in health (ready_to_publish + has open approvals) →
 *      "Resolve N blockers" — surfaces the readiness count without
 *      re-running the readiness service.
 *   3. Health overdue → "X days overdue — submit for review" (or the
 *      step explanation's `next` string)
 *   4. Otherwise, the step explanation's `next` string.
 *
 * `tab` is set when the next action is logically anchored to a
 * detail-page section (workflow tab for transitions, publishing tab
 * for ready_to_publish, etc.). The list row's "→ Submit for review"
 * becomes a deep-link to the right tab instead of always opening
 * the overview.
 */
export function deriveNextAction(input: {
  status: ContentStatus;
  health: HealthSnapshot;
  openApprovalCount: number;
  actorRoles: ActorRoles;
  now: Date;
  plannedPublishAt: Date;
}): NextAction {
  const { status, health, actorRoles, openApprovalCount } = input;
  const explanation: StepExplanation = explainStatus(status);
  const canAct = (roleSet: ReadonlySet<WorkspaceRole>) =>
    roleSet.size > 0 && actorRoles.some((r) => roleSet.has(r));

  // 1. Blocked — always surfaced as a manager action.
  if (status === "blocked") {
    return {
      label: "Resolve blocker",
      canCurrentUserAct: canAct(new Set<WorkspaceRole>(["workspace_manager"])),
      tab: "workflow",
    };
  }

  // 2. Ready to publish but a re-review is in flight. The detail page
  //    uses the full readiness service for per-channel blockers; the
  //    row gets the same signal at a glance via `openApprovalCount`.
  if (status === "ready_to_publish" || status === "partially_published") {
    if (openApprovalCount > 0) {
      return {
        label: `Resolve ${openApprovalCount} approval${openApprovalCount === 1 ? "" : "s"}`,
        canCurrentUserAct: canAct(
          new Set<WorkspaceRole>(["internal_reviewer", "client_reviewer", "workspace_manager"]),
        ),
        tab: "publishing",
      };
    }
    // No open approval — the publisher is clear to act. The label
    // still comes from STEP_EXPLANATIONS so the row matches the
    // detail page, but the tab is anchored to the publishing
    // section so the row's "→" link opens the right place.
    return {
      label: explanation.next,
      canCurrentUserAct: canAct(new Set<WorkspaceRole>(["publisher", "workspace_manager"])),
      tab: "publishing",
    };
  }

  // 3. Overdue → label surfaces the days.
  if (health === "overdue" || health === "at_risk") {
    const days = Math.max(
      1,
      Math.floor((input.now.getTime() - input.plannedPublishAt.getTime()) / 86_400_000),
    );
    return {
      label: `${days} day${days === 1 ? "" : "s"} overdue — ${explanation.next}`,
      canCurrentUserAct: canAct(rolesThatCanActForStatus(status)),
      tab: REVIEW_STATUSES.has(status) || IN_PROGRESS_STATUSES.has(status) ? "workflow" : "content",
    };
  }

  // 4. Default — use the step explanation's `next` string verbatim.
  return {
    label: explanation.next,
    canCurrentUserAct: canAct(rolesThatCanActForStatus(status)),
    tab: REVIEW_STATUSES.has(status)
      ? "workflow"
      : IN_PROGRESS_STATUSES.has(status)
        ? "workflow"
        : status === "draft" || status === "changes_requested"
          ? "content"
          : null,
  };
}
