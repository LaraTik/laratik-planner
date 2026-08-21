# Production UAT and release verdict

> **Read this first.** This file describes the §23 30-step **UAT** gate, which is independent from the **deploy** gate in `PRODUCTION_READINESS_TRACKER.md`. Both gates must pass for `READY`; either failing blocks release. As of 2026-08-21 the deploy gate is `READY ✅` (awaiting independent reviewer sign-off → `Verified`); the UAT gate is `READY FOR INDEPENDENT REVIEW` (evidence contracts in place, owner-side checks and the §23 journey still need to be run by the independent reviewer). They are not contradictions — they are two different gates.

## Two-gate summary

| Gate                                      | Owner                | Status as of 2026-08-21                                                                            | How it flips                                                                                                                                                   |
| ----------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deploy**                                | Implementation       | `READY ✅` (awaiting independent reviewer sign-off → `Verified`)                                   | Independent reviewer flips to `Verified` after the §23 journey and external owner gates are signed.                                                            |
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

| Step | Account | Operator | Date | Environment | Result | Evidence link |
| ---- | ------- | -------- | ---- | ----------- | ------ | ------------- |
| 1    |         |          |      |             |        |               |
| 2    |         |          |      |             |        |               |
| 3    |         |          |      |             |        |               |
| 4    |         |          |      |             |        |               |
| 5    |         |          |      |             |        |               |
| 6    |         |          |      |             |        |               |
| 7    |         |          |      |             |        |               |
| 8    |         |          |      |             |        |               |
| 9    |         |          |      |             |        |               |
| 10   |         |          |      |             |        |               |
| 11   |         |          |      |             |        |               |
| 12   |         |          |      |             |        |               |
| 13   |         |          |      |             |        |               |
| 14   |         |          |      |             |        |               |
| 15   |         |          |      |             |        |               |
| 16   |         |          |      |             |        |               |
| 17   |         |          |      |             |        |               |
| 18   |         |          |      |             |        |               |
| 19   |         |          |      |             |        |               |
| 20   |         |          |      |             |        |               |
| 21   |         |          |      |             |        |               |
| 22   |         |          |      |             |        |               |
| 23   |         |          |      |             |        |               |
| 24   |         |          |      |             |        |               |
| 25   |         |          |      |             |        |               |
| 26   |         |          |      |             |        |               |
| 27   |         |          |      |             |        |               |
| 28   |         |          |      |             |        |               |
| 29   |         |          |      |             |        |               |
| 30   |         |          |      |             |        |               |

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

| Reviewer           | Commit / image | Date       | Verdict                                                      | Unresolved risks                                    |
| ------------------ | -------------- | ---------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Independent review | —              | 2026-08-21 | `READY FOR INDEPENDENT REVIEW` (evidence contracts in place) | See tracker; §23 journey + owner checks not yet run |

The final decision flips to `READY` when **all** of the following are true:

1. The §23 30-step primary journey has been executed with separated accounts and every step passes (every row in the record table above is `Pass`).
2. Every external owner gate in [`EXTERNAL_SERVICES_UAT.md`](./EXTERNAL_SERVICES_UAT.md) has a recorded operator + date + result.
3. Every row in [`ACCESSIBILITY_CHECKLIST.md`](./ACCESSIBILITY_CHECKLIST.md) is `Pass` (or `Verified` after independent review).
4. `PRODUCTION_READINESS_TRACKER.md` shows every P0 and P1 row at `Verified` (independent reviewer sign-off).
5. `docs/production-readiness/SCREEN_PARITY.md` shows every row at `Verified`.
6. The first production deploy to `laratik-vps` has been live for at least one full business week with no P0/P1 incident.
