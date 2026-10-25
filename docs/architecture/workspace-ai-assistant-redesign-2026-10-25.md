# Workspace AI Assistant redesign — 2026-10-25

## Product request and reference

The redesign request describes an Arabic-first AI Workspace Copilot with the
existing workspace navigation, a clear route back to recent conversations, a
dashboard-led planning view, and tools/context that open when needed. It also
requires Arabic as the default response language regardless of interface
locale or source-data language, an explicit per-conversation language choice,
citations, reviewable changes, and user confirmation before any Planner write.

The supplied screenshot is the visual and section-order reference for the
Assistant page. Match its hierarchy inside the existing LaraTik application
shell and retain that shell's navigation and design tokens.

## User-directed screenshot layout update — 2026-10-25

The owner explicitly asked to apply the attached dashboard design and section
order. The page now follows the screenshot's sequence: dashboard hero and
knowledge actions, an Arabic-default composer with explicit language and
workspace-item reference controls, searchable prompt library, recent
conversations, monthly plan summary, status totals, calendar and format charts,
plan insights, execution actions, and the not-ready item table. The full
conversation history remains available through the existing desktop panel and
mobile dialog; the sticky composer appears while a conversation is active.

The dashboard reads exact status, format, and workspace-local calendar
aggregates from the authorized workspace content table and displays at most
five upcoming items in its not-ready list. It does not make an AI-provider
request while loading. Report generation remains an explicit user action;
assistant proposals still require the existing review and confirmation flow
before Planner writes. This layout adds no schema or production-data
mutation. Bilingual browser, accessibility, and visual evidence for the new
layout must be recorded against the exact release commit.

## Audit of the current screen

- Prompt cards and knowledge management occupied the top of the page before
  the conversation area. The conversation list was a second large card rather
  than a compact return path.
- The answer was rendered as plain text. Findings and recommendations shared
  one section, while the evidence list and activity timeline stayed expanded.
- Response language is stored per conversation and remains independent of the
  interface locale, source names, and source-data language.
- Session text is intentionally browser-memory-only. Reopening a session
  restores its metadata and saved proposals, not the transcript.
- The existing service already resolves an explicit plan/content reference,
  produces deterministic and model findings with evidence IDs, and prepares
  proposals that are checked again against role, workspace, status, revision,
  and prior value before a separate confirmation can apply them.

## Implemented direction

- Keep the current app shell and its right-side RTL navigation unchanged.
- Use the requested dashboard-first section order. Show four recent
  conversations in compact cards; retain searchable, pinnable full history in
  the desktop panel and mobile dialog.
- Load the prompt gallery for the page, with search and category filters.
  Keep prompt authoring, knowledge management, and context tools available
  through the Tools and context dialog.
- Show one composer at a time: the page-level composer for a new conversation
  and the sticky composer while a conversation is active. Include an explicit
  response-language choice and a workspace content reference field.
- Render assistant output as safe Markdown with GitHub-flavored tables,
  wrapped local table overflow, code-direction handling, and no raw HTML.
- Separate deterministic findings, model findings, and recommendations.
  Evidence references link to a collapsed source panel that retains source,
  period, retrieval time, count, version, and completeness.
- Collapse activity by default after a run and keep it available for review.
  Add copy and regenerate controls to the latest answer.
- Store `response_locale` on each conversation. New sessions default to Arabic;
  English is an explicit conversation setting. The server injects the selected
  language policy before provider use and rejects a request that disagrees
  with the saved session value. Current user locale continues to control only
  the interface.
- Add `pinned_at` as session metadata and sort pinned sessions before the
  remaining sessions. Ownership and workspace predicates remain unchanged.

## Data and security impact

Migration `0103_workspace_assistant_language_pinning` is additive. Existing
rows receive `response_locale = 'ar'`; `pinned_at` stays null. A database
constraint allows only `ar` and `en`. Rollback drops the new constraint and
both new columns. It does not alter content, saved messages, proposal rows, or
authorization data.

No transcript persistence is introduced. Existing owner/workspace access
checks, read-only tools, AI capability/model gates, budget/rate limits, and
explicit proposal confirmation remain authoritative. The response language
choice is validated by the API and stored only on the conversation owned by
the current user in the requested workspace.

## Acceptance and remaining release evidence

- English and Arabic interfaces must each retain their own language and
  direction while the response locale is selected independently.
- New conversations must default to Arabic in both interface locales; an
  explicit English choice must survive reopening the conversation.
- Chat output must preserve lists, headings, code, and tables without
  horizontal page overflow. Citations must resolve to the corresponding
  source record.
- Prompt cards, recent conversations, and knowledge tools must remain usable
  at desktop and mobile widths.
- A proposed Planner change remains a preview until the user chooses an
  existing apply control; access checks and revision checks remain in force.
- Release evidence still tracks disposable-database integration, bilingual
  browser and accessibility checks, refreshed visual baselines, the full
  browser matrix, MiniMax/model and privacy UAT, separated-account UAT, and
  production backup/rollback. Independent review and complete local gates are
  not prerequisites for merge; missing or failed evidence remains visible and
  does not make the release `Verified` or `READY`.
