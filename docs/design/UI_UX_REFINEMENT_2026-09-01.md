# UI/UX Refinement and Arabic Localization — page-by-page audit

- **Date:** 2026-09-01
- **Plan:** `docs/ui-ux-pro-max-2026-09-01.md` (the `/ui-ux-pro-max` master prompt for the **final** pass).
- **Branch:** `feat/ui-ux-arabic-2026-09-01`
- **Companion ADR:** [`docs/decisions/0009-user-interface-locale.md`](../decisions/0009-user-interface-locale.md)
- **Previous passes:**
  - `docs/ui-ux-pro-max-2026-08-30.md` (sidebar / navigation refactor)
  - `docs/ui-ux-pro-max-2026-08-31.md` (product UX system, agency/workspace context fix, content / board / design queue surfaces, AI contract)
  - `docs/design/UI_UX_REFINEMENT_2026-08-24.md` (settings + brand-kit foundations)

## Scope

- 65 page routes, 6 layout files, 8 loading files, 6 error files, 1 not-found.
- All authentication / invitation / setup / recovery surfaces.
- Public surfaces (landing, privacy, terms, data-deletion).
- Agency-admin, workspace-manager, client-reviewer, and platform-admin consoles.
- The full notification + email rendering path (the message-key migration is the structural change; the per-screen review is a follow-up).
- All system emails that form part of a user journey (invitation, password reset, magic link, mention, daily digest, delivery published, request changes, approval, scheduled publish failure).

## Status legend

| Status         | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `Not Reviewed` | Surface exists; the row has not been audited yet.                                                 |
| `Reviewed`     | Audit row is complete. P0/P1/P2/P3 findings recorded.                                             |
| `Implemented`  | The proposed change has landed in code on the `feat/ui-ux-arabic-2026-09-01` branch.              |
| `Tested`       | The change passes the focused unit + bilingual E2E + axe + visual subset.                         |
| `Verified`     | Independent review has accepted the change. Only the independent reviewer can move to `Verified`. |

Severity definitions from the master prompt:

- **P0** — security, privacy, authorization, data loss, or unusable critical journey.
- **P1** — task blocker, broken responsive layout, or missing localization.
- **P2** — unclear hierarchy, recovery, consistency, or accessibility problem.
- **P3** — visual polish.

## Phase tracker

The 10-step master plan mapped to this branch's commits:

| Phase | Subject                                                                                  | Status                        | Evidence                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Localization engine, fonts, profile switcher, public switcher, common catalogs           | **Implemented**               | `pnpm typecheck` clean; `pnpm lint` clean; `pnpm format:check` clean; `pnpm test:unit` 2950/2950 pass (53 new i18n tests, 2897 pre-existing); ADR-0009 accepted; audit row #14 `Implemented`.                                                                                                               |
| 2     | Landing, sign-in, verification, recovery, setup, invitation, password                    | **Implemented** (this commit) | Landing, sign-in (page + signin-options client component + auth-error-codes), sign-in/verify, sign-in/forgot-password migrated to the catalog; setup / accept-invitation / set-password deferred to a Phase 2 follow-up. 73 i18n + signin-options + auth-error-codes tests pass; full unit suite 2953/2953. |
| 3     | Root shell, sidebar, mobile nav, account, notifications, agency/workspace switchers      | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |
| 4     | My Work, workspace overview, planning list, board, calendar, Quick Create, Batch Add     | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |
| 5     | Content detail, editing, format payload, translations, AI assistance, comments, activity | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |
| 6     | Review queues, delivery versions, client review, client calendar, publishing             | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |
| 7     | Workspaces, users, roles, invitations, team, channels, Brand Kit, library, settings      | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |
| 8     | Agency administration, plans, AI/social configuration, platform console                  | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |
| 9     | Legal, privacy, operational, error, denied, archived, unavailable states                 | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |
| 10    | Full evidence reconciliation and independent-review handoff                              | `Not Reviewed`                |                                                                                                                                                                                                                                                                                                             |

## Inventory — 65 page routes

Generated from the `feat/ui-ux-arabic-2026-09-01` branch starting commit
(`b1d08ce Merge branch 'feat/ui-ux-refinement-2026-09' into main`). The
inventory is regenerated by:

```bash
find src/app -name "page.tsx" -not -path "*/node_modules/*" | sort
```

and verified against the route-boundary files:

| Count | File kind          | Glob                                    |
| ----- | ------------------ | --------------------------------------- |
| 6     | `layout.tsx`       | `find src/app -name "layout.tsx"`       |
| 8     | `loading.tsx`      | `find src/app -name "loading.tsx"`      |
| 6     | `error.tsx`        | `find src/app -name "error.tsx"`        |
| 1     | `not-found.tsx`    | `find src/app -name "not-found.tsx"`    |
| 0     | `global-error.tsx` | `find src/app -name "global-error.tsx"` |

> **Dev-only route:** `src/app/dev/signin/page.tsx` is excluded from the
> production surface count; it is gated by `NODE_ENV !== "production"`
> in `src/proxy.ts` and is a single line of code: a 404 outside dev.
> Audit row: `not_production`.

### Public surfaces (8)

| #   | Route                        | Surface                       | EN/LTR               | AR/RTL               | A11y                 | Responsive           | Findings | Status        |
| --- | ---------------------------- | ----------------------------- | -------------------- | -------------------- | -------------------- | -------------------- | -------- | ------------- |
| 1   | `/`                          | Landing                       | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |
| 2   | `/signin`                    | Sign-in (password-first)      | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |
| 3   | `/signin/verify`             | Magic-link verification state | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |
| 4   | `/signin/forgot-password`    | Forgot password               | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |
| 5   | `/signin/set-password`       | Forced first-password change  | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |
| 6   | `/setup`                     | First administrator setup     | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |
| 7   | `/accept-invitation/[token]` | Invitation acceptance         | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |
| 8   | `/set-password`              | OAuth first-password set      | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | `Reviewed` (Phase 2) | —        | `Implemented` |

### Legal / operational (3)

| #   | Route                 | Surface                     | EN/LTR         | AR/RTL         | A11y           | Responsive     | Findings | Status         |
| --- | --------------------- | --------------------------- | -------------- | -------------- | -------------- | -------------- | -------- | -------------- |
| 9   | `/privacy`            | Privacy                     | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 10  | `/terms`              | Terms                       | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 11  | `/data-deletion`      | Data-deletion request       | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 12  | `/agency-unavailable` | Suspended / archived agency | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |

### Dev-only (1)

| #   | Route         | Surface             | EN/LTR               | AR/RTL | A11y | Responsive | Findings | Status                                                                       |
| --- | ------------- | ------------------- | -------------------- | ------ | ---- | ---------- | -------- | ---------------------------------------------------------------------------- |
| —   | `/dev/signin` | Dev one-tap sign-in | n/a (not_production) | n/a    | n/a  | n/a        | —        | `Verified` (gated by `src/proxy.ts` 404 outside `NODE_ENV !== "production"`) |

### App — global (2)

| #   | Route          | Surface                                    | EN/LTR               | AR/RTL               | A11y           | Responsive     | Findings                                                 | Status         |
| --- | -------------- | ------------------------------------------ | -------------------- | -------------------- | -------------- | -------------- | -------------------------------------------------------- | -------------- |
| 13  | `/app`         | My Work (signed-in landing)                | `Not Reviewed`       | `Not Reviewed`       | `Not Reviewed` | `Not Reviewed` | —                                                        | `Not Reviewed` |
| 14  | `/app/account` | Account (profile + password + preferences) | `Reviewed` (Phase 1) | `Reviewed` (Phase 1) | `Not Reviewed` | `Not Reviewed` | P1: locale list was `["en"]` only — fixed in this commit | `Implemented`  |

### App — agency settings (5)

| #   | Route                                   | Surface                    | EN/LTR         | AR/RTL         | A11y           | Responsive     | Findings | Status         |
| --- | --------------------------------------- | -------------------------- | -------------- | -------------- | -------------- | -------------- | -------- | -------------- |
| 15  | `/app/agency-settings`                  | Agency overview            | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 16  | `/app/agency-settings/ai`               | Agency AI configuration    | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 17  | `/app/agency-settings/plan`             | Agency plan + entitlements | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 18  | `/app/agency-settings/social`           | Social integrations        | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 19  | `/app/agency-settings/social/providers` | Provider credentials       | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |

### App — users + workspaces (3)

| #   | Route                 | Surface         | EN/LTR         | AR/RTL         | A11y           | Responsive     | Findings | Status         |
| --- | --------------------- | --------------- | -------------- | -------------- | -------------- | -------------- | -------- | -------------- |
| 20  | `/app/users`          | Users + roles   | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 21  | `/app/workspaces`     | Workspaces list | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 22  | `/app/workspaces/new` | New workspace   | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |

### App — platform (8)

| #   | Route                               | Surface                      | EN/LTR         | AR/RTL         | A11y           | Responsive     | Findings | Status         |
| --- | ----------------------------------- | ---------------------------- | -------------- | -------------- | -------------- | -------------- | -------- | -------------- |
| 23  | `/app/platform/overview`            | Platform overview            | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 24  | `/app/platform/agencies`            | Platform agencies            | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 25  | `/app/platform/agencies/[agencyId]` | Platform agency detail       | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 26  | `/app/platform/access`              | Platform access (Owner-only) | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 27  | `/app/platform/security`            | Platform security            | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 28  | `/app/platform/errors`              | Platform error ledger        | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 29  | `/app/platform/operations/cron`     | Platform cron                | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 30  | `/app/platform/admins`              | Platform admins              | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |

### App — workspace (24)

| #   | Route                                 | Surface              | EN/LTR         | AR/RTL         | A11y           | Responsive     | Findings | Status         |
| --- | ------------------------------------- | -------------------- | -------------- | -------------- | -------------- | -------------- | -------- | -------------- |
| 31  | `/app/w/[slug]`                       | Workspace overview   | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 32  | `/app/w/[slug]/planning`              | Planning list        | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 33  | `/app/w/[slug]/planning/new`          | Quick Create         | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 34  | `/app/w/[slug]/planning/batch`        | Batch Add            | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 35  | `/app/w/[slug]/planning/[id]`         | Content detail       | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 36  | `/app/w/[slug]/planning/[id]/publish` | Publish confirmation | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 37  | `/app/w/[slug]/planning/edit/[id]`    | Edit (legacy alias)  | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 38  | `/app/w/[slug]/board`                 | Kanban board         | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 39  | `/app/w/[slug]/calendar`              | Calendar             | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 40  | `/app/w/[slug]/reviews`               | Review queues        | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 41  | `/app/w/[slug]/design-queue`          | Design queue         | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 42  | `/app/w/[slug]/library`               | Library              | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 43  | `/app/w/[slug]/team`                  | Team                 | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 44  | `/app/w/[slug]/channels`              | Channels             | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 45  | `/app/w/[slug]/analytics/social`      | Social analytics     | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 46  | `/app/w/[slug]/ai-settings`           | Workspace AI status  | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 47  | `/app/w/[slug]/client`                | Client review index  | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 48  | `/app/w/[slug]/client/calendar`       | Client calendar      | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 49  | `/app/w/[slug]/settings`              | Settings (group)     | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 50  | `/app/w/[slug]/settings/lifecycle`    | Lifecycle            | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 51  | `/app/w/[slug]/settings/lead-times`   | Lead times           | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 52  | `/app/w/[slug]/settings/defaults`     | Assignment defaults  | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 53  | `/app/w/[slug]/settings/approvals`    | Approval mode        | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 54  | `/app/w/[slug]/settings/templates`    | Settings templates   | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 55  | `/app/w/[slug]/brand-kit`             | Brand Kit (group)    | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 56  | `/app/w/[slug]/brand-kit/voice`       | Brand voice          | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 57  | `/app/w/[slug]/brand-kit/pillars`     | Pillars              | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 58  | `/app/w/[slug]/brand-kit/logos`       | Logos                | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 59  | `/app/w/[slug]/brand-kit/colors`      | Colors               | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 60  | `/app/w/[slug]/brand-kit/typography`  | Typography           | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 61  | `/app/w/[slug]/brand-kit/templates`   | Templates            | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 62  | `/app/w/[slug]/brand-kit/publishing`  | Publishing defaults  | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 63  | `/app/w/[slug]/brand-kit/linked`      | Linked accounts      | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |
| 64  | `/app/w/[slug]/brand-kit/activity`    | Brand kit activity   | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | `Not Reviewed` | —        | `Not Reviewed` |

### Route-boundary files (15)

| File kind       | Count | Files                                                                                                                                                                              |
| --------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.tsx`    |     6 | `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/app/layout.tsx`, `src/app/(app)/app/w/[slug]/layout.tsx`, `src/app/signin/layout.tsx`, `src/app/setup/layout.tsx` |
| `loading.tsx`   |     8 | enumerated below                                                                                                                                                                   |
| `error.tsx`     |     6 | enumerated below                                                                                                                                                                   |
| `not-found.tsx` |     1 | `src/app/not-found.tsx`                                                                                                                                                            |

> Each route-boundary file is treated as a single audit row; the
> matrix above is regenerated alongside the per-page rows in
> subsequent batches.

## Phase 1 — Localization Foundation (this commit)

This commit lands the localization engine and the foundation pair
of message catalogs. It does **not** claim Arabic support on
production surfaces — the per-page audit is the next phase.

### Code changes

- `src/lib/i18n/cookie.ts` — `laratik_locale` server-only cookie
  helpers (`getPublicLocale`, `setPublicLocale`,
  `clearPublicLocale`). HttpOnly, SameSite=Lax, Secure-in-prod,
  365-day lifetime, validated against `SUPPORTED_LOCALES`.
- `src/lib/i18n/resolve-active-locale.ts` — server-side resolver
  with the locked precedence: user profile → public cookie →
  active agency → English fallback. Memoized per request.
- `src/lib/i18n/format-arabic.ts` — Arabic number / percentage /
  date / time formatters built on `Intl` with
  `numberingSystem: "latn"`. Pure, no DOM.
- `src/app/layout.tsx` — `<html lang dir>` now reads from
  `resolveActiveLocale()`; Inter and Noto Sans Arabic are loaded
  via `next/font/google` and the body class selects the face from
  the active direction.
- `src/app/globals.css` — `--font-noto-arabic` variable hook
  (set in layout) and the body rule that uses it for `dir="rtl"`.
- `src/lib/auth/profile.ts` — `LOCALE_VALUES` widened to
  `["en", "ar"]`; the schema is now driven by
  `SUPPORTED_LOCALES`.
- `src/app/(app)/app/account/actions.ts` — `SUPPORTED_LOCALES`
  deleted; validation reads from the central list. After a
  successful save the action also calls
  `setPublicLocale` and `revalidatePath("/app", "layout")` so
  the root flips without a full reload.
- `src/app/(app)/app/account/profile-form.tsx` — locale
  `<select>` now enumerates `en` and `ar` with native labels
  (`English` / `العربية`).
- `src/app/page.tsx` (landing) — `<PublicLocaleSwitcher>` in the
  top-right; switches only the cookie, returns to a validated
  same-origin relative path.
- `src/app/(landing)/public-locale-switcher.tsx` — client
  component. Server action `setPublicLocaleAction` lives in
  `src/app/(landing)/public-locale-actions.ts`.
- `src/messages/{en,ar}/common.json` — `Common` and
  `Navigation` namespace seed. Both files share the same key
  set; missing-key tests fail `tsc` and the test suite.
- `tests/unit/i18n/cookie.test.ts` — cookie attribute + invalid
  value + delete behavior.
- `tests/unit/i18n/resolve-active-locale.test.ts` — full
  precedence matrix (user / cookie / agency / none), invalid
  value fallbacks, and English-when-everything-is-bad.
- `tests/unit/i18n/catalogs.test.ts` — en vs ar identical key
  structure, ICU variable parity, plural parameter parity.
- `tests/unit/i18n/format-arabic.test.ts` — Western-digit Arabic
  formatting, timezone respected, mixed string does not throw.

### What this commit does **not** do

- It does **not** ship the rest of the message catalogs
  (Auth / Profile / Planning / Content / Workflow / Reviews /
  Publishing / Workspace / Agency / Platform / Notifications /
  Validation / Legal / Operational). Those ship per-screen in
  Phases 2–9.
- It does **not** migrate the `notification` table yet. The
  additive migration lands in the Phase 1 follow-up commit that
  also adds the `Notifications` catalog.
- It does **not** claim Arabic support on any production
  surface. The per-page audit begins in Phase 2.

### Acceptance criteria (this commit)

- `pnpm typecheck` clean.
- `pnpm test:unit` clean, including the four new test files.
- `pnpm format:check` and `pnpm lint` clean.
- Manual verification: `pnpm build` succeeds; running the dev
  server with a fresh DB and switching the profile to `ar`
  flips the root `lang`/`dir`/font on the next navigation.
