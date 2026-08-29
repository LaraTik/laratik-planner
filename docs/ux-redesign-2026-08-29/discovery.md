# UX Architecture Review — Discovery Report

**Date:** 2026-08-29
**Scope:** Planning content detail / edit / publishing experience
**Reviewer:** Mavis

---

## 1. Current architecture

### 1.1 Stack and shape

- Next.js 16 + React 19 (Server Components by default)
- Drizzle ORM + Postgres
- next-auth (5.0.0-beta.32) with role-aware workspace context
- Radix UI primitives + Tailwind v4
- date-fns + date-fns-tz for timezone handling

### 1.2 Routes

| Path                                  | Role                                                 |
| ------------------------------------- | ---------------------------------------------------- |
| `/app/w/[slug]/planning`              | List / filters / board                               |
| `/app/w/[slug]/planning/[id]`         | **Content detail workspace** (the page under review) |
| `/app/w/[slug]/planning/[id]/publish` | **Publish package configurator** (per-channel)       |
| `/app/w/[slug]/planning/edit/[id]`    | **Full edit form** (separate page)                   |
| `/app/w/[slug]/planning/new`          | Quick create                                         |
| `/app/w/[slug]/planning/batch`        | Batch create                                         |
| `/app/w/[slug]/ai-settings`           | Agency AI config                                     |

### 1.3 Domain model (key entities)

- `contentItems` — title, format, brief, plannedPublishAt, status, approvedDeliveryVersionId, formatPayload, campaignId, contentPillarId, designerId, owner
- `contentItemChannels` — channel selection (per content)
- `socialChannels` — workspace's connected accounts
- `platformPayload` (on `contentItemChannels`) — discriminated-union publish package per channel
- `deliveryVersions` — design versions; `isFinalApproved` boolean drives "approved creative"
- `approvalRequests` / `approvalDecisions` — review lifecycle
- `comments` / `commentMentions` — discussion
- `activityEvents` — append-only audit log of real workflow events (kind ∈ status_transition, brief_updated, delivery_submitted, comment_added, ai_draft_applied, publication_recorded, blocked, claimed)
- `aiFeatureSettings` — agency-level AI allowlist

### 1.4 Workflow state machine

11 statuses: `draft → content_review → changes_requested ↺ → approved_for_design → in_design → creative_review → ready_to_publish → partially_published → published`, plus terminal branches `blocked`, `cancelled`. `workflow-explanations.ts` already supplies the human label + responsible roles + "next" copy for every status.

### 1.5 Roles

- `workspace_manager` — full control
- `content_planner` — edits draft / changes_requested
- `designer` — submits delivery versions
- `internal_reviewer` — approves content + creative
- `client_reviewer` — co-approves creative for client-facing
- `publisher` — records publication outcomes
- `viewer` — read-only

---

## 2. Relevant files / components

### 2.1 Detail page (`/app/(app)/app/w/[slug]/planning/[id]`)

- `page.tsx` (579 LOC) — server component, orchestrates 11 parallel reads (channels, deliveries, comments, readiness, channel payloads, AI settings, etc.), composes the page
- `workflow-bar.tsx` (623 LOC) — full 11-status pipeline + role-aware action buttons
- `inline-editable-fields.tsx` — three thin client wrappers (brief / title / date) over `InlineEditableField`
- `delivery-section.tsx` (231 LOC) — delivery history + submit form
- `discussion-section.tsx` (131 LOC) — comments
- `ai-assistance-section.tsx` (656 LOC) — capability grid (5 actions × status / context toggles)
- `reset-idea-section.tsx` (69 LOC) — destructive operator zone

### 2.2 Shared / cross-cutting

- `components/planning/planning-header.tsx` — compact header (title, status, channels, date)
- `components/planning/planning-section.tsx` — uniform card wrapper
- `components/planning/readiness-panel.tsx` — blocker list with anchor "Fix" links
- `components/planning/channel-publishing-card.tsx` (279 LOC) — per-channel publication outcome form
- `components/planning/activity-timeline.tsx` — append-only event log
- `components/forms/format-payload-editor.tsx` (310 LOC) — per-format structured fields (caption, hook, CTA, scenes, …)
- `components/workspace/top-tabs.tsx` — sticky tab strip (already used on Brand Kit)
- `components/workspace/platform-icon.tsx` — existing icon helper
- `lib/publishing/readiness.ts` (755 LOC) — server-side readiness evaluation (one source of truth)
- `lib/publishing/readiness-presentation.ts` — turns `channels[0].payload.caption` into "Add a caption" + anchor
- `lib/content/workflow-explanations.ts` — plain-English status copy

### 2.3 Publish package page

- `publish/page.tsx` (202 LOC) — server: loads readiness + channels
- `publish/publish-package-form.tsx` (784 LOC) — client: 3-column form, 8 platform variants

### 2.4 Edit page

- `edit/[id]/page.tsx` (122 LOC) — server
- `edit/[id]/edit-form.tsx` (138 LOC) — 5-field form (title, format, plannedPublishAt, brief, channels)

### 2.5 Tests

- 100+ vitest unit tests in `tests/unit/`
- 4 E2E suites (`tests/e2e/`)
- Coverage 50%+ per phase; relevant suites:
  - `tests/unit/planning/inline-editable-fields.test.tsx`
  - `tests/unit/planning/readiness-panel.test.tsx`
  - `tests/unit/planning/planning-header.test.tsx`
  - `tests/unit/planning/workflow-progress.test.tsx`
  - `tests/unit/publishing-readiness-evaluate.test.ts`
  - `tests/unit/publishing-readiness-presentation.test.ts`
  - `tests/unit/workflow-bar-statuses.test.tsx`

---

## 3. Current data flow

```
Server: page.tsx (RSC)
  ├─ auth() / currentActor() / getAccessibleWorkspace()
  ├─ getContentItem()  →  contentItems + channels (joined)
  ├─ listApprovalsForItem()
  ├─ listPublicationsForItem()        (record-outcome)
  ├─ listCommentsForItem()            (discussion)
  ├─ listDeliveryVersionsForItem()
  ├─ listWorkspaceDesigners()         (for assignment)
  ├─ evaluateReadiness()              (readiness + per-channel)
  ├─ readAllChannelPayloads()         (per-channel publish package)
  └─ isAiEnabled() / aiFeatureSettings / agency locale

Server → Client:
  PlanningHeader              (RSC → children are server-rendered buttons)
  WorkflowBar                 (client; serialised status, roles, approvals)
  ReadinessPanel              (client; presentation issues)
  InlineBriefEditor / InlineTitleEditor / InlineDateEditor (client)
  ChannelPublishingCard       (client; per-channel outcome)
  DeliverySection             (client; submit form)
  DiscussionSection           (client; comment tree)
  AiAssistanceSection         (client; capability grid)
  ActivityTimeline            (client; lifecycle events)
  ResetIdeaSection            (client; operator zone)
  FormatPayloadEditor         (client; per-format fields)
```

---

## 4. Current state model

The 11-state machine is exposed to the user in the workflow bar's pipeline. The detail page is a vertical stack:

```
PlanningHeader
WorkflowBar                  (current step explanation + status pipeline + actions)
ReadinessPanel?              (only when blockers/recommendations)
[ Brief section ]
[ Schedule section ]
[ Channels section ]
[ Creative brief section ]   (FormatPayloadEditor)
[ AI section? ]
[ Delivery section ]
[ Publishing section ]       (ChannelPublishingCard per channel)
[ Discussion section ]
[ Activity timeline ]
[ Reset idea section? ]
```

Each section is its own card → ≈ 12+ cards on a content item → long scroll.

---

## 5. Reusable components

Confirmed safe to reuse:

- `WorkspaceTopTabs` (anchor-tab strip with scroll-spy) — already battle-tested on Brand Kit
- `PlanningHeader`, `PlanningSection`, `ReadinessPanel`
- `ChannelPublishingCard`, `FormatPayloadEditor`
- `InlineEditableField` + the three wrappers
- `DeliveryVersionList`, `ActivityTimeline`
- `PlatformIcon` (one icon per platform, used in channel cards)
- `SectionEmptyState`
- `humanizeCode` / `presentReadinessIssues` already exist and are correct

---

## 6. UX problems confirmed in code

1. **Three ways to open the same full editor.** `EditIdeaButton` (header), "Edit all fields" (`primaryAction`), "Open full editor" (brief section actions) all navigate to the same `/planning/edit/[id]` URL. Visually identical, semantically redundant.
2. **Workflow bar exposes the full state machine.** The pipeline pills render every one of the 11 statuses. The user only cares about the _current_ step and the _next_ transition. The pipeline is technically informative but visually noisy.
3. **Readiness panel and channel "in setup" badge duplicate each other.** Both can say "Instagram setup incomplete" with different anchors.
4. **Publish package page shows technical `path` codes.** Line 164 of `publish/page.tsx`:
   ```jsx
   <code className="text-label text-fg-muted">{issue.path}</code>
   ```
   The path is `channels.<UUID>.payload.caption` — leaks UUIDs and internal schema keys.
5. **AI section is a capability grid, not a contextual tool.** Five "Run" buttons in a 2-column grid with `Ready`/`Off` badges, plus a `<details>` exposing "Send with context (3 of 5 on)" — reads as a dev console.
6. **Per-field AI exists but is not adjacent to the field.** `FormatPayloadEditor` already supports per-field `<PerFieldAiSuggest>` but the section above exposes the higher-level capabilities instead, so the user doesn't discover the contextual button.
7. **Channel state inconsistency is plausible.** The `EditIdeaForm` builds `defaultChecked={initialValues.channelIds.includes(c.id)}` from the full `socialChannels` list (active + not-archived). The detail page reads `item.channels` which is the `contentItemChannels` join. If `contentItemChannels` is missing a row, the detail shows the channel selected but the edit page unchecks it. (Need to verify in tests; a regression test will lock the contract.)
8. **Timezone semantics unclear.** `InlineDateEditor` already uses local-clock conversion via `formatDateForInput` / `parseInputAsLocalDate` and re-states `Times are in your local clock. Stored as {timezone}.` — but the schedule section in the _read-only_ path just shows the local string and the IANA code, without "UTC+2" offset. Users see "Aug 1, 17:30" and may not know whether that's their local or workspace local.
9. **Danger zone is a full-width red card.** Consumes the same visual real estate as primary content. Should be collapsed into an overflow menu.
10. **ActivityTimeline's "No activity yet" empty state renders even when the page is brand-new.** Should be conditionally hidden or surfaced as a compact "Why no activity?" hint.
11. **DiscussionSection takes a full card width near the bottom.** No easy way to comment while looking at content.
12. **No compact "content readiness" signal for the user.** The `readiness` report is a side panel; users don't see "this brief is 60% ready" anywhere unless they open the publish package page.
13. **Publish page is a 3-column grid** that is hard to use below `md:` — columns become too narrow.
14. **Channel cards don't have a thumbnail.** `Creative` section is per-content; the channel card doesn't say which delivery version it will use.

---

## 7. Suspected bugs to verify / fix

| Bug                                           | Evidence                                                                                                            | Fix                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `path` codes leak into publish page           | `publish/page.tsx:164` `<code>{issue.path}</code>`                                                                  | Use `humanizeCode` / `presentReadinessIssues`                                                                        |
| Channel state inconsistency                   | `EditIdeaForm` reads `socialChannels` (active set) but posts `channelIds`; detail page reads `item.channels` (join) | Use the same source-of-truth — derive `channelIds` from `item.channels` and pass to the form. Add a regression test. |
| Full-state pipeline renders for any state     | `workflow-bar.tsx:228-244`                                                                                          | Replace with a 4-step "stage" stepper. Keep the detailed explanation card.                                           |
| DiscussionSection consumes large vertical     | `discussion-section.tsx` full-width card                                                                            | Move to a drawer; keep a compact `💬 2` affordance in the header.                                                    |
| AI capability grid exposes technical controls | `ai-assistance-section.tsx` Ready/Off + context toggles in plain sight                                              | Move context toggles behind a "Context settings" disclosure; keep one primary AI affordance per field.               |
| Danger zone is full-width                     | `reset-idea-section.tsx`                                                                                            | Fold into an overflow menu under the header "•••".                                                                   |

---

## 8. Implementation approach

Phases 4 → 10 of the prompt, in order. Prefer frontend / interaction changes over schema changes. No backend API changes for the M5 milestone. Server actions stay where they are. Tests added in `tests/unit/planning/` and `tests/unit/publishing/`.

### 8.1 P0 correctness (Phase 4)

- Use `presentReadinessIssues` on the publish page (kill `path` display).
- Lock the channel state contract with a regression test (edit form's initial state matches `item.channels`).

### 8.2 Content workspace (Phase 5)

- Compact workflow stepper (`Draft → Review → Design → Publish`) — map detailed status → stage visually; keep current/eligible role + "next" copy below.
- One primary "Edit content" action in the header. Remove "Edit all fields" and "Open full editor" duplicates.
- Restructure body into `Overview | Content | Publishing | Activity` tabs. Each tab is a stacked-card view; Overview surfaces the readiness + brief + schedule + channels at-a-glance.
- Move discussion to a right-side drawer; keep a `💬 N` badge in the header.
- Move Reset idea under a "•••" overflow menu (operator-only).
- Activity only renders when events exist, or in the Activity tab.

### 8.3 Publishing (Phase 6)

- Rename "Publish package" → "Publishing setup" in user-facing copy (keep `publishPackage` model).
- 60/40 split: form on the left, sticky live preview + readiness + final-copy approval on the right.
- Add a real Instagram / Reel / Story preview that reflects the current caption + selected delivery.
- Per-channel `Setup` collapse, not a giant form.

### 8.4 AI (Phase 7)

- Per-field `✨ Improve` and `✨ Generate draft` buttons next to the existing inline AI (already wired via `FormatPayloadEditor`).
- Remove the "Ready" / "Off" badges from the normal surface; surface only when off / processing / failed.
- Move "Send with context" behind a "Context settings" disclosure.
- Add a single "AI suggestions" section for `brief_improvement`, `campaign_ideas`, etc. that says "AI uses your brand, campaign and content context" with a single "Generate" button.
- Surface a content-readiness percent near the brief; "Help me complete" button.

### 8.5 Responsive + a11y (Phase 8)

- Tabs collapse to a dropdown below `md:`.
- Sticky preview becomes a tab on small viewports.
- Touch targets ≥ 44×44 px.

### 8.6 Quality gates (Phase 9)

- Forward + reverse regression tests for each guard.
- `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`.

### 8.7 Final audit (Phase 10)

- Walk the 8 scenarios in the prompt; fix inconsistencies.

---

## 9. Migrations / schema changes required

**None.** All changes are UI / interaction. Domain model, server actions, validators, and tests stay aligned.

---

## 10. Risk register

| Risk                                                                      | Mitigation                                                                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaking existing E2E tests that depend on current selector names         | Keep `data-testid` values stable; add new ids for new affordances.                                                                                                                |
| Tabs may hide the discussion thread on small viewports; users may miss it | Drawer affordance in the header with comment count.                                                                                                                               |
| "Edit content" full editor is still narrow (same fields as before)        | Add the structured sections (BASICS, PLANNING, CREATIVE BRIEF, COPY, ASSETS, PUBLISHING) progressively — but keep the existing 5-field form until the structured editor is built. |
| Removing "Edit all fields" / "Open full editor" breaks bookmarks          | Add a redirect from `/planning/edit/[id]` to the same path; keep the URL.                                                                                                         |
| AI surfacing changes could regress capability-disabled UX                 | Keep the "AI is off" banner intact; only remove redundant "Ready" badges.                                                                                                         |
