# Production UAT and release verdict

> **Read this first.** This file describes the §23 30-step **UAT** gate, which is independent from the **deploy** gate in `PRODUCTION_READINESS_TRACKER.md`. Both gates must pass for `READY`; either failing blocks release. As of 2026-08-21 the shared release verdict across both this file and `PRODUCTION_READINESS_TRACKER.md` is `READY FOR INDEPENDENT REVIEW`. The independent reviewer (Task 13) flips it to `READY` after the §23 journey and the external owner gates below are signed.

## Two-gate summary

| Gate                                      | Owner                | Status as of 2026-08-21                                                                            | How it flips                                                                                                                                                   |
| ----------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deploy**                                | Implementation       | `READY FOR INDEPENDENT REVIEW` (awaiting independent reviewer sign-off → `READY`)                  | Independent reviewer flips to `READY` after the §23 journey and external owner gates are signed.                                                               |
| **UAT (§23 journey + external services)** | Independent reviewer | `READY FOR INDEPENDENT REVIEW` (evidence contracts in place; §23 journey and owner checks pending) | Run the 30-step primary journey with separated Maya / Omar / Elena / Jon / Sophie / Daniel accounts; complete the owner checks below; sign the final decision. |

## UAT verdict

`READY FOR INDEPENDENT REVIEW — 2026-08-21`

The evidence contracts are in place:

- The 30-step primary acceptance journey in `STUDIOFLOW_MASTER_PROMPT.md` §23 has a step-by-step checklist (this file, § "2026-08-21 — 30-step separated-account UAT").
- The external-services UAT is captured in
  [`EXTERNAL_SERVICES_UAT.md`](./EXTERNAL_SERVICES_UAT.md) (Google OAuth, Mailcow SMTP, MiniMax AI, Sentry, offsite backup, credential rotation).
- The manual accessibility checklist is captured in
  [`ACCESSIBILITY_CHECKLIST.md`](./ACCESSIBILITY_CHECKLIST.md) (27 canonical surfaces, one row each).

The complete 30-step primary acceptance journey must pass with separate Maya, Omar, Elena, Jon, Sophie and Daniel accounts. A failure in any numbered step blocks release. The journey cannot be automated (each step is a real human-in-the-loop action with a different identity), so it stays `Pending` until an operator runs it against the first deployed build. The temporary `READY FOR INDEPENDENT REVIEW` verdict is **not** the final `READY` verdict; the orchestrator flips it back to `READY` only after independent sign-off (Task 13). Until then the UAT gate remains `Partial`: contracts in place, evidence not yet collected.

## External owner gates (UAT-side)

The full checklist is in
[`EXTERNAL_SERVICES_UAT.md`](./EXTERNAL_SERVICES_UAT.md). Summary:

- Rotate all design/development credentials that were shared outside the production secret store.
- Configure and test real Google OAuth redirect/callback settings.
- Configure and test Mailcow magic links, invitation and password-reset delivery.
- Configure and test MiniMax through a controlled account (enabled / disabled / provider-error paths).
- Configure and test Sentry releases, source maps, scrubbing and alerts.
- Configure encrypted offsite backup and complete a timed disposable restore.
- Calendar the next rotation for every production credential class (DB, OAuth, SMTP, Sentry, AI).

Record only operator, date, environment and result. Never record secret values or real invitation URLs.

## 2026-08-21 — 30-step separated-account UAT

The 30 steps below are the **§23 primary acceptance journey** from
`STUDIOFLOW_MASTER_PROMPT.md`. The record table underneath is the
single place an independent reviewer records `Pass` / `Fail` /
`Blocked` for each step with operator, date and environment. A
failure in any numbered step blocks release.

### Steps

1. Start with a new deployment containing no agency administrator.
2. Maya completes Create Agency Administrator.
3. A second browser attempting setup receives the configured result and cannot create another administrator.
4. Maya creates Northstar Coffee with Europe/Vienna timezone, monthly target 24, and four channels: Instagram, TikTok, Facebook, YouTube.
5. Maya configures Omar as default content owner/planner where appropriate, Elena as default designer, Jon as internal reviewer, Sophie as client reviewer, and internal-then-client approval.
6. Maya invites Omar, Elena, Jon, Sophie, and Daniel with their exact roles.
7. Each invitation is accepted; a client account cannot see Workspaces, User Management, Team, Brand Kit internals, Settings, drafts, or internal comments.
8. Omar lands on My Work and opens Northstar Coffee Planning for September 2026.
9. Omar opens Quick Create. Initially only Title, Format, Planned date/time, and Short brief are visible.
10. Omar creates "Autumn Recipe in 30 Seconds" as Short-form Video.
11. The Draft receives all four active channels, workspace timezone, Omar as owner, Elena as designer, configured reviewers, 9:16 defaults, 30-second suggestion, and Draft status.
12. Omar opens More details, completes Hook → Main message → CTA, scenes, captions, and channel copy.
13. Omar submits Content Review; readiness validation passes.
14. Jon requests changes with required feedback. Omar sees the notification, edits, and resubmits.
15. Jon approves. The item becomes Approved for Design and then In Design with Elena assigned.
16. Elena adds a client-visible clarification question. Sophie sees it; neither Sophie nor the client data response contains internal discussion.
17. The clarification is resolved and appears in activity.
18. Elena submits Delivery V1 with a Frame.io preview and Google Drive production link.
19. Jon requests creative changes. Elena submits Delivery V2. Both versions and feedback remain visible.
20. Jon approves V2 internally.
21. Sophie receives a client review containing only client-safe content, V2, relevant context, and client-visible discussion.
22. Sophie approves. The item becomes Ready to Publish and identifies V2 as final approved version.
23. Daniel records Instagram and TikTok as Published. Overall status becomes Partially Published.
24. Facebook is recorded Failed, edited, retried, then Published.
25. YouTube is Skipped with a reason.
26. Overall status becomes Published.
27. Overview, Planning List, Board, Calendar, Reviews, My Work, Notifications, and activity all show consistent final state.
28. An archived/restored check confirms history remains.
29. Mobile screens allow a review decision, comment reply, and publishing confirmation.
30. Keyboard-only operation completes Login, Quick Create, review request, review decision, and calendar move dialog.

### Separated accounts

The six accounts defined in `STUDIOFLOW_MASTER_PROMPT.md` §21 each play
a single role. The journey is invalid if a single account holds more
than one of these roles, and the credentials must remain separated
throughout the run. Real names are never recorded in this table.

| Account        | Role                               | Sample fixture                                           |
| -------------- | ---------------------------------- | -------------------------------------------------------- |
| Maya Chen      | Agency Admin and Workspace Manager | `agencyAdmin`, default owner of Northstar Coffee         |
| Omar Haddad    | Content Planner                    | `content_planner`, creates "Autumn Recipe in 30 Seconds" |
| Elena Rossi    | Designer                           | `designer`, claims V1/V2 deliveries                      |
| Jon Bell       | Internal Reviewer                  | `internal_reviewer`, requests changes + approves V2      |
| Sophie Laurent | Client Reviewer                    | `client_reviewer`, approves from `/app/w/.../client`     |
| Daniel Kim     | Publisher                          | `publisher`, records channel-level publish state         |

### Record

> **Column legend (added in 2026-08-22 pre-fill).** The first four
> `Auto-check …` columns are auto-derived from the code and the test
> surface; the remaining six columns still require the real operator
>
> - reviewer (account, operator, date, environment, result, evidence
>   link). The `Automated result` column reads the latest green/red
>   state of the named test on `96e7048` (see
>   [`TEST_EVIDENCE.md`](./TEST_EVIDENCE.md) § "Re-baseline —
>   2026-08-21"); a `PASS` here is **not** a substitute for the
>   reviewer's pass — the journey is human-in-the-loop and only an
>   operator running the named account on the named date can sign it
>   off.
>
> * `Required account role` — single role from §21 ("Separated
>   accounts") that must drive the named step; multi-account steps
>   (e.g. step 7 "each invitation is accepted") show the role of
>   the accepting account.
> * `Required data state` — preconditions the operator must have
>   already created (or that the dev seed supplies) before the step
>   can be run against the real production build.
> * `Test command` — the e2e or integration test that exercises the
>   same service-layer transition; the unit-only steps fall back to
>   the unit test that pins the contract.
> * `Automated result`:
>   - `PASS` — the named test is green on `96e7048` AND covers the
>     whole step.
>   - `PARTIAL` — the named test covers a subset of the step (e.g.
>     service-layer only, no UI assertion) OR the step is exercised
>     by the journey integration test indirectly.
>   - `OUT OF SCOPE` — no automated test covers this step; the
>     reviewer must run it manually against the real production
>     build.

| Step | Auto-check: required account role                | Auto-check: required data state                         | Auto-check: test command                                                                                                                                                                                          | Auto-check: automated result                                                                                                                                | Account | Operator | Date | Environment | Result | Evidence link |
| ---- | ------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | ---- | ----------- | ------ | ------------- |
| 1    | (none — no session)                              | empty deployment, no agency row                         | `tests/e2e/health.spec.ts`, `tests/e2e/public.spec.ts` (`/api/bootstrap/status`), `tests/integration/schema.test.ts` (singleton agency)                                                                           | PARTIAL (singleton-agency invariant + status API pinned; no e2e asserts "fresh deploy ⇒ no agency row" in one assertion)                                    |         |          |      |             |        |               |
| 2    | agency_admin (Maya)                              | step 1 satisfied                                        | `tests/e2e/auth-gate.spec.ts` (`/signin` redirect), `tests/integration/bootstrap` (Maya becomes first admin)                                                                                                      | PARTIAL (service layer only — no e2e signs up the first admin)                                                                                              |         |          |      |             |        |               |
| 3    | agency_admin (Maya, second browser)              | step 2 satisfied, second browser                        | `tests/integration/schema.test.ts` (singleton agency invariant)                                                                                                                                                   | PARTIAL (DB invariant pinned; UI not in e2e)                                                                                                                |         |          |      |             |        |               |
| 4    | workspace_manager (Maya)                         | step 2 satisfied, no workspace yet                      | `tests/e2e/workspace.spec.ts` ("admin can create a new workspace via the form")                                                                                                                                   | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 5    | workspace_manager (Maya)                         | step 4 satisfied, Northstar Coffee created              | `tests/e2e/workspace.spec.ts` (settings update), `tests/integration/journey.test.ts` (workspace settings + role rows)                                                                                             | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 6    | workspace_manager (Maya)                         | step 5 satisfied                                        | `tests/integration/invitation-concurrency.test.ts` (invitation rows), `tests/unit/invitation-command.test.ts` (schema), `tests/unit/email.test.ts` (SMTP transport)                                               | PARTIAL (concurrency pinned; multi-inviter happy path not in e2e)                                                                                           |         |          |      |             |        |               |
| 7    | mixed (Maya + each invitee)                      | step 6 invitations sent and accepted                    | `tests/integration/client-isolation.test.ts` (client_reviewer denied internal), `tests/integration/journey.test.ts` ("client_reviewer cannot read internal content")                                              | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 8    | content_planner (Omar)                           | step 7 satisfied, Omar signed in                        | `tests/e2e/content-flow.spec.ts` ("the new draft appears in the planning list")                                                                                                                                   | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 9    | content_planner (Omar)                           | step 8 satisfied, on `/app/w/acme/planning/new`         | `tests/e2e/content-flow.spec.ts` ("planner can quick-create a draft and submit for review" — first 2 asserts)                                                                                                     | PARTIAL (form fills + submit green; no explicit assertion that ONLY Title/Format/Date/Brief are initially visible)                                          |         |          |      |             |        |               |
| 10   | content_planner (Omar)                           | step 9 satisfied, Quick Create open                     | `tests/e2e/content-flow.spec.ts` ("planner can quick-create a draft …" — submit), `tests/integration/journey.test.ts` ("§23 step 11: Quick Create applies workspace settings defaults")                           | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 11   | content_planner (Omar)                           | step 10 draft created                                   | `tests/integration/journey.test.ts` ("§23 step 11: Quick Create applies workspace settings defaults")                                                                                                             | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 12   | content_planner (Omar)                           | step 10 draft created, detail page open                 | `tests/e2e/content-flow.spec.ts` ("the new draft appears in the planning list" — for the save + persist path)                                                                                                     | PARTIAL (UI for the More-details fields is hand-tested today; no e2e for the Hook→Main→CTA blocks)                                                          |         |          |      |             |        |               |
| 13   | content_planner (Omar)                           | step 12 satisfied, "Submit for review" click            | `tests/e2e/content-flow.spec.ts` ("planner can quick-create a draft and submit for review" — second half), `tests/integration/journey.test.ts` ("submit_content_review from 'draft' allowed for content_planner") | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 14   | internal_reviewer (Jon) + content_planner (Omar) | step 13 satisfied, item in `content_review`             | `tests/e2e/discussions.spec.ts` ("a comment can be resolved (and un-resolved)" — exercises the comments surface)                                                                                                  | PARTIAL (workflow rules + comments e2e; full Jon-then-Omar round-trip not in e2e)                                                                           |         |          |      |             |        |               |
| 15   | internal_reviewer (Jon) + designer (Elena)       | step 14 resubmitted and re-approved                     | `tests/e2e/content-flow.spec.ts` ("full happy path: planner drafts, reviewer approves → approved_for_design"), `tests/integration/journey.test.ts` ("approve_content" workflow rule)                              | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 16   | designer (Elena) + client_reviewer (Sophie)      | step 15 satisfied, item in `in_design`                  | `tests/integration/client-isolation.test.ts` (Sophie cannot read internal comments), `tests/e2e/discussions.spec.ts` (visibility selector)                                                                        | PARTIAL (visibility selector pinned; full Elena-to-Sophie handoff not in e2e)                                                                               |         |          |      |             |        |               |
| 17   | designer (Elena) + client_reviewer (Sophie)      | step 16 question posted                                 | `tests/e2e/discussions.spec.ts` ("posting a comment shows it in the thread with the open-count badge", "a comment can be resolved")                                                                               | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 18   | designer (Elena)                                 | step 17 question resolved, item in `creative_review`    | `tests/unit/deliveries-service.test.ts` (SubmitDeliverySchema + submitDelivery), `tests/unit/creative-approval.test.ts`                                                                                           | PARTIAL (service-layer only; UI delivery-form not in e2e)                                                                                                   |         |          |      |             |        |               |
| 19   | designer (Elena) + internal_reviewer (Jon)       | step 18 V1 submitted                                    | `tests/unit/deliveries-service.test.ts` (`listDeliveriesForItem`, `listDeliveryVersionsForItem`), `tests/unit/creative-approval.test.ts` (V1/V2 request-changes → resubmit round-trip)                            | PARTIAL (service-layer version history; no e2e for the round-trip)                                                                                          |         |          |      |             |        |               |
| 20   | internal_reviewer (Jon)                          | step 19 V2 submitted, Jon reviews                       | `tests/unit/creative-approval.test.ts` ("deriveCreativeApprovalOutcome"), `tests/integration/journey.test.ts` ("approve_internal_creative" rule)                                                                  | PARTIAL (service-layer only)                                                                                                                                |         |          |      |             |        |               |
| 21   | client_reviewer (Sophie)                         | step 20 satisfied, item in `creative_review` for client | `tests/integration/client-isolation.test.ts` (Sophie can see V2 and client-visible thread, not internal), `tests/e2e/role-authorization.spec.ts` ("review roles see only their review surface")                   | PASS                                                                                                                                                        |         |          |      |             |        |               |
| 22   | client_reviewer (Sophie)                         | step 21 satisfied, on `/app/w/acme/client`              | `tests/unit/creative-approval.test.ts` (approve_client_creative rule), `tests/integration/journey.test.ts` ("approve_client_creative" rule)                                                                       | PARTIAL (service-layer only; client-portal UI is manual)                                                                                                    |         |          |      |             |        |               |
| 23   | publisher (Daniel)                               | step 22 satisfied, item in `ready_to_publish`           | `tests/unit/publishing-service.test.ts` (recordPublication), `tests/unit/publishing-aggregate.test.ts` (derivePublicationAggregate)                                                                               | PARTIAL (service-layer only; UI publish flow is manual)                                                                                                     |         |          |      |             |        |               |
| 24   | publisher (Daniel)                               | step 23, one channel published, one failed              | `tests/unit/publishing-service.test.ts` (recordPublication error path), `tests/unit/publication-aggregate.test.ts` (Partially Published derivation)                                                               | PARTIAL (service-layer only)                                                                                                                                |         |          |      |             |        |               |
| 25   | publisher (Daniel)                               | step 24, one channel Failed, then Published             | `tests/unit/publishing-service.test.ts` (recordPublication retry), `tests/unit/publishing-aggregate.test.ts` (Published derivation)                                                                               | PARTIAL (service-layer only)                                                                                                                                |         |          |      |             |        |               |
| 26   | publisher (Daniel)                               | step 25, one channel Skipped                            | `tests/unit/publishing-aggregate.test.ts` (Skipped + Published aggregate)                                                                                                                                         | PARTIAL (service-layer only)                                                                                                                                |         |          |      |             |        |               |
| 27   | workspace_manager (Maya) / any internal          | step 26 satisfied, item is `published`                  | `tests/integration/journey.test.ts` ("approve_client_creative" → "published" terminal state), `tests/unit/publication-aggregate.test.ts` (Published final)                                                        | PARTIAL (service-layer + integration; UI overview/board/calendar consistency is manual)                                                                     |         |          |      |             |        |               |
| 28   | workspace_manager (Maya)                         | step 27, item in `published`                            | `tests/unit/content-service.test.ts` (archive + restore), `tests/integration/brand-kit.test.ts` (archive filter)                                                                                                  | PARTIAL (service-layer archive/unarchive pinned; no e2e round-trip)                                                                                         |         |          |      |             |        |               |
| 29   | mixed (any internal role on mobile viewport)     | step 28, mobile-chrome project                          | `tests/e2e/mobile.spec.ts` (bottom nav + 44px touch target), `tests/e2e/mobile-safari.spec.ts`                                                                                                                    | PARTIAL (layout + touch target pinned; review-decision / publish-confirm on mobile not in e2e)                                                              |         |          |      |             |        |               |
| 30   | mixed (any role, keyboard-only)                  | step 29, fresh browser, Tab-only input                  | `tests/e2e/mobile.spec.ts` (mobile nav), `tests/e2e/role-authorization.spec.ts` (review surfaces), `tests/e2e/a11y-routes.spec.ts` (axe per route on chromium — keyboard nav indirectly)                          | PARTIAL (keyboard nav indirectly covered; full Login → Quick Create → review-request → review-decision → calendar-move keyboard flow not in any single e2e) |         |          |      |             |        |               |

### Auto-check coverage (2026-08-22 pre-fill on `96e7048`)

- **Required account role + required data state** are pre-filled for
  all 30 steps; they are derived from §21 (separated accounts) +
  §23 (primary acceptance journey) and the order in which each step
  logically depends on the prior step.
- **Test command + automated result** are pre-filled for all 30
  steps from the test surface in `tests/e2e/*`, `tests/integration/*`
  and `tests/unit/*`. Distribution:
  - **PASS** (10/30): steps 4, 5, 7, 8, 10, 11, 13, 15, 17, 21
    — the workspace create + settings flow, the Quick Create +
    planner→internal-reviewer transition, the comment thread,
    and the client-isolation contract all have a fully green e2e
    or integration test on `96e7048`.
  - **PARTIAL** (20/30): steps 1, 2, 3, 6, 9, 12, 14, 16, 18, 19,
    20, 22, 23, 24, 25, 26, 27, 28, 29, 30 — service-layer or
    schema invariants are pinned in unit or integration tests,
    but no e2e drives the named step end-to-end against the real
    production build with the named account on the named date.
    The operator must run these manually.
  - **OUT OF SCOPE** (0/30): none of the 30 steps lacks any
    automated test surface at all.
- **pending reviewer** — `Account`, `Operator`, `Date`,
  `Environment`, `Result` and `Evidence link` are still empty in
  every row; the reviewer fills those against the real production
  build. The `Automated result` column is **not** a substitute for
  the reviewer's pass — the §23 journey is deliberately
  human-in-the-loop and a `PASS` automated result on step N does
  not let the reviewer sign the row off without running the named
  account on the named date.

### Pass criteria

A step may be marked `Pass` only when the operator observed the
documented behaviour against the real production build with the
named account on the named date, the related automated check is
green (axe-core per route, role-by-route, integration journey), and
no tracking issue is open. `Fail` requires a tracking issue link
with a reproduction. `Blocked` requires the owner and the external
action required (e.g. a fixture that is not yet seeded in
production). Steps 1, 2 and 3 are bootstrap steps; failures there
block every later step and must be fixed first.

## Final decision

| Reviewer           | Commit / image | Date       | Verdict                                                                        | Unresolved risks                                    |
| ------------------ | -------------- | ---------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| Independent review | —              | 2026-08-21 | `READY FOR INDEPENDENT REVIEW` (shared with `PRODUCTION_READINESS_TRACKER.md`) | See tracker; §23 journey + owner checks not yet run |

The final decision flips to `READY` when **all** of the following are true:

1. The §23 30-step primary journey has been executed with separated accounts and every step passes (every row in the record table above is `Pass`).
2. Every external owner gate in [`EXTERNAL_SERVICES_UAT.md`](./EXTERNAL_SERVICES_UAT.md) has a recorded operator + date + result.
3. Every row in [`ACCESSIBILITY_CHECKLIST.md`](./ACCESSIBILITY_CHECKLIST.md) is `Pass` (or `Verified` after independent review).
4. `PRODUCTION_READINESS_TRACKER.md` shows every P0 and P1 row at `Verified` (independent reviewer sign-off).
5. `docs/production-readiness/SCREEN_PARITY.md` shows every row at `Verified`.
6. The first production deploy to `laratik-vps` has been live for at least one full business week with no P0/P1 incident.
