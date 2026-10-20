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

## Amendment — 2026-10-20: the scenario is enforced on the server, and an omitted stage is skipped

**Status:** accepted (amends the "Engine refactor" and "MCP surface"
sections above).

### What was wrong

Two things, and the second was hidden by the first.

1. **The scenario was a UI-only guard.** The planning detail page and
   the board read `workspace_settings.workflow_scenario` and rendered
   only the stages the scenario includes. Nothing else did.
   `resolveWorkflowTransition` has always accepted an optional
   `scenario` argument and filtered the transition table with it, and
   this ADR says the pages and the MCP server "all pass the
   workspace's active scenario in" — but the content service never
   did, so the filter was dead on every server path. The MCP tool
   description advertised the behaviour ("Transitions that target a
   stage excluded by the workspace's active scenario are also
   rejected") while the implementation could not honour it.

   The service now reads the workspace's scenario and passes it to the
   engine, so the scenario is enforced identically for the planning
   server action, the inline-update path and the MCP tool.

2. **Enforcing it stranded every `lightweight` item.** `lightweight`
   omits the `content_review` stage, and `approve_content` is the ONLY
   rule whose target is `approved_for_design`. Filtering
   `submit_content_review` out of the table therefore removed the only
   way out of `draft` — the scenario's own product copy promises
   "Planning → Design → Creative approval → Publishing setup →
   Published" with "No pre-design content review", and none of that
   spine was reachable. ADR 0014 requires the opposite: "a scenario
   switch can never trap an in-flight item."

### What changed

- **An omitted stage is SKIPPED, not blocked.** When a rule's target
  stage is excluded by the scenario, the action lands on the bypass
  target (`content_review` → `approved_for_design`) instead of being
  rejected. The action's role set is unchanged: under `lightweight`
  the submitter hands the item to design, which is precisely what "no
  pre-design content review" means.
- **The scenario filter applies to the TARGET only.** The original
  engine filtered on the source stage as well, and that turned out to
  be a trap rather than a protection: rejecting an excluded SOURCE
  rejects _every_ action out of that status, including `cancel` and
  `block` — the escape hatches. A workspace switched to `lightweight`
  while an item sat in `content_review` would have stranded it with no
  way forward and no way out, which this ADR forbids ("a scenario
  switch can never trap an in-flight item"). The target filter is the
  one that matters:
  - a move INTO a stage the scenario omits is still refused;
  - an item already in an omitted stage is _finished_ —
    `approve_content` lands on `approved_for_design`, and `cancel` /
    `block` land on conditions, which are always reachable;
  - the board's "Outside current workflow" section still lists such
    items, and its copy — "Open each one to finish or reset it" — is
    now true.
- **No approval request for a gate that does not exist.** A content
  approval request is created only when the item actually entered
  `content_review`. A request nobody can decide is a permanently
  pending approval.
- **`changes_requested` is exempt from the target filter.** It is a
  _derived_ status: it records that work went back to a gate
  (`statusReturnTarget` = `content_review` for a content-gate
  revision, `in_design` for a creative-gate one), it does not own a
  stage. `STATUS_TO_STAGE` maps it to `content_review` for rail
  display only. Gating it on that fixed mapping made a creative
  revision impossible to request _and_ impossible to re-deliver in a
  workspace that skips content review.
- **`unblock` falls back to `draft`** when the item's return target
  sits in a stage the scenario omits, so a blocked item is never
  unblocked into a state the scenario cannot reach.
- **`effectiveTransitions()` was aligned** with the same semantics, so
  the function this ADR names as the filter does not disagree with the
  resolver it feeds.

### Compatibility

`standard`, `two_gate_client` and `self_publish` include every stage,
so the filter is a no-op for them and their behaviour is unchanged
byte-for-byte. Only `lightweight` — which must be chosen explicitly by
a manager — changes, and it changes into the behaviour its product copy
already promised.
