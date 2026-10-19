# Food Game Community & Inbox audit — 2026-10-19

Status: implementation and verification in progress; not independently Verified.

## Live findings

Read-only Chrome inspection covered Activity, Connections, Unified inbox,
AI Test Lab, Settings & safety, and agency AI configuration. One synthetic
Test Lab request was made. No customer reply, permission change, safety-switch
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

No schema migration, production-data write, new API/MCP tool, scope, or
transport behavior is introduced. No plan or safety gate is loosened.

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
