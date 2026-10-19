# Food Game Community & Inbox audit — 2026-10-19

Status: local baseline and focused Community checks Tested; full release gates pending; not independently Verified.

## Live findings

Chrome inspection and a read-only provider sync covered Activity, Connections, Unified inbox,
AI Test Lab, Settings & safety, and agency AI configuration. One synthetic
Test Lab request and one manual public-comment sync were made. No customer reply, permission change, safety-switch
change, or provider credential change was performed. No private message text,
provider identifiers, or secrets are recorded here.

| Capability         | Observed result                                                                              | Next step                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Public comments    | 32 stored conversations; Facebook and Instagram content visible; comment sync has completed  | Use the inbox; sync is manual and bounded, not a real-time webhook service                         |
| Comment replies    | Capability marked Available, but workspace emergency stop is active; server rejects delivery | Complete controlled read/reply UAT before an operator releases the safety stop                     |
| Private messages   | Read/reply Unavailable; missing `pages_messaging`; no completed private-message sync         | Obtain the permission through Meta App Review, reconnect, validate, then controlled read/reply UAT |
| AI                 | Provider configured, master switch On, last provider check OK; `community_reply_drafts` Off  | Agency administrator enables that capability if desired; use synthetic Test Lab inputs first       |
| Autonomous replies | Not established or approved                                                                  | Keep disabled; simulation is not an autonomous send workflow                                       |
| Webhooks/history   | Unknown; operational setup and history expansion not completed                               | Follow Community UAT; do not promise real-time delivery or full history                            |

## Reproduced defects and scoped changes

- The header’s generic “Available” badge referred only to module access. It
  now says “Module enabled”; provider and AI readiness remain separate.
  Breadcrumbs use translated section titles, and connection timestamps use
  the shared day-first formatter and workspace timezone.
- Activity counted events but rendered an empty container whenever the count
  was positive. It now loads the latest 50 workspace-scoped events and renders
  allowlisted bilingual event labels and workspace-timezone timestamps.
  Provider details and metadata are never rendered directly.
- Overview matched all nested engagement routes. It now uses exact matching.
- “Connected channels” counted enabled workspace channel records, including
  those without a validated provider connection. It now says “Enabled channels”;
  Connections remains the source of provider permission readiness.
- “Messages today” counted all stored messages. The label now says “Stored
  messages”; no invented daily time window is implied.
- “Delivery reliability” showed 100 after any send attempt. The tile now shows
  the actual reply-attempt count and makes no success-rate claim.
- Post comments showed an empty placeholder despite imported comments. It now
  reuses the public-comment inbox view without claiming full post context.
- Conversation cards, filters, and search had no interaction. They now use
  URL-backed selection, visibility filters, and search within the loaded
  window. The 25-conversation limit is visible. Reply state resets when the
  selected conversation changes.
- The mobile inbox sync toolbar clipped its private-message button at 375px.
  The toolbar now wraps; browser coverage checks button bounds as well as
  document overflow.
- Descending message rows were deduplicated with last-write-wins, replacing
  the newest message with an older message. Deduplication now retains the
  first/newest row.
- Test Lab mapped disabled capability, plan restriction, rate limit, quota,
  and provider failure to “Review required.” It now explains these errors
  separately. Test Lab textareas use content-driven direction.
- Sync feedback treated every returned result as success, including partial
  provider failures or no readable channels. Shared result classification now
  distinguishes success, partial results, and failure. A fresh read-only live
  comment sync was observed to complete, with its Connections timestamp updated.
- Sync controls were enabled without validated read permission, and Connections
  called a blocked sync “Ready.” The controls now respect the operation’s
  read capability, explain the required setup, and do not claim background
  polling is active.
- Emergency-stop copy was ambiguous and the composer remained editable even
  though the server would reject sending. The UI now explains the paused
  state and disables the composer. Server protections remain enforced.

No schema migration, new API/MCP tool, scope, or transport behavior is introduced.
The manual read-only provider sync reused existing ingestion and updated its
local sync evidence. No plan or safety gate is loosened.

## Remaining product work

Review queue, playbooks, routing, automation, export, and advanced
analytics still contain foundation/disabled surfaces. They must not be
presented as completed operations. Full conversation history, post context,
pagination beyond the bounded inbox window, per-connection readiness, and
unknown-delivery reconciliation need their own implementation/UAT evidence.
Author attribution is missing in the observed imported comments; provider
field availability must be checked without inventing names. Agency AI also
shows unresolved Advertising capability catalog keys, outside this patch.

## Verification contract

Regression tests cover event rendering and safe fallback, timezone display,
empty activity, exact Overview matching, latest-message deduplication,
selection/filter/search behavior, and actionable AI errors. The dedicated
`tests/e2e/community-inbox-audit.spec.ts` uses only a disposable test database,
synthetic conversations, bilingual routes, five widths, and axe.

Required commands: `pnpm verify`, `NODE_ENV=test pnpm migration-drill`,
`pnpm test:integration`, isolated Community browser tests, and release-candidate
full browser/visual checks before merge. Record results against the exact clean
commit. External Meta UAT, native Arabic editorial review, and independent
verification remain open; local compilation cannot close those gates.

## Local evidence — frozen code candidate

Date: 2026-10-19. Operator: Codex. Code candidate:
`2f9fbbb54fe14f836de9cfe0c9b1933a97221eac`, clean worktree for the runs below.
Subsequent evidence-only commits do not change the application or tests.

| Gate                      | Command                                                                                                                                                                   | Result                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                  | `VITEST_MAX_FORKS=2 VITEST_MIN_FORKS=1 VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=1 pnpm verify`                                                                             | Exit 0: formatting, lint, typecheck, 545 unit files / 4,901 tests, production webpack build                                       |
| Migration drill           | `NODE_ENV=test pnpm migration-drill` with `TEST_DATABASE_URL` set to the isolated `planner_community_ci_test` database                                                    | Exit 0: all five checks; ledger 88/88                                                                                             |
| Integration               | `pnpm test:integration` against that same disposable database                                                                                                             | Exit 0: 41 files / 326 tests                                                                                                      |
| Community browser         | `pnpm test:e2e:isolated -- tests/e2e/community-inbox-audit.spec.ts --project=chromium --project=firefox --project=webkit --project=mobile-chrome --project=mobile-safari` | Exit 0: 10/10 EN/AR cases, five widths per case, keyboard selection, serious/critical axe checks, disabled send/sync restrictions |
| Independent static review | `/root/community_review`, including the final enabled-channel label delta                                                                                                 | No actionable findings; Arabic meaning/clarity assessed, not native human sign-off                                                |

Browser tests ran as the non-root user in the official Playwright 1.62.1
Linux image matching the installed package. They used synthetic data and a
separate PostgreSQL 16 database; no production tokens or customer messages
were copied into the runner. Local evidence logs remain outside the repository.

An earlier unrestricted parallel baseline timed out in one existing Meta
callback test. That test passed 3/3 in isolation and in the complete final
baseline with fewer workers. No assertion, timeout, or test was weakened.

The full `pnpm test:e2e:release` gate has **not passed**. The first local attempt
lost its development server to the Docker VM OOM killer (`oom_kill=1`);
the following bounded-heap attempt hit Next's memory-triggered restart and
lost the server. Both runs were stopped after the cause was confirmed;
connection-refused failures are not treated as release evidence. A successful
targeted run does not replace the full five-browser and visual release gate.

The repository's GitHub `advisory-quality.yml` release-candidate workflow can
run the full gate, but its dependency job also creates a GitHub issue. Approval
for that side effect is pending. Merge and deployment remain on hold.

The emergency-stop button in Settings & safety is disabled/unimplemented;
there is no working self-service release control in that screen. Complete the
controlled provider UAT and an authorized safety-control implementation before
promising that a workspace manager can enable sending. Do not bypass it with
a database edit. Meta App Review/reconnection, AI capability enablement, and
native Arabic sign-off remain separate external steps.

### Synthetic visual evidence

These captures are from the disposable test workspace, not Food Game customer
conversations. Screenshots accompany the behavioral/authorization assertions
above and are not refreshed visual baselines.

- [Activity, EN at 1440px](evidence/food-game-community-2026-10-19/activity-en-1440.png)
- [Inbox, EN at 1440px](evidence/food-game-community-2026-10-19/inbox-en-1440.png)
- [Inbox, AR/RTL at 375px](evidence/food-game-community-2026-10-19/inbox-ar-375.png)
