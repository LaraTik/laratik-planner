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

The 2026-10-25 Arabic-first workspace redesign is in progress on a feature
branch and is not yet release-verified. Its target layout, conversation-language
rule, additive data impact, and remaining acceptance gates are recorded in
[`workspace-ai-assistant-redesign-2026-10-25.md`](workspace-ai-assistant-redesign-2026-10-25.md).
The page now separates the conversation, history, and on-demand tools/context
surfaces. It does not change the capability boundary above or persist
transcript text.

The code is implemented on PR #44. The latest clean application code evidence
is SHA `3c43f49b6e15bc131b62032536d28d665a340ac0`; the branch currently ends at
`6c73c9082d9a895bc5e8bb4bf9dbeb3db6c1f32d` after documentation-only commits.
Local verification, integration, and the Assistant migration drill are
recorded in `docs/production-readiness/TEST_EVIDENCE.md`.

This is not a production release approval. The full browser release matrix,
non-production MiniMax model/tool and privacy checks, separated-account UAT,
production backup/rollback evidence, and a recorded independent PR approval
remain open. Check the current verdict in `PRODUCTION_READINESS_TRACKER.md`
before merging or deploying.

## Deferred work

Image generation, additional providers, autonomous workflows, and broader
cross-feature integrations remain deferred. Any new mutation must continue to
use existing Planner domain commands, explicit user confirmation, current
authorization, and version checks.
