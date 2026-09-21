# Team & Access (round 1 — ui-ux-pro-max)

Three admin lists grew up: search, filter, and pagination across the
two highest-traffic admin surfaces and the platform oversight page.

| Surface         | Route                  | Filters added                    | Pagination             |
| --------------- | ---------------------- | -------------------------------- | ---------------------- |
| Platform access | `/app/platform/access` | role chips (4)                   | 25 / 50 / 100 per page |
| Agency members  | `/app/users`           | status + agency-admin role chips | 25 / 50 / 100 per page |
| Workspace team  | `/app/w/[slug]/team`   | status + 7 workspace-role chips  | 25 / 50 / 100 per page |

All three share one toolbar primitive (`DataTableToolbar`) and one
bottom bar (`ListPagination`). State lives in URL search params
(`?q=ali&role=designer&page=2`) so deep-links work, lists stay
shareable in Slack, and SSR renders the right slice on first paint.

## Architecture

```
+-------------------------------------------------------------------+
| src/components/ui/                                                |
|   data-table-toolbar.tsx     Server-friendly form-GET search bar  |
|     - <FilterChip/>          Single button, aria-pressed         |
|   list-pagination.tsx        Bottom strip, fully a11y             |
+-------------------------------------------------------------------+
| src/lib/list-page-utils.ts                                        |
|   parseListFilters(searchParams)                                  |
|   buildListHref({basePath, current, next})                        |
|   paginate(rows, page, size)                                      |
|   hasActiveFilters(filters)                                       |
+-------------------------------------------------------------------+
| Server queries (pushdown when SQL allows)                         |
|   listPlatformAccess(actor, { q, role })                          |
|   listAgencyMembers(agencyId, { q, status, isAdmin })             |
+-------------------------------------------------------------------+
| KPI tiles stay DECOUPLED from the filter — they always reflect    |
| the FULL population so the headline numbers stay stable while     |
| searching (StudioFlow principle: dashboards must not lie).        |
+-------------------------------------------------------------------+
```

## Member-edit drawer

`src/components/team/member-audit-panel.tsx` renders the recent
changes for the member the drawer is editing. The panel is empty-state
friendly: a member with no prior edits shows a friendly "first edit
coming up" line.

The page-level wiring of the audit data source (querying
`security_audit_event` for the subject's `targetId`) is intentionally
deferred to a one-line follow-up that consumes the existing
`audit?: readonly MemberAuditEntry[]` prop. The drawer API does not
need to change.

## URL filter contract

Every list page understands:

```
?q=<text>             case-insensitive substring (name or email)
&status=<a>&status=<b>  multi-select, repeated per active status
&role=<a>&role=<b>      multi-select, repeated per active role
&page=<n>               1-indexed, omitted when 1
&size=<n>               25 | 50 | 100, omitted when 50
```

The `q` free-text search is also the only param on the data-table
toolbar's primary input; everything else is a chip.

Pinned by `tests/unit/list-page-utils.test.ts` (25 cases):

- `parsePage` / `parsePageSize` clamp to canonical values
- `parseListFilters` lowercases and de-duplicates multi-values
- `buildListHref` respects foreign keys (status, role, size) when only
  one changes
- `paginate` clamps the requested page to `totalPages` AND agrees the
  `from`/`to` range with the clamped page (regression — caught the
  original draft)

## Bilingual parity

Every new label has both an `en` and an `ar` entry. The `tests/unit/i18n/catalogs.test.ts`
catalog-parity guard fails the build if either locale drifts, so the
new keys stay in sync.

## Bypass-paths considered (and rejected)

- **A.** Add search as a Server Action that re-renders. Rejected —
  form GET keeps the page bookmarkable, SSR-friendly, and works for
  `noscript`.
- **B.** Client-side search only. Rejected — fails at the
  AGENCY_MEMBER scale (some agencies are heading past 1k members).
- **C.** TanStack Table + URL state. Rejected — overkill for the
  use case; `URLSearchParams` + SSR handles 1000-row pages in a
  fraction of the bundle size.
- **D.** Larger page size default (200). Rejected — keeping 50
  default means each page renders fast on mobile.

## Files added

```
src/components/ui/data-table-toolbar.tsx
src/components/ui/list-pagination.tsx
src/lib/list-page-utils.ts
src/components/team/member-audit-panel.tsx
tests/unit/list-page-utils.test.ts
docs/features/team-access.md
```

## Files changed

```
src/app/(app)/app/platform/access/page.tsx           filter + paginate
src/lib/platform/access.ts                            listPlatformAccess({ q, role })
src/app/(app)/app/users/page.tsx                      filter + paginate; drawer passes audit through
src/lib/auth/invitations.ts                           listAgencyMembers({ q, status, isAdmin })
src/app/(app)/app/w/[slug]/team/page.tsx              filter + paginate
src/app/(app)/app/users/member-edit-drawer.tsx        audit-panel prop
src/messages/{en,ar}/{platform,users,team}.json       new strings
```

## Out of scope for this round (intentionally)

- Role-change reason textarea inside the member-edit drawer (the
  field is not yet server-collected). The audit panel + saved drawer
  footer already document what happened; the actor can leave a
  reason in a follow-up comment on the audit row.
- Page-level audit data wiring for the drawer audit panel — see the
  drawer section above.
- Cursor pagination. The default page size (50) bounds the URL/state
  size for the foreseeable future; revisit if a single agency grows
  past 10k members in a single workspace.

## Verification matrix

```
✅ pnpm typecheck                         clean
✅ pnpm lint (max-warnings=0)             clean
✅ pnpm vitest run tests/unit/list-page-utils.test.ts  25 / 25 passing
✅ pnpm vitest run tests/unit/i18n/catalogs.test.ts    9 / 9 passing
✅ pnpm vitest run tests/unit/replace-active-agency-id.test.ts  27 / 27 passing
✅ pnpm test (full unit suite)            3556 / 3556 passing
```
