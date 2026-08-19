# Round 2 — Code + UX + Test Review Plan

**Date:** 2026-08-19
**Scope:** Finish the code/UX review started in the previous turn (uncommitted local changes
from 2026-08-18 evening), then do a second pass on test coverage.

## What state are we in?

- Site is **live at https://planner.laratik.com** with valid Let's Encrypt cert.
- 50 tests green (Playwright E2E + integration + unit).
- `pnpm lint` is clean.
- `pnpm typecheck` is **broken** — one error: `src/app/signin/page.tsx(7,27): Cannot find
module './auth-error-codes'`. The module was referenced but never created.
- 18 files uncommitted in the working tree (9 modified, 9 new) from the previous turn's
  UX/quality pass — sidebar/switcher/signin rewrites, shared status helpers, loading/error
  boundaries, etc.

## Round 2A — Code + UX + Quality (this pass)

The previous turn finished most of the structural UX work (sidebar active state, workspace
switcher keyboard, signin error UI, loading/error boundaries, shared status helpers, My
Work fixed). What's left:

### A1. Fix the typecheck break (BLOCKER, ~5 min)

- Create `src/app/signin/auth-error-codes.ts` with the lookup used by `signin/page.tsx`.
  Mirror the actual NextAuth v5 error codes we can produce (Configuration, AccessDenied,
  Verification, Default). Keep it pure, no I/O.
- Re-run `pnpm typecheck` to confirm green.

### A2. Finish UX round on the live surface (medium, ~1h)

Three surfaces were noted as "in progress" but never finished:

1. **Notifications bell** — focus trap on open (move focus into the dialog, restore to
   trigger on close), Esc closes, mobile full-width popover (already `max-w-[calc(100vw-2rem)]`
   but verify on a 320px viewport), empty state copy, optimistic mark-read with rollback
   if the action throws.
2. **Comments section** — optimistic insert on submit (clear the textarea immediately,
   add a "posting…" placeholder row that gets replaced on success or removed on failure),
   disabled-during-submit, better mobile wrap of the visibility/label selects, remove the
   spurious hidden `<X>` icon from the sr-only status line, type the `state` cast properly
   (no `as { error?: string }`).
3. **Sidebar / footer link** — `/app/account` doesn't exist (404 right now for non-admins).
   Two options: (a) build a minimal `/app/account` page with name/email/agency, (b) remove
   the link. I recommend (a) — it's needed for the "change display name" flow later anyway
   and removes a broken-link smell. If it expands scope too much, do (b) and add a TODO.

### A3. Code quality / dead code sweep (small, ~30 min)

- `humanStatus(item.format)` in My Work + Planning detail is wrong semantically (the
  function is for workflow status, not content format). Add a tiny `humanFormat()` or
  inline a `format.replace(/_/g, " ")` and rename. Same for "format" rendering — the
  format is e.g. "short_video", "blog_post", etc.
- `signin/page.tsx` does `await searchParams` (Promise) — that's correct for Next 15.
  Just confirm.
- Dead imports / unused props in the new files (lint passed but a manual pass with
  `grep` is faster than fixing it later).
- `useFormState` deprecation in React 19 — both `discussion-section.tsx` and the bell use
  it; React 19 replaced it with `useActionState`. Plan to keep `useFormState` for now
  (it's still exported, just deprecated) but flag in code comments so the next major
  pass swaps them.
- `Button asChild` is used in many places — confirm `asChild` works on our `Button`
  component (shadcn pattern). If not, swap to `<Link>` wrapping `<Button>` everywhere.

### A4. Best practices / consistency (small, ~30 min)

- All public pages should have `<title>` via `metadata`. Sign-in already has it. Add
  for `/legal/terms`, `/legal/privacy` (or remove the links if the pages don't exist).
- All `useState` setters in client components should be typed where the inferred type
  would be widened (none so far, but verify).
- All `useFormState` actions should be `void`-returning (no return value) per React 19
  best practice — current actions return `{ ok: true }` which is still valid but
  slightly off-pattern. Won't refactor unless `pnpm typecheck` complains.
- All `aria-current` usage: confirm `Sidebar` and `MobileNav` use the same
  `pathname === href || pathname.startsWith(href + "/")` predicate (currently both
  do, but slightly differently — Sidebar takes an `exact` flag, MobileNav always uses
  startsWith). Unify on one helper exported from `src/lib/utils/nav.ts`.

### A5. Final lint + typecheck + unit tests (gate, ~5 min)

- `pnpm lint --max-warnings=0` — must pass
- `pnpm typecheck` — must pass (currently fails)
- `pnpm test:unit` — must pass

### A6. Round 2A commit + push (small, ~5 min)

- One commit per logical group: A1+A3 (fixes), A2 (UX), A4+A5 (quality). Or one big
  commit if it's easier to review. Default: one commit with a structured message.

## Round 2B — Test coverage round 2 (after Round 2A lands)

Current coverage (50 tests, all green):

| Suite                             | Count  | Covers                                                                            |
| --------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `e2e/public.spec.ts`              | 11     | root, /signin, /signin/verify, /api/health, /api/bootstrap, /api/dev/*            |
| `e2e/auth-gate.spec.ts`           | 14     | 10 protected /app/* → 307, signed-in bypass, public-while-authed                  |
| `e2e/workspace.spec.ts`           | 5      | seeded nav, create-via-form, invalid-slug rejection, non-member                   |
| `e2e/content-flow.spec.ts`        | 4      | Quick Create, list, draft→content_review→approved_for_design, channel auto-select |
| `e2e/a11y.spec.ts`                | 4      | axe-core on public pages                                                          |
| `e2e/health.spec.ts`              | 2      | /api/health checks                                                                |
| `e2e/discussions.spec.ts`         | 6      | comment list, post, visibility, resolve, optimistic states                        |
| `integration/discussions.test.ts` | 4      | service-level comments + notifs + outbox                                          |
| `integration/schema.test.ts`      | ?      | (not seen)                                                                        |
| `unit/sentry.test.ts`             | 4      | Sentry wrapper                                                                    |
| **Total**                         | **50** |                                                                                   |

Gaps to close in Round 2B:

### B1. Notifications E2E (new file: `tests/e2e/notifications.spec.ts`, 6 tests)

- Bell renders 0 badge when empty
- After `markNotificationsRead` insert, bell shows N>0
- Click bell → popover opens → list shows items
- Click "Mark all read" → badge → 0, items dimmed
- Click "Mark read" on one row → that row's readAt set, badge -1
- Mobile viewport (375×667): popover full-width, doesn't overflow
- Esc closes popover and restores focus to trigger
- Outside click closes popover

### B2. Mobile viewport tests (new file: `tests/e2e/mobile.spec.ts`, 4 tests)

- Bottom nav visible at 375px
- Sidebar hidden at 375px, visible at 1280px
- Topbar (mobile variant) shows initials at 375px, name+email at 1280px
- Touch targets on bottom nav are ≥44px (use `getBoundingClientRect`)

### B3. Error states (extend `e2e/public.spec.ts` or new `e2e/error-states.spec.ts`, 4 tests)

- 404 route → renders not-found page (not blank screen)
- /app without session → 307 to /signin (already covered, but assert the page is the
  signin page, not just a 307)
- Signin with `?error=AccessDenied` → error banner shown
- Signin with `?error=Configuration` → different copy shown

### B4. Workspace switcher keyboard (extend `e2e/workspace.spec.ts`, 3 tests)

- Tab to switcher → Enter → popover open → focus on first item
- ArrowDown moves aria-activedescendant
- Enter selects → navigates to new workspace
- Escape closes + returns focus to trigger

### B5. A11y per-route scan (new file: `tests/e2e/a11y-routes.spec.ts`, ~5 tests)

- For each authenticated route, sign in, navigate, run `@axe-core/playwright`.cover()
  and assert no serious/critical violations.
- Routes: /app, /app/workspaces, /app/w/[slug], /app/w/[slug]/planning, /app/w/[slug]/planning/[id]
- Signin page should be scanned too (a11y.spec.ts already covers some, but not all
  branches)

### B6. Loading + error boundary render (new file: `tests/e2e/loading-error.spec.ts`, 2 tests)

- Mock a slow route (e.g. /api/health → 5s delay) → assert skeleton renders
- Force a server error on /app → assert error boundary shows "Try again" button

### B7. Auth-gate edge cases (extend `e2e/auth-gate.spec.ts`, 3 tests)

- `?callbackUrl=//evil.com` → must not redirect to off-origin URL
- `?callbackUrl=/app/w/secret` → redirects to that path fine
- Expired/missing session token → redirect with `?callbackUrl` preserved

### B8. Final test gate (~5 min)

- `pnpm test:unit`
- `pnpm test:e2e` (the existing 40+ tests + ~26 new)
- `pnpm test:integration`
- All must pass

### B9. Commit + push (~5 min)

- One commit per logical group: B1-B4, B5, B6, B7.
- Total new tests: ~26. New total: ~76.

## Round 2C — Deploy + smoke (small, ~10 min)

- Deploy to laratik-vps (`mavis-trader.sh`-style): `git pull && pnpm build && docker compose up -d --build`
- Smoke test https://planner.laratik.com (root + /signin + /api/health via curl)
- Update `docs/operations/runbook.md` and `docs/implementation/progress.md` with the
  round-2 results.

## Out of scope (deferred)

- OAuth provider setup (Google, Mailcow SMTP) — user-owned, not engineering
- /app/account page build (option a in A2) — punted to a follow-up if needed
- React 19 `useActionState` migration — punt to a dedicated refactor turn
- Restic offsite backups — user-owned (needs GitHub repo)
- Sentry DSN wiring — env-gated, ready when user has the DSN

## Estimated total time

- A1: 5 min
- A2: 60 min
- A3: 30 min
- A4: 30 min
- A5: 5 min
- A6: 5 min
- B1-B7: 90 min (mostly writing new specs)
- B8: 5 min
- B9: 5 min
- C: 10 min
- **Total: ~4 hours of focused engineering**

## Acceptance bar

- `pnpm lint --max-warnings=0` passes
- `pnpm typecheck` passes
- `pnpm test` (unit + integration + e2e) passes — ~76 tests
- Site is live and serves `/app` (signin redirect), `/signin`, `/api/health`
- progress.md + runbook.md reflect the new state
- All changes pushed to https://github.com/LaraTik/laratik-planner
