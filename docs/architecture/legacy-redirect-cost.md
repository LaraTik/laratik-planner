# Legacy `/app/w/<slug>` redirect — measured cost

Recorded 2026-10-12, against `main` at `a2a7e521` (the build deployed to
`laratik-vps` at the time).

## The question

`src/lib/urls.ts` says the legacy workspace URL shape is inbound-only —
"Never link to this form" — yet the app was still generating it for internal
navigation. The obvious cost is one extra HTTP round-trip through the legacy
catch-all. The less obvious question is whether the **app shell re-renders**
on that hop, which would roughly double the server work per navigation.

This note records the measurement rather than an assumption. A previous
change deferred the URL sweep partly because this number was unknown; the
deferral was justified at the time, but leaving it unmeasured was not.

## Method

- **Production build.** `pnpm build` + `pnpm start` against a dedicated
  database (`planner_perfmeasure`, migrated with `pnpm db:migrate`). Dev mode
  was rejected deliberately: Router Cache behaviour differs there, and the
  question is about cache/render behaviour.
- **Real data.** One agency (`acme`), one user, one workspace (`demo`) plus
  six filler workspaces so the shell's workspace list has real work, and 25
  content items so the planning page is not free to render.
- **Real session.** Auth.js v5 cookies are encrypted JWE, so the session was
  minted with NextAuth's own `encode()` rather than by driving the
  credentials form (which rate-limits at 5/hour and made repeated runs fail
  for reasons unrelated to the measurement).
- **SQL counted server-side** from the Postgres log by byte offset — nothing
  was instrumented inside the app being measured.
- **Prefetch suppressed.** The app shell prefetches every sidebar and tab
  route on render; without blocking those the measured window is dominated by
  prefetch traffic and the signal is meaningless.
- **3 runs**, identical `pnpm start` server, no restart between them.

## Result

| Navigation                                | SQL statements |    Wall-clock (ms) |
| ----------------------------------------- | -------------: | -----------------: |
| `/app/a/acme/w/demo/planning` (canonical) |         **52** |    670 / 667 / 666 |
| `/app/w/demo/planning` (legacy)           |         **73** | 1301 / 1023 / 1305 |
| **Delta**                                 |        **+21** |        **~1.5–2×** |

The SQL counts were byte-identical across all three runs (52 and 73), so this
is a deterministic property of the render, not measurement noise. The
wall-clock spread is JIT/GC noise; the statement counts are the finding.

**The app shell IS re-rendered on the legacy hop.** The ~21 extra statements
are roughly three times the shell's own post-optimisation cost of ~7 queries,
which is what a second full shell render plus the workspace layout plus the
legacy page's own slug resolution would look like.

## Scope of the claim

- **What was measured:** a document navigation to each URL. That covers every
  inbound legacy link — bookmarks, pasted URLs, previously-shared links — and
  is the conservative (worst-case) reading.
- **What was NOT isolated:** the true client-side `<Link>` click. Attempting it
  produced a window so polluted by prefetch traffic that blocking it also
  changed what was being measured. A client-side click may skip the shared
  layout segment and cost less than +21. **Do not treat +21 as a per-click
  figure.** It is a measured cost for a document navigation, and the direction
  of the effect is confirmed.
- **RSC request counts from the harness are unreliable** and are excluded:
  Playwright's `request` event fires before route interception aborts a
  request, so prefetched-then-aborted requests were still counted. The SQL
  delta is the trustworthy signal.

## Consequence

The sweep that removes the remaining legacy navigations is a **user-visible
performance fix**, not only a correctness one — alongside the tenant-ambiguity
argument, which stands independently: a workspace slug is unique per agency, so
a legacy link resolves to "whichever agency the reader currently has active".

**Status: the sweep is complete, including the two holdouts.** Every
`/app/w/<slug>` navigation the app generated now emits the canonical form.
The legacy catch-all is the only remaining producer of that shape, and it is
the one thing `tests/unit/read-path-fanout-guard.test.ts` allowlists.

The last two producers were not fixed by swapping a string. Both said "we
cannot know the tenant here", and both were given the tenant instead:

- the workspace switcher was deriving it from whatever URL the user was
  currently on, so a switch from a non-canonical page had nothing to work
  with. Each switcher option now carries its own agency slug.
- the tenant switch fetched it in a separate query and tolerated an empty
  result. It now joins the agency onto the landing workspace, so there is
  no branch that can fall back.

Worth noting that the first of those was also a latent correctness bug, not
just a performance one: switching from an agency-one workspace into an
agency-two workspace inherited agency-one from the URL. That is the exact
cross-tenant ambiguity canonical URLs exist to prevent.

Priority therefore goes to the highest-traffic generators first: the
planning-detail links rendered from lists (`needs-attention-list`,
`recently-updated-list`, `review-row`, `calendar-event-card`).

## Reproducing

1. `docker`-free: create a scratch database, `pnpm db:migrate`.
2. Seed one agency / one user / one workspace / 25 content items.
3. `ALTER SYSTEM SET log_statement = 'all'; SELECT pg_reload_conf();`
4. `pnpm build && pnpm start` with `DATABASE_URL` pointed at the scratch DB.
5. Mint an `authjs.session-token` with `encode()` from `next-auth/jwt`, load
   each URL in a fresh context with all `_rsc` requests aborted, and count
   statements appended to the Postgres log by byte offset.
6. **Revert:**
   `ALTER SYSTEM RESET log_statement; ALTER SYSTEM RESET logging_collector;
ALTER SYSTEM RESET log_destination; ALTER SYSTEM RESET log_filename;
SELECT pg_reload_conf();`

Original values on the dev server were `log_statement=none`,
`logging_collector=off`, `log_destination=stderr`, `log_filename=postgresql-%Y-%m-%d_%H%M%S.log`.
