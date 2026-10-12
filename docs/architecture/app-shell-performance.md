# App-shell navigation performance

The authenticated app shell — `src/app/(app)/layout.tsx` — renders on **every**
navigation inside `/app`, including every tenant (agency) and workspace
switch. It is the single most reused server component in the product, so its
cost is the floor under the perceived speed of the whole authenticated app.

This file records how that cost is measured and what the budget is, so the
next person adding a per-workspace query to the shell notices the pattern
before it becomes a regression.

## Why the shell is the hot path

`layout.tsx` must supply the sidebar, the agency switcher, the workspace
switcher, and per-workspace badge counts. Each of those is a _set_ question
("what can this actor see across all their workspaces?"), but the
implementation could easily reach for a per-workspace loop instead. When it
does, the cost is `O(workspaces)` round-trips on every navigation, paid by
every user on every click.

## Budget

Measured with a real Postgres by instrumenting `pool.query` (see
"Reproducing the measurement" below), for the layout's switcher + role +
badge path:

| Workspaces | Queries (before) | Queries (after) |
| ---------: | ---------------: | --------------: |
|          1 |                7 |               7 |
|          8 |              131 |               7 |
|         25 |             ~390 |               7 |
|         60 |             ~910 |               7 |

The budget is **a constant, not a per-workspace multiple**. A change that
introduces a `switcher.options.map(...)` with a query inside it is a
regression even when it looks correct and passes every behavioural test.

## The same rule applies beyond the shell

The rule is not shell-specific; it is about answering a _set_ question without
looping. Two other surfaces had the same shape and are now covered:

| Surface                                     | Before                                                    | After   |
| ------------------------------------------- | --------------------------------------------------------- | ------- |
| `app/media/page.tsx` role filters           | ~3N (two loops, the second redundant)                     | 3       |
| `listMediaFolders` + `listMediaFoldersTree` | ~8 per workspace (access check + the same `select` twice) | 4       |
| Platform security overview                  | 1 per **agency**, platform-wide                           | 1 total |

The platform case is the one worth remembering: its growth axis is the
**customer base**, not one customer's team. It also carried a comment
justifying itself as cheap because "every agency has at most a handful of
recent requests" — which bounded the _result_, while the _work_ stayed linear.
When a comment explains why something is cheap, check whether it is describing
the output or the cost.

## Rules

1. **Never loop a query over `switcher.options`.** Use a set-based helper:
   `WHERE id IN (...)`, or a `groupBy(workspaceId)` count. The batched
   counterparts are `getActorWorkspaceRoleIndex` (`lib/auth/policy.ts`) and
   `getWorkspaceBadgesForActor` (`lib/nav/badges.ts`).
2. **Resolve the agency once.** Every workspace in one agency resolves the
   same `agencyId`, so any per-workspace admin check repeats the identical
   statement. The batched helper resolves admin flags for all _distinct_
   agencies in one query.
3. **Reuse one role index per request.** If two consumers both need
   authorization context, pass the index to the second one instead of letting
   it re-derive it. Badge gating reads the same role index the sidebar access
   map was built from.
4. **Don't generate legacy URLs.** `/app/w/<slug>` is a redirect-only page
   inside the `(app)` route group: routing to it renders the entire shell and
   discards it. Emit `/app/a/<agencySlug>/w/<slug>` via `workspaceBasePath`.
   The legacy route exists for inbound bookmarks only, and `revalidatePath`
   naming it could never invalidate anything — those calls were removed.
5. **Don't rely on `cache()` alone for a dedupe that has to be true.** React's
   `cache()` memoises only inside an active Next request scope; outside one it
   silently does not cache. A saving that depends on it is therefore both
   unobservable at runtime and untestable. If a duplicate read must actually be
   avoided, pass the rows — `listMediaFoldersTree` takes `preloadedFolders`
   for exactly this.

## Reproducing the measurement

Count round-trips through the real pool, against the disposable test database:

```ts
const original = pool.query.bind(pool);
let queries = 0;
pool.query = (...args) => {
  queries += 1;
  return original(...args);
};
await someLayoutHelper();
pool.query = original;
```

`tests/integration/app-shell-batched-access.test.ts` does exactly this and
asserts the count is bounded, so the budget above is enforced rather than
documented-and-hoped.

Note that counting **unique** `(sql, params)` pairs is a useful diagnostic but
is _not_ the budget: React's `cache()` already collapses same-argument calls
in a real request, so a raw count taken outside a request scope overstates the
per-workspace cost. Assert on the real count through the pool, and use the
unique-pair view only to locate redundant work.

## Corollaries

- **A "cheap" comment may be describing the result, not the cost.** The
  platform security fan-out was justified as cheap because each agency had
  few requests — true of the output, false of the queries.
- **A dead call can hide a live binding.** Removing a `revalidatePath` orphaned
  two `const result =` assignments it had been the only consumer of. Lint
  caught it; a behavioural test never would have.

- **A fan-out is invisible to behavioural tests.** Every count and access
  decision in the batched path can be correct while the query count explodes.
  That is why the query budget is asserted separately.
- **A batched count that is faster but different is a permissions bug wearing
  a performance patch's clothes.** Badge gating is a real security boundary:
  approvals are counted across the union of gates, so a per-workspace filter
  must be reapplied. When changing the gates, re-run the differential
  assertions against the per-workspace helpers rather than editing expected
  numbers.
