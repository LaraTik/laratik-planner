# Workspace AI Agent Platform — Repository Audit and Delivery Plan

**Reviewed:** 2026-10-24  
**Audit baseline:** `0476a724b1b672754a0f4c1f54cf9eab68f2581b`  
**Current code evidence:** `68a63d5a43773deb43e4e7773b3f543bd51fc923` (clean commit; local full verification passed).  
**Current documentation sync:** 2026-10-24; see the latest exact-SHA entry in `docs/production-readiness/TEST_EVIDENCE.md`.  
**State:** the Workspace Assistant, prompt governance, agency skills, and confirmed draft proposals are implemented on PR #44. The release remains blocked by the external and production-readiness gates recorded in `PRODUCTION_READINESS_TRACKER.md`.

## Current architecture

The repository already has several of the foundations requested for the agent
workspace:

| Existing capability                                                                                                                       | Current owner                                                                                                                                                                    | Reuse boundary                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agency AI enablement, capability intersection, provider secrets, request rate limits, token reservations/reconciliation, and usage events | `src/lib/ai/`, `ai_feature_setting`, `ai_usage_event`                                                                                                                            | Keep as the authority for AI access, agency configuration, budgets, and redacted telemetry. Do not create a second provider-key or quota system.                                               |
| MiniMax request adapter and prompt-specific generation                                                                                    | `src/lib/ai/index.ts`                                                                                                                                                            | Extend behind a provider-neutral contract. Today it is text-only and returns a completed response; it does not expose a genuine streaming/tool-call runtime.                                   |
| Optional agency-scoped MiniMax secret                                                                                                     | `src/lib/ai/provider-secret.ts`, `ai_provider_secret`                                                                                                                            | Reuse the current key lookup and encryption; never send or reveal the key to the browser.                                                                                                      |
| Persistent guided planning session, messages, versioned instruction packs, and create-content proposals                                   | `monthly_planning_session`, `monthly_planning_message`, `planning_instruction_pack`, `planning_instruction_pack_revision`, `planning_proposal`; `src/lib/ai/monthly-planning.ts` | Reuse its authorization, revision, proposal, and audit patterns. It is a month-bound planning workflow, so it should remain distinct from searchable, general-purpose assistant conversations. |
| Brand profile, voice rules, visual rules, pillars, channels, campaigns, and approved-content context                                      | `src/lib/brand/`, `src/lib/ai/context.ts`, brand and planning feature services                                                                                                   | Reuse these as initial, permission-aware knowledge sources. Do not create a second brand or analytics store.                                                                                   |
| Authorized content reads and writes, workflow and publishing constraints, format validation, materiality events                           | `src/features/content/` and existing publishing services                                                                                                                         | Every assistant tool must call the owning service. Never update content tables directly from the agent runtime.                                                                                |
| Remote Planner MCP                                                                                                                        | `src/lib/mcp/`, `/api/mcp`                                                                                                                                                       | Keep transport, bearer tokens, scopes, and MCP tool descriptions independent. New in-app tools do not implicitly become MCP tools.                                                             |
| Workspace AI page with Ask/Plan/Apply request modes and confirmed draft proposals                                                         | `src/features/workspace-assistant/`, `/api/ai/workspace-assistant`                                                                                                               | Continue through the existing assistant feature; mode gates model proposal creation and the per-proposal confirmation stays explicit.                                                          |

The initial implementation adds private, per-member session metadata with
search, rename, archive, restore, and delete. Chat turns live only in browser
memory and disappear on reload. Requests may send at most the eight most recent
turns from that in-memory session; the server neither stores nor retrieves
transcripts. Session titles are neutral by default. Every request resolves the active
agency/workspace on the server, checks the assistant role and current AI
capability, reserves the existing budget, and reads through the authorized
content and brand services. It deterministically reviews up to 200 active items
for the selected month, while sending detailed title/brief context for at most
40 items. Retrieved content and saved prompt text are treated as untrusted data.
Model findings must cite evidence IDs returned by the server. Structured results
and bounded context provenance are returned to the browser for the current
session only. Raw provider reasoning, API keys, hidden provider payloads, and
chat turns are not saved by Planner. Short-lived proposals and session metadata
remain server-side so a user can review a pending change after navigation.

The assistant estimates input tokens from the complete bounded provider request
before reserving budget, including browser-memory history. Tool-enabled runs
reserve additional input and output capacity before every follow-up provider
round, without counting another user request. Reconciliation uses the sum of
reported usage across rounds; if a later round fails, usage already reported is
still reconciled and unused reservation is returned. Positive reconciliation
deltas are recorded even when actual use crosses the plan cap, so the next
request is blocked without losing the completed provider usage from accounting.

The UI now includes bilingual built-in monthly planning prompts, private,
workspace, and agency-scoped prompt records with immutable revisions and the
workspace-manager/agency-admin publication gates, plus 30 first-party skills
selected by simple intent matching. It also exposes request-level Ask, Plan,
and Apply modes in English and Arabic. Ask and Apply cannot create new
proposals. Plan can prepare a preview only for an explicitly selected draft
when the user requests an edit. Apply mode supports confirming one preview or
explicitly selecting up to ten changes across up to five drafts. A draft can
appear only once per field in a batch. The batch path locks all selected
previews and drafts in stable order, checks each revision and exact
before-value, writes through the existing content service in one transaction,
and marks the selected previews applied in that transaction. If any selected
preview is stale, the batch applies none of its changes; a repeated batch
request is idempotent.
The selected mode is stored on private session metadata and restored when opened;
legacy sessions default to Ask, and opening one does not restore its transcript.
The shared MiniMax model registry currently describes M3 and M3.1 Flash for
the default Anthropic-compatible endpoint. It declares streaming, tool-call,
reasoning, modality, and suitability capabilities; the assistant hides effort
controls unsupported by the selected model and rejects unsupported effort
requests before reserving budget. M3.1 Flash receives only the documented
`low`, `medium`, `high`, `xhigh`, or `max` effort values; M3 has no reasoning
control. Agency configuration remains authoritative for model selection.
Agency admins select the permitted model set from the server allowlist and keep
the agency default within that set. Members can choose a permitted model; the
preference is stored in browser storage per user and agency, then validated
again against both agency and server allowlists for every request. Model
metadata does not establish eligibility for a specific subscription key, and
the external account/model smoke remains a production gate.

This is a grounded, narrowly governed assistant slice, not the full agent
experience in the acceptance scenario. It resolves authorized content item references by ID,
Planner item URL, title, or partial title. Calendar/planning URLs, ISO month
references, named English/Arabic months with years, and selected-plan phrases
resolve to the product's existing month-scoped calendar; there is no separate
titled Plan entity. The assistant still preloads authorized facts in one
request for the non-tool path. When explicitly agency-enabled for MiniMax
M3.1-Flash, a bounded read-only tool loop selects allowlisted tools. Short
requests use provider streaming, real request-scoped activity events, and
cancellation. Durable sanitized run/event records support actor-bound replay
and server-side cancellation polling; the request still runs in the web process,
so worker recovery and restart-safe execution remain open. Agency admins can
author, revise, submit, review, archive, and request rollback of agency skills
from `/app/agency-settings/ai/skills`. Revisions are immutable; publication
requires a different agency admin to review, and custom skills receive no
tools or permissions. Workspace and agency
knowledge now use categorized,
workspace-filtered entries with verification status, bounded search, source
links, soft archive, optimistic revision checks, and immutable history. Only
workspace managers can manage workspace entries and only agency admins can
manage agency entries. Knowledge is passed to the assistant as source-linked,
untrusted reference data; tool-mode citations are restricted to evidence IDs
actually returned by the authorized knowledge tool. Document upload, website
ingestion, semantic retrieval, usage tracking, and richer provenance remain
unimplemented.

The Knowledge Library also includes nine bilingual, code-owned Planner default
guidance entries adapted from `docs/ai-planning/defaults/`. They are visible in
the library and available through bounded retrieval under the `default` scope.
The entries provide generic guidance on strategy, evidence, responsible
marketing, execution, accessibility, and measurement; relevant entries link to
AMEC, ICC, or W3C sources. Platform specifications and jurisdiction-specific
requirements are not treated as fixed defaults. Workspace managers can copy an
entry into workspace scope to tailor it; the copy begins unverified and uses
the standard revision history. The built-in entries do not establish
workspace-specific brand, product, audience, offer, performance, or operating
facts.

Proposal application supports title, brief, and planned-date
changes on one explicitly selected draft. The legacy transcript table is
retained for migration compatibility but is no longer read or written by
runtime code. Existing transcript rows are not automatically deleted by this
change; their disposal requires a separately reviewed, backed-up data-retention
migration. Session metadata and pending proposals have separate lifecycles.

The specialized monthly-planning flow already persists conversation messages
and supports proposal approval and idempotent application for newly created
content. Its current proposal schema is create-oriented; it is not a general
before/after edit proposal for existing items.

## Architecture decision

Keep a modular monolith. `src/features/workspace-assistant/` owns assistant
conversations, prompt selection, skill routing, authorized tools, review
results, and proposals. `src/lib/ai/` remains the shared provider and
governance boundary. Routes adapt HTTP/SSE and call feature services; they do
not own database policy. Existing Planner domain services remain the only path
for content, campaign, publishing, and analytics reads or mutations.

The month-bound planning sessions and general assistant conversations have
different lifecycles and proposal contracts. Keep their tables separate rather
than weakening the month constraint or silently changing existing proposal
semantics. Reuse the existing policy and transaction patterns, not a generic
agent framework or a new service.

The first-party skill catalog currently contains 30 versioned Planner-authored
definitions across strategy, planning, creation, and quality. Discovery returns
compact metadata and loads full instructions only for selected skills. The
agency admin registry adds reviewed, immutable agency revisions; rollback
creates a new draft revision that must pass review before activation. The
management page loads bounded revision history and may omit older revisions
after its global query limit. Workspace-specific skill authoring, portable
`SKILL.md` packages, and live evaluation workflows remain open. Workspace and
agency instruction packs remain scoped extensions and cannot add tools or
permissions.

## Delivery sequence

### A. Audited foundation and private in-memory assistant — implementation started

- Add private assistant session metadata with workspace, creator, neutral title,
  mode, and archive state. Keep transcript turns in browser memory only, send a
  bounded recent history with each request, and enforce active workspace and
  membership on every server read/write. Add rename, archive, and delete controls.
- Short assistant requests use the documented MiniMax Anthropic-compatible
  text stream and SSE activity events for actual context, skill, analysis,
  provider, validation, and persistence transitions. Thinking blocks are
  discarded. The UI can stop an in-flight request. Durable run/event records
  now support workspace/actor-bound replay from a cursor and server-side
  cancellation polling; only sanitized event types and bounded details are
  persisted. No progress is simulated.
- Browser disconnect does not cancel the bounded request. Reconnect can replay
  persisted activity and detect stale runs, but the request still runs in the
  web process: worker recovery, leases, durable resumption, and retrying a
  failed tool step remain open. Replayed event delivery is sequence-based.
- Do not persist new transcript turns. Review and remove legacy transcript data
  separately under backup, retention, and rollback controls. Transcripts, run
  events, prompt text, and retrieved source bodies must not enter logs or usage
  events.

### B. Prompt and skill library

- Seed the reviewed prompt set as bilingual built-ins; add workspace/private/
  agency templates with purpose, tags, typed parameters, allowed context,
  output contract, lifecycle, and immutable revisions.
- Reuse the existing instruction-pack revision and approval pattern for shared
  procedural extensions where its schema fits. Add discovery and progressive
  loading for curated first-party skills. Do not let a prompt or skill grant
  context access or write capability.
- Agency publication stays behind agency-admin authority. Workspace prompts
  use the workspace-manager gate. A prompt shares instructions only; its
  execution resolves fresh, authorized data for the active actor and workspace.

### C. Plan Review and Improve vertical slice — partially implemented

- Resolve exact Planner content-item URLs/IDs/titles and bounded partial-title
  searches only inside the current authorized workspace. Calendar/planning
  URLs and explicit month references select the existing month-bound plan.
  Ambiguous content references require user selection; unknown and
  unauthorized references do not reveal metadata. Selected item summaries,
  creative text allowlists, revisions, and month evidence are bounded. Campaign
  and distinct titled-plan resolution are not available in the current model.
- Register typed, read-only tools for the selected plan, its items, schedule,
  content mix, assignment workload when requested, brand profile/voice,
  channels, and available analytics. Current context is bounded and carries source, version, retrieval time, and
  completeness metadata. A bounded MiniMax-M3.1-Flash tool loop can select
  allowlisted read-only tools only when the agency explicitly enables the
  feature; the default is off and model/key eligibility still requires external
  UAT. Broader analytics retrieval and skill evaluation are not implemented.
- The current engine computes schedule/content findings deterministically and
  validates structured evidence-linked responses. The workload tool reports
  bounded owner/designer assignment counts only; it does not infer capacity or
  deadlines. Per-item quality checks and evaluation scorecards remain open.

### D. Confirmed edits — partially implemented

- For an explicitly selected draft, title, brief, and planned-date suggestions can now become
  immutable 30-minute proposals bound to the current actor, workspace,
  conversation, item, and expected revision. The UI shows the server-sourced
  before value and proposed after value; the user explicitly applies or rejects
  each edit. The model cannot choose a target ID or supply a before value.
- Apply locks the proposal and content item in one transaction, rechecks the
  active assistant role, status, field value, and revision, then calls the
  existing `updateContentItem` service with an optimistic revision fence. The
  service records materiality/audit data in the same transaction. Replayed
  applies return `already_applied`; changed records become `stale`; expired and
  rejected previews cannot be applied.
- Remaining: proposal generation across multiple selected drafts, create
  proposals, richer calendar-wide changes, and the full adversarial,
  permission-loss, and expiry/replay matrix. Existing selected proposals can
  be batch-applied across up to five drafts. The write surface is limited to
  title, brief, and planned-date edits on existing drafts. Date changes use a
  date-only value and preserve the existing planned UTC time.
- Publishing, approval/status transitions, ad activation, and deletion remain
  outside this capability.

### E. Knowledge and quality hardening

- Start with existing brand profile/kit, campaign, pillar, channel, content,
  and analytics read models. Add permission-filtered search only when there is
  a measured need; do not add a vector store as a default.
- Add first-party knowledge entry management with verification state and
  provenance before adding document upload or website fetching. Any future
  fetching must block private, local, and link-local network targets and treat
  retrieved text as untrusted data.
- Add fixture-based quality, injection, tenant-isolation, tool-schema,
  proposal-replay, stale-version, cancellation, reconnect, bilingual, and
  accessibility evidence.

## Provider and third-party research

The repo's master prompt names MiniMax M2.7, but the current application
defaults `MINIMAX_BASE_URL` to the Anthropic-compatible endpoint and
`MINIMAX_MODEL`/`ai_feature_setting.model` to `MiniMax-M3`. Agency settings
now persist an administrator-managed model list; the server further limits
choices to the provider model registry. The current official Anthropic
compatibility documentation lists `MiniMax-M3` and
`MiniMax-M3.1-Flash` as supported model IDs and says M2-family models use the
standard MiniMax API interface. The repository's M2.7 guidance and current
model allowlist therefore need reconciliation before adding model controls; do
not expose M2.7 through the Anthropic adapter unless a controlled account
smoke proves that protocol/model combination works.

MiniMax's current official API index documents M3.1-Flash and M3, tool-use
guidance, Anthropic-compatible message APIs, and streaming. M3.1-Flash
documents `output_config.effort` values `low`, `medium`, `high`, `xhigh`, and
`max`, with reasoning required; M3 has a different thinking policy. The
current adapter sends `temperature`, which the official Anthropic compatibility
docs say is ignored for M3/M3.1-Flash. Model controls must map only to each
verified model's documented parameters and preserve full provider tool-call
history internally without displaying private reasoning. Protocol capability
does not prove a specific agency key or subscription tier has model access.
M Plan usage has its own 5-hour and weekly windows; Planner's token budget is
an application quota, not a claim about MiniMax subscription charges.

Primary provider references: [MiniMax Anthropic API compatibility and supported
models](https://platform.minimax.io/docs/api-reference/text-anthropic-api),
[MiniMax M3.1-Flash tool use](https://platform.minimax.io/docs/guides/text-m3-function-call),
[MiniMax message streaming](https://platform.minimax.io/docs/api-reference/text-chat-anthropic),
and [M Plan usage windows](https://platform.minimax.io/docs/m-plan/usage-rules).

External skill references reviewed:

- [Agent Skills specification](https://agentskills.io/specification) defines
  `SKILL.md` metadata, optional resources, and progressive disclosure.
- [Social Media Skills](https://github.com/social-media-skills/skills) reports
  an MIT license and a broad catalog with skill validation. Its procedures are
  useful for task coverage, but Planner will author original skills and retain
  independent evidence and platform constraints.
- [Anthropic knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins)
  uses Apache-2.0 licensing and includes workflow skills with explicit inputs,
  decisions, and handoffs. Do not copy its product-specific connector rules.
- [Hermes Agent skill guidance](https://github.com/NousResearch/hermes-agent)
  demonstrates progressive loading and the distinction between procedural
  skills and deterministic tools. Its skill execution and installation model
  is not appropriate for Planner's constrained server environment.
- [Meta's Reels guidance](https://about.fb.com/news/2023/04/instagram-reels-trending-audio-and-gifts-updates/)
  is source material for examples, not a permanent API/format contract. Any
  platform constraints shown to users must be dated, versioned, and rechecked.

No third-party skill code or text has been imported. Model IDs, M Plan access,
reasoning parameters, retention terms, and data-processing terms still require
verification against the selected live account and production contract.

## Known release state and gates

- The existing feature commit `0476a724b1b672754a0f4c1f54cf9eab68f2581b`
  passes the manually dispatched authoritative CI run
  [39968383745](https://github.com/LaraTik/laratik-planner/actions/runs/39968383745).
- The critical browser advisory
  [39968507132](https://github.com/LaraTik/laratik-planner/actions/runs/39968507132)
  failed after broad unrelated route timeouts and connection-refused errors;
  the failure needs runner/environment classification and a clean targeted
  browser rerun before it can count as evidence.
- Local browser checks previously could not verify the disposable Postgres
  target because the Docker API returned HTTP 500. No browser test may use an
  unverified or production database.
- The feature is not merged or deployed. Schema changes require registered
  migration metadata, forward/compatibility/backup/rollback/from-zero/upgrade
  evidence, exact-clean-SHA verification, and the repository's manual CI and
  deployment workflow.
- The older feature commit's working-tree verification is not release
  evidence for later code. All gates must run against the final clean SHA.

## Acceptance checkpoint

The first release candidate must complete this real-data path: select
**Review and Improve a Plan**, resolve a plan within the active workspace,
show genuine retrieval and analysis events, return source-linked findings,
choose specific recommendations, show a before/after proposal, confirm it,
recheck permission and record version, apply through Planner services, read
back the result, and show per-operation outcomes. The same test matrix must
prove that unknown, ambiguous, unauthorized, stale, cancelled, timed-out, and
partially applied cases cannot be reported as complete.
