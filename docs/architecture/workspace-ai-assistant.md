# Workspace AI Assistant — Current Implementation

The Workspace AI Assistant is the first consumer of Planner's reusable,
in-process AI foundation. It remains part of the Planner modular monolith and
does not share the remote Planner MCP transport, bearer tokens, scopes, or tool
descriptions.

## Current capability boundary

- Each request resolves the signed-in actor, active agency, accessible
  workspace, and permitted role on the server. It reuses the agency AI switch,
  `monthly_planning_copilot` capability, managed MiniMax key, model allowlist,
  per-user rate limit, and token reservation/reconciliation.
- The assistant reads a selected month through authorized Planner services,
  with bounded plan items, brand context, and permitted workspace or agency
  knowledge. Deterministic analysis identifies calendar gaps; model findings
  and recommendations must cite evidence returned for the current request.
- Model-driven tools, when enabled by an agency administrator, are a fixed,
  bounded, schema-validated, read-only allowlist. The model cannot select a
  workspace, issue database queries, or add tools. Tool use stays disabled
  until the exact agency key and model pass restricted non-production UAT.
- Ask mode answers and analyzes. Plan mode can prepare a preview only for an
  explicitly selected draft when the user requests an edit. Apply mode supports
  explicit confirmation of individual or selected batches of previews. The
  current supported edits are title, brief, and planned publish date; existing
  Planner services recheck role, workspace, status, revision, and prior value
  when applying them. The assistant cannot approve, publish, or change workflow
  status.
- Saved prompts support private, workspace, and agency scopes, typed
  parameters, immutable revisions, and publication gates. Agency skills have
  their own review and rollback workflow. Prompt and skill instructions never
  grant tools, data access, or permissions.
- Visible chat turns stay in browser memory and are not stored or restored by
  session APIs. Planner stores session metadata, sanitized short-lived run
  events, and expiring proposals; those records contain no transcript text.
  Usage events omit prompts, transcripts, provider secrets, raw provider
  responses, and hidden reasoning.

## Current status

The 2026-10-25 Arabic-first workspace redesign is merged in PR #48 and deployed
on main SHA `1bfc9e324813d08a4ac43453165af808631ff1b6`. The target layout,
conversation-language rule, additive data impact, and remaining acceptance
gates are recorded in
[`workspace-ai-assistant-redesign-2026-10-25.md`](workspace-ai-assistant-redesign-2026-10-25.md).
The page prioritizes the conversation, keeps history compact and hideable, and
opens prompt and knowledge tools on demand. It does not change the capability
boundary above or persist transcript text.

Main-only CI and Deploy both passed for the exact SHA. The pre-migration
backup, production migration, and post-deploy health result are recorded in
[`docs/production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md)
and [`docs/production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md).

The deployment was risk accepted. The full browser and visual release gates
remain failed/incomplete; MiniMax model/tool/privacy checks, separated-account
UAT, production restore/rollback proof, and an independent GitHub review record
remain open. The app is deployed, but production readiness remains **NOT
READY**. See `PRODUCTION_READINESS_TRACKER.md` and
`docs/production-readiness/UAT_RELEASE.md` for the current verdict.

## Deferred work

Image generation, additional providers, autonomous workflows, and broader
cross-feature integrations remain deferred. Any new mutation must continue to
use existing Planner domain commands, explicit user confirmation, current
authorization, and version checks.
