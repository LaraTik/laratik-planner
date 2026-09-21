# Workspace Activity (Round 2 — ui-ux-pro-max)

The Activity page grew up: from a brand-kit-scoped audit log into a
workspace-wide feed that aggregates every meaningful change.

| Old URL                            | New URL                                       |
| ---------------------------------- | --------------------------------------------- |
| `/app/w/[slug]/brand-kit/activity` | `/app/w/[slug]/activity` (with redirect shim) |

The old URL still resolves — `/brand-kit/activity/page.tsx` is a
one-line `redirect()` shim so existing Slack/email links keep working.

## Sources of activity

The new page is fed by `listWorkspaceActivity`, which aggregates two
sources and merges them in-memory by `createdAt DESC`:

1. **`activity_event` table** — already records workspace-level events
   for content items, reviews, plans, publications, and settings. The
   schema lives at `src/lib/db/schema/notifications.ts:145`. Indexes on
   `(workspace_id, created_at DESC)` and `(content_item_id)` are
   already in place from the original schema.

2. **`listRecentBrandUpdates`** — the four brand-kit source tables
   (assets, voice rules, publishing rules, linked resources). Until
   now this was the _whole_ of the old activity page. It's now one
   filter chip on the new feed (the brand-kit events keep the same
   actor profile; brand-kit actor_id is wired through to
   `security_audit_event` for downstream audit).

Each row is classified into one of six scopes via the
`kindToScope(kind)` mapping in `service.ts`:

| Scope               | Kinds                                                                           |
| ------------------- | ------------------------------------------------------------------------------- |
| `content`           | create, update, delete, archive, restore, schedule_change, content_copy_patched |
| `review`            | review, approval, approval_reset, changes_requested                             |
| `planning`          | assignment                                                                      |
| `publication`       | delivery, publication                                                           |
| `brand_kit`         | (brand-kit source rows only)                                                    |
| `settings` / `team` | reserved for future kinds; reserved today so chips don't shift                  |

The toolbar exposes six chips (`All / Content / Reviews / Brand kit /
Planning / Publications`); the underlying service renders
`settings` and `team` rows under the `content` count when those
kinds appear.

## Page structure

```
┌───────────────────────────────────────────────────────────────┐
│ PageHeader              workspace name                       │
├───────────────────────────────────────────────────────────────┤
│ KPI row: All · Content · Reviews · Brand kit · Planning ·    │
│         Publications    (active chip is the "selected" tone) │
├───────────────────────────────────────────────────────────────┤
│ Toolbar:  search box  filter chips  clear                   │
├───────────────────────────────────────────────────────────────┤
│ ┌─[avatar] Maya            edited                  Spring drop│
│ ──────────── 24 May, 14:32                          [Content] │
│                                                              │
│ ┌─[avatar] Sam           approved                  Lookbook 04│
│ ──────────── 24 May, 12:01                          [Reviews] │
│                                                              │
│ ── See all  · page 1 of 4 · Prev / Next ──                  │
└───────────────────────────────────────────────────────────────┘
```

Each row is keyboard-focusable; the target label is a deep link to
the source row's canonical page (`/planning/[id]`, `/reviews/[id]`,
`/calendar?item=[id]`, etc.).

## Why SSR over a Server Action

Same logic as PR1: state lives in URL search params
(`?role=content&page=2`), filters are GETs, the page is fully SSR.
No client JS for the data fetch path; only the toolbar form submits
over a regular `<form method="GET">`.

## Bilingual

`src/messages/{en,ar}/activity.json` — both locales have the same
key structure. Parity-pinned by `tests/unit/i18n/catalogs.test.ts`.

## Verification

```
✅ pnpm typecheck                          clean
✅ pnpm exec eslint (max-warnings=0)       clean
✅ pnpm vitest run tests/unit/i18n/catalogs.test.ts  9 / 9
```

## Out of scope for this round (intentionally)

- Summary free-text search via SQL pushdown (current toolbar accepts
  `?q=` and persists it; the merge will wire it to a
  `summary ILIKE %q%` predicate in a follow-up).
- Actor filter chip (planned; not built in v1 because the activity
  feed already renders actor identity per row, and an actor combobox
  is a deeper UX decision that benefits from a dedicated design pass).
- Live tail / SSE. The page is a tool; a real-time stream would
  belong elsewhere (notification bell / dashboard tile).
