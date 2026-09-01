# Interface localization and bilingual-content contract

This is the implementation contract for English/Arabic interface work, RTL behavior, profile language switching, stored system copy, and bilingual release evidence. `AGENTS.md` contains the short mandatory rules; ADR 0009 records why the architecture exists.

## Sources of truth

| Concern                               | Source                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Supported locale codes and directions | `src/lib/i18n/locales.ts`                                                   |
| Interface/content locale resolution   | `src/lib/i18n/resolve-active-locale.ts`                                     |
| Public locale cookie                  | `src/lib/i18n/cookie.ts`                                                    |
| Message catalogs                      | `src/messages/en/common.json`, `src/messages/ar/common.json`                |
| Profile save path                     | `src/app/(app)/app/account/actions.ts`                                      |
| Per-field direction                   | `src/lib/i18n/dir.ts`, `src/components/forms/dir-aware-textarea.tsx`        |
| Format-specific content translations  | `formatPayload.translations[locale]` and `src/lib/format-payload/mapper.ts` |
| Architectural decision                | `docs/decisions/0009-user-interface-locale.md`                              |
| Page-by-page audit                    | `docs/design/UI_UX_REFINEMENT_2026-09-01.md`                                |

## Three independent language concepts

Do not combine these concepts or use one as a fallback for another.

### Interface locale

Controls navigation, labels, help text, validation, system messages, error boundaries, emails, notifications, document `lang` / `dir`, and interface typography.

Resolution precedence per request:

1. Validated authenticated `users.locale`.
2. Validated HttpOnly `laratik_locale` cookie.
3. English.

Unknown, empty, or legacy values resolve safely to English. `agencies.locale` is never part of this chain.

### Agency content locale

Controls the agency's brand/content default: brand voice, templates, caption-language defaults, and AI content-language hints.

Resolution precedence:

1. Validated active agency `agencies.locale`.
2. English.

An English-interface planner may work with Arabic content, and an Arabic-interface planner may work with English content.

### Per-field direction

Direction follows the first meaningful character of user-entered content, not the interface or agency locale. Use the shared `DirAwareInput` and `DirAwareTextarea` primitives. Mixed-direction values use `<bdi>`, `dir="auto"`, or reviewed `dir="ltr"` where the value is intrinsically LTR.

## Language-switching behavior

### Signed-out surfaces

The public switcher is allowed on landing and authentication/legal surfaces. It validates the requested locale, writes the HttpOnly preference cookie through a server action, validates a same-origin relative return path, and refreshes the rendered tree.

The public switcher must not be mounted globally on authenticated routes. Its local optimistic state must be initialized from serialized server locale and synchronized when that locale changes.

### Authenticated surfaces

`/app/account` is the authoritative language control. Saving follows this sequence:

1. Validate the locale against `SUPPORTED_LOCALES`.
2. Persist `users.locale` successfully.
3. Set the public preference cookie to the same locale.
4. Revalidate affected app layouts/pages.
5. Refresh the client tree while preserving useful focus.

The database and cookie cannot be one transaction. The database is authoritative if the cookie step fails; the action must return a stable failure code that the UI can translate and recover from.

Required persistence journey: select locale → save → immediate repaint → reload → deep link → sign out → public page → sign in again.

## React Server Component boundary

Translator functions are functions and are not serializable. A Server Component must never pass `t`, closures, class instances, or another function-valued prop into a Client Component.

Use one of these patterns:

1. Translate on the server and pass a small serializable copy object.
2. Mount a scoped client translation provider and translate inside the Client Component.

Do not serialize the full catalog into every route. Do not suppress React's serialization error or convert functions to strings.

The locale cookie is HttpOnly by design. Client Components and client error boundaries cannot resolve locale through `document.cookie`. Supply the resolved locale through server-rendered serializable state, a provider, or a stable document attribute. Never remove HttpOnly merely to make translation code easier.

## Catalog and copy rules

- `next-intl` is the locked target runtime from ADR 0009. The hand-written Phase 1 loader is transitional; do not expand it as a permanent parallel framework.
- The completed runtime must provide typed message keys and ICU plural/rich-text behavior. Until then, catalog key/placeholder parity tests are mandatory but are not a substitute for type safety.
- Visible product copy, accessible names, validation, success/error messages, empty states, loading states, confirmation dialogs, and recovery instructions belong in the central catalogs.
- Domain services and server actions return stable codes or structured results. The presentation boundary translates them. Logs, observability events, and audit records stay technical.
- Never translate user-generated content implicitly: comments, briefs, captions, attachment names, handles, URLs, identifiers, and brand text remain as entered.
- Arabic copy must be clear Modern Standard Arabic suited to a professional SaaS product. Translate meaning, not English word order. A native Arabic reviewer must approve new or materially changed copy.

Starter glossary:

| English concept   | Preferred Arabic                      | Avoid                                         |
| ----------------- | ------------------------------------- | --------------------------------------------- |
| Workflow          | سير العمل                             | Literal machine-generated variants            |
| Lead time         | المدة اللازمة / مدة الإنجاز           | أوقات الريادة                                 |
| Approval          | اعتماد / موافقة, according to context | One translation for every context             |
| Changes requested | تعديلات مطلوبة                        | Literal passive wording that hides the action |
| Publishing        | النشر                                 | إطلاق when the action is publishing content   |
| Brand Kit         | دليل الهوية                           | Unexplained English-only label                |

When product terminology changes, update both catalogs and this glossary in the same change.

## RTL and formatting

- Root `<html lang dir>` must match the resolved interface locale on first paint; do not flip it after hydration.
- Use logical CSS utilities: `text-start`, `text-end`, `ps-*`, `pe-*`, `ms-*`, `me-*`, and logical inset/border utilities.
- Physical `left` / `right` positioning requires a documented intrinsic-direction exception.
- Directional icons use the shared direction-aware primitive or a reviewed mirror transform. Brand/platform logos never mirror.
- Arabic dates, time, percentages, and numbers use Western `0–9` digits and the workspace timezone.
- Check truncation, punctuation, icon order, tables, drawers, dialogs, charts, breadcrumbs, calendars, and horizontal scrolling in both directions.

## Notifications, activity, and email

- New system notifications store `message_key` and structured `message_params`, plus legacy English `title` / `body` fallbacks for rollback compatibility.
- Renderers prefer the localized message-key result and fall back to stored text only when a key or translation is unavailable.
- Email uses the recipient's validated profile locale. Pre-account invitations use the agency content locale, then English.
- Never interpolate unescaped user content as HTML. Mixed-direction parameters require isolation.
- Notification migrations are additive and must use the exact singular schema tables `notification` and `activity_event` unless the schema is deliberately changed first.

## Required evidence for every touched route

At the exact clean HEAD, record:

- English/LTR and Arabic/RTL behavior.
- 375, 768, 1024, 1280, and 1440+ pixel layouts where relevant.
- Keyboard order, focus restoration, accessible names, and axe results.
- Loading, empty, populated, permission-denied, validation, error, and recovery states.
- Long Arabic copy, long English copy, mixed-direction values, and dense data.
- Locale persistence through profile save, reload, sign-out, and sign-in.
- Focused unit tests plus relevant `pnpm test:e2e:isolated` and `pnpm test:visual` coverage.

`pnpm verify` remains mandatory but proves compilation and unit-level behavior only. It does not replace migration, browser, accessibility, or visual evidence.

## Migration and release requirements

For any localization schema change:

1. Confirm exact table/column names against the Drizzle schema and the previous migration.
2. Add the SQL migration and matching Drizzle journal/meta entry atomically.
3. Document forward, compatibility, backup, and rollback behavior.
4. Run the from-zero and supported-upgrade paths with `pnpm migration-drill`.
5. Run the app against the migrated database and exercise an authenticated page that reads the new columns.
6. Record commands, exit codes, date, and exact clean commit SHA in the production-readiness evidence bundle.

If the branch advances after evidence is captured, rerun every affected gate.

## Adding another locale

Adding a locale is more than adding a code to `SUPPORTED_LOCALES`. The same change set must provide:

- Full catalog and placeholder parity.
- Font and document-direction behavior.
- Profile and public-switcher labels.
- Locale-specific formatting policy.
- Notification/email rendering.
- Native-language editorial review.
- Bilingual-equivalent E2E, accessibility, and visual evidence.
- Updated ADR, contract, route matrix, and release evidence.

Do not claim support until the complete checklist passes.
