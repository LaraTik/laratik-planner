# ADR 0014 — Per-workspace workflow scenarios

Date: 2026-09-19
Status: accepted for implementation

## Context

Today every LaraTik Planner workspace runs the same 11-state content machine
(`draft → content_review → approved_for_design → in_design → creative_review →
ready_to_publish → published`, with `changes_requested`, `blocked`,
`cancelled`, `partially_published` off the spine). The only per-workspace
variation is `workspace_settings.approvalMode` (`simple` vs
`internal_then_client`), which changes the creative-approval gate, not the
spine.

Mid-to-large agencies want the full editorial spine; solo brands and small
teams want a lighter path with no pre-design content review; agencies with
explicit client sign-off want the two-gate flow forced on every workspace;
publishers that own their channels want to publish directly from the
approval screen with no separate publishing-setup gate.

A full drag-drop custom designer is out of scope (master prompt §1.2
non-goals). Per-content workflow overrides are also out of scope (same).

## Decision

Ship a **pre-defined workflow-scenario library**. The manager picks one per
workspace from a Settings → Templates → Workflow section. Each scenario
fixes:

1. the ordered rail stages the workspace includes;
2. whether Creative Approval is forced to one or two gates, or left to the
   workspace's existing `approvalMode` setting;
3. whether Publishing Setup is a required gate or is collapsed into the
   creative-approval step.

Four scenarios ship in v1:

| ID                | Spine (rail stages)                                                                                | Approval mode                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `standard`        | planning → content_review → creative_production → creative_approval → publishing_setup → published | defers to workspace's `approvalMode`                                   |
| `lightweight`     | planning → creative_production → creative_approval → publishing_setup → published                  | forces `simple`                                                        |
| `two_gate_client` | standard spine                                                                                     | forces `internal_then_client`                                          |
| `self_publish`    | planning → content_review → creative_production → creative_approval → publishing_setup → published | forces `simple`; publishing setup state still reachable, gate optional |

`WORKFLOW_RULES` remains the engine for legal transitions. The scenario
layer (`effectiveTransitions()`, `stageIncluded()`) filters the rules at the
boundary. Conditions (`blocked`, `cancelled`) always pass through so a
scenario switch can never trap an in-flight item.

## Migration

`0048_workflow_scenarios.sql`:

- Adds `workspace_settings.workflow_scenario` (default `'standard'`,
  check-constrained to the four ids).
- Adds the `workflow_scenario` catalog table (read-only seed data).
- Every existing workspace gets `standard`, which preserves the prior
  behaviour byte-for-byte.

## Engine refactor

`src/lib/content/workflow.ts` gains:

```ts
export type WorkflowScenarioStage =
  | "planning"
  | "content_review"
  | "creative_production"
  | "creative_approval"
  | "publishing_setup"
  | "published";

export const WORKFLOW_SCENARIOS: Record<WorkflowScenarioId, ScenarioSpec>;
export function getActiveScenario(input: { workflowScenario; approvalMode? }): ScenarioSpec;
export function stageIncluded(status: ContentStatus, spec: ScenarioSpec): boolean;
export function effectiveTransitions(status, spec): readonly TransitionRule[];
```

`resolveWorkflowTransition(input)` gains an optional `scenario?: ScenarioSpec`
argument. Existing call sites that omit `scenario` default to `standard`, so
no behaviour change for callers predating migration 0048. The planning
detail page, the board page, and the MCP server all pass the workspace's
active scenario in.

## UI

A new "Workflow scenario presets" section on `/app/w/[slug]/settings/templates`
(matching the existing lead-times / approval / monthly-target sections). Each
card shows:

- The scenario name + blurb (en/ar i18n keys).
- A horizontal mini-rail preview (check + arrow markers; visual language
  matches the right-side WorkflowRail).
- A current-vs-card diff badge ("Current" / "−N stages · +M stages").
- An optional side-effect hint when the scenario forces `approvalMode`
  ("Will also change approval mode to internal_then_client.").
- A single "Apply" button that calls `applyWorkflowScenarioAction`.

The action is manager-only, runs in a single Drizzle transaction, and
revalidates `/settings`, `/settings/templates`, `/planning`, `/board`.

## UI consequences

- `WorkflowRail` (right-side planning detail) renders only the stages the
  active scenario includes. `lightweight` ships 5 chips; `self_publish`
  ships 6 (the gate is optional, not the stage).
- `WorkflowBoard` (`/board`) renders only the columns whose stage is
  included. Out-of-scenario items (rare; in-flight grandfathering) surface
  in a dedicated "Outside current workflow" section so the switch is never
  lossy.
- `StagePill` (planning list row) reads the scenario and reports the
  position counter against the scenario's stage count.
- `WorkflowStepper` (header) is unchanged — its 4-chip projection was
  already stage-agnostic.

## MCP surface

Two new tools:

- `laratik_planner_get_workspace_settings` (read): returns the workspace's
  `workflowScenario` (with resolved `stages` array), `approvalMode`, lead
  times, and monthly target.
- `laratik_planner_apply_workflow_scenario` (write, manager-only): applies
  a scenario by calling the same server action the UI uses.

`laratik_planner_transition_content` gains one sentence in its description
calling out the scenario filter so MCP clients know to call
`get_workspace_settings` first when the spine is unclear.

## Reversibility / rollout

- Switching is reversible. Manager can apply any other scenario at any
  time. No data is deleted.
- Existing items are NOT migrated. Their current `status` is preserved;
  the new scenario's `effectiveTransitions()` takes over from this point
  forward. The audit log records the switch with `before`, `after`,
  `actorId`, and `forcedApprovalMode`.
- The migration is additive (new column with default; new table).
- The default `standard` scenario is behaviour-preserving.

## Consequences

- Lighter UI per workspace.
- Per-workspace flexibility without a custom designer.
- Per-item override still deferred (documented as a follow-up).
- One new concept (`workflowScenario`) joins the existing per-workspace
  knobs (`approvalMode`, lead times, monthly target).

## Follow-up

- Per-content-item scenario override.
- Hook `effectiveTransitions()` into the deliverable approval flow so a
  workspace's scenario can force skip the client gate when the agency
  relationship has been downgraded.
- Surface the audit log entry on the workspace's activity feed so managers
  can see exactly when a scenario was last applied and by whom.
