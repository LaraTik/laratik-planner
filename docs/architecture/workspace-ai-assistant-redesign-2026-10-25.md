# Workspace AI Assistant redesign — 2026-10-25

## Product request and reference

The redesign request describes an Arabic-first AI Workspace Copilot with four
areas: the existing StudioFlow app navigation, a compact conversation-history
panel, a primary conversation workspace, and tools/context that open only when
needed. It also requires a fixed Arabic response default independent of
interface locale or the language of source data, an explicit per-conversation
language choice, citations, reviewable changes, and user confirmation before
any Planner write.

The supplied screenshot depicts the pre-redesign page. It is useful as a
current-state reference, while the target is specified in the accompanying
text. It does not provide target pixel measurements or a target screenshot.

## Audit of the current screen

- Prompt cards and knowledge management occupied the top of the page before
  the conversation area. The conversation list was a second large card rather
  than a compact return path.
- The answer was rendered as plain text. Findings and recommendations shared
  one section, while the evidence list and activity timeline stayed expanded.
- The interface locale was the only available language signal; session
  metadata did not store a response language.
- Session text is intentionally browser-memory-only. Reopening a session
  restores its metadata and saved proposals, not the transcript.
- The existing service already resolves an explicit plan/content reference,
  produces deterministic and model findings with evidence IDs, and prepares
  proposals that are checked again against role, workspace, status, revision,
  and prior value before a separate confirmation can apply them.

## Implemented direction

- Keep the app shell and its right-side StudioFlow navigation unchanged.
- Place the conversation and composer first. On wide screens, a compact
  conversation panel sits at the inline end and can be hidden. On smaller
  screens, history opens in a dialog.
- Move prompt search, saved prompt authoring, knowledge management, and
  context tools into a Tools and context dialog. Prompt execution returns the
  user to the conversation.
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
- Prompt and knowledge panels must be on-demand; history must remain usable at
  desktop and mobile widths.
- A proposed Planner change remains a preview until the user chooses an
  existing apply control; access checks and revision checks remain in force.
- Required release gates still include migration drill, disposable database
  integration tests, bilingual browser and accessibility checks, refreshed
  visual baselines, the full browser matrix, independent review, MiniMax/model
  and privacy UAT, separated-account UAT, and production backup/rollback
  evidence. A local build or the focused language unit tests do not close
  those gates.
