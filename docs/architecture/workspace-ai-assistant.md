# Workspace AI Assistant — Phase 1

The Workspace AI Assistant is the first consumer of a reusable, in-process AI
foundation. It remains part of the Planner modular monolith. It does not share
the remote Planner MCP transport, bearer tokens, scopes, or tool descriptions.

## Current boundary

- The route resolves the workspace slug under the signed-in actor's active
  agency, then requires `workspace_manager` or `content_planner` membership.
- It reuses the agency AI master switch, the existing
  `monthly_planning_copilot` capability intersection, the managed MiniMax key,
  per-user rate limit, and token reservation/reconciliation. Agency model and
  key configuration remain the existing source of truth.
- The assistant reads one selected month through the existing content feature
  query. The server caps the result at 200 active items and passes only the
  fields required for planning analysis. It does not send titles, briefs,
  comments, member records, credentials, or other workspaces to the model.
- The initial fixed read capability set is plan summary, calendar distribution,
  and content mix. These are application-selected capabilities; the model
  cannot name a tool, workspace, table, or query. Model-driven tool calling is
  intentionally not enabled until the configured model and agency key pass a
  restricted non-production compatibility check.
- Schedule gaps are computed deterministically. The model may explain and
  recommend based on those facts, but all structured output is schema-checked
  and its evidence IDs must refer to the current request's evidence.
- The browser keeps the visible conversation in component memory. Each request
  can include up to eight recent turns; the route does not persist them.
- This phase is read-only. No proposals, status changes, approvals, content
  writes, or publishing calls are exposed.

## Request flow

`signed-in request → active-agency workspace resolution → role/capability gate
→ per-user rate limit → AI token reservation → bounded content read →
deterministic analysis capabilities → MiniMax response → response/evidence
validation → budget reconciliation → response`

Provider errors and model output are not returned raw. Usage events contain the
existing workspace/member/capability/model/token/request metadata and category
manifest, not prompts or conversation text. Internal Planner token accounting
is not an assertion of MiniMax subscription charges.

## Deferred work

Shared prompts, revision and publication workflow, action proposals, confirmation
and idempotent execution, contextual entry points, workspace knowledge,
additional providers, image generation, and autonomous workflows are later
phases. Prompt sharing must never share the creator's workspace data or
permissions. Any future action must call the existing authorized Planner domain
commands after explicit confirmation and current-version validation.

## Verification status

This document describes the implemented Phase 1 boundary. The analysis unit
tests and catalog/navigation checks are local evidence only. Production-ready
completion still requires route authorization coverage, the repo release gates,
English/Arabic browser and accessibility review, model/key compatibility UAT,
privacy/data-processing review, exact-clean-SHA evidence, and independent
verification. No production readiness status is implied by this document.
