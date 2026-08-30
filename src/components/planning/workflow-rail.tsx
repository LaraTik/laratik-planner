"use client";

import * as React from "react";
import { useEffect, useId, useState, useTransition } from "react";
import {
  Check,
  CheckCircle,
  Circle,
  XCircle,
  ArrowRight,
  Ban,
  Play,
  Info,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  transitionAction,
  decideApprovalAction,
  claimAction,
  assignDesignerAction,
} from "@/app/(app)/app/w/[slug]/planning/actions";
import { humanize, humanStatus } from "@/lib/content/status";
import { ApprovalTimeline } from "@/components/workspace/approval-timeline";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { STEP_EXPLANATIONS, explainStatus } from "@/lib/content/workflow-explanations";
import { type WorkflowStage, stageForStatus } from "./workflow-stepper";
import { cn } from "@/lib/utils";

type Role =
  | "isManager"
  | "isPlanner"
  | "isDesigner"
  | "isInternalReviewer"
  | "isClientReviewer"
  | "isPublisher";

/**
 * localStorage key for the desktop rail's collapsed/expanded
 * preference. The key is namespaced under `laratik-planner` so
 * it doesn't collide with anything else in `localStorage`. The
 * stored value is the string `"1"` for collapsed and `"0"` for
 * expanded; reading a missing/invalid value returns `false`
 * (default = expanded).
 */
const RAIL_COLLAPSED_KEY = "laratik-planner-workflow-rail-collapsed";

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsedPreference(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // localStorage may be disabled (private mode, quota). The
    // collapse state is best-effort — failing to persist just
    // means the user gets the default on the next visit.
  }
}

// 11-state pipeline used by the "View full workflow" disclosure.
// Mirrors `STATUSES` in `workflow-bar.tsx` — the rail re-uses the
// same array so the disclosure behaves identically to the
// previous top-of-page WorkflowBar.
const STATUSES = [
  "draft",
  "content_review",
  "changes_requested",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "published",
  "blocked",
  "cancelled",
] as const;

const STAGE_LABEL: Record<WorkflowStage, string> = {
  draft: "Planning",
  review: "Content review",
  design: "Creative production",
  publish: "Publishing",
};

/**
 * Rail-stage model — a finer-grained 6-stage view used ONLY by
 * the right-rail (the planning-detail spec's primary workflow
 * surface). The 4-stage model above stays in place for the
 * header-pill `WorkflowStepper` because the header is at-a-
 * glance and 4 chips read better than 6 in a tight horizontal
 * row.
 *
 * The 11-state backend machine maps to the 6 rail stages as
 * follows:
 *
 *   1. planning           draft
 *   2. content_review     content_review, changes_requested
 *   3. creative_production approved_for_design, in_design
 *   4. creative_approval  creative_review
 *   5. publishing_setup   ready_to_publish, partially_published
 *   6. published          published
 *
 * `blocked` and `cancelled` are special cases: the rail marks
 * them as `attention` against the most-relevant user-facing
 * stage (planning by default — the user can return to the
 * content item from there) but surfaces the system state as a
 * separate "Blocked" / "Cancelled" pill so the user is never
 * silently mis-led.
 */
export type RailStage =
  | "planning"
  | "content_review"
  | "creative_production"
  | "creative_approval"
  | "publishing_setup"
  | "published";

const RAIL_STAGES: ReadonlyArray<{ id: RailStage; label: string }> = [
  { id: "planning", label: "Planning" },
  { id: "content_review", label: "Content review" },
  { id: "creative_production", label: "Creative production" },
  { id: "creative_approval", label: "Creative approval" },
  { id: "publishing_setup", label: "Publishing setup" },
  { id: "published", label: "Published" },
];

export function railStageForStatus(status: string): {
  stage: RailStage;
  /** "linear" or "blocked" / "cancelled" special states. */
  variant: "linear" | "blocked" | "cancelled";
} {
  switch (status) {
    case "draft":
      return { stage: "planning", variant: "linear" };
    case "content_review":
    case "changes_requested":
      return { stage: "content_review", variant: "linear" };
    case "approved_for_design":
    case "in_design":
      return { stage: "creative_production", variant: "linear" };
    case "creative_review":
      return { stage: "creative_approval", variant: "linear" };
    case "ready_to_publish":
    case "partially_published":
      return { stage: "publishing_setup", variant: "linear" };
    case "published":
      return { stage: "published", variant: "linear" };
    case "blocked":
      return { stage: "planning", variant: "blocked" };
    case "cancelled":
      return { stage: "planning", variant: "cancelled" };
    default:
      return { stage: "planning", variant: "linear" };
  }
}

/**
 * WorkflowRail — right-side persistent rail for the planning
 * detail page. Phase 2 of the planning-detail refactor
 * (2026-08-30) extracted this from the top-of-page `WorkflowBar`
 * and re-shaped it into the spec's compact 4-stage list with an
 * expanded current-step block.
 *
 * The rail answers one question: "Where is this content in its
 * lifecycle?" It deliberately does NOT duplicate the
 * detailed blockers/readiness content shown inside the tabs —
 * the Overview's "Next action" card + readiness rows own that.
 *
 * Visual states (per spec §3):
 *   ✓ Complete / approved
 *   ● Current step
 *   ! Action required
 *   × Blocked / rejected
 *   ○ Upcoming
 *
 * Accessibility:
 *   - The 4-stage list uses semantic icons + colour, never
 *     colour alone.
 *   - The current step is announced as `aria-current="step"`.
 *   - The "View full workflow" disclosure is a real `<details>`
 *     with a `<summary>` so keyboard users can expand/collapse.
 *   - All action buttons are real `<button>`s with `aria-label`s
 *     where icon-only.
 *
 * Responsive: the rail renders as a right-side column on
 * `lg+` (handled by the parent grid in `page.tsx`). On smaller
 * viewports the rail is replaced by a bottom sheet in phase 4.
 *
 * Phase 4 (2026-08-30) split the rail into three pieces:
 *   - `WorkflowRailBody` — pure content, used by both the
 *     desktop and mobile renderers.
 *   - `WorkflowRail` (this export) — desktop wrapper. Adds the
 *     `<aside>` chrome and a collapse/expand toggle whose
 *     state persists in `localStorage`.
 *   - `WorkflowSheet` — mobile bottom-sheet companion. Renders
 *     a compact trigger under the header on `<lg`; tapping it
 *     opens a slide-up sheet that mounts `WorkflowRailBody`.
 */
export function WorkflowRail(props: WorkflowRailBodyProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Read the user's saved preference once, after mount, to avoid
  // an SSR/CSR mismatch (the server can't read `localStorage`).
  // The pattern matches `format-payload-editor.tsx`'s
  // localStorage read on first effect — the cascading render
  // is the explicit cost of deferring hydration until the
  // client knows the persisted value.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readCollapsedPreference());
    setHydrated(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedPreference(next);
      return next;
    });
  };

  if (!hydrated) {
    // First paint — render the expanded rail to match the
    // server-side default. The user may briefly see the
    // expanded state, then the persisted preference kicks in
    // on the next tick. Acceptable: the alternative is a
    // layout flash on every page load.
    return (
      <aside
        className="border-border bg-surface w-[300px] overflow-hidden rounded-[var(--radius-control)] border"
        data-testid="workflow-rail"
      >
        <WorkflowRailBody {...props} />
      </aside>
    );
  }

  if (collapsed) {
    return (
      <aside
        className="border-border bg-surface w-14 overflow-hidden rounded-[var(--radius-control)] border"
        data-testid="workflow-rail"
        data-collapsed="true"
        aria-label="Workflow rail (collapsed)"
      >
        <button
          type="button"
          onClick={toggle}
          className="text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring flex w-full items-center justify-center px-2 py-2 focus-visible:ring-2 focus-visible:outline-none"
          aria-label="Expand workflow rail"
          data-testid="workflow-rail-expand"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <ol
          className="flex flex-col items-center gap-1 px-1 py-1"
          aria-label="Workflow stages (collapsed)"
          data-testid="workflow-rail-stages-collapsed"
        >
          {(["draft", "review", "design", "publish"] as const).map((stage) => {
            const state = stageState(stage, props.status);
            return (
              <li
                key={stage}
                className="py-0.5"
                data-stage-id={stage}
                data-active={state.kind === "current" || undefined}
                title={STAGE_LABEL[stage]}
              >
                <StageIcon kind={state.kind} compact />
              </li>
            );
          })}
        </ol>
      </aside>
    );
  }

  return (
    <aside
      className="border-border bg-surface w-[300px] overflow-hidden rounded-[var(--radius-control)] border"
      data-testid="workflow-rail"
    >
      <header className="border-border flex items-center justify-between border-b px-3 py-2">
        <p className="text-label text-fg-secondary font-semibold uppercase">Workflow</p>
        <button
          type="button"
          onClick={toggle}
          className="text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          aria-label="Collapse workflow rail"
          data-testid="workflow-rail-collapse"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <WorkflowRailBody {...props} />
    </aside>
  );
}

/**
 * `WorkflowRailBody` — the rail's inner content, used by both
 * the desktop `WorkflowRail` wrapper and the mobile
 * `WorkflowSheet`. The component is intentionally chrome-less
 * (no `<aside>`, no header bar) so the same tree can mount
 * inside an `<aside>` on `lg+` and inside a bottom-sheet panel
 * on `<lg`.
 */
export interface WorkflowRailBodyProps {
  workspaceSlug: string;
  contentItemId: string;
  status: string;
  blockedReason: string | null;
  cancellationReason: string | null;
  roles: Record<Role, boolean>;
  approvals: {
    id: string;
    gate: string;
    status: string;
    requestedAt: string;
    deliveryVersionId: string | null;
  }[];
  designers: { id: string; label: string }[];
}

function WorkflowRailBody({
  workspaceSlug,
  contentItemId,
  status,
  blockedReason,
  cancellationReason,
  roles,
  approvals,
  designers,
}: {
  workspaceSlug: string;
  contentItemId: string;
  status: string;
  blockedReason: string | null;
  cancellationReason: string | null;
  roles: Record<Role, boolean>;
  approvals: {
    id: string;
    gate: string;
    status: string;
    requestedAt: string;
    deliveryVersionId: string | null;
  }[];
  designers: { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const executeTransition = async (
    action: Parameters<typeof transitionAction>[0]["action"],
    reason?: string,
  ) => {
    setActionError(null);
    const result = await transitionAction({
      workspaceSlug,
      contentItemId,
      action,
      ...(reason ? { reason } : {}),
    });
    if (result?.error) {
      setActionError(result.error);
    }
  };

  const run = (action: Parameters<typeof transitionAction>[0]["action"], reason?: string) => {
    start(async () => {
      await executeTransition(action, reason).catch(() => undefined);
    });
  };

  const can = (allowed: Role[]) => allowed.some((r) => roles[r]);

  const currentStep = (() => {
    try {
      return explainStatus(status as Parameters<typeof explainStatus>[0]);
    } catch {
      return null;
    }
  })();

  const currentEligibleRoles: Role[] = (() => {
    switch (status) {
      case "draft":
      case "changes_requested":
        return ["isManager", "isPlanner"];
      case "content_review":
        return ["isInternalReviewer", "isManager"];
      case "approved_for_design":
        return ["isManager", "isDesigner"];
      case "in_design":
        return ["isManager", "isDesigner"];
      case "creative_review":
        return ["isInternalReviewer", "isClientReviewer", "isManager"];
      case "ready_to_publish":
      case "partially_published":
        return ["isManager", "isPublisher"];
      case "blocked":
        return ["isManager"];
      case "cancelled":
        return ["isManager"];
      case "published":
        return ["isManager", "isPublisher"];
      default:
        return [];
    }
  })();
  const canActOnCurrentStep = currentEligibleRoles.some((r) => roles[r]);
  const currentRoleLabels = (currentStep?.responsibleRoles ?? []).map((r) => r.label);

  const { stage: currentStage } = stageForStatus(status);
  const { stage: railCurrentStage } = railStageForStatus(status);
  const hasAnyButton =
    (status === "draft" && can(["isManager", "isPlanner"])) ||
    (status === "content_review" && can(["isInternalReviewer", "isManager"])) ||
    (status === "changes_requested" && can(["isManager", "isPlanner"])) ||
    (status === "approved_for_design" && (roles.isDesigner || roles.isManager)) ||
    (status === "blocked" && roles.isManager) ||
    ([
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
    ].includes(status) &&
      roles.isManager);

  return (
    <div data-status={status} data-stage={currentStage}>
      <div className="border-border flex items-center justify-end border-b px-3 py-1.5">
        <Badge
          variant={canActOnCurrentStep ? "primary" : "outline"}
          data-testid="workflow-rail-actor-badge"
        >
          {canActOnCurrentStep ? "You can act" : "Awaiting"}
        </Badge>
      </div>
      <ol
        className="relative px-3 py-2"
        aria-label="Workflow stages"
        data-testid="workflow-rail-stages"
      >
        {/* Vertical process line — a single hairline that connects
            all the stage markers. Rendered via an absolutely-
            positioned pseudo-element on the <ol> so the line
            stays continuous even when the current stage's
            expanded block pushes the row height. The line sits
            16px in from the left edge to align with the stage
            marker centers. */}
        <div
          className="bg-border absolute top-2 bottom-2 left-[22px] w-px"
          aria-hidden="true"
          data-testid="workflow-rail-process-line"
        />
        {RAIL_STAGES.map(({ id: stage, label }) => {
          const expanded = stage === railCurrentStage;
          return (
            <li
              key={stage}
              className="relative py-1"
              data-stage-id={stage}
              data-active={expanded || undefined}
            >
              <RailStageRow stage={stage} label={label} status={status} />
              {expanded ? (
                <div
                  className="border-border bg-surface-subtle mt-1 ml-7 space-y-2 rounded-[var(--radius-control)] border p-2"
                  data-testid="workflow-rail-current"
                >
                  {currentStep ? (
                    <>
                      <p className="text-body text-fg-primary font-semibold">{currentStep.label}</p>
                      <p className="text-label text-fg-secondary">{currentStep.description}</p>
                      <div className="text-label text-fg-secondary flex flex-wrap items-center gap-1.5">
                        <span className="text-fg-muted">Responsible:</span>
                        {currentRoleLabels.length > 0 ? (
                          currentRoleLabels.map((label) => (
                            <Badge key={label} variant="info">
                              {label}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </div>
                      {currentStep.next ? (
                        <p className="text-label text-fg-muted inline-flex items-start gap-1.5">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            <span className="text-fg-secondary font-semibold">Next:</span>{" "}
                            {currentStep.next}
                          </span>
                        </p>
                      ) : null}

                      {blockedReason ? (
                        <p className="text-body text-danger">
                          <Ban className="mr-1 inline h-4 w-4" aria-hidden="true" />
                          Blocked: {blockedReason}
                        </p>
                      ) : null}
                      {cancellationReason ? (
                        <p className="text-body text-danger">
                          <Ban className="mr-1 inline h-4 w-4" aria-hidden="true" />
                          Cancelled: {cancellationReason}
                        </p>
                      ) : null}

                      {actionError ? (
                        <p role="alert" className="text-body text-danger">
                          {actionError}
                        </p>
                      ) : null}

                      <ActionButtons
                        status={status}
                        roles={roles}
                        isDesigner={roles.isDesigner}
                        isManager={roles.isManager}
                        isInternalReviewer={roles.isInternalReviewer}
                        isClientReviewer={roles.isClientReviewer}
                        isPublisher={roles.isPublisher}
                        designers={designers}
                        pending={pending}
                        onTransition={run}
                        onExecuteTransition={executeTransition}
                        onClaim={async () => {
                          setActionError(null);
                          const result = await claimAction({ workspaceSlug, contentItemId });
                          if (result?.error) setActionError(result.error);
                        }}
                        onAssignDesigner={async (designerId) => {
                          setActionError(null);
                          const result = await assignDesignerAction({
                            workspaceSlug,
                            contentItemId,
                            designerId,
                          });
                          if (result?.error) setActionError(result.error);
                        }}
                      />

                      {!hasAnyButton && currentEligibleRoles.length > 0 ? (
                        <p
                          className="text-label text-fg-muted inline-flex items-center gap-1.5"
                          data-testid="workflow-awaiting-others"
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden="true" />
                          {(() => {
                            const step =
                              STEP_EXPLANATIONS[status as keyof typeof STEP_EXPLANATIONS];
                            const eligibleLabels = currentEligibleRoles
                              .map(
                                (r) =>
                                  step?.responsibleRoles.find((x) => x.role === roleNameForFlag(r))
                                    ?.label,
                              )
                              .filter((label): label is string => Boolean(label));
                            return eligibleLabels.length > 0
                              ? `Awaiting ${eligibleLabels.join(" or ")}.`
                              : "Awaiting another team member.";
                          })()}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {approvals.length > 0 ? (
        <div className="border-border border-t px-3 py-2">
          <ApprovalTimeline
            approvals={approvals}
            roles={{
              isManager: roles.isManager,
              isInternalReviewer: roles.isInternalReviewer,
              isClientReviewer: roles.isClientReviewer,
            }}
            disabled={pending}
            onApprove={(approvalRequestId) =>
              start(async () => {
                setActionError(null);
                const result = await decideApprovalAction({
                  workspaceSlug,
                  approvalRequestId,
                  decision: "approved",
                });
                if (result?.error) setActionError(result.error);
              })
            }
            onRequestChanges={async (approvalRequestId, feedback) => {
              setActionError(null);
              const result = await decideApprovalAction({
                workspaceSlug,
                approvalRequestId,
                decision: "changes_requested",
                feedback,
              });
              if (result?.error) setActionError(result.error);
            }}
          />
        </div>
      ) : null}

      <details
        className="border-border bg-surface-subtle border-t"
        data-testid="workflow-pipeline-details"
      >
        <summary
          className="text-label text-fg-secondary cursor-pointer list-none px-3 py-2 font-semibold [&::-webkit-details-marker]:hidden"
          data-testid="workflow-pipeline-toggle"
        >
          View workflow ({STATUSES.length} steps)
        </summary>
        <div
          className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--border)] px-3 py-2"
          data-testid="workflow-pipeline"
        >
          {(() => {
            const idx = STATUSES.indexOf(status as (typeof STATUSES)[number]);
            return STATUSES.map((s) => {
              const sIdx = STATUSES.indexOf(s);
              const past = idx >= 0 && sIdx >= 0 && sIdx < idx;
              const current = s === status;
              return (
                <Badge
                  key={s}
                  variant={current ? "primary" : past ? "success" : "outline"}
                  data-testid={current ? "status-current" : undefined}
                  data-status={s}
                >
                  {humanize(s)}
                </Badge>
              );
            });
          })()}
        </div>
      </details>
    </div>
  );
}

/**
 * Rail-stage row — the 6-stage equivalent of `StageRow`. Lives
 * inside the right-rail's <ol> which has an absolutely-
 * positioned vertical process line on its left side. The row
 * keeps the spec's icon + label + colour + text state language
 * (the same five state icons the original 4-stage row used) and
 * leaves the current stage's expanded block to the parent.
 */
function RailStageRow({
  stage,
  label,
  status,
}: {
  stage: RailStage;
  label: string;
  status: string;
}) {
  const state = railStageState(stage, status);
  return (
    <div
      className="flex items-center gap-3"
      aria-current={state.kind === "current" ? "step" : undefined}
      data-testid={`workflow-rail-stage-${stage}`}
    >
      <RailStageIcon kind={state.kind} />
      <span
        className={cn(
          "text-body font-semibold",
          state.kind === "current"
            ? "text-fg-primary"
            : state.kind === "upcoming"
              ? "text-fg-muted"
              : "text-fg-secondary",
        )}
      >
        {label}
      </span>
    </div>
  );
}

type StageState = { kind: "complete" | "current" | "blocked" | "upcoming" };

function stageState(stage: WorkflowStage, status: string): StageState {
  const { stage: currentStage, variant } = stageForStatus(status);
  if (variant === "blocked" || variant === "cancelled") {
    return { kind: stage === "draft" ? "current" : "upcoming" };
  }
  if (stage === currentStage) return { kind: "current" };
  // Compare positions in the canonical stage order.
  const order: WorkflowStage[] = ["draft", "review", "design", "publish"];
  const sIdx = order.indexOf(stage);
  const cIdx = order.indexOf(currentStage);
  if (sIdx < cIdx) return { kind: "complete" };
  return { kind: "upcoming" };
}

/**
 * 6-stage equivalent of `stageState`. Uses the rail's own
 * `RAIL_STAGES` order and the `railStageForStatus` mapping. The
 * "blocked" / "cancelled" variants anchor the user to the
 * "planning" rail stage with an "attention" state — the
 * system state is rendered as a separate badge in the
 * expanded current block so the user is never silently
 * mis-led.
 */
function railStageState(stage: RailStage, status: string): StageState {
  const { stage: currentStage, variant } = railStageForStatus(status);
  if (variant === "blocked" || variant === "cancelled") {
    if (stage === currentStage) return { kind: "blocked" };
    const order: RailStage[] = RAIL_STAGES.map((s) => s.id);
    const sIdx = order.indexOf(stage);
    const cIdx = order.indexOf(currentStage);
    if (sIdx < cIdx) return { kind: "complete" };
    return { kind: "upcoming" };
  }
  if (stage === currentStage) return { kind: "current" };
  const order: RailStage[] = RAIL_STAGES.map((s) => s.id);
  const sIdx = order.indexOf(stage);
  const cIdx = order.indexOf(currentStage);
  if (sIdx < cIdx) return { kind: "complete" };
  return { kind: "upcoming" };
}

/**
 * Compact stage marker for the rail's 6-stage list. Sized
 * 24×24 so the markers line up with the absolutely-positioned
 * 1px process line at `left-[22px]`. The marker background
 * covers the line behind the icon so the line doesn't poke
 * through the marker.
 */
function RailStageIcon({ kind }: { kind: StageState["kind"] }) {
  if (kind === "complete") {
    return (
      <span
        className="border-success/40 bg-success-subtle text-success relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
        aria-label="Complete"
        data-state="complete"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (kind === "blocked") {
    return (
      <span
        className="border-danger/40 bg-danger-subtle text-danger relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
        aria-label="Blocked"
        data-state="blocked"
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (kind === "current") {
    return (
      <span
        className="border-primary bg-primary text-primary-foreground relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 shadow-sm"
        aria-label="Current"
        data-state="current"
      >
        <Circle className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
      </span>
    );
  }
  // "upcoming"
  return (
    <span
      className="border-border bg-surface text-fg-muted relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
      aria-label="Upcoming"
      data-state="upcoming"
    >
      <Circle className="h-2 w-2" aria-hidden="true" />
    </span>
  );
}

function StageIcon({ kind, compact = false }: { kind: StageState["kind"]; compact?: boolean }) {
  // Compact variant is used inside the collapsed rail
  // (~56 px wide) and inside the mobile trigger. The full
  // variant is used in the expanded rail's stage list.
  const size = compact ? "h-5 w-5" : "h-6 w-6";
  const iconClass = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  if (kind === "complete") {
    return (
      <span
        className={cn(
          "border-success/40 bg-success-subtle text-success inline-flex items-center justify-center rounded-full border",
          size,
        )}
        aria-label="Complete"
      >
        <CheckCircle className={iconClass} aria-hidden="true" />
      </span>
    );
  }
  if (kind === "current") {
    return (
      <span
        className={cn(
          "border-primary bg-primary text-primary-foreground inline-flex items-center justify-center rounded-full border",
          size,
        )}
        aria-label="Current step"
      >
        <ChevronRight className={iconClass} aria-hidden="true" />
      </span>
    );
  }
  if (kind === "blocked") {
    return (
      <span
        className={cn(
          "border-danger/40 bg-danger-subtle text-danger inline-flex items-center justify-center rounded-full border",
          size,
        )}
        aria-label="Blocked"
      >
        <XCircle className={iconClass} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "border-border bg-surface text-fg-muted inline-flex items-center justify-center rounded-full border",
        size,
      )}
      aria-label="Upcoming"
    >
      <span className="h-2 w-2 rounded-full bg-current" />
    </span>
  );
}

/**
 * ActionButtons — extracts the per-status action button tree
 * from the previous WorkflowBar into a focused subcomponent.
 * Logic is identical to the previous top-of-page implementation;
 * only the wrapping context changed.
 */
function ActionButtons({
  status,
  roles,
  isDesigner,
  isManager,
  pending,
  onTransition,
  onExecuteTransition,
  onClaim,
  onAssignDesigner,
  designers,
}: {
  status: string;
  roles: Record<Role, boolean>;
  isDesigner: boolean;
  isManager: boolean;
  isInternalReviewer: boolean;
  isClientReviewer: boolean;
  isPublisher: boolean;
  designers: { id: string; label: string }[];
  pending: boolean;
  onTransition: (action: Parameters<typeof transitionAction>[0]["action"], reason?: string) => void;
  onExecuteTransition: (
    action: Parameters<typeof transitionAction>[0]["action"],
    reason?: string,
  ) => Promise<void>;
  onClaim: () => Promise<void>;
  onAssignDesigner: (designerId: string) => Promise<void>;
}) {
  const can = (allowed: Role[]) => allowed.some((r) => roles[r]);
  return (
    <div className="flex flex-col gap-1.5" data-testid="workflow-rail-actions">
      {status === "draft" && can(["isManager", "isPlanner"]) ? (
        <Button
          size="default"
          onClick={() => onTransition("submit_content_review")}
          data-testid="workflow-rail-primary-action"
          className="w-full"
        >
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Submit for review
        </Button>
      ) : null}
      {status === "content_review" && can(["isInternalReviewer", "isManager"]) ? (
        <>
          <Button
            size="default"
            onClick={() => onTransition("approve_content")}
            data-testid="workflow-rail-primary-action"
            className="w-full"
          >
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" /> Approve content
          </Button>
          <ReasonDialog
            trigger={
              <Button size="default" variant="secondary" disabled={pending} className="w-full">
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Request changes
              </Button>
            }
            title="Request content changes"
            description="Describe the revision needed before this content can move forward."
            confirmLabel="Request changes"
            disabled={pending}
            onConfirm={(reason) => onExecuteTransition("request_content_changes", reason)}
          />
        </>
      ) : null}
      {status === "changes_requested" && can(["isManager", "isPlanner"]) ? (
        <Button
          size="default"
          onClick={() => onTransition("resubmit_content")}
          data-testid="workflow-rail-primary-action"
          className="w-full"
        >
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Resubmit for review
        </Button>
      ) : null}
      {status === "approved_for_design" && isDesigner ? (
        <Button
          size="default"
          onClick={() => {
            void onClaim();
          }}
          data-testid="workflow-rail-primary-action"
          className="w-full"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Claim as designer
        </Button>
      ) : null}
      {status === "approved_for_design" && isManager ? (
        <AssignDesignerDialog
          designers={designers}
          disabled={pending}
          onConfirm={onAssignDesigner}
        />
      ) : null}
      {status === "blocked" && isManager ? (
        <Button size="sm" onClick={() => onTransition("unblock")}>
          Unblock
        </Button>
      ) : null}
      {[
        "draft",
        "content_review",
        "approved_for_design",
        "in_design",
        "creative_review",
        "ready_to_publish",
      ].includes(status) && isManager ? (
        <ReasonDialog
          trigger={
            <Button size="sm" variant="destructive" disabled={pending}>
              <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
            </Button>
          }
          title="Cancel content item"
          description="This removes the item from the active workflow. Record why it is being cancelled."
          confirmLabel="Cancel item"
          destructive
          disabled={pending}
          onConfirm={(reason) => onExecuteTransition("cancel", reason)}
        />
      ) : null}
      {[
        "draft",
        "content_review",
        "approved_for_design",
        "in_design",
        "creative_review",
        "ready_to_publish",
      ].includes(status) && isManager ? (
        <ReasonDialog
          trigger={
            <Button size="sm" variant="secondary" disabled={pending}>
              Block
            </Button>
          }
          title="Block content item"
          description="Explain what is preventing progress so the team can resolve it."
          confirmLabel="Block item"
          disabled={pending}
          onConfirm={(reason) => onExecuteTransition("block", reason)}
        />
      ) : null}
    </div>
  );
}

/** Map the client-side flag union back to the canonical role name
 *  so the explanation lookup is symmetrical. The flag/role pairs are
 *  static — see `actorRoles` in the planning detail page. */
function roleNameForFlag(
  flag: Role,
):
  | "workspace_manager"
  | "content_planner"
  | "designer"
  | "internal_reviewer"
  | "client_reviewer"
  | "publisher"
  | "viewer" {
  switch (flag) {
    case "isManager":
      return "workspace_manager";
    case "isPlanner":
      return "content_planner";
    case "isDesigner":
      return "designer";
    case "isInternalReviewer":
      return "internal_reviewer";
    case "isClientReviewer":
      return "client_reviewer";
    case "isPublisher":
      return "publisher";
    default:
      return "viewer";
  }
}

/** Manager-driven designer assignment. Extracted from the
 *  previous `workflow-bar.tsx` and re-used by the rail. */
function AssignDesignerDialog({
  designers,
  disabled,
  onConfirm,
}: {
  designers: { id: string; label: string }[];
  disabled: boolean;
  onConfirm: (designerId: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(designers[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();
  const errorId = `${selectId}-error`;
  const hasDesigners = designers.length > 0;

  async function submit() {
    if (!selectedId) {
      setError("Pick a designer to assign.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedId);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assign action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={disabled || !hasDesigners}
          data-testid="assign-designer-trigger"
        >
          Assign designer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a designer</DialogTitle>
          <DialogDescription>
            Pick the designer who will own this design task. They&apos;ll be notified and the item
            will move into the &quot;in design&quot; state.
          </DialogDescription>
        </DialogHeader>
        {hasDesigners ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div>
              <label
                htmlFor={selectId}
                className="text-body text-fg-primary mb-1 block font-semibold"
              >
                Designer
              </label>
              <select
                id={selectId}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="border-border bg-surface text-body min-h-11 w-full rounded-[var(--radius-control)] border px-2 py-1"
                data-testid="assign-designer-select"
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
              >
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              {error ? (
                <p id={errorId} role="alert" className="text-label text-danger mt-1">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={submitting || !selectedId}
                data-testid="assign-designer-confirm"
              >
                {submitting ? "Assigning…" : "Assign"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-body text-fg-secondary">
            No designers in this workspace yet. Invite one from Settings, or wait for a designer to
            claim the item themselves.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Public type export so consumers (e.g. a future
// "where is this content in the workflow?" mini-component)
// can share the same 4-stage vocabulary without re-declaring
// the union.
export type { WorkflowStage };

/**
 * WorkflowSheet — mobile bottom-sheet companion to the desktop
 * `WorkflowRail`. Phase 4 of the planning-detail refactor
 * (2026-08-30) introduces this so the rail data is reachable
 * on `<lg` viewports without a permanent right column.
 *
 * On `<lg` the page renders a compact "Workflow" pill under
 * the header. Tapping it opens a slide-up bottom sheet (full
 * width, max-height ~85 vh) that mounts `WorkflowRailBody`.
 * The sheet follows the same overlay pattern as the existing
 * `DiscussionDrawer` (fixed inset-0 z-40 backdrop + sliding
 * panel); no new primitive was introduced.
 *
 * Accessibility:
 *   - The trigger is a real `<button>` with an `aria-label`
 *     and `aria-expanded` so screen readers announce the
 *     open/closed state.
 *   - Escape and backdrop click close the sheet.
 *   - The sheet restores focus to the trigger on close.
 */
export function WorkflowSheet(props: WorkflowRailBodyProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  // Close on Escape; restore focus to the trigger on close.
  // Copy the ref to a local so the cleanup function captures
  // the node that was actually mounted at effect time, not
  // whatever the ref points to when the cleanup runs.
  React.useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (trigger) trigger.focus();
    };
  }, [open]);

  const { stage: currentStage } = stageForStatus(props.status);
  const canAct = (() => {
    switch (props.status) {
      case "draft":
      case "changes_requested":
        return props.roles.isManager || props.roles.isPlanner;
      case "content_review":
        return props.roles.isInternalReviewer || props.roles.isManager;
      case "approved_for_design":
      case "in_design":
        return props.roles.isManager || props.roles.isDesigner;
      case "creative_review":
        return (
          props.roles.isInternalReviewer || props.roles.isClientReviewer || props.roles.isManager
        );
      case "ready_to_publish":
      case "partially_published":
      case "published":
        return props.roles.isManager || props.roles.isPublisher;
      case "blocked":
      case "cancelled":
        return props.roles.isManager;
      default:
        return false;
    }
  })();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="workflow-mobile-sheet"
        className="border-border bg-surface text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
        data-testid="workflow-mobile-trigger"
      >
        <span className="text-label text-fg-muted uppercase">Workflow</span>
        <span className="text-body text-fg-primary font-semibold">{STAGE_LABEL[currentStage]}</span>
        <Badge
          variant={canAct ? "primary" : "outline"}
          data-testid="workflow-mobile-trigger-actor-badge"
        >
          {canAct ? "You can act" : humanStatus(props.status)}
        </Badge>
        <ChevronRight className="text-fg-muted h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40"
          data-testid="workflow-mobile-sheet"
          id="workflow-mobile-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Workflow"
        >
          <button
            type="button"
            aria-label="Close workflow"
            className="bg-fg-primary/40 absolute inset-0 cursor-default backdrop-blur-sm"
            onClick={() => setOpen(false)}
            data-testid="workflow-mobile-backdrop"
          />
          <div
            className="border-border bg-surface absolute right-0 bottom-0 left-0 max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-control)] border shadow-2xl"
            data-testid="workflow-mobile-panel"
          >
            <header className="border-border bg-surface sticky top-0 z-10 flex items-center justify-between border-b px-3 py-2">
              <p className="text-label text-fg-secondary font-semibold uppercase">Workflow</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                data-testid="workflow-mobile-close"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>
            <WorkflowRailBody {...props} />
          </div>
        </div>
      ) : null}
    </>
  );
}
