# UI/UX + Arabic critical findings — implementation TODO

> Handoff for a fixing agent. Review snapshot: `3aea1f4` on `feat/ui-ux-arabic-2026-09-01`, 2026-09-01. The branch is active; re-confirm each path against the current HEAD before editing.

## Objective

Resolve the release-blocking migration, language-switching, React Server Component, error-localization, profile, and notification-email failures found by independent review. Do not mark an item complete from compilation or unit tests alone.

Canonical rules:

- `AGENTS.md`
- `docs/i18n/CONTRACT.md`
- `docs/decisions/0009-user-interface-locale.md`
- `docs/production-readiness/README.md`

## Required execution order

1. Fix and prove the database migration and migration drill.
2. Remove translator functions from every Server → Client boundary.
3. Restore the account/profile language journey.
4. Separate public and authenticated language controls.
5. Fix client error localization without weakening cookie security.
6. Fix localized notification/email rendering.
7. Close skipped routes and collect exact-HEAD release evidence.

## P0 — I18N-001: migration 0025 is invalid and unregistered

Status: [ ] Not started

Evidence:

- `src/lib/db/migrations/0025_notification_message_key.sql` targets plural `notifications` and `activity_events`.
- The Drizzle schema and prior migrations use singular `notification` and `activity_event`.
- `src/lib/db/migrations/meta/_journal.json` ends at 0024, so 0025 is not applied.
- A migrated local database failed on authenticated `/app` with `column "message_key" does not exist` from `listNotificationsForUser`.
- The from-zero drill reported 25 registered migrations for 26 SQL files.
- Migration drill 2 also has stale post-repair timestamp expectations that stop before migrations 0019–0024.

Required fix:

- Correct SQL and rollback comments to the exact singular tables.
- Add the proper Drizzle journal/meta entry; do not hand-wave the ledger mismatch.
- Update the migration drill's expected post-repair sequence without weakening its assertions.
- Preserve additive compatibility: nullable new columns, legacy `title` / `body` fallback, and a safe rollback story.

Acceptance criteria:

- [ ] Fresh database applies every migration exactly once.
- [ ] Supported pre-0025 database upgrades successfully.
- [ ] Drizzle ledger count and ordered SQL file count match.
- [ ] Authenticated `/app` loads notifications without compatibility columns added by hand.
- [ ] Forward, compatibility, backup, and rollback evidence is recorded.
- [ ] `pnpm migration-drill` exits 0 without skipped or weakened checks.

## P1 — I18N-002: translator functions cross Server/Client boundaries

Status: [ ] Not started

Evidence:

- `src/app/(app)/app/account/page.tsx` passes `t={t}` into Client Components at the profile, password, notification-preferences, and sign-out sections.
- `/app/account` throws: `Functions cannot be passed directly to Client Components`.
- The same `t={t}` pattern appears in users, planning detail, settings, design queue, provider configuration, platform agencies/access, client review, and brand-kit surfaces.

Required fix:

- Inventory every Server Component that passes a translator/function into a Client Component.
- Choose one approved pattern per boundary: a small serializable copy object, or a scoped client translation provider.
- Do not serialize the entire catalog per page and do not silence the React error.
- Add a regression guard that fails when a Server Component passes a function-valued translator prop into a Client Component.

Acceptance criteria:

- [ ] `/app/account` and every inventoried route render without RSC serialization errors.
- [ ] No Server → Client `t={t}` boundary remains.
- [ ] English and Arabic interactive states still translate after client updates.
- [ ] Focused unit tests and authenticated E2E cover at least account, users, planning detail, and settings.

## P1 — I18N-003: profile language switching is blocked and profile copy is English

Status: [ ] Not started

Evidence:

- The RSC crash makes `/app/account` unusable.
- `src/app/(app)/app/account/profile-form.tsx` hardcodes visible English copy including `Profile saved`, `Display name`, `Language`, and `Save profile`.
- Profile action failures are returned as English prose instead of stable localizable codes.

Required fix:

- Localize all profile/password/preferences/sign-out copy and accessible labels.
- Return stable action/domain codes and translate them at the presentation boundary.
- Preserve the ordered save contract: DB success → cookie synchronization → revalidation → refresh.
- Surface and recover from a cookie-sync failure without rolling back or hiding a successful database update.

Acceptance criteria:

- [ ] English → Arabic and Arabic → English profile saves repaint immediately.
- [ ] Locale persists through refresh, deep link, sign-out, public page, and sign-in.
- [ ] Success, validation, permission/session expiry, and recovery states are localized.
- [ ] Keyboard focus and screen-reader announcements are preserved.

## P1 — I18N-004: public switcher conflicts with authenticated locale

Status: [ ] Not started

Evidence:

- `src/app/layout.tsx` mounts `PublicLocaleSwitcher` for authenticated routes.
- On an English authenticated session, pressing Arabic can show Arabic as selected while `<html lang="en" dir="ltr">` and English page copy remain active because `users.locale` wins.
- On an Arabic authenticated render, the switcher can initialize English as selected, producing hydration warnings and contradictory state.

Required fix:

- Mount the public switcher only on signed-out public/authentication/legal surfaces.
- Use `/app/account` as the authenticated source of truth.
- Initialize any client switcher from the server-resolved locale and synchronize it when props change.
- Keep return-path validation and server-only cookie mutation.

Acceptance criteria:

- [ ] No public switcher appears in the authenticated shell.
- [ ] Pressed/current state always matches root `lang`, `dir`, font, and visible copy.
- [ ] No locale-related hydration warning occurs.
- [ ] Public selection persists through landing and sign-in without overriding an existing authenticated profile locale.

## P1 — I18N-005: client error localization cannot read the HttpOnly cookie

Status: [ ] Not started

Evidence:

- `src/lib/i18n/cookie.ts` correctly writes an HttpOnly locale cookie.
- `src/lib/i18n/client-locale.ts` attempts to read that locale from `document.cookie`, which can never expose an HttpOnly cookie.
- With `<html lang="ar" dir="rtl">`, `/app/account` rendered an English `We hit a snag` recovery page.
- App/root error boundaries still contain hardcoded operational labels.

Required fix:

- Keep the cookie HttpOnly.
- Bootstrap resolved locale/catalog state into client error boundaries using serializable server state, a scoped provider, or a stable document attribute.
- Move every user-visible recovery label, button, hint, and accessible name into the catalog.
- Keep technical details technical and avoid exposing secrets or private data.

Acceptance criteria:

- [ ] Root and nested error boundaries render Arabic copy under Arabic locale and English under English locale.
- [ ] Recovery actions work with keyboard and screen readers.
- [ ] No client locale resolver depends on the HttpOnly cookie being visible.
- [ ] Error E2E deliberately triggers both locales and verifies recovery.

## P1 — I18N-006: localized notification email branch is unreachable

Status: [ ] Not started

Evidence:

- `src/lib/notifications/service.ts` populates `title` and `body` before evaluating `messageKey && !title` / `messageKey && !body`.
- Those conditions are therefore false for normal messages, so Arabic recipients receive stored/default English copy.
- Existing dispatch tests cover opt-out behavior but do not prove an opted-in Arabic recipient's rendered subject/body.

Required fix:

- Prefer translated `message_key` + `message_params` output when a valid key exists.
- Fall back to stored `title` / `body` only for legacy rows or unavailable keys.
- Resolve email locale from the recipient profile; pre-account invitations use agency content locale, then English.
- Isolate mixed-direction parameters and keep user content unmodified.

Acceptance criteria:

- [ ] Opted-in English and Arabic recipients receive localized subject and body.
- [ ] Legacy rows without message keys still send the stored fallback.
- [ ] Missing/invalid keys fail safely and are observable.
- [ ] Notification center, activity timeline, mention email, digest, approval, request-changes, and publishing-failure paths have focused coverage.

## Completeness backlog discovered by the review

These are not substitutes for the P0/P1 work above, but the branch cannot claim a whole-product Arabic/UI review until they are audited:

- [ ] `/app/w/[slug]/ai-settings`
- [ ] `/app/w/[slug]/analytics/social`
- [ ] `/app/w/[slug]/brand-kit` overview
- [ ] `/app/w/[slug]/planning/edit/[id]`
- [ ] `/data-deletion`
- [ ] Root and nested loading, error, and not-found boundaries
- [ ] Legal pages: retain counsel-approved source language but verify RTL shell, responsiveness, accessibility, and explicit translation status
- [ ] Native Arabic editorial review of the full catalog and product glossary; replace literal translations such as `أوقات الريادة` for lead time
- [ ] Reconcile the route matrix with the actual `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx` inventory

## Mandatory final verification

Run against a clean, immutable release-candidate HEAD and record the SHA, date, exit code, and summarized result:

```bash
pnpm migration-drill
pnpm verify
pnpm test:e2e:isolated
pnpm test:visual
```

Also run focused i18n, notification, profile, and RSC-boundary tests. Update:

- `docs/design/UI_UX_REFINEMENT_2026-09-01.md`
- `docs/production-readiness/SCREEN_PARITY.md`
- `docs/production-readiness/TEST_EVIDENCE.md`
- `docs/production-readiness/MIGRATION_DEPLOYMENT.md`
- `docs/production-readiness/UAT_RELEASE.md`

Completion rules:

- [ ] Do not mark `Tested` from `pnpm verify` alone.
- [ ] Do not mark `Verified`; only the independent reviewer may do that.
- [ ] Do not weaken, skip, or delete a failing test to obtain green output.
- [ ] If HEAD changes after evidence, rerun every affected gate.
- [ ] Commit implementation, catalogs, tests, migration metadata, route-matrix status, and evidence atomically by milestone.
