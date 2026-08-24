# Milestone 4 — Publish-ready Post and Reel packages

> **Status:** implementation refined on `main` (2026-08-24). All 1,469 unit tests + 106 integration tests green; `pnpm verify` clean.
> **Integration branch:** merged to `main`; this document now reflects the post-merge security and UX refinement.
> **Implementation commits:** schema/services + UI + tests, all atomic.

## Scope (per the master prompt, §4 Milestone 4)

1. **Versioned `platformPayload` schema** — one Zod discriminated
   union per documented surface: Instagram Post, Instagram Reel,
   Facebook, TikTok, LinkedIn, YouTube, Pinterest, X, Other.
   Common fields shared via `CommonPublishingFieldsSchema.merge()`.
2. **Central materiality service** — every material edit routes
   through `recordMaterialityEvent` which (a) increments the
   content item's revision, (b) cancels pending approvals, (c)
   records an immutable `activity_event` row, (d) notifies
   reviewers. Administrative changes use
   `recordNonMaterialityEvent` (no revision bump, no reset).
3. **Server-authoritative readiness service** — per-platform
   required-field registry, blockers vs recommendations, AI
   `completeness_check` suggestions folded in as recommendations
   only. Hashtags are never globally mandatory.
4. **New route** `/app/w/[slug]/planning/[id]/publish` —
   desktop 3-column layout (destination | media | preview),
   sticky bottom action bar with Save draft + Ready for
   publishing, accordion mobile layout, 44px touch targets.
5. **Link from the existing publishing section** — every
   `/app/w/[slug]/planning/[id]` page now has a "Configure
   publish package" link in the publishing card.

## Delivered task chain

Six sub-tasks. Each one is implemented and tested on the
integration branch.

### M4.1 — Zod schemas for every platform + discriminated union

- `src/lib/publishing/payload-schemas.ts` — the schema. Single
  source of truth for the wire contract of every publish
  package. 19 unit tests in `tests/unit/payload-schemas.test.ts`
  cover the happy path + error path for each of the 9 platforms
  and the discriminated union's `PLATFORM_KEYS` export.

### M4.2 — Platform payload service

- `src/lib/publishing/platform-payload-service.ts` —
  `savePlatformPayload`, `readPlatformPayload`,
  `readAllChannelPayloads`, `clearChannelPayload`, and
  `setFinalCopyApproval`. Every write
  goes through the materiality service (M4.3). The service
  re-validates workspace membership and re-reads the
  content-item + channel join to enforce IDOR.

### M4.3 — Materiality service

- `src/lib/publishing/materiality.ts` — the central mutation
  funnel. `recordMaterialityEvent` is the single point of
  truth for the four-step requirement (revision, approval
  reset, audit, notify). `recordNonMaterialityEvent` is
  the administrative alternative for internal notes.
- Reason codes are typed via Zod; the discriminator
  eliminates typo-class errors.

### M4.4 — Readiness service

- `src/lib/publishing/readiness.ts` — per-platform required
  field table; one read per channel; one fold-in for AI
  suggestions (advisory only). The output `ReadinessReport`
  is the source of truth for the publish UI's "Ready for
  publishing" CTA.
- `confirmPublishReadiness` re-runs that evaluation on the server,
  checks the current workflow status and revision, and records an
  immutable confirmation event. A client-side enabled button is
  never treated as proof of readiness.
- `foldAiSuggestions` pure helper tested in
  `tests/unit/readiness-fold.test.ts`.

### M4.5 — Publish UI

- `src/app/(app)/app/w/[slug]/planning/[id]/publish/page.tsx` —
  the route handler (server component).
- `publish-package-form.tsx` — the client form. Desktop
  3-column grid, mobile stacked accordion, sticky bottom
  action bar with 44px touch targets, channel selector tabs
  with per-channel blocker count, server action
  `savePublishPackageAction` and `recordInternalNoteAction`.
- Final-copy approval is agency-admin owned and server stamped.
  Draft saves strip any browser-supplied approval metadata and
  material edits revoke the prior approval.
- `src/components/ui/textarea.tsx` — new shadcn-style
  multi-line input (matched to `Input`).
- "Configure publish package" link added to the existing
  `publishing-section.tsx` so the content detail page routes
  to the new surface.

### M4.6 — Integration tests

- `tests/integration/publishing-m4.test.ts` — 8 cases against
  a real Postgres database:
  1. Save → read roundtrip preserves the discriminated union.
  2. Saving a payload increments `content_items.revision`.
  3. Readiness blocks when the final-copy approval is missing.
  4. An internal note does NOT increment revision.
  5. Cross-workspace channel access is rejected (IDOR defence).
  6. Browser-supplied final-copy approval is stripped.
  7. Agency-admin approval is stamped with the server actor/time.
  8. Material changes reset approval and non-admin approval is denied.
- `tests/e2e/publish-package.spec.ts` — admin save/reload/approve
  and planner cannot self-approve journeys.

## Security and audit requirements

| Requirement                                                | Status                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Central materiality service for material edits             | ✅ `recordMaterialityEvent` is the single funnel; every platform-payload write goes through it.           |
| Increment appropriate revision on material edit            | ✅ `content_items.revision` is `revision + 1` (atomic).                                                   |
| Reset affected approval decisions                          | ✅ `approval_request.status` is set to `cancelled` with `invalidation_reason` and `invalidated_at`.       |
| Record an immutable event                                  | ✅ `activity_event` row written inside the same transaction as the revision bump.                         |
| Notify affected reviewers                                  | ✅ In-app notification per reviewer with deep link to `/app/w/<slug>/planning/<id>/publish`.              |
| Administrative changes do NOT reset approvals              | ✅ `recordNonMaterialityEvent` writes a metadata-only audit row; no revision, no reset, no notification.  |
| Never treat hashtags as globally mandatory                 | ✅ Hashtags are not in the required-field table for any platform.                                         |
| Block "Ready for publishing" while blockers remain         | ✅ `canPublish` is `blockers === 0 && channels.length > 0`; the server command rejects blockers.          |
| Revalidate on the server during every readiness transition | ✅ `confirmPublishReadiness` re-evaluates blockers, status, role and revision before recording readiness. |
| Integrate with AI `completeness_check` (advisory only)     | ✅ `foldAiSuggestions` is the integration seam; suggestions are always `severity: "recommendation"`.      |
| IDOR defence on support grant IDs                          | ✅ Cross-workspace channel access rejected with `FORBIDDEN` (or `NOT_FOUND` for the channel row).         |
| Quick Create unchanged (4 fields)                          | ✅ Out of scope; `quick-create` was not touched in M4.                                                    |

## Migration, compatibility, and rollback

- The M4 implementation is **schema-additive only** — no new
  tables, no new columns on existing tables. The
  `content_item_channel.platform_payload` JSONB column was
  added in M2; the discriminated-union Zod schema is a
  TypeScript-only contract.
- Application rollback path: deploy the prior image. The
  publish route is new; the link is additive; no existing
  service or column is touched.
- Destructive rollback: zero-cost (nothing to drop).

## Definition of done — evidence pointers

| Requirement                                         | Evidence                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1,469 unit tests + 106 integration tests green      | `pnpm test:unit` 1,469/1,469, `TEST_DATABASE_URL=… pnpm test:integration` 106/106.                     |
| `pnpm verify` clean                                 | `pnpm format:check && pnpm lint --max-warnings=0 && pnpm typecheck && pnpm test:unit && pnpm build`.   |
| Discriminated union covers all 9 platforms          | `tests/unit/payload-schemas.test.ts` 19 cases.                                                         |
| Material edits reset approvals + increment revision | `tests/integration/publishing-m4.test.ts` "saving a payload increments content_items.revision".        |
| Administrative changes do NOT reset approvals       | `tests/integration/publishing-m4.test.ts` "internal note does NOT increment revision".                 |
| IDOR defence                                        | `tests/integration/publishing-m4.test.ts` "cross-workspace channel access is rejected (IDOR defence)". |
| Hashtags not globally mandatory                     | The required-field table (`REQUIRED_FIELDS`) has no `hashtags` entry for any platform.                 |
| New route on the right URL                          | `/app/w/[slug]/planning/[id]/publish` is a real `page.tsx`; `pnpm build` shows it.                     |
| Link from the existing publishing section           | `publishing-section.tsx` adds a "Configure publish package" link.                                      |
| No M1 / M2 / M3 regression                          | `pnpm test:integration` 106/106 (covers all prior suites).                                             |

## Out of scope (deferred)

- AI `completeness_check` route integration is plumbed
  (`foldAiSuggestions`) but the actual call to the AI
  capability from the publish UI is a follow-up. The
  readiness service is the integration point.
- Platform API delivery remains manual; M4 builds and approves the
  package but does not connect provider OAuth or publish remotely.
- The publish route now passes the Chromium axe sweep. Linux visual
  baseline capture/reviewer approval remains part of the independent
  release-candidate workflow and is intentionally not generated on macOS.
