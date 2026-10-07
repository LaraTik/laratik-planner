# ADR 0018 — Workspace URLs carry the tenant

Date: 2026-10-07
Status: accepted for implementation
Extends: [ADR 0007](0007-workspace-overview-dashboard-refactor.md) (workspace-by-slug resolution)

## Context

`planner.laratik.com/app/w/food-game` did not mean _that_ workspace.

A workspace's identity is the tuple `(agencyId, slug)`. The uniqueness constraint
is per-agency, not global:

```js
// schema/workspaces.ts
uniqueIndex("workspace_agency_slug_unique").on(t.agencyId, sql`lower(${t.slug})`);
```

The route carried only the slug, so `findWorkspaceBySlug` fell through to the
implicit path:

```js
// lib/workspaces/context.ts
const ctx = await resolveActiveAgencyContext({ actor }); // the RECIPIENT's cookie
agencyId = ctx?.agencyId ?? null;
```

And that cookie is deliberately sticky — _"once a user lands in agency B, they
stay there until they ask for A"_ (`lib/auth/agency-context.ts`).

So the URL meant **"the workspace with this slug in whatever agency the person
opening the link currently has active."** The meaning lived in recipient-side
state, not in the link. Two agencies can both own `food-game`; a link shared
between them either 404'd or opened a different tenant's workspace.

### Severity, stated precisely

This is **not** a cross-tenant data leak. Every hop is membership-gated, and an
explicit agency override fails closed. The real risk is a **wrong
destination**: a user who belongs to both agencies, whose cookie is sticky on B,
receives a link to A's workspace and edits B's content believing it is A's. That
is a data-integrity bug, not a confidentiality one — but it is the kind that
quietly corrupts the wrong client's data.

## Decision

**The canonical workspace URL carries both segments:**

```
/app/a/<agencySlug>/w/<workspaceSlug>[/<section>][?query]
```

A shared link is now self-describing: it names the tenant, so it opens the same
workspace for everyone who has access to it, regardless of their active agency.

Four parts:

1. **`src/lib/urls.ts` is the single source of truth.** `workspaceHref`,
   `parseWorkspacePath`, `legacyToCanonicalHref`. Every workspace link is built
   through it, which is what stops a cookie-scoped URL from creeping back in.

2. **`getAccessibleWorkspaceAtPath(actor, agencySlug, slug)`** replaces
   `getAccessibleWorkspace(actor, slug)` on pages. `findAgencyIdBySlug` maps the
   slug to an id **only for an active member** and fails closed, so a wrong-tenant
   pair yields `null` → 404, not a redirect into someone else's data.

3. **The workspace layout no longer reads the active-agency cookie.** It resolves
   the workspace from the URL alone. `tests/unit/workspace-layout-agency-context.test.tsx`
   previously asserted the _opposite_ — that the layout threaded the cookie's
   agency id into the lookup. It was rewritten, and now asserts both halves of
   the fix: the URL's agency wins, and the cookie resolver is never called.

4. **`/app/w/[...legacy]` catch-all keeps old links working.** Exactly one
   reachable workspace with that slug → canonical. **More than one → the
   workspace switcher, not a guess.** None → 404, preserving the anti-IDOR
   contract that an unreachable slug is indistinguishable from a non-existent one.
   It uses `redirect()` (307), **not** `permanentRedirect()`: rule 2's outcome
   depends on _who is asking_, and a cached 308 would freeze one visitor's answer
   and serve it to everyone.

   `findReachableWorkspacesBySlug` is deliberately **not** built on
   `listSwitcherWorkspaces` — that helper resolves the active agency internally,
   so using it to answer "which workspace did this link mean?" would have
   reproduced the original bug inside the fix.

## Scope, and what is deliberately NOT done

- **Publishing mutations** (`recordPublicationAction`, the settings actions, the
  publish package form) now carry the explicit tenant. They write state, so
  binding the tenant matters most there.
- **Most read-only server actions** still resolve through the active-agency
  context — the same membership-gated behaviour as before this change. Threading
  the tenant through ~27 brand-kit actions and their call sites is real work, but
  it does not affect link sharing, which is what this ADR is about. It is a
  follow-up, not an oversight.
- **Link builders still emit the legacy `/app/w/...` shape.** Every navigation
  therefore costs one redirect hop. This is _correct_ (the redirect resolves the
  tenant and refuses to guess) but not yet canonical. Migrating them to
  `workspaceHref` is the next step and the reason `lib/urls.ts` exists.

## Consequences

- A link sent between agencies now opens the intended workspace, or the switcher
  when it genuinely cannot know which one was meant.
- Old bookmarks, screenshots and previously-shared links keep resolving.
- URLs are longer. That is the price of being self-describing, and it is the
  price that makes deep links (`deep-linking` in the navigation rules) actually
  work across tenants.
- The 404-not-403 contract is preserved end to end, so cross-tenant slugs remain
  unenumerable.
