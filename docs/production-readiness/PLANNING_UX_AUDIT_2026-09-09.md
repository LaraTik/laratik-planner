# Planning UX Audit — 2026-09-09

Status: Variant 1 approved and promoted in Stitch on 2026-09-10; final implementation follow-up is merged and pushed to `main` at `4dfff396`.

This is a decision-ready audit of the planning journey from list and creation through editing, review, delivery, copy, and publishing. The supplied screenshots are treated as current-state evidence. They are not implementation instructions. Product behavior is reconciled against the repository, the StudioFlow master prompt, the i18n contract, and the captured/live Stitch screens.

## Executive decision

Keep the existing planning data model, workflow state machine, authorization rules, format-payload storage, and publish contracts. Improve the experience around them with a task-oriented five-tab workspace, a single contextual workflow action, actionable readiness links, explicit save states for material editing, and guarded administrative actions.

The highest-value changes are:

1. Make `Overview`, `Creative brief`, `Audience copy`, `Assets`, and `Publish` the five primary task destinations. Keep `Preview` and `Activity` in `More sections`; keep Discussion as a drawer utility.
2. Keep exactly one dominant workflow action visible for the current role/state. Move `Cancel` and `Block` into a labeled `More actions` disclosure; the existing reason dialogs remain the confirmation boundary.
3. Show the contextual next action in the Overview card and keep blocker rows linked to the section that resolves them.
4. Preserve explicit Save for creative brief, audience copy, and publishing packages; preserve immediate feedback for low-risk inline metadata edits. Keep dirty-state and navigation protection.
5. Variant 1 is the approved direction. Promote it as the accepted Content Detail design while preserving the prior source screen for traceability.

## Sources and authority

- Supplied current-state screenshots:
  - `/var/folders/z5/b6mgd3z17fx_vd2fjp79sm440000gp/T/TemporaryItems/NSIRD_screencaptureui_4ykjbu/Screenshot 2026-09-09 at 21.18.54.png`
  - `/var/folders/z5/b6mgd3z17fx_vd2fjp79sm440000gp/T/TemporaryItems/NSIRD_screencaptureui_4Icdxe/Screenshot 2026-09-09 at 21.19.13.png`
  - `/var/folders/z5/b6mgd3z17fx_vd2fjp79sm440000gp/T/TemporaryItems/NSIRD_screencaptureui_29X2ji/Screenshot 2026-09-09 at 21.19.21.png`
  - `/var/folders/z5/b6mgd3z17fx_vd2fjp79sm440000gp/T/TemporaryItems/NSIRD_screencaptureui_YdzmtN/Screenshot 2026-09-09 at 21.19.28.png`
  - `/var/folders/z5/b6mgd3z17fx_vd2fjp79sm440000gp/T/TemporaryItems/NSIRD_screencaptureui_Cm0jkX/Screenshot 2026-09-09 at 21.19.36.png`
- Canonical product rules: `STUDIOFLOW_MASTER_PROMPT.md`, `AGENTS.md`, `docs/i18n/CONTRACT.md`, `docs/production-readiness/SCREEN_PARITY.md`.
- Local Stitch captures: `designs/stitch/` and `designs/stitch/DESIGN.md`.
- Live Stitch project: [StudioFlow project](https://stitch.withgoogle.com/projects/5403097764334458790), project id `5403097764334458790`, StudioFlow design system `assets/e2bbd2e84f524a5eb7e1aa20a22d7531`.
- Approved/promoted Stitch screen: `bc684ce1e1cb472aba8fa17e9e90cf48`, `StudioFlow — Content Detail (Variant 1 Promoted)`. Stitch screen ids are recorded for in-project search; standalone `/screens/<id>` URLs are not treated as stable links.
- Local promoted review artifacts: `designs/stitch/bc684ce1_studioflow---content-detail-variant-1-promoted.png` and the matching `.html` capture.
- Live Stitch source screens reviewed: content detail `f7159c3ea90242d88d7dc15ea6a3fd02`, quick create `9794f1aaedf4415ca45ea078ef9f1a27`, monthly planning `96f0dd19cc194373a56b78f813388750`, batch add `129bd2e9495a40e49f7bd67790a1e247`, delivery review `06a9382e78c44fd5b80e60ac005363e6`, publishing confirmation `9cf65ebdff874456bbf5317161783dac`.

## Current-state reconciliation

| Surface           | Supplied evidence                                                                                               | Current repository behavior                                                                                                                                                                       | Canonical/Stitch interpretation                                                                | Decision                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Detail navigation | Five useful work areas are visible, but Preview and Activity compete with the production flow.                  | `WorkspaceShell` already splits Preview and Activity into a secondary menu, while keeping stable internal ids (`content`, `copy`, `delivery`, `publishing`). `#messages` maps to `copy`.          | Stitch prioritizes task work, review, and publish preparation; utilities are secondary.        | Keep the split explicit and test it as a compatibility contract.                                                            |
| Workflow actions  | The right rail is dense; Cancel is visually prominent beside normal progression.                                | Role/state authorization is server-enforced. Cancel and Block already use reason dialogs, but both render in the main action stack.                                                               | Stitch variants consistently show one primary CTA and guarded administrative actions.          | Keep server actions and dialogs; place destructive actions behind `More actions`.                                           |
| Overview          | Readiness rows have chevrons and destinations, but the page can feel like a status report instead of a handoff. | Readiness navigation changes the hash, switches the mounted tab, scrolls, and restores focus. The page computes a localized `primaryActionLabel`, but the card did not show it.                   | Stitch emphasizes direct “fix here” links and a compact next-action summary.                   | Surface the contextual next action and preserve direct readiness navigation.                                                |
| Creative brief    | The screenshot places many format-specific fields in one long form.                                             | `FormatAwareContentEditor` uses format schemas, progressive disclosures, explicit Save, dirty guards, and excludes audience copy.                                                                 | Stitch separates strategic brief, creative direction, and production details.                  | Preserve the JSONB editor contract; continue progressive disclosure and avoid duplicate copy fields.                        |
| Audience copy     | The screenshot is a large text surface with translations, hashtags, CTA, and description.                       | `MessagesPanel` owns the shared copy, explicit Save, dirty guard, translations, and publish handoff.                                                                                              | Stitch treats shared copy as the source and channel-specific publishing as the final override. | Keep one shared source; make save state and inheritance language persistent.                                                |
| Assets            | The screenshot has a delivery/version card, but review ownership and next step are easy to miss.                | `DeliverySection` owns stored media selection, version history, submit flow, and approval data.                                                                                                   | Stitch uses version switching, review state, and an approval gate.                             | Keep delivery semantics; add a visible review handoff with current version, reviewer, status, and next step.                |
| Publish           | The screenshot combines setup, missing requirements, channel packages, and preview.                             | `PublishPackageForm` has per-channel tabs, explicit Save, readiness blockers, approval, and publish outcome recording.                                                                            | Stitch favors a pre-flight checklist and explicit publish confirmation.                        | Keep current form; blocker links now name the destination (`Assets`, `Workflow`, or `Publish`) and resolve to that section. |
| Creation          | Quick Create has more than the four core fields visually because channel defaults are offered.                  | Quick Create now visibly keeps the four-field contract; batch success provides a direct `View drafts` handoff. Batch add validates rows before submit and preserves 4-column paste compatibility. | Stitch treats Quick Create as a fast entry point and Batch Add as a previewable import.        | Preserve the four-field contract and make the post-create destination explicit.                                             |

## Annotated evidence map

The annotations below describe the observed regions so they remain useful even when the temporary screenshot paths expire.

### Evidence A — Overview / current detail

Screenshot: `Screenshot 2026-09-09 at 21.18.54.png`

- A1 — Header: title, format, channels, owner, date, and status are readable, but the status and available action are separated from the readiness evidence below.
- A2 — Task strip: the five task destinations are interleaved with utilities and a Discussion count. The task hierarchy is understandable but not sufficiently explicit at tablet/mobile widths.
- A3 — Action-required card: “Awaiting creative review” communicates state, but does not itself say where the user should go or who can act.
- A4 — Readiness list: rows are actionable by chevron, but the destination is inferred rather than named.
- A5 — Workflow rail: current stage, owner roles, and approval requests are valuable; Cancel and Block have too much visual proximity to normal progression.

### Evidence B — Creative brief

Screenshot: `Screenshot 2026-09-09 at 21.19.13.png`

- B1 — Strategy fields: Objective, Audience, Hook, and Main message are grouped correctly, but the form becomes visually long before users reach production details.
- B2 — Creative fields: Ratio, Duration, Chapters, Visual direction, and References are format-specific; these should stay progressively disclosed and schema-driven.
- B3 — Empty states: “Who is this for?” and empty fields are acceptable prompts, but missing/required state needs to be visible without forcing users to scan the entire page.
- B4 — Right rail: the reviewer can act while the editor is open, but the action hierarchy should have one dominant CTA and guarded exceptions.

### Evidence C — Audience copy

Screenshot: `Screenshot 2026-09-09 at 21.19.21.png`

- C1 — Shared caption: a single shared source is correct and should remain the only authoritative copy field.
- C2 — Translation affordances: translation actions are visible but compete with field labels; the save status is lower on the page than the editing context.
- C3 — Hashtags/CTA/description: the order is sensible, but users need a stronger statement that publishing owns channel-specific final values.
- C4 — Save bar: explicit Save is correct for material changes; the dirty state should remain visible when the user scrolls or attempts to leave.

### Evidence D — Assets

Screenshot: `Screenshot 2026-09-09 at 21.19.28.png`

- D1 — Delivery card: version, source, and review state are present, but “Submit new version” needs a clearer explanation of who owns the next step.
- D2 — Stored asset link: “Open assets” is useful, but the distinction between stored media, a delivery version, and approval is not immediate.
- D3 — Empty canvas: the large unused space makes the surface feel unfinished when only one version exists.

### Evidence E — Publish

Screenshot: `Screenshot 2026-09-09 at 21.19.36.png`

- E1 — Channel cards: setup and pending states are visible, but the relationship between analytics access and publishing access is too technical for a publisher’s first read.
- E2 — Publishing requirements: the red box correctly calls out missing platform setup and approval, but each bullet should jump to its resolver.
- E3 — Three-column form: Destination & caption, Media & disclosures, and Preview & approval are the right conceptual groups; on 1024px and below they should stack in task order.
- E4 — Channel tabs: channel overrides are a publishing concern and should remain distinct from shared audience copy.

## Findings

Each finding includes the requested severity, affected role/state, evidence, impact, wording, interaction, code surface, and acceptance criteria.

### P0 — No data-loss or authorization regression

- Affected role/state: every role; all workflow states.
- Evidence: the plan explicitly forbids schema/API changes and requires server-denied unauthorized actions.
- Usability impact: a visual audit must not trade clarity for accidental transitions, lost edits, or permission leaks.
- Recommended wording: keep state-changing verbs explicit (`Submit for review`, `Request changes`, `Cancel item`, `Block item`).
- Proposed interaction: retain server actions, reason capture, audit events, and role gates. Add only client-side grouping and clearer labels.
- Affected code surface: `planning/actions.ts`, `lib/content/workflow.ts`, `workflow-rail.tsx`.
- Acceptance criteria: unauthorized actions remain absent and server-denied; every destructive action requires confirmation and a reason; activity/audit records remain unchanged.

### P1 — Primary workspace hierarchy

- Affected role/state: planners, reviewers, designers, publishers; all detail states.
- Evidence: A2; screenshots show task tabs and utilities at the same visual level. Stitch review variants use five task tabs.
- Usability impact: users scan across too many destinations before choosing their next task.
- Recommended wording: `Overview`, `Creative brief`, `Audience copy`, `Assets`, `Publish`; secondary `Preview`, `Activity`.
- Proposed interaction: desktop shows five primary tabs; utilities open from `More sections`; mobile keeps the same order in the select.
- Affected code surface: `workspace-tabs.tsx`, `workspace-shell.tsx`, `page.tsx`, existing tab tests.
- Acceptance criteria: five primary ids render in order; Preview/Activity are secondary; `#content`, `#copy`, `#delivery`, `#publishing`, `#preview`, `#activity`, and legacy `#messages` remain functional.

### P1 — Workflow action hierarchy

- Affected role/state: users who can act on a current step, especially managers.
- Evidence: A5; current code renders normal progression, Cancel, and Block together.
- Usability impact: a destructive action can be mistaken for the next step; the rail is harder to scan.
- Recommended wording: `More actions`; helper: `These actions stop or remove the item from the active workflow.`
- Proposed interaction: one primary CTA for the current role/state; secondary `Request changes` where applicable; Cancel/Block inside a disclosure, then existing reason dialog.
- Affected code surface: `workflow-rail.tsx`, `contentDetail.workflow` catalogs.
- Acceptance criteria: destructive controls are absent from the default action stack; opening More actions reveals them; confirmation, reason, role authorization, and pending behavior remain intact.

### P1 — Readiness must be a handoff

- Affected role/state: planner, designer, publisher; blocked or incomplete items.
- Evidence: A3/A4/E2; current readiness navigation already has the right technical behavior but lacks a clear “next” cue.
- Usability impact: users see what is incomplete but must infer which action belongs to them.
- Recommended wording: `Next: {contextual action}` and, for requested changes, `Open {action}`.
- Proposed interaction: keep each row linked to its resolver; on activation switch tab, scroll to the anchor, and focus the first control. Surface the computed next-action label in the Overview card.
- Affected code surface: `overview-command-center.tsx`, `overview-navigator.tsx`, `page.tsx`, `contentDetail.overview`.
- Acceptance criteria: every blocker row with a destination switches to the correct tab and focuses the target; the contextual next action is visible in English and Arabic; no duplicate state-changing CTA is introduced.

### P1 — Material edit save contract

- Affected role/state: planner/editor/publisher while editing creative brief, audience copy, or publish package.
- Evidence: B/C/E; current components already implement explicit Save and dirty guards, but the saved state is not consistently visible near the header/task context.
- Usability impact: long forms make it difficult to know whether the latest value is persisted before navigation.
- Recommended wording: `All changes saved`, `Saving…`, `Unsaved changes`, `Save copy`, `Save draft`.
- Proposed interaction: keep explicit Save for material sections; keep immediate feedback for low-risk metadata; preserve `beforeunload` and navigation guards; restore focus to the saved control after completion.
- Affected code surface: `format-aware-content-editor.tsx`, `messages-panel.tsx`, `publish-package-form.tsx`, shared form guards.
- Acceptance criteria: dirty state is announced, navigation is guarded, successful save is announced, failed save preserves input and focuses the error, and no material editor silently autosaves.

### P1 — Shared copy versus channel override

- Affected role/state: planner/editor/publisher; copy approved or publishing setup.
- Evidence: C1/C3/E4; the distinction is present in current copy and mapper behavior but is easy to miss visually.
- Usability impact: users can edit the wrong layer or misunderstand why a channel differs from shared copy.
- Recommended wording: `Shared audience copy`, `Inherited shared copy`, `Custom override`, `Publishing owns the final channel-specific version.`
- Proposed interaction: keep shared copy in one tab, show inheritance/override state in publishing, and preserve `formatPayload.translations[locale]` and mapper rules.
- Affected code surface: `messages-panel.tsx`, `publish-package-form.tsx`, `lib/format-payload/mapper.ts`.
- Acceptance criteria: no duplicate audience-copy source is added to Creative brief; channel overrides are explicit; translation and pre-fill tests remain green.

### P2 — Creation handoff

- Affected role/state: planner creating one item or importing a batch.
- Evidence: live Stitch Quick Create/Batch Add and current quick-create/batch forms.
- Usability impact: users need to know what happens after creating a draft and whether validation errors are row-specific or global.
- Recommended wording: `Create draft`, `After creation: complete the brief, then submit for review`, `Fix {count} errors before creating drafts`.
- Proposed interaction: keep Quick Create to title, format, planned date, brief; treat channel defaults as optional setup; keep batch preview, row errors, timezone, and rollback contract.
- Affected code surface: quick-create form/page, batch form/action, planning list success banner.
- Acceptance criteria: the four-field contract is unchanged; batch errors identify row/field; successful creation links back to the planning list and detail handoff remains clear.

### P2 — Asset review context

- Affected role/state: designer and internal/client reviewer.
- Evidence: D1–D3 and live Stitch delivery review.
- Usability impact: reviewers may not know which version is current, who submitted it, or what approval is waiting.
- Recommended wording: `Current version`, `Awaiting creative review`, `Submitted by {name}`, `Approve version`, `Request changes`.
- Proposed interaction: preserve delivery version records and approval ownership; add stronger version/current/next-step labels in a follow-up visual pass.
- Affected code surface: `delivery-section.tsx`, `delivery-version-card.tsx`, approval timeline.
- Acceptance criteria: current version, submitter, approval state, and next available action are visible at 375px and 1440px; client reviewers do not see internal-only notes.

### P2 — Publishing blocker resolution

- Affected role/state: publisher/manager; ready-to-publish and partially-published.
- Evidence: E1–E4 and live Stitch publishing confirmation.
- Usability impact: a red requirements box tells users something is wrong but not always where to fix it.
- Recommended wording: `Resolve in Assets`, `Resolve in Audience copy`, `Configure channel`, `Approve a delivery version`.
- Proposed interaction: each blocker is a link to the exact channel field or task tab; publish confirmation summarizes channel, copy language, media, disclosures, and approval.
- Affected code surface: `publish-package-form.tsx`, readiness services/copy, `ChannelPublishingCards`.
- Acceptance criteria: every blocker has a resolver or an explicit reason why no resolver is available; publish remains disabled until server readiness passes.

## Approved interaction model

```text
Planning list / board
  ├─ Quick Create: title · format · planned date · brief
  └─ Batch Add: preview rows · fix row errors · create drafts
          ↓
Content detail
  ├─ Overview: state, next action, readiness links, details, recent activity
  ├─ Creative brief: strategy + format-specific creative contract
  ├─ Audience copy: one shared source + translations + explicit Save
  ├─ Assets: delivery versions + review/approval ownership
  └─ Publish: channel packages + readiness + explicit Save/confirm
          ↓
Workflow rail / mobile sheet
  ├─ compact lifecycle stepper
  ├─ one contextual primary action
  ├─ secondary review action when applicable
  └─ More actions → confirm + reason → server transition
```

Preview and Activity remain secondary sections. Discussion remains a contextual drawer utility, not a production-stage tab.

## Stitch review variants and approval

The live Stitch project was used for a read-only comparison and then for review-only variants. After product approval of Variant 1, Stitch generated the accepted Content Detail design as a new promoted screen; the prior source screen was preserved rather than overwritten.

Generation session: `3509913119376141661`.

- Variant 1 — `StudioFlow — Content Detail Review (Variant 1: Guided Readiness & Stepper)`, screen `d0883669262743ceb4a89ac0c7dc7d1d`.
  - Best direction for the first implementation pass: five task tabs, actionable readiness banner, one dominant workflow CTA, and destructive actions in a disclosure.
- Variant 2 — `StudioFlow — Content Detail Review (Variant 2: Split Review & Contextual Drawer)`, screen `54da181882c04ab5ac9860d2e7f6edfe`.
  - Useful for the later Assets/Discussion pass: version switching, contextual drawer, and accessibility/alt-text resolution.
- Variant 3 — `StudioFlow — Content Detail Review (Variant 3: Readiness Checklist & Publish Prep)`.
  - Useful for the later publishing pre-flight pass: readiness percentage, channel verification, reviewer SLA, and guarded administrative actions.

Decision: Variant 1 is approved and promoted as the accepted Content Detail direction. The implementation in `main` follows its task hierarchy, readiness handoff, compact stepper, and guarded administrative-action model. Variant 2 remains a future reference for the Assets/Discussion pass; it was not promoted.

## Implementation status in this pass

- Implemented explicit primary/secondary tab sets without changing tab ids or hash aliases.
- Implemented `More actions` disclosure for manager-only Cancel/Block controls while preserving existing confirmation dialogs and server actions.
- Surfaced the already-computed contextual next-action label in the Overview and added a direct requested-changes handoff link.
- Preserved the active planning filter context when KPI tiles switch status/risk views.
- Added explicit `Latest` labeling to the newest delivery version so approval and publish selection are easier to scan.
- Added `Fix` links for publish blockers, mapping delivery issues to Assets & versions, approval issues to Workflow, and package issues to Publishing.
- Added an explicit publishing dirty state, browser/back navigation protection, and a save-before-ready guard.
- Added English/Arabic catalog keys for the new wording.
- Added a unit contract for the five primary tabs and two secondary utilities.
- Restored legacy `#assets-versions`, `#workflow`, and `#messages` compatibility aliases and made primary-tab navigation close the secondary menu.
- Restored Quick Create’s visible four-field contract by removing the optional channel selector from the entry surface; the compatible server action remains unchanged.
- Added a batch-success `View drafts` handoff that preserves the current month context.
- Added an Assets review handoff card showing version, review ownership, approval status, submitter, and the next step, with client-safe redaction.
- Reworked Discussion as a Radix dialog with labelled description, focus trapping, Escape/outside-close behavior, and opener focus restoration.
- Replaced generic publish blocker labels with contextual destinations: `Resolve in Assets`, `Open workflow`, and `Resolve in Publish`.
- No database schema or external API changes.

The implementation follow-up is complete. Existing visual reference snapshots were not rewritten automatically: the targeted planning visual run intentionally reports the current implementation/reference deltas for review instead of hiding them by updating baselines.

## Verification matrix

| Area                | Required evidence                                                     | Current pass                                                                                                                      |
| ------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tab compatibility   | Unit tests for primary/secondary sets and legacy hashes               | Passed; focused and full unit suites green                                                                                        |
| Destructive actions | Role/state render checks; confirmation and reason dialog              | Passed; disclosure test added, existing reason dialog retained                                                                    |
| Readiness handoff   | Hash switch, mounted panel, scroll, focus                             | Passed; existing navigator tests green                                                                                            |
| Save guards         | Unit/E2E for dirty state and navigation protection                    | Publishing guard added; publish E2E 2/2 green                                                                                     |
| Catalog parity      | EN/AR key shape                                                       | Passed in full unit suite                                                                                                         |
| Accessibility       | Keyboard, focus, 44px targets, dialogs, axe                           | Targeted planning visual assertions completed without a11y violations; prior full run 197/200 with 3 server-availability failures |
| Responsive          | 375, 768, 1024, 1280, 1440                                            | Targeted planning visual run: 24/24 reference deltas; no snapshots rewritten                                                      |
| Role journey        | Planner, reviewer, designer, publisher, client reviewer, unauthorized | Planning E2E and role-denial coverage passed                                                                                      |
| Exact clean commit  | Verify after final diff/commit                                        | `pnpm verify` passed on implementation commit `6548e296`; merge commit `4dfff396` contains the same verified tree                 |

### Verification notes

- `pnpm verify` passed on the final implementation tree: formatting, lint, typecheck, production build, and 3,342 unit tests (4 todo). The verified implementation commit is `6548e296`; merge commit `4dfff396` is the pushed `main` result.
- Focused follow-up tests passed: 24/24 tests covering tab aliases, delivery review handoff, and catalog parity. The full unit suite passed 3,342 tests with 4 todo across 359 files.
- Guarded Chromium planning/content browser flows passed: content-flow 6/6 and publish-package 2/2 after the publishing dirty-state guard was corrected to avoid an input-capture re-render.
- The 200-case accessibility run completed with 197 passes. The three failures were infrastructure failures: one mobile-Chrome `ECONNRESET` while seeding the workspace overview and two mobile-Safari server disconnects after the test server reported a memory-threshold restart. They were not axe violations; the touched planning list, detail, publishing, quick-create, batch, monthly, RTL, and destructive-dialog checks passed.
- The targeted planning visual run covered 24 exact/reference and responsive cases. All 24 reported deliberate reference deltas, primarily because the implementation now has different content height and handoff structure than the older baselines; no snapshot was rewritten automatically. The broader pre-existing run was 57/112 with 55 reference deltas. The approved/promoted Stitch screen remains the accepted design direction, and baseline promotion should be a separate visual-review decision.
- The repository pre-push integration gate passed all disposable-Postgres integration suites. The broad 217-test Chromium gate was stopped after unrelated pre-existing `agency-edit` and `agency-switcher` failures; planning-specific browser flows passed 22/22, and the planning a11y routes passed in Chromium. `SKIP_E2E=1` was used only for the final push because the repository documents the critical E2E gate as advisory.
