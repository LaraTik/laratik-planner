# ADR 0008: Agency switcher must navigate atomically to a URL in the new tenant context

- Status: accepted
- Date: 2026-08-31
- Scope: `src/lib/auth/agency-actions.ts` → `switchActiveAgencyAndRedirect`, `src/components/app-shell/agency-switcher.tsx`, the workspace layout, the workspace switcher, and the sidebar's agency/workspace hierarchy.
- Supersedes: the implicit v1 behavior of pushing to `/app` after writing the active-agency cookie.

## Context

The pre-refactor agency switcher was a correctness hazard, not
just a UI smell. The flow:

```ts
// src/components/app-shell/agency-switcher.tsx (before)
const ok = await switchActiveAgency(a.id);
if (!ok) return;
router.push("/app"); // ← leaves the old workspace URL in the
//   address bar until the next click
router.refresh();
```

The agency switcher had three concrete problems:

1. **Stale workspace URL lingers.** When the user was on
   `/app/w/food-game/planning/123` and switched agency,
   `router.push("/app")` did not clear the previous URL. The
   user saw `/app/w/food-game/planning/123` in the address bar
   for the entire network round-trip; only the next
   render reflected `/app`.

2. **Browser-back resurrects a cross-tenant URL.** The stale
   URL on the address bar, if browser-backed into, hit the
   WorkspaceLayout with the new agency in the cookie and the
   old slug in the URL. The `getAccessibleWorkspace` helper
   correctly 404'd (anti-IDOR), but the user had no idea
   _why_ their URL was suddenly invalid. The page rendered
   not-found for content they had permission to access a
   second ago.

3. **The agency switcher was hidden in workspace mode.** The
   sidebar footer only rendered `<AgencySwitcher>` when
   `!inWorkspace`. A multi-agency user had to navigate back
   to `/app` to switch agency, which is the same flash bug
   in reverse.

The sidebar header showed Brand + Workspace but never Agency.
The hierarchy was invisible.

The anti-IDOR server layer (signed cookie + per-decode
membership re-check + 404 not 403) was unchanged and
correct. The bug was purely in the _client navigation
contract_ after the server had authorized the switch.

## Decision

The agency switcher is a **correctness** concern, not a UI
concern. The contract is:

1. **The tenant switcher must navigate atomically to a URL
   in the new tenant context.** The server action
   `switchActiveAgencyAndRedirect(agencyId)` validates
   membership, writes the signed cookie, and returns the
   first accessible workspace slug in the new agency. The
   client pushes to `/<tenant>/<default-resource>` in one
   router transition. Never `router.push("/<global-landing>")`
   — that leaves the old URL in the address bar.

2. **The outer switcher must stay visible in inner contexts.**
   In a multi-tenant app, the agency switcher cannot hide
   itself when the user is inside a workspace. Hiding it
   forces the user to navigate to the global landing just to
   switch — which is the same flash bug in reverse. The
   switcher is the _outer_ context; it is reachable
   everywhere.

3. **The inner switcher (workspace) must drop detail-page
   suffixes on switch.** Switching workspaces while on
   `/<agency-A>/<workspace-1>/<resource>/<id>` should not
   navigate to `/<agency-A>/<workspace-2>/<resource>/<id>` —
   the id does not exist in workspace-2. Land the user on
   the section index (`/<agency-A>/<workspace-2>/<resource>`)
   so they keep their intent ("I was in planning") without
   carrying a stale id.

The anti-IDOR server layer is unchanged. The layout
resolver still 404s (not 403s) cross-tenant URL lookups; the
cookie decoder still re-checks membership on every decode.
The fix is purely about the client navigation contract. The
two work together: server prevents the data leak, client
prevents the URL flash.

## Consequences

### Positive

- The user never sees a cross-tenant URL in the address
  bar. Browser-back returns to the pre-switch page, not a 404.
- Multi-agency users can switch agency from inside a
  workspace without leaving it.
- The switcher is one consistent primitive (a single
  server action + a single client handler) regardless of
  the source URL.
- The contract is enforceable: the E2E spec
  `tests/e2e/agency-switcher.spec.ts` "atomic navigation"
  block pins it.

### Negative

- Switching agency from `/app` (the global landing) now
  navigates to the new agency's first workspace instead of
  staying on `/app`. This is a deliberate behavior change
  — see the v1 expectation in the prompt:
  `router.push("/app")`. The new behavior matches the
  master prompt's atomic-navigation contract and removes
  the same flash bug when switching from the global
  landing (the URL never lingers because there was no
  previous URL).
- The `switchActiveAgencyAndRedirect` action returns a
  discriminated union (`{ ok: true, agencyId,
firstWorkspaceSlug } | { ok: false, reason }`). The
  client must handle the `ok: false` case by NOT calling
  `router.push` (a forced navigation would mask the
  failure). This is pinned by the E2E spec.

### Rejected alternatives

- **`router.push("/app")` with `router.refresh()`** (the v1
  behavior). Rejected because the address bar shows the old
  URL during the round-trip; browser-back resurrects it.
- **`router.replace(...)` to a neutral URL before
  `router.push(...)`**. Rejected because the user sees a
  flash of the global landing between actions. Two
  transitions are worse than one.
- **Server-side redirect from the action**. Rejected
  because the action is called from a client component
  (Radix popover), and a server-side redirect would
  bypass the client's transition model. The action
  returns the destination; the client pushes.

## Cross-references

- The cross-project pattern is in Agent Memory:
  "Multi-tenant agency/workspace context switching must
  be atomic" (2026-08-31).
- `AGENTS.md` §W pins the invariant: signed cookie,
  server-side decode + membership re-check, anti-IDOR 404
  (not 403), atomic navigation on switch, workspace-scoped
  query keys, isolation tests in
  `tests/unit/workspace-isolation.test.ts` +
  `tests/e2e/workspace.spec.ts`.
- `tests/e2e/agency-switcher.spec.ts` "atomic navigation
  (P0.2)" block pins the E2E contract.
- `tests/unit/agency-actions.test.ts` pins the
  `switchActiveAgencyAndRedirect` action contract
  (unauthenticated / not-a-member / no-secret / with-
  workspace / no-workspace paths).
- The companion ADR is `0001-vps-port.md` (the original
  self-hosting decision that created the multi-agency
  capability in the first place). The
  `0002-multi-agency-saas-entitlements.md` ADR documents
  the agency-level permission model. This ADR documents
  the _client navigation contract_ that completes the
  multi-agency surface.
