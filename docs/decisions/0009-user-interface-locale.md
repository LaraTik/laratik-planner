# ADR 0009: User-interface locale (Arabic) — precedence, cookie, fonts, formatting, rollback

- Status: accepted
- Date: 2026-09-01
- Scope: `src/lib/i18n/**`, `src/app/layout.tsx`, `src/app/(app)/app/account/**`, `src/app/page.tsx`, `src/app/signin/**`, message catalogs, `next/font` Arabic face, root `<html lang dir>`, `users.locale` and `agencies.locale` semantics, the `laratik_locale` cookie.
- Companion doc: `docs/design/UI_UX_REFINEMENT_2026-09-01.md` (the page-by-page audit matrix).
- Supersedes: the v1 implicit "English-only" profile schema (`src/lib/auth/profile.ts` `LOCALE_VALUES = ["en"]`), the v1 layout that resolved `<html dir>` from `agencies.locale` only, and the absence of any public locale cookie.

## Context

The v1 surface rendered English-only. The `users.locale` and `agencies.locale`
columns already exist in the schema, and `src/lib/i18n/{locales,dir}.ts`
already defines a closed `en | ar` locale set with a robust
`resolveLocale` fallback. The `DirAwareTextarea` / `DirAwareInput` /
`DirAwareIcon` primitives are in place, and the root layout
already sets `<html lang dir>` from `agencies.locale`. The
august-2026 UI/UX pass polished individual pages, but the
product as a whole does not claim Arabic support because:

1. The **profile form** enumerates English only
   (`profile-form.tsx:29` `SUPPORTED_LOCALES = [{ value: "en" }]`).
2. The **profile action** validates against `["en"]`
   (`actions.ts:30` `SUPPORTED_LOCALES: ReadonlyArray<Locale> = ["en"]`).
3. The **profile schema**'s `LOCALE_VALUES` is
   `["en"]` (`src/lib/auth/profile.ts:35`).
4. The **root layout** uses `agencies.locale` only — there is
   no `users.locale` precedence, no `laratik_locale` cookie,
   and no public language switcher on `/`.
5. **No Noto Sans Arabic** is loaded. The CSS only references
   `var(--font-inter)`, so an Arabic glyph falls back to the
   platform default.
6. **No `next-intl`** is installed; the catalogs and ICU
   plumbing the rest of the plan needs are absent.
7. **No landing language switcher**, no shared `lang`/`dir`
   primitives beyond per-page layout, and no
   `message_key` / `message_params` columns on the
   `notification` table for structured translation.

Shipping "Arabic support" without fixing (1)–(7) would mean
setting `<html dir="rtl">` and nothing else — the kind of
partial claim the plan explicitly forbids ("No Arabic-support
claim from direction switching alone").

## Decision

### Locale set and direction

The product ships two locales in v1: **`en`** (LTR) and **`ar`**
(RTL). The closed set is `SUPPORTED_LOCALES` in
`src/lib/i18n/locales.ts`. The only other place a locale code
can appear is the database (`users.locale`, `agencies.locale`,
and the new `laratik_locale` cookie). All of those store the
closed set's `code`; an unknown / null / empty value falls back
to `en` without throwing.

Per-field content direction is content-driven, not
locale-driven (`src/lib/i18n/dir.ts` `detectDir`); the page
direction follows the active locale.

### Resolution precedence — interface language (per request)

```
1. Authenticated user's validated `users.locale`   (if signed in)
2. Validated `laratik_locale` cookie              (if set)
3. English fallback                               (always safe)
```

The profile value, when set, always overrides a conflicting
public cookie. Saving the profile **writes both**
`users.locale` and the cookie in a single transaction; the
cookie is set only after the DB write returns ok. The
cookie is mutated by a server action — never from client JS.

The `agencies.locale` column is **not** part of the
interface-language chain. It controls **content / brand
defaults** — the language the agency writes its brand
voice, captions, and templates in. Resolved through a
separate `resolveContentLocale()` helper that consults
the active workspace's agency. This separation is what
keeps an Arabic agency writing Arabic content for a
planner whose interface is English.

### Content / brand default (separate chain)

For surfaces that ask "what language is this agency's
content written in?" (brand kit templates, default
caption language, AI brief language hint, etc.) the
resolver is `resolveContentLocale(actor)`:

```
1. The active workspace's `agencies.locale`  (if any)
2. English fallback                          (always safe)
```

This is **never** the UI locale. A planner with an
English UI in an Arabic agency still sees the Arabic
brand voice templates.

### Cookie contract

| Property     | Value                                                   |
| ------------ | ------------------------------------------------------- |
| Name         | `laratik_locale`                                        |
| Allowed vals | `en`, `ar` (anything else is read as `en`)              |
| Lifetime     | 365 days                                                |
| Path         | `/`                                                     |
| SameSite     | `lax`                                                   |
| Secure       | production only (`serverEnv.NODE_ENV === "production"`) |
| HttpOnly     | `true`                                                  |
| Mutation     | server action only                                      |

The cookie never carries an HMAC — it is a public preference
that is meaningless without the (signed) session cookie, and
signed cookies add no value for a value whose only consumer is
the same server that wrote it. An invalid / stale value is
treated as absent.

### URLs

**No URL change.** The plan locks the existing routes; we do
not introduce `/en` or `/ar` prefixes. The active locale is
resolved server-side per request, so the same URL serves the
correct `<html lang dir>` and message catalog for the
caller. The public landing and sign-in pages still use the
cookie; the (app) layouts use the user-or-cookie precedence.

### Typography

- **English** keeps Inter (already loaded).
- **Arabic** loads **Noto Sans Arabic** weights 400 / 500 /
  600 / 700 via `next/font/google` with `display: swap`.
- The root layout selects the face from the active locale's
  `dir`:
  - `ltr` → `var(--font-inter)`
  - `rtl` → `var(--font-noto-arabic)`
- The font CSS variable is set on `<html>` so it cascades to
  every descendant.

### Bidirectionality

- The root layout renders `<html lang={code} dir={dir}>` from
  the resolved locale.
- Form controls use `text-start` / `text-end` logical
  utilities; the `DirAwareTextarea` / `DirAwareInput` /
  `DirAwareArrowRight` primitives are the canonical input /
  arrow components.
- Direction-aware icons mirror automatically. Hard-coded
  `left-*` / `right-*` utilities require an explicit,
  reviewed intrinsic-LTR exception (an `AGENTS.md` rule, not
  silently permitted).
- Mixed-direction strings — email addresses, URLs, handles,
  hashtags, filenames, IDs, channel identifiers, technical
  values — are wrapped in `<bdi>` or carry an explicit
  `dir="auto"` / `dir="ltr"`.
- Numbers, percentages, dates, and times render in **Arabic
  with Western `0–9` digits** (`numberingSystem: "latn"`).
  Business dates still use the workspace timezone.

### Translation architecture

- The **only** locale type is `LocaleCode = "en" | "ar"`
  (already in `src/lib/i18n/locales.ts`).
- The **only** place the closed locale set is enumerated is
  `SUPPORTED_LOCALES`. The profile form, profile action, and
  the public switcher **must** read from this list — no
  `["en"]` literals, no English-only arrays.
- Message catalogs live under `src/messages/{en,ar}/` and
  follow a stable namespace list: `Common`, `Navigation`,
  `Auth`, `Profile`, `Planning`, `Content`, `Workflow`,
  `Reviews`, `Publishing`, `Workspace`, `Agency`, `Platform`,
  `Notifications`, `Validation`, `Legal`, `Operational`.
- Type augmentation is configured so missing / misspelled
  keys fail `tsc`. Catalog tests assert identical key
  structure across `en` and `ar`, ICU variable parity,
  plural parameter parity, and rich-text placeholder parity.
- **Server Components** resolve messages through the
  shared per-request config; **Client Components** receive
  either scoped providers or already-translated props
  (no full-catalog serialization to every page).
- **Domain services** retain stable error codes / technical
  copy. Route and action boundaries map codes to localized
  messages. Logs and audit records stay technical.

### Stored system copy

- `notification` gains nullable `message_key text` and
  `message_params jsonb` columns through an additive
  migration.
- New writers store `message_key` + `message_params` plus
  the existing `title` / `body` English fallback for
  compatibility with rolled-back code.
- Renderers use the active profile locale when both the
  message key and a catalog entry exist; otherwise they
  fall back to the stored `title` / `body` (untranslated).
- Activity events are rendered from `kind + metadata` when
  sufficient; the immutable stored summary is the fallback.
- Emails are generated in the **recipient profile locale**.
  New-recipient invitations use the agency locale, then
  English. User-generated content (comments, briefs,
  captions, attachments, user-entered names, activity
  payload values) is **never** translated.

### Profile language switching

The existing `/app/account` profile form is the single save
path:

- The locale `<select>` enumerates `en` and `ar` with
  native labels (`English`, `العربية`) and exposes the
  current selection through `aria-current`.
- Save goes through the existing `updateProfileAction` →
  `updateOwnProfile` flow.
- On success the server action **sets the cookie** in
  addition to the DB write, calls `revalidatePath` for
  `/app/account` and `/app`, and the client calls
  `router.refresh()` so the root `lang` / `dir` / font /
  navigation / page copy update immediately.
- The success banner is localized; focus is preserved.
- The select does not auto-submit on change.

### Public language switching

A compact `<PublicLocaleSwitcher>` lives on the landing and
authentication surfaces. It calls a server action
`setPublicLocaleAction` that:

1. Validates the requested locale against
   `SUPPORTED_LOCALES`.
2. Sets the `laratik_locale` cookie only (no DB write).
3. Calls `revalidatePath("/", "layout")` and returns to a
   **validated same-origin relative path** (the `returnTo`
   field is the current pathname + search; it must start
   with `/` and must not contain `//` or `\`).
4. Returns the success / failure result; the client uses
   `router.refresh()` to repaint the root.

The switcher is usable before authentication and persists
across sign-out.

### Profile vs public precedence, plain language

A user with an English profile who lands on a page that
shows Arabic because of a stale cookie will see English after
the next signed-in render — the profile is authoritative for
authenticated surfaces. The public cookie is authoritative
only on landing / sign-in / privacy / terms / data-deletion.

## Consequences

### Positive

- `<html lang dir>` is always correct for the current
  request, with no client-side flip and no URL change.
- The interface locale and the content locale are
  separate concepts with separate resolvers. An English-UI
  planner working in an Arabic agency sees Arabic brand
  content; an Arabic-UI planner in the same agency sees
  the same Arabic brand content. Either can read
  English-only content in LTR if their UI is English.
- The profile form, profile action, profile schema, public
  switcher, and root layout share a single source of truth
  (`SUPPORTED_LOCALES`). Adding a third locale is a
  single-line change with a typed test gate.
- Noto Sans Arabic renders Arabic glyphs from the first
  paint; the visual regression suite has a stable target.
- Notification writers can begin emitting
  `message_key` + `message_params` today; legacy rows keep
  rendering through the `title` / `body` fallback with
  documented compatibility.
- The cookie is HttpOnly + SameSite=Lax + Secure-in-prod,
  so it is not a CSRF / XSS amplification surface.

### Negative / accepted costs

- `next/font/google` adds one self-hosted font to the
  build. We accept this because there is no offline /
  self-hosted Arabic face in the repo today, and the
  build-time `next/font` fetch is the supported path.
- A rolled-back deployment that still reads `users.locale`
  safely ignores Arabic (every read goes through
  `resolveLocale`); a rolled-back deployment that does
  **not** know about the cookie treats it as an unknown
  cookie and is unaffected.
- A `message_key` written by the new code is invisible to
  the old renderer if it is rolled back — the renderer
  must continue to honour the `title` / `body` fallback.
  The migration is therefore **additive**: both columns
  are written by the new writers; the old writers are
  untouched.

## Rollback

- **Code rollback:** `git revert` of the feature branch
  merge; the v1 layout / `users.locale = "en"` default
  resumes. Cookie ignored. No DB change required.
- **DB rollback:** the `message_key` / `message_params`
  columns are nullable and additive. Dropping them is a
  forward-only migration; the new writers' English
  fallback `title` / `body` keeps every existing surface
  rendering.
- **Cookie purge:** the cookie expires in 365 days; an
  active purge ships a one-line `cookies().delete(...)`
  server action.

## Out of scope (this ADR)

- Translation of user-generated content.
- The full 65-page per-screen audit (companion doc).
- The message catalogs beyond the foundation namespace
  pair (Common + Navigation ship in Phase 1; the rest
  ship in subsequent milestones).
- Right-to-left forms beyond the canonical `DirAware*`
  primitives (per-screen work lives in subsequent
  batches).
