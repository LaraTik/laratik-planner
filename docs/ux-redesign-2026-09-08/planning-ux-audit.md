# Planning UX audit — idea to publishing

**Date:** 2026-09-08  
**Scope:** Planning list, idea creation, content detail, workflow, discussion, and the path from an idea to publishing.  
**Out of scope:** Batch Add, Board, and Calendar as primary audit surfaces.  
**Constraint:** The first improvement pass is UI, copy, interaction, and information architecture only. It should not require schema or API changes.

## Executive summary

The Planning list and Quick Create flow are understandable enough for a first draft. The detail workspace is where the experience becomes difficult: too many concepts are exposed at the same time, the workflow rail competes with the work surface, future publishing blockers appear before they are actionable, and the boundary between the shared Copy and channel-specific Publishing content is not obvious.

The product should guide the user through one current stage at a time:

> **Plan → Content → Copy → Assets → Publish**

Preview, Activity, and Discussion should remain available, but they are secondary utilities rather than equal-weight stages. The existing hashes and deep links should remain valid while the visible navigation becomes simpler.

The most valuable first changes are:

1. Make the current stage, next action, and responsible role the primary workflow message.
2. Hide or defer publishing-only readiness blockers until the idea reaches the publishing stage.
3. Give every empty state a clear reason, next step, and owner.
4. Explain the difference between shared Audience copy and per-channel Publishing setup.
5. Use progressive disclosure for translations, AI, metadata, and advanced publishing controls.
6. Make the mobile stage selector compact and keep all deep links and keyboard paths intact.

## Severity-ranked findings

| ID   | Severity | Finding                                                                                                                                            | User impact                                                                                           | Recommended response                                                                                                                         |
| ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | P0       | Draft Overview shows future publishing blockers such as missing disclosures, hashtags, and first comments.                                         | Users think a new idea is already broken and do not know what to do first.                            | Make readiness stage-aware. For draft and review stages, show the next content action and defer publishing blockers.                         |
| F-02 | P0       | Delivery is blank for a draft when the user cannot submit a delivery yet.                                                                          | The user cannot tell whether the page failed to load, is unavailable, or is waiting for another role. | Render an explicit “Assets come after the brief is approved” state with responsible role and next transition.                                |
| F-03 | P1       | Seven equal-weight tabs plus the workflow rail expose too many navigation choices.                                                                 | The workspace feels like a form system rather than a guided process, especially on mobile.            | Promote Plan/Content/Copy/Assets/Publish; move Preview and Activity to a secondary menu while preserving hashes.                             |
| F-04 | P1       | “Content”, “Copy”, “Delivery”, and “Publishing” are technically accurate but do not explain the user’s job in each area.                           | New users do not know where to write the brief, prepare words, upload files, or finish a channel.     | Use task-oriented labels and one-sentence purpose text: Creative brief, Audience copy, Assets, Publishing setup.                             |
| F-05 | P1       | The Content editor presents strategy, audience, hook, message, visuals, references, notes, translations, and AI affordances together.              | Users face a large blank surface and cannot distinguish required work from optional enrichment.       | Group fields by outcome, mark required/optional, add examples, and disclose advanced/translation controls.                                   |
| F-06 | P1       | Publishing combines channel selection, readiness, destination, copy, media, disclosures, preview, approval, and save actions in one dense surface. | Blockers are hard to locate and users do not know which fix will unblock the selected channel.        | Use a guided per-channel checklist. Each blocker should link directly to its fix and show what remains.                                      |
| F-07 | P2       | Shared Copy and channel Publishing copy are related but the handoff is described only in supporting text.                                          | Users can overwrite a channel unexpectedly or wonder why a shared caption is not the final post.      | Add a persistent “shared source → channel-specific final version” explanation beside the channel readiness summary.                          |
| F-08 | P2       | Workflow rail shows many stages and destructive actions together.                                                                                  | The full lifecycle distracts from the current task; Cancel and Block feel too prominent.              | Show current stage, next action, responsible role, and a collapsed “View history” disclosure. Keep destructive actions in a lower-risk menu. |
| F-09 | P2       | Planning list exposes many filters and operational terms before the user has chosen a task.                                                        | First-time users may not know what “health”, “stage”, or “owner” mean.                                | Keep Search, Status, and Date visible; place advanced filters under “More filters” with examples/tooltips.                                   |
| F-10 | P2       | Mobile keeps a horizontally scrollable tab strip and the fixed bottom navigation competes with form actions.                                       | Users miss stages and may not see the final action without scrolling around overlays.                 | Use a compact stage selector on small screens and reserve bottom safe-area space for actions.                                                |
| F-11 | P2       | Activity and Discussion are useful but visually compete with work stages through badges and controls.                                              | Users may treat collaboration history as another required step.                                       | Keep them discoverable as utilities; show counts only when action is required.                                                               |
| F-12 | P3       | Draft form guidance is short but does not explain what happens after creation.                                                                     | Users create an empty draft without understanding the review/design handoff.                          | Add a short “What happens next” explanation beside Create draft.                                                                             |

## Live walkthrough evidence

The walkthrough used the local seeded application in English/LTR and Arabic/RTL. Evidence was captured at 1440px, 1024px, 768px, and 375px targets; representative screenshots are stored outside the repository in the Codex visual evidence directory for this run.

### Observed routes and states

| Surface             | Local route/state                      | Evidence                                                                                                                             |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Planning list       | `/app/w/{slug}/planning`               | 1440px list had KPI tiles, seven filters, density control, and four top-level actions.                                               |
| Create idea         | `/app/w/{slug}/planning/new`           | Required title, format, planned publish, optional brief, and active channels.                                                        |
| Overview            | `/app/w/{slug}/planning/{id}#overview` | Draft showed a “6 blockers to publish” card even though the immediate task was preparing the brief.                                  |
| Creative brief      | `#content`                             | Strategy, audience, hook, main message, visual fields, references, notes, translation controls, and AI affordances visible together. |
| Audience copy       | `#copy`                                | Shared caption/hashtags/CTA/first comment plus per-channel readiness summaries.                                                      |
| Assets              | `#delivery`                            | Draft state was visually empty instead of explaining why assets are not yet actionable.                                              |
| Preview             | `#preview`                             | Useful simulator, but it is a secondary utility and should not compete with the creation stages.                                     |
| Publishing setup    | `#publishing`                          | Three channel cards and multiple readiness/publishing sections created a dense, blocker-heavy surface.                               |
| Activity            | `#activity`                            | Empty state was understandable and appropriate as a secondary utility.                                                               |
| Workflow/discussion | Right rail and discussion trigger      | Full workflow was always present; discussion was accessible but visually secondary only by icon/count.                               |

### Responsive and localization observations

- At 375px, the Quick Create form itself stacked correctly, but the fixed bottom navigation competed with the lower form area and action affordances.
- At 375px, the detail workspace showed only part of the tab strip, requiring horizontal discovery. A compact selector would expose the complete path more clearly.
- Arabic rendered with `lang="ar"` and `dir="rtl"` without document-level horizontal overflow. Platform names, handles, URLs, and account identifiers should continue to use direction isolation.
- “Skip to main content” remained English in the Arabic walkthrough, which is a localization defect outside the planning detail payload but visible in this journey.
- Deep links and the `#messages` compatibility alias worked. The visible simplification must keep `#overview`, `#content`, `#copy`, `#delivery`, `#preview`, `#publishing`, `#activity`, and `#messages` working.

## Current journey audit

| Surface          | User goal                          | Current behavior                                                                       | Confusion/risk                                                                                                     | Recommended change                                                                                                                     |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Planning list    | Find an idea or start one          | Dense operational list with KPIs, filters, and multiple actions.                       | The page serves power users first; a new user cannot tell which action starts the work.                            | Primary CTA “Create idea”; keep Search/Status visible; collapse advanced filters. Explain stage and health terms inline.               |
| Quick Create     | Capture a useful idea quickly      | Four core fields plus channel selection.                                               | “Brief” is optional but its role in the next stage is not explicit. “Planned publish” can sound like a commitment. | Rename “Quick Create” to “Create idea”; call the field “Short brief”; say “Target publish date”; add examples and “What happens next”. |
| Overview         | Know what to do now                | Shows next action, readiness rows, details, activity, and future publishing readiness. | Future blockers dominate the first impression.                                                                     | Stage-aware Overview: current task, owner, next transition; defer future blockers.                                                     |
| Creative brief   | Define intent and direction        | Many format-specific fields are visible at once.                                       | Empty optional fields look like missing work; “Content” does not tell the user this is the brief.                  | Label “Creative brief”; group “Required to submit”, “Helpful context”, “Assets”; disclose translations and AI.                         |
| Audience copy    | Write the words the audience sees  | Shared source copy plus channel readiness cards.                                       | Users may not know whether this is final or inherited.                                                             | Explain shared source vs channel final version; use “Audience copy” throughout.                                                        |
| Assets           | Attach approved media              | History and submit form are available in eligible statuses; draft can be empty.        | Empty draft surface looks unfinished.                                                                              | Explain that assets become actionable after brief approval and name the responsible role.                                              |
| Preview          | Check how the idea will look       | Platform simulator with first channel and format modes.                                | Users may read it as a required step or expect all channels.                                                       | Keep as utility; say “Preview is optional. Publishing setup controls each channel.”                                                    |
| Publishing setup | Configure and approve each channel | Dense multi-section channel form with repeated save/readiness controls.                | Too many decisions at once; blocker fixes are not close to the problem.                                            | Per-channel guided checklist, one blocker/fix at a time, clear draft vs ready state.                                                   |
| Activity         | Understand history                 | Empty state and timeline.                                                              | Low risk; badge can imply required work.                                                                           | Keep secondary; show count only when there is meaningful history or a mention requiring attention.                                     |
| Workflow rail    | Understand status and ownership    | Full lifecycle, roles, approvals, and actions visible.                                 | Full state model overwhelms the current task.                                                                      | Current stage + next action + owner; detailed history behind disclosure.                                                               |
| Discussion       | Ask or resolve a question          | Icon trigger with count opens a drawer.                                                | Discoverability depends on icon literacy.                                                                          | Keep trigger, add accessible label and show “Discussion” text at larger widths.                                                        |

## Proposed target information architecture

### Primary progression

1. **Plan** — idea title, format, target publish date, channels, short brief.
2. **Content** — creative brief: objective, audience, hook, main message, visual direction.
3. **Copy** — shared Audience copy: caption, hashtags, CTA, first comment, location.
4. **Assets** — media and versions, review/approval handoff.
5. **Publish** — per-channel destination, language, metadata, disclosures, final approval, outcome.

The current public hashes remain valid. “Plan” can remain the Planning list/create surface, while the detail page keeps `#overview` as the command center and maps visible labels to the clearer task language. Preview (`#preview`) and Activity (`#activity`) remain available from a secondary “More” control. Discussion remains a utility in the workspace header.

### Stage-aware Overview model

The Overview should answer, in order:

- **You are here:** current stage and status.
- **Do this next:** one action written as a verb.
- **Who owns it:** responsible role or person.
- **What is complete:** only the signals relevant to this stage.
- **What comes later:** collapsed, non-blocking preview of future stages.

For a draft, the headline should be “Complete the brief and submit for review.” Publishing blockers should not be counted as current blockers. Once an item is ready to publish, the full channel readiness count can become prominent.

### Workflow rail model

Default rail content:

| Element          | Example                          |
| ---------------- | -------------------------------- |
| Current stage    | Planning — Idea drafted          |
| Next action      | Complete the brief               |
| Responsible role | Content planner                  |
| Transition       | Submit for content review        |
| Secondary        | View workflow history (11 steps) |

Keep Block and Cancel in a secondary action menu with confirmation language. Preserve role permissions and existing server-side authorization.

## Recommended wording and helper text

| Current concept | Preferred label     | Helper text/example                                                                                   |
| --------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| Quick Create    | Create idea         | Start with the smallest useful version. You can add creative details after saving.                    |
| Title           | Idea title          | Use a short name your team can recognize later. Example: “Ramadan launch — first teaser”.             |
| Format          | Content format      | Choose the shape of the idea. This controls which creative fields appear next.                        |
| Planned publish | Target publish date | A planning target, not a final publishing confirmation.                                               |
| Brief           | Short brief         | What should the audience understand, feel, or do? Include the audience and one key message.           |
| Content         | Creative brief      | Turn the idea into direction a writer, designer, and reviewer can act on.                             |
| Copy            | Audience copy       | The shared source for the words your audience will read. Each channel may adapt it before publishing. |
| Delivery        | Assets              | Add approved media versions when the brief is ready for design review.                                |
| Publishing      | Publishing setup    | Finish each channel: destination, language, metadata, disclosures, and approval.                      |
| Preview         | Preview             | Optional check of how the current copy/media may appear on a channel.                                 |
| Activity        | Activity            | History and decisions; no action is required unless a teammate mentions you.                          |

### Field guidance rules

- Use “Required” only when the user cannot complete the current transition without the field.
- Use “Optional” where omission is valid, not as a generic label on every field.
- Put examples in helper text or placeholders, never as the only label.
- Explain the consequence of a field: “This appears in the first line of the post” is better than “Enter caption”.
- Keep AI, translation, metadata, and advanced overrides behind a disclosure titled with the user outcome, such as “Add translations” or “Advanced publishing options”.
- Keep inline validation near the field and tell the user how to fix it. Do not rely only on a red summary at the top.

## Mobile, accessibility, and localization requirements

### Mobile

- Use a compact accessible stage selector below 768px; preserve the deep-link hash and active-stage announcement.
- Keep primary stages visible as a short, ordered progression; Preview and Activity belong in “More sections”.
- Reserve bottom safe-area space so fixed navigation does not cover the last field or primary action.
- Keep touch targets at least 44px and avoid horizontal page overflow.

### Accessibility

- Preserve semantic tabs/navigation and visible focus rings.
- Every icon-only control needs an accessible name; Discussion must announce its count and purpose.
- Every field needs a programmatic label, required/optional state, helper association, and inline error association.
- Use live regions for save status, blocker changes, and async publishing results.
- Run axe against loaded and empty states, not only the initial Overview.

### Localization and RTL

- Add all new labels, helper text, empty states, and status explanations to both message catalogs with identical key shapes.
- Verify EN/LTR and AR/RTL at 375px, 768px, 1024px, and 1440px.
- Use logical CSS properties and content-driven direction for bilingual fields.
- Keep URLs, handles, hashtags, emails, IDs, and channel names direction-isolated.
- Verify Western digits, workspace timezone, and Arabic editorial quality with a native reviewer.

## Phased implementation plan

### Phase 1 — clarity and safe progressive disclosure

- Ship the renamed task-oriented labels and helper text.
- Add the Create idea “What happens next” guidance.
- Add the explicit Assets/Delivery empty state for non-submittable stages.
- Make draft Overview hide/de-emphasize future publishing blockers.
- Preserve schema, API contracts, URLs, hashes, permissions, and existing test IDs.

**Acceptance criteria:** A new user can create an idea, identify the next step from Overview, understand why Assets is empty, and reach the next stage without reading documentation.

### Phase 2 — navigation and workflow simplification

- Add the primary stage selector: Plan, Content, Copy, Assets, Publish.
- Put Preview and Activity behind a secondary menu on desktop and a compact selector on mobile.
- Reduce the workflow rail to current stage, next action, owner, and collapsed history.
- Keep Discussion visible and accessible.

**Acceptance criteria:** All existing hashes and deep links work; keyboard users can reach every section; mobile users can select every stage without horizontal hunting.

### Phase 3 — guided detail surfaces

- Break the Creative brief into Required to submit, Helpful context, and Assets/visual direction.
- Add examples and completion guidance to each required field.
- Add a shared-copy handoff explanation and progressive disclosure for translations/AI.
- Rebuild Publishing as a per-channel checklist with direct blocker fixes.

**Acceptance criteria:** A user can identify the next missing field or channel fix from the section where the problem is shown; no user must understand JSON, readiness internals, or inheritance terminology.

### Phase 4 — evidence and refinement

- Verify EN/AR, LTR/RTL, 375/768/1024/1440 layouts.
- Run keyboard and focus review, axe, and existing Planning/Content unit and E2E suites.
- Test create, save, tab switching, deep links, blockers, empty states, and publishing readiness.
- Record screenshots and results against the exact clean commit.

**Acceptance criteria:** No regression to existing URLs, hashes, permissions, saved content, or test IDs; all changed copy has catalog parity and Arabic review.

## Verification checklist

- [ ] English/LTR: Planning → Create idea → Overview → Creative brief → Audience copy → Assets → Preview → Publish.
- [ ] Arabic/RTL: same journey, including direction-aware inputs and mixed-direction channel data.
- [ ] Viewports: 375px, 768px, 1024px, 1440px.
- [ ] Keyboard: tab order, focus visibility, selector/menu operation, disclosures, dialogs, and form submission.
- [ ] Axe: loaded, empty, blocked, and validation-error states.
- [ ] Creation and saving: validation, successful draft creation, saved content, and save status.
- [ ] Navigation: tab switching, back/forward, all hashes, and `#messages` alias.
- [ ] Workflow: role permissions, current stage, next action, discussion, block/cancel confirmations.
- [ ] Publishing: no-channel, missing-delivery, missing-copy, missing-disclosure, and ready states.
- [ ] Existing Planning and Content unit/E2E suites.
- [ ] No schema or API change in Phase 1.

## Conclusion

The product does not need more capability to become easier to use. It needs stronger sequencing and clearer language. The first pass should make the next action obvious, keep future work out of the way, and explain the purpose of each surface before asking users to fill it in. That work can be delivered without changing stored content or the existing planning/publishing contracts.
