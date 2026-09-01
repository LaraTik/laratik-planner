# AGENTS — laratik-planner

> **What this repo is:** `laratik-planner` is a Next.js 16 + Drizzle + Postgres + NextAuth SaaS for social media planning, design, and approvals. It is the LaraTik port of the **StudioFlow Production Development Master Prompt** to a self-hosted stack running on the LaraTik VPS (`217.154.124.83`).
>
> **Single source of truth:** `STUDIOFLOW_MASTER_PROMPT.md` in this directory. All product, scope, design, and engineering decisions originate there. `PORT_NOTES.md` records every deviation from that prompt (Supabase → Postgres sidecar, Vercel → VPS, Resend → Mailcow, pgTAP → Drizzle tests).

## Mandatory production-readiness protocol

`PRODUCTION_READINESS_TRACKER.md` is the authoritative implementation status. Before changing code, read the master prompt, tracker, relevant ADRs, and the applicable documentation in `node_modules/next/dist/docs/`.

- Execute tracker items in dependency order. A full implementation pass does not remove evidence requirements.
- Use atomic milestone commits and never mix unrelated work.
- Never mark work complete from compilation alone or weaken/skip a test to obtain green output.
- MiniMax may move work through `Tested`; only an independent reviewer may assign `Verified`.
- Record every material deviation with reason, impact, security/data implications, and approval requirement.
- Preserve production identifiers/data. Every migration needs forward, compatibility, backup, and rollback evidence.
- End an implementation pass with the evidence bundle described in `docs/production-readiness/README.md`.

## Quick start

```bash
# Local dev (one-shot)
./scripts/dev.sh                  # docker compose up postgres + pnpm dev (HMR native)

# Daily ops
./scripts/project.sh status       # container states + health
./scripts/project.sh logs app     # tail app logs
./scripts/project.sh restart app
./scripts/project.sh shell app
./scripts/project.sh health       # app + db reachability
./scripts/project.sh migrate      # pnpm db:migrate
./scripts/project.sh backup       # pg_dump → ./tmp/backups

# Deploy to VPS
./scripts/deploy.sh               # pulls :latest
./scripts/deploy.sh <sha>         # pulls specific commit
```

## Local disposable test database

Integration tests, the migration drill, isolated Playwright E2E, and the
visual suite all use a separate `planner_test` database. Start the dev
Postgres container and provision it once (the Docker command works even when
the host does not have `psql` installed):

```bash
docker compose -f docker-compose.dev.yml up -d postgres
docker exec laratik-planner-pg-dev pg_isready -U planner -d planner
docker exec laratik-planner-pg-dev psql -U planner -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'planner_test'" | grep -q 1 || \
  docker exec laratik-planner-pg-dev psql -U planner -d postgres \
  -c "CREATE DATABASE planner_test"
export TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test
```

Run `NODE_ENV=test pnpm migration-drill` and `pnpm test:integration` before
browser checks. The `test:e2e:isolated`, `test:e2e:critical`, and `test:visual`
scripts all use `scripts/run-e2e-tests.ts`; it refuses non-test URLs, applies
migrations, and injects deterministic test-only Auth.js secrets. Never point
`TEST_DATABASE_URL` at `planner` or a production database.

## Design source — Google Stitch

The visual target is the **StudioFlow** design system on Google Stitch
(project `5403097764334458790`, design system `assets/e2bbd2e84f524a5eb7e1aa20a22d7531`).
The captured copy lives in `./designs/stitch/` (49 PNGs + 49 HTMLs + `DESIGN.md`)
and is the in-repo canonical artifact for visual parity work. `docs/visual-parity/PLAN.md`
records the M0–M6 plan that consumed it; `docs/production-readiness/SCREEN_PARITY.md`
is the 27-row matrix that tracks each Stitch screen against a laratik-planner route.

**Refresh from the live Stitch MCP** only when the user reports an upstream
change. The MCP endpoint is `https://stitch.googleapis.com/mcp`; auth is the
`X-Goog-Api-Key` header. The full recipe (auth, tools, gotchas, regeneration
of `DESIGN.md`, what to commit) is in **`docs/visual-parity/MCP.md`** — read
it before re-capturing. Key reminders:

- `list_screens` param is the bare integer `"5403097764334458790"`, not
  the `"projects/…"` form (the latter returns "Request contains an
  invalid argument")
- `get_screen` param is the `parent/child` shape
  `"projects/5403097764334458790/screens/<id>"` — there is no
  `get_project` tool
- The CDN `downloadUrl` in `get_screen` is a **512px thumbnail**, not
  the 2560px original — full-res requires authenticated access
- Captured HTML uses arbitrary-value classes (`bg-[#3525cd]`,
  `p-[20px]`); always translate to the project's design tokens
  (`src/app/globals.css`), never copy-paste
- `designs/stitch/` is in `.prettierignore` — the captured HTML is
  auto-generated and must not be reformatted
- The Stitch API key is a personal secret. The captured copy in the
  repo is the build artifact; the MCP is only for refreshes

## Stack

| Layer     | Choice                                          | Why                                                        |
| --------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Framework | Next.js 16.3 (App Router) + TypeScript strict   | Per STUDIOFLOW_MASTER_PROMPT §4                            |
| UI        | Tailwind 4 + shadcn/ui + Radix                  | Per master prompt §4, §17                                  |
| DB        | Postgres 16 (sidecar container)                 | Dedicated, isolated, Drizzle-first-class                   |
| ORM       | Drizzle                                         | Type-safe, no codegen daemon, SQL-flavored migrations      |
| Auth      | NextAuth v5 (Auth.js) + Drizzle adapter         | Google OAuth + email magic link, JWT sessions              |
| Email     | Nodemailer → Mailcow SMTP                       | No new vendor, free, `mail.laratik.com` already running    |
| AI        | MiniMax (`MiniMax-M3`, Anthropic-compat)        | Goal 11 only, optional, `AI_FEATURE_ENABLED=false` default |
| Tests     | Vitest (unit) + Playwright (E2E + a11y)         | Per master prompt §4, §20                                  |
| CI        | GitHub Actions → GHCR                           | Free, public-image-friendly                                |
| Deploy    | GHCR → `docker compose pull` on VPS via Traefik | Matches `mavis-trader` / `laratik-social-platform` pattern |

## Repo layout

```
laratik-planner/
├── STUDIOFLOW_MASTER_PROMPT.md     # source spec (forwarded from Codex session)
├── PORT_NOTES.md                   # every deviation from the master prompt
├── README.md
├── AGENTS.md                       # this file
├── package.json
├── tsconfig.json                   # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── next.config.ts                  # output: 'standalone'
├── Dockerfile                      # multi-stage, ~150 MB final
├── docker-compose.yml              # prod: app + postgres (Traefik labels)
├── docker-compose.dev.yml          # local: postgres only (app runs native)
├── .github/workflows/
│   ├── ci.yml                      # deploy-gate: integration/coverage/audit/build/smoke/smtp-cert/lint-meta
│   └── deploy.yml                  # workflow_run: CI success → build+push GHCR → ssh deploy
#                                    # Release-gate contract: docs/testing/strategy.md (Release gates)
#                                    # Local E2E recipes: docs/operations/runbook.md (Local E2E)
├── src/
│   ├── app/                        # App Router
│   │   ├── layout.tsx              # Inter + StudioFlow tokens
│   │   ├── globals.css             # CSS variables + @theme inline
│   │   ├── page.tsx                # Goal 0 landing placeholder
│   │   └── api/health/route.ts     # { ok, version, env, db, uptime }
│   ├── components/
│   │   ├── ui/                     # shadcn primitives
│   │   ├── forms/                  # FormField, etc.
│   │   └── feedback/               # EmptyState, etc.
│   └── lib/
│       ├── validation/env.ts       # split client/server Zod schemas
│       ├── db/                     # Drizzle client, schema (Goal 1), migrations
│       ├── auth/                   # NextAuth v5 config (Goal 2)
│       └── email/                  # Nodemailer wrapper
├── tests/
│   ├── setup.ts                    # vitest + jest-dom
│   ├── unit/
│   └── e2e/                        # Playwright
├── docs/
│   ├── implementation/progress.md  # live checklist (per master prompt §0)
│   ├── architecture/overview.md
│   ├── operations/runbook.md
│   ├── operations/environment.md
│   └── testing/strategy.md
└── scripts/
    ├── dev.sh                      # one-shot local dev
    ├── deploy.sh                   # local → VPS deploy
    ├── project.sh                  # daily ops wrapper
    └── vps/                        # rsynced to /opt/laratik-planner/scripts/
        ├── logs.sh
        ├── shell.sh
        ├── migrate.sh
        ├── backup.sh               # pg_dump + (optional) restic offsite
        ├── health-check.sh         # /api/health retry loop (curl-after-up race fix)
        └── preflight.sh            # refuses to deploy if no auth provider is complete
```

## Production deployment (VPS)

| Field              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Repo               | `LaraTik/laratik-planner` (GitHub)                                 |
| Image              | `ghcr.io/laratik/laratik-planner`                                  |
| Domain             | `planner.laratik.com`                                              |
| VPS                | `laratik-vps` (217.154.124.83)                                     |
| Source path on VPS | `/opt/laratik-planner/`                                            |
| Container          | `laratik-planner-app-1` (via `docker compose -p laratik-planner`)  |
| Postgres container | `laratik-planner-postgres-1` (private internal network)            |
| Volumes            | `laratik-planner-pgdata`, `laratik-planner-app-data`               |
| Networks           | `laratik-planner_internal` (private), `traefik-public` (external)  |
| Traefik router     | `laratik-planner` (Host: planner.laratik.com, TLS via letsencrypt) |
| Autoheal           | Yes (label `autoheal=true`)                                        |
| Log rotation       | `json-file` 10m × 5 (per vps-ops rule)                             |

## Hard rules

- ❌ Never commit `.env` — gitignored, only `.env.example` is committed
- ❌ Never run `docker compose down -v` on prod — destroys the Postgres volume
- ❌ Never paste real secrets into source, examples, fixtures, screenshots, or PR descriptions
- ❌ Never expose `MINIMAX_API_KEY`, `AUTH_SECRET`, `SMTP_PASSWORD`, or `SENTRY_AUTH_TOKEN` in client code (the split env schema enforces this structurally)
- ✅ Always backup before upgrading — `./scripts/project.sh backup` (or `scripts/vps/backup.sh` on VPS)
- ✅ Always run `pnpm verify` before pushing
- ✅ `pnpm verify` is the baseline, not complete release evidence. Database changes also require `pnpm migration-drill`; user-facing UI or localization changes also require the relevant bilingual E2E, accessibility, and visual checks from `docs/testing/strategy.md`.
- ✅ Every migration must be registered in `src/lib/db/migrations/meta/_journal.json`, target the exact table names in the Drizzle schema, and include forward, compatibility, backup, rollback, from-zero, and upgrade evidence. A successful build does not prove that a migration runs.
- ✅ Record verification against the exact clean commit SHA. If the branch advances or becomes dirty after verification, rerun the affected gates before calling the work complete.
- ✅ Pre-commit hook catches lint/format/typecheck/unit-test issues early — keep it fast by keeping its scope tight (lint-staged on staged files, `vitest related` on staged sources, sentinel-driven `tsc --noEmit`). Skip with `git commit --no-verify` or `SKIP_TYPECHECK=1` for WIP / hotfixes.
- ✅ Pre-push hook runs the full unit suite and the critical E2E subset (`pnpm test:e2e:critical` = chromium + visual-chromium). Skip with `git push --no-verify`, `SKIP_PREPUSH=1`, or `SKIP_E2E=1` for trivial pushes.
- ✅ Always merge finished work to `main` — review, commit, push as soon as `pnpm verify` is green and the local pre-merge E2E checklist (full 5-browser matrix + visual) is complete on the release-candidate branch. No half-finished work sitting in the local working tree or on a stale local branch. The deploy workflow fires on `workflow_run: CI success`, so the change is live on production the moment the deploy job finishes.
- ✅ CI is authoritative — local git hooks are optional and never replace CI
- ✅ Staging before production: not yet (single-environment for v1, see Goal 14)
- ✅ Disk hygiene before deploy: ensure VPS `/` is < 70% (use the vps-ops `disk-cleanup.sh apply` if needed)
- ✅ Log rotation per container, not just daemon default (already in compose: 10m × 5)

## Settings architecture

Settings is a **nested group in the main sidebar**, not an inline nav inside a settings page. The Stitch design (`2f6acd26`) has 8+ sections; the inline 200px rail we shipped first was a stopgap that made the page feel nested twice. The rules:

- **Workspace manager sidebar** — `Settings` is a top-level expandable group under the workspace tabs. Sub-items live as `SidebarSubLink` inside it. Current sections: `Lifecycle`, `Lead times`, `Assignment defaults`, `Approval mode`, `AI assistance`.
- **Admin sidebar (global)** — `Agency Settings` is a top-level expandable group under the Admin section. Sub-items: `General` (the existing agency overview) and `AI configuration` (the editable surface at `/app/agency-settings/ai`).
- **Sections share one page when the data is one row.** Lifecycle / Lead times / Assignment defaults / Approval mode all read from the same `workspace_settings` row and live as anchor fieldsets on `/w/[slug]/settings`. Don't split them into separate routes until the data diverges.
- **AI lives inside Settings on both sides.** Agency admins configure at `/app/agency-settings/ai`. Workspace managers and planners see a read-only status card at `/w/[slug]/ai-settings` with a link to the agency config. The capability toggles are the agency's, not the workspace's.
- **New section** = add a `SidebarSubLink` in `src/components/app-shell/sidebar.tsx`, an anchor `id` on a `<Card>` or `<fieldset>` in the page, and the corresponding `Section` shape in the page's data load. Don't add a route unless the section needs its own server-only auth path.
- **Settings pages are not full-page replacements of the sidebar.** They are scrollable surfaces with the sidebar as the primary nav. The settings page may show a compact "overview strip" linking each section (the current implementation does this), but never a duplicate vertical nav.

## Form controls

For native HTML form controls, use the shared primitives in `src/components/forms/` (FormField, FormSubmitButton, PasswordInput, PasswordStrengthMeter). For checkboxes, **use `<Checkbox>` from `src/components/ui/checkbox.tsx`** — never raw `<input type="checkbox">`. The Radix-powered primitive bakes in the `checkbox` role, `aria-checked` state, keyboard handling (space to toggle), and indeterminate state, which are easy to get wrong with a native input. Pair the checkbox with a `<label htmlFor={id}>` and a helper `<p id="${id}-help">` (linked via `aria-describedby`) when the affordance needs explanation — see `app/users/add-directly-form.tsx` for the canonical pattern.

For bilingual (English + Arabic) text inputs, use the shared
`DirAwareTextarea` / `DirAwareInput` from
`src/components/forms/dir-aware-textarea.tsx`. They auto-switch
the `dir` attribute based on the first non-whitespace char
(Arabic Unicode blocks → `rtl`, otherwise `ltr`) and use
`text-start` / `text-end` logical properties so the caret
aligns correctly when the user types. The `locale` prop sets
the fallback dir for empty fields. **Never** copy-paste the
underlying `<textarea>` / `<input>` and add a hard-coded
`dir="rtl"` — the per-field direction is content-driven, not
locale-driven.

For a per-field translation sidecar (the workspace's other
language), wrap the field with `TranslationPanel` from
`src/components/forms/translation-panel.tsx`. Translations
live inside `formatPayload.translations[locale]` (see the
`formatPayload` rule below).

## Content `formatPayload` rule

Per StudioFlow §11/§17/§23: Quick Create has exactly 4 fields (title, format, planned date, short brief). Format-specific structured fields (Hook, Main message, CTA, scenes, captions, references, etc.) live in `content_item.format_payload` (jsonb) and are edited under a **More details** disclosure on the content detail page (`src/components/forms/format-payload-editor.tsx`).

- Do NOT add columns to `content_item` for these fields. The schema is already jsonb-shaped (§8: "default `{ schemaVersion: 1 }` enforced in service"). Adding columns duplicates the JSONB, breaks the format-driven UX, and requires a backfill migration.
- The per-format schemas are the source of truth: see `docs/content/format-payload-schemas.md`. Update that file when a format gains a field; the implementation derives from it.
- The `brief` field is a one-line text intent. It is separate from `formatPayload` (the structured creative contract). Rewriting the brief for clarity does not reset creative's notes, and vice versa.

### Save path

The editor's save path is `updateFormatPayloadAction` →
`updateFormatPayload` in `lib/content/service.ts`. The
service re-applies the per-format Zod schema on every
write; malformed input throws. The activity event records
the key-set diff (not the JSONB body) — JSONB diffs are
noisy and not actionable in audit. Editability is the same
as `updateContentItem` (only `draft` and `changes_requested`
items are editable per master prompt §10).

### Per-field AI

Every text field in the More details editor has a
`Suggest with AI` button (`src/components/forms/per-field-ai-suggest.tsx`).
The button POSTs to `/api/ai/generate` with
`capability=caption_drafts` and a new `field` parameter that
scopes the prompt to that one field. The route reuses the
existing `caption_drafts` allowlist (no new entitlement) and
returns `{ text, parsed? }` — `parsed` is the structured value
for fields like `hashtags` (string[]). The preview shows
Insert / Replace / Try again / Dismiss; the route never
writes to the DB on the user's behalf (master prompt §0.13).
The button is hidden when the agency's `caption_drafts`
capability is off — there is no second `caption_drafts_per_field`
gate to manage.

### Translations

Translaton sidecar (`src/components/forms/translation-panel.tsx`):
each text field gets a per-locale sidecar (v1: English +
Arabic from `src/lib/i18n/locales.ts`). The values are
stored inside `formatPayload.translations[locale]` as a
per-locale partial of the source payload shape. The publish
form (`planning/[id]/publish`) reads the matching translation
when the user sets `contentLanguage`; otherwise the source
(default-locale) values flow through. The mapper
(`src/lib/format-payload/mapper.ts`) is the only place the
locale → field resolution lives — adding a new locale to
the picker is a one-line change to `SUPPORTED_LOCALES`.

### Publish pre-fill

The publish form (`publish-package-form.tsx`) starts from a
per-platform default and merges the planner's mapped
`formatPayload` (caption / hashtags / firstComment /
callToAction / description / location / contentLanguage) on
top. Saved channel values always win. See
`formatPayloadPreFill` in `publish-package-form.tsx` and
`mapFormatPayloadToPlatform` in `lib/format-payload/mapper.ts`.

### Batch add extensions

Batch paste (`/planning/batch`) now supports an extended
row format: `title | format | date | brief [| caption
[| hashtags [| location]]]`. The location cell accepts
`name` or `name|externalId` (internal `|`). Per-row
extensions are written into `formatPayload` on insert via
the per-format Zod schema; a row that exceeds a per-format
limit rolls back the whole batch. v1 paste rows (4 fields)
still parse.

## Interface localization and bilingual content (EN/AR + RTL)

The canonical implementation and verification contract is
`docs/i18n/CONTRACT.md`; ADR 0009 records the architectural
decision. The durable rules are:

- **Interface locale and content locale are different concepts.** The interface precedence is validated `users.locale` → validated HttpOnly `laratik_locale` cookie → `en`. `agencies.locale` is only the agency's content / brand default and must never drive application chrome.
- The root `<html lang dir>` and Arabic font come from the resolved interface locale. Public language controls belong only on signed-out public/authentication surfaces. Authenticated users switch language through `/app/account`, which persists `users.locale` and synchronizes the public cookie after the database write succeeds.
- **Never pass a translator function or other function-valued prop from a Server Component to a Client Component.** Pass serializable translated strings or install a scoped client provider. Do not serialize the full catalog into every page.
- The locale cookie is HttpOnly by design. Client code and error boundaries must not read `document.cookie` to resolve locale; bootstrap locale through server-rendered serializable state or a provider. Do not weaken the cookie to fix a client translation problem.
- Server actions and domain services return stable codes / structured data. Page, action, email, notification, and error boundaries translate those codes. Logs and audit records remain technical. User-generated content is never machine-translated implicitly.
- Per-field direction is content-driven. Use `DirAwareTextarea` / `DirAwareInput`, `<bdi>`, `dir="auto"`, or reviewed `dir="ltr"` for mixed-direction values such as URLs, handles, emails, IDs, hashtags, and filenames.
- Use logical CSS (`text-start` / `text-end`, `ps-*` / `pe-*`, `ms-*` / `me-*`, logical inset utilities). Physical left/right utilities require a documented intrinsic-direction exception.
- Arabic numbers, percentages, dates, and times use Western `0–9` digits and the workspace timezone. Arabic product copy requires native editorial review against the glossary in `docs/i18n/CONTRACT.md`; direction switching alone is not Arabic support.
- A touched route is not complete until English and Arabic, LTR and RTL, 375/768/1024/1280/1440+ layouts, keyboard access, axe, loading/empty/error states, and locale persistence are evidenced at the exact clean HEAD.
- Format-specific content translations continue to live in `formatPayload.translations[locale]`; the `TranslationPanel` is the write UI and `lib/format-payload/mapper.ts` is the read path.

### Bilingual implementation contract (master-prompt §22 / UI_UX_REFINEMENT_2026-09-01)

The durable bilingual implementation rules — not optional, not review-dependent — are:

- **Every new screen ships in English/LTR and Arabic/RTL.** A feature is not complete until both locales render at the same code path. Direction switching alone (`<html dir="rtl">`) is not Arabic support.
- **Central message catalogs only.** No hard-coded user-facing copy in components. The catalog module is `src/messages/{en,ar}/common.json`; the loader is `src/messages/index.ts` (pure, vitest-importable); the server resolver is `src/lib/i18n/t-for-active.ts`; the client-side optional-`t` + English-fallback pattern is documented in the "Client components" rule below. Catalog parity (en ↔ ar identical key shape) is a `tests/unit/i18n/catalogs.test.ts` gate.
- **Interface / content locale split.** `users.locale` controls the application interface. `agencies.locale` is content-only (brand default). The two never drive each other.
- **Server-side `tForActive()` for every Server Component that renders user-visible copy.** It returns `{ t, code, dir, source }`; the page threads the `t` function (or pre-resolved strings) to client children via serializable props.
- **Client children: optional `t` + English-fallback pattern.** Every client sub-component that renders user-visible text accepts an optional `t?: (key, params?) => string` prop. When provided, the component reads from the catalog via `tr(key, fallback, params?)`. When omitted, the component falls back to the stored English copy with `{name}` placeholders interpolated manually (no `sprintf` dependency). The result: the test surface (which doesn't mock the translator) still renders real, human-readable strings.
- **The exactOptionalPropertyTypes contract.** TypeScript's `exactOptionalPropertyTypes: true` is on, so `t?` props cannot be passed as `t={undefined}` to a child. Either pass `t={t}` directly (when the parent always has `t` in scope, e.g. immediately after `await tForActive()`), or use the conditional-spread pattern `{...(t ? { t } : {})}` when the parent itself has optional `t?`. The "always true" error TS2774 is a hint that the parent can pass directly.
- **Plural pair pattern.** The hand-rolled `t(key, params?)` does not support ICU `plural`. Use adjacent `{One,Many}` keys (e.g. `workspaceOverview.attention.atRiskOne` / `atRiskMany`); the caller picks the right key by count. The translated path interpolates `{count}`; the fallback path uses the English singular/plural. This keeps the catalog parity test green.
- **No function-valued prop crosses the Server → Client Component boundary.** Pre-resolve translated strings in the Server Component and pass them as serializable props, OR install a scoped client provider with a small, named catalog slice. Do not serialize the full catalog into every page.
- **Mixed-direction isolation.** Use `DirAwareTextarea` / `DirAwareInput`, `<bdi>`, `dir="auto"`, or reviewed `dir="ltr"` for mixed-direction values (URLs, handles, emails, IDs, hashtags, filenames). E-mail addresses, URLs, handles, hashtags, filenames, IDs, and channel identifiers stay direction-isolated.
- **`generateMetadata` for every page with a meaningful title.** The browser tab / SEO title follows the active locale. The body title is in `PageHeader`. Hard-coded English `export const metadata = { title: "..." }` is forbidden on production routes.
- **A touched route is bilingual-gate-complete only when** English and Arabic, LTR and RTL, 375/768/1024/1280/1440+ layouts, keyboard access, axe, loading/empty/error states, locale persistence, and the role-by-role and authentication-state review (`auth/anon`, `auth/client_reviewer`, `auth/workspace_manager`, `auth/agency_admin`, `auth/platform_owner`, suspended/archived workspaces) are all evidenced at the exact clean HEAD.
- **Direction switching is not Arabic support.** `<html dir="rtl">` plus `font-family` swap is necessary but not sufficient. Arabic product copy requires native editorial review against the glossary; UI strings require the catalog round-trip; date/number/percent/time formatting requires `Intl.*` with `numberingSystem: "latn"` and the workspace timezone; mixed-direction values require the explicit per-field isolation.

These rules apply to every new feature, every refactor of a touched surface, and every UI/UX polish pass. The audit doc `docs/design/UI_UX_REFINEMENT_2026-09-01.md` records the evidence trail.

## AI integration

Per StudioFlow §15:

- **Configuration is agency-level.** Key in `ai_feature_setting.agency_id` (PK). The full API key is NEVER stored in this table — only a 4-character masked suffix when the key is a managed secret. Default `key_source` is `environment`. The UI only shows provider, model, last-test result, 30-day usage, and capability toggles.
- **Six capabilities** defined in §15: `campaign_ideas`, `brief_improvement`, `caption_drafts`, `platform_adaptation`, `related_format_ideas`, `completeness_check`. The current end-to-end set is `caption_drafts` + `brief_improvement` + `completeness_check`. The other three return `501` from `/api/ai/generate` until implemented; do NOT silently fall back to a different capability.
- **Drafts only.** The route returns a `text` field; the user is responsible for `Insert / Replace / Copy / Try Again`. The route never writes to the DB on the user's behalf. `ai_usage_event.capability` records which capability was used.
- **Allowlist is server-enforced.** The agency's `enabled_capabilities` is the gate. The route returns `403` for a disabled capability. The UI hides the button but the server is the source of truth.
- **Capability allowlist is the full set** (not the 3 working ones). Disabling `brief_improvement` in agency settings hides the button on the content detail page. The allowlist size is what the agency admin sees, not what is currently implemented.
- **Per-field AI scope.** The More details editor's per-field "Suggest with AI" button (`src/components/forms/per-field-ai-suggest.tsx`) reuses the existing `caption_drafts` capability for allowlist + governance. The new `field` body parameter scopes the prompt to a single field (`caption`, `hook`, `hashtags`, `callToAction`, `description`, `visualDirection`, `additionalNotes`, etc.). An agency with `caption_drafts` on gets per-field AI for free — no new entitlement. The response shape is `{ text, parsed? }`; `parsed` is the structured value for fields like `hashtags` (string[]). Adding a field to the per-field surface is a one-line change to the `FIELD_PROMPTS` map in `src/lib/ai/index.ts` + the `FormatPayloadField` union.

## Goal progress (live)

| #   | Goal                                                        | Status | Notes                                                                                                                                                                                    |
| --- | ----------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Repository, design foundation, quality harness              | ✅     | This commit                                                                                                                                                                              |
| 1   | Database foundation, tenancy, RLS, generated types          | ✅     | Drizzle schema port from master prompt §8                                                                                                                                                |
| 2   | Closed auth, bootstrap, reset, invitation onboarding        | ✅     | NextAuth v5 + Google + Mailcow magic link + password sign-in (`c46fc21`)                                                                                                                 |
| 2.5 | Admin-initiated user creation (Add directly) + force-change | ✅     | `feat/users-add-directly` — `users.must_change_password` (migration 0022) + `createUserDirectly` service + first-login redirect middleware + `/set-password` page. Tabs on `/app/users`. |
| 3   | App shell, My Work, workspace creation, overview            | ✅     | M3b 27-row parity matrix closed                                                                                                                                                          |
| 4   | Workspace administration, users, channels, Brand Kit        | ✅     | Brand Kit R1–R3 (`439a52d`…`b66d7ba`); R4 publishing + linked resources (`cef5ca3`…`b84c945`); settings polish (`acda5ef`…`7f32060`)                                                     |
| 5   | Content model, Quick Create, formats, campaigns, templates  | ✅     | M3b content + library routes                                                                                                                                                             |
| 6   | Monthly planning, Batch Add, board, calendar, KPI           | ✅     | FullCalendar + dnd-kit                                                                                                                                                                   |
| 7   | Workflow transitions, assignments, review readiness         | ✅     | State machine in `src/lib/content/workflow.ts`                                                                                                                                           |
| 8   | Discussion, mentions, attachments, notifications            | ✅     | `CommentItem` + `CommentForm` extracted (`ca7ea77`)                                                                                                                                      |
| 9   | Delivery versions and two-stage creative review             | ✅     | Immutable versions, FOR UPDATE                                                                                                                                                           |
| 10  | Manual publishing, partial completion, failure recovery     | ✅     | `derivePublicationAggregate` + status guard                                                                                                                                              |
| 11  | Optional MiniMax assistance                                 | ✅     | Gated by `AI_FEATURE_ENABLED`; capability entry points on content detail (`b4e210b`)                                                                                                     |
| 12  | Responsive completion, accessibility, visual fidelity, perf | ✅     | 23 unique routes × 6 viewports = 138 responsive baselines (`a9fa300`, `3d40183`)                                                                                                         |
| 13  | Security hardening, observability, CI, staging, recovery    | ✅     | Sentry + restic offsite + visual-test deploy gate                                                                                                                                        |
| 14  | UAT, production deployment, final proof                     | ⏳     | Verdict: `READY FOR INDEPENDENT REVIEW` (2026-08-24, post-M3 merge `4a999fe`)                                                                                                            |

See `docs/implementation/progress.md` for the live per-task checklist.

**Release verdict (2026-08-24):** `READY FOR INDEPENDENT REVIEW` (shared across
`PRODUCTION_READINESS_TRACKER.md` and `docs/production-readiness/UAT_RELEASE.md`).
The independent reviewer (Task 13) flips the verdict to `READY` after the
30-step §23 journey and the owner checks in
`docs/production-readiness/EXTERNAL_SERVICES_UAT.md` are signed.

> Workflow contract — see `docs/testing/strategy.md` (Release gates). `ci.yml` is the **deploy-gate** (integration, coverage, audit, build, Docker smoke, SMTP-cert probe, workflow linters). Format / lint / typecheck / full unit suite / critical E2E (chromium + visual-chromium) run locally in `.husky/pre-commit` and `.husky/pre-push` so a regression is caught before CI minutes are spent. The full 5-browser E2E matrix and the visual matrix run **locally** as a manual pre-merge step (no GitHub workflow). `deploy.yml` fires on `workflow_run: CI success` and only deploys the exact `head_sha` (no `:latest`-only deploys).

## Conventions

- **Commits:** `<type>(<scope>): <description>`. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `upgrade`. Scopes: `db`, `auth`, `content`, `planning`, `workflow`, `discussions`, `deliveries`, `publishing`, `notifications`, `ai`, `infra`, `ci`, `deps`, `i18n`, `format-payload`.
- **Branches:** `main` is production. `feat/*` for features, `fix/*` for hotfixes, `chore/*` for chores. Squash-merge.
- **PRs:** must pass CI (`pnpm verify` + build + smoke e2e). Reference the goal number in the PR title.
- **ADRs:** material deviations from the master prompt go in `docs/decisions/`. The first one (`docs/decisions/0001-vps-port.md`) records the choice to self-host on the LaraTik VPS instead of Supabase + Vercel.
- **Merge on completion:** when a change is finished and `pnpm verify` is green AND the local pre-merge E2E checklist (`pnpm test:e2e:isolated` + `pnpm test:visual` on the release-candidate branch) is complete, commit it with a `<type>(<scope>): <description>` message and push to `main`. The deploy workflow fires on `workflow_run: CI success`, so the change is live on production the moment the deploy job finishes. No finished work sits in the local working tree or on a stale local branch; feature branches (`feat/*`, `fix/*`, `chore/*`) are temporary scratch space.

## Product UI/UX Engineering Rules

Every agent modifying user-facing UI in this repository — pages, components, layout, navigation, copy, color, motion, or interaction — MUST follow these rules. They are the durable UX contract that survives across PRs, branches, and goals. They are deliberately opinionated so future agents converge on a consistent product rather than re-deriving conventions per change.

### A. Understand the screen before modifying it

Before implementation, write a one-paragraph "screen review" covering: SCREEN, PURPOSE, PRIMARY USER, PRIMARY QUESTION, PRIMARY ACTION, CURRENT UX PROBLEMS, PROPOSED CHANGE, RESPONSIVE BEHAVIOR, REUSED COMPONENTS, NEW COMPONENTS, RISKS. The list page templates live next to the route. Never start by simply moving cards around.

### B. Follow progressive disclosure

Show the first decision-making metadata only:

1. what the item is (title + format icon)
2. current state (status / stage)
3. owner
4. deadline (or overdue)
5. next action (single primary CTA)

Move secondary metadata and advanced settings behind tabs, expandable sections, drawers, inspectors, or contextual menus. **Never inline the full workflow stepper in a list row** — the full stepper belongs in the detail view. (See `src/components/planning/planning-list-grouped.tsx` for the canonical list row; `src/components/planning/workflow-rail.tsx` for the inspector stepper.)

### C. One concept has one visual language

These concepts must look consistent everywhere they appear. Do not invent a new badge, color, or icon treatment on a per-screen basis — extract a shared primitive instead.

- **Content status** — `draft` / `in_design` / `content_review` / `creative_review` / `changes_requested` / `approved` / `ready_to_publish` / `partially_published` / `published` / `blocked` / `cancelled`. Source: `src/components/content/status-badge.tsx`. Map: `ALL_STATUSES` in `src/lib/content/status.ts`. Color: muted/primary/warning/danger variants. Never re-derive the mapping inside a page.
- **Workflow stage** — current step in the stage machine (Planning, Content Review, Design, Creative Review, Publishing). Source: `src/components/planning/workflow-stepper.tsx`. Stage count "3 / 5" is the only inline format allowed in list rows; full stepper is a popover or detail view.
- **Approval state** — `pending` / `approved` / `changes_requested` / `rejected`. Source: `src/lib/deliveries/service.ts`. Visual: distinct from content status; never share a color with the corresponding content status unless intentional and documented in `docs/decisions/`.
- **Publishing state** — `not_started` / `pending` / `succeeded` / `failed` / `partially_failed`. Source: `src/lib/publishing`. Visual: success/warning/danger variants. Always paired with the channel name so the failure is actionable.
- **Health / risk** — `on_track` / `at_risk` / `blocked` / `not_started`. Source: `aggregateHealth` in `src/lib/dashboard/health.ts`. Use the strict definition (excludes drafts, cancelled, blocked from "at risk") so the KPI tile and the row badge cannot disagree.
- **Ownership** — Owner, Designer, Reviewer. Three different responsibilities. Never collapse into a generic "assignee" — see `src/components/planning/overview-command-center.tsx` for the canonical role display.
- **Due / overdue** — always pair a planned date with its health state. Use the shared `DateBadge` primitive (if present) or the pattern in `src/components/planning/planning-list-grouped.tsx`. "Overdue" must be a color + an icon + a label, never color alone.

When a new visual treatment is needed twice, it is a candidate for extraction. When it is needed three times, extract it.

### D. Every screen must be responsive

Test at minimum: **375px (mobile)**, **768px (tablet portrait)**, **1024px (laptop)**, **1280px (desktop)**, **1440px+ (wide)**. Visual regression baselines for the 23 unique routes × 6 viewports live in `tests/e2e/visual-regression.spec.ts` and are pinned in `tests/unit/stitch-cases.test.ts`. Do not ship a screen that has not been verified at the relevant widths.

- Large desktop (≥1280px): persistent sidebar + main + optional inspector. Max content width 1440px (`max-w-[1440px]`) for planning/board; `max-w-7xl` (1280px) for forms.
- Standard laptop (1024–1279px): collapsed icon rail (72px), main, inspector drawer.
- Tablet (768–1023px): collapsed rail + collapsible inspector.
- Mobile (<768px): top app bar with workspace context (`MobileContextHeader`), bottom navigation, full-screen sheets for inspectors/dialogs. Never squeeze editor + preview + workflow into three tiny mobile columns.

Avoid fixed pixel widths in component CSS. Use Tailwind responsive prefixes (`md:`, `xl:`, `2xl:`) and the design tokens from `src/app/globals.css`. If a layout truly needs a fixed width, document the breakpoint in the component header.

### E. Avoid duplicate information

Do not show the same metadata repeatedly in the page header, tabs, cards, sidebar, and workflow rail unless repetition provides clear task context. The "what" appears once (e.g. content title in the header), the "who" appears once in the inspector, the "when" appears once. Cross-reference by anchor, not by repetition.

### F. Make actions obvious

Every page and workflow state must answer "What can I do now?" The primary CTA is the visually dominant action (full-color button, top-right or in the inspector). Secondary actions are outline buttons. Tertiary actions are text links or menu items. **Never present five actions with identical hierarchy.**

The Next-Action card in the content detail (`OverviewCommandCenter` → `NextActionCard`) is the canonical source of "what to do now" for a content item. The primary action label is the same string in the workspace header (server-computed `nextActionLabel` in the page). The two must never disagree.

### G. Prefer contextual editing

- Trivial fields: inline edit (`InlineEditableFields` pattern).
- Grouped related fields: panel/section (card with fieldset).
- Complex object: drawer (`EditDetailsDrawer` in `src/components/planning/`).
- Whole-content edit: dedicated screen (`/planning/[id]/edit`).
- Whole-content read: detail page (`/planning/[id]`).

Do not open a full editor for a single-field change. Do not put a single field inside a drawer.

### H. Preserve user context

Navigation and mutations must preserve, where reasonable: active agency, active workspace, selected month, filters, sort, density, selected content, selected tab. The list/board calendar page must accept the active filter set on the URL and reconstruct every pagination link from the known filter keys (see `buildPageHref` in `src/app/(app)/app/w/[slug]/planning/page.tsx`). Never silently drop a filter on a pagination click.

When switching agency or workspace, prefer to land the user inside the new context (the new agency's first workspace, or the new workspace's overview) rather than on the global app home. The agency switcher must surface a confirmation when the user is mid-task in a workspace URL that will become invalid — switching agency invalidates the current workspace URL.

### I. Accessibility is mandatory

Minimum bar:

- Semantic `<button>` / `<a>` / `<nav>` / `<main>` / `<header>`. No `<div onClick>`.
- Keyboard accessibility: every interactive element reachable by Tab, operable by Enter / Space.
- Visible focus treatment: `focus-visible:ring-focus-ring` (the `--focus-ring` token). The skip-link is a real skip-link with `focus:opacity-100`.
- ARIA labels on icon-only controls (`aria-label="Switch agency"`).
- Sufficient contrast: 4.5:1 for body text, 3:1 for large text and UI components. Test with light + dark mode.
- **Never** communicate state by color alone — pair color with an icon or a label (e.g. "29 days overdue" + warning icon + amber color).
- Meaningful empty states (see §Q below).
- Tooltips for icon-only controls via Radix's `Tooltip` (already wrapped on most primitives).
- The `prefers-reduced-motion` query is honored by `src/app/globals.css` (motion-fade utilities are gated).

### J. Responsive density

- Desktop may use information-rich layouts (the planning list at "comfortable" density).
- Tablet should reduce secondary metadata (hide the row's `comments` count, hide the `format` sublabel).
- Mobile should prioritize: title, status, owner, deadline, primary action. Everything else hides into a detail view or a swipe action.

Never compress desktop text below `text-body` (14px). The token is defined in `src/app/globals.css`. If a layout needs to fit more on mobile, change the representation (stacked card, sheet) — do not shrink type.

### K. Maintainability

Do not solve UI issues with one-off CSS hacks. Prefer:

- Shared primitives in `src/components/ui/` (Card, Button, Badge, EmptyState, Tooltip, Popover).
- Reusable layout components in `src/components/workspace/` (PageHeader, KpiCard, ListCard, ListItem, Pagination).
- Typed configuration (TS const arrays, not string literals inline).
- Consistent variants (`variant="outline"`, `density="compact"`).
- Design tokens (CSS variables in `src/app/globals.css`).
- Small composable components.

If the same pattern appears 3+ times, evaluate extraction. The `StatusBadge`, `EmptyState`, `KpiCard`, and `ListItem` are the canonical "extract these" precedents.

### L. Every UI task requires a UX regression review

Before completion verify, on every touched screen:

- navigation (does the back/forward button work? does the URL reflect state?)
- workspace isolation (does the data loader gate by workspace id? does the query key include the workspace?)
- permissions (does the server action check the role?)
- loading state (skeleton, not blank)
- empty state (no items, no match, no permission)
- error state (the global error boundary renders the surface, not a white page)
- long text (does the layout survive 200-char titles?)
- many items (100+ rows: pagination, virtualization if needed)
- zero items (the empty state explains + offers an action)
- mobile (375px)
- keyboard navigation (Tab through the screen)
- browser back/forward
- deep links (visiting a deep URL with a stale filter)

### M. No emoji as icons

Use the Lucide icon set (`lucide-react`) for UI icons. Do not use emojis (📷 🎨 🚀) as inline icons. The `

### N. Cursor pointer on interactive surfaces

Every clickable element (card, row, list item) MUST have `cursor-pointer`. The default cursor on an interactive element reads as "broken" to operators.

### O. No layout shift on hover

Hover states use color / background / opacity / shadow transitions only. No scale transforms that reflow neighboring elements. The exception is the canonical "lift" pattern on Cards (translate-y -1px + shadow), which is allowed because the surrounding grid tolerates the small reflow.

### P. No nested cards

A card inside a card inside a card is a visual smell. Use sections (borderless dividers + spacing) within a card, or use a flat grid of cards at the same nesting level. The "Owner / Designer / Reviewer" rows inside the workflow inspector are a divider, not a card.

### Q. Empty states must be meaningful

Every empty state MUST explain:

1. **what is missing** (e.g. "No content for August 2026")
2. **why it matters** (e.g. "This is where your monthly plan lives")
3. **what to do next** (e.g. "Quick Create →" or "Clear filters")

Reuse the `EmptyState` component from `src/components/feedback/empty-state.tsx`. The icon prop accepts any Lucide icon. The action prop is optional — not every empty state has a CTA, but a blank region is never acceptable.

### R. Loading states must be consistent

- Use skeletons for structured content (`<Skeleton>` from `src/components/ui/skeleton.tsx`).
- Use a single spinner for whole-page loads (`<Loader2 className="h-6 w-6 animate-spin" />`).
- Never render a duplicated spinner (page spinner + button spinner) on the same surface.
- Workspace switching must not flash stale content. The agency switcher does `router.refresh()` after the cookie write; the new SSR pass replaces the tree. If the user is on a workspace page, the new server pass returns 404 for the old URL (correct anti-IDOR) — but the agency switcher MUST navigate to a new URL atomically (see §H). See `src/components/app-shell/agency-switcher.tsx` for the canonical pattern.

### S. Status system audit (do not collapse different domains)

These are five distinct state enums. They MUST be modeled separately, queried separately, and rendered with separate primitives. The temptation to collapse them for UI convenience is a known bug pattern; the audit fixture in `tests/unit/workspace-kpis.test.ts` pins the rule.

| Dimension        | Enum                                                                                                                                                                                 | Source                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Content status   | draft / content_review / changes_requested / approved_for_design / in_design / creative_review / approved / ready_to_publish / partially_published / published / blocked / cancelled | `ALL_STATUSES` in `src/lib/content/status.ts`                                                             |
| Workflow stage   | Planning → Content Review → Design → Creative Review → Publishing (the stage-machine view)                                                                                           | `src/lib/content/workflow.ts`                                                                             |
| Approval state   | pending / approved / changes_requested / rejected (per delivery version)                                                                                                             | `src/lib/deliveries/service.ts`                                                                           |
| Publishing state | not_started / pending / succeeded / failed / partially_failed (per channel)                                                                                                          | `src/lib/publishing`                                                                                      |
| Health / risk    | on_track / at_risk / blocked / not_started                                                                                                                                           | `aggregateHealth` in `src/lib/dashboard/health.ts` (strict, excludes drafts and `blocked` from "at risk") |

If a future agent is tempted to render "At risk" as a status badge, or to filter by "at risk" using the content status enum, that is a bug. The five dimensions live in `docs/content/state-model.md` (or this section) and the unit test fixture in `tests/unit/workspace-kpis.test.ts` pins the boundary.

### T. Information density hierarchy

Follow this hierarchy. The same metadata MUST NOT appear at two of these levels on the same screen.

- **List / board rows:** decision-making metadata only. Title, format, status, date, owner, next action. (See §B.)
- **Detail overview:** operational summary. Next action, health, owner, designer, reviewer, planned date, last activity. (See `OverviewCommandCenter` in `src/components/planning/`.)
- **Content tab:** creation / editing fields. The 4-field Quick Create is the minimum; per-format `formatPayload` fields live under "More details". (See §G + the `formatPayload` rule above.)
- **Preview tab:** representation of the final published output. Platform selector, safe areas, carousel, story / reel / feed. NOT a live editor.
- **Publishing tab:** destination-specific publishing configuration. Channel selection, scheduled time, captions, hashtags.
- **Activity tab:** history / audit trail. Append-only.
- **Workflow inspector:** current process state and next action. Not a duplicate of the detail overview — answers "what is blocking me and what do I do next?"

### U. AI assistance rules

- **AI must NEVER silently overwrite user content.** Every AI output surfaces a preview with Insert / Replace / Copy / Dismiss. (Per master prompt §0.13; see `src/components/forms/per-field-ai-suggest.tsx` and `src/components/planning/ai-assistance-panel.tsx`.)
- For generated multi-field content, show exactly which fields will change. (Will update ✓ Hook, ✓ Main message, ✓ CTA. Will not change: Caption, Visual direction.)
- Surface a compact "Using:" indicator with the AI context (Brand Kit, Campaign, Content brief, Instagram constraints). Do not expose the technical implementation (no "tokens used", no "model", no "temperature" in the user-visible surface).
- Disabling an `ai_*` capability in agency settings hides the button on the content detail page; the route returns 403 if the disabled capability is requested.

### V. Screen review template

For EVERY touched screen, before writing code, write a short review (in the PR description or in a comment on the route file):

```
SCREEN:           /app/w/[slug]/planning (list view)
PURPOSE:          Monthly plan of content ideas for the active workspace.
PRIMARY USER:     Content planner / workspace manager
PRIMARY QUESTION: "What needs my attention this month?"
PRIMARY ACTION:   Open an item to act on it.
CURRENT UX ISSUES:
  - Workflow stepper in every row steals width
  - "OVERDUE (1)" repeated as a header per group
  - Owner and Designer are visually identical (no role distinction)
PROPOSED CHANGE:
  - Inline stage pill ("Design  3/5") replaces the full stepper
  - Group under "Overdue · 6 / Due this week · 4 / Upcoming · 12"
  - Owner + Designer get role-labelled row (Owner, Designer)
RESPONSIVE:       Compress row on mobile to title+status+owner+date+arrow
REUSED:           StatusBadge, DateBadge (extract), ListItem, EmptyState
NEW:              StagePill, RoleAvatarRow
RISKS:            Mobile row might lose the Owner/Designer pair — use a stacked sub-row.
```

This template is enforced by code review, not by an automated test. The intent is to force deliberate design decisions before pixels move.

### W. The agency → workspace context is correctness, not UI

Agency and workspace context is a P0 invariant. The current implementation has multiple defenses (signed `laratik_active_agency` cookie, HMAC, per-request decode with membership re-check, `getAccessibleWorkspace` anti-IDOR gate, 404 not 403 on cross-tenant lookup). Future agents MUST NOT weaken any of these defenses for a UI affordance. Specifically:

- The agency switcher MUST issue the cookie server-side via a server action. The client cannot forge a cookie for an agency it is not a member of.
- A user who is not a member of `agencyId` MUST be unable to load `/app/w/[slug]` for any slug in that agency — the layout returns 404, not 403 (anti-enumeration).
- A user who switches agency loses authority over the old workspace URL. The agency switcher navigates to a new URL atomically; it does not leave the old URL in the address bar.
- Cross-workspace query keys MUST include the workspace id. A `useSWR(['/api/content', workspaceId])` key without the workspace id is a data-leak bug.
- Tests covering A1→A2, A1→B1, B1→A1, browser refresh, browser back, direct URL, workspace removed, stale cached API response live in `tests/unit/workspace-isolation.test.ts` and `tests/e2e/workspace.spec.ts`.

## Cross-references

- `STUDIOFLOW_MASTER_PROMPT.md` — the source spec (3,010 lines, 26 sections)
- `PORT_NOTES.md` — every Supabase / Vercel / Resend / pgTAP reference mapped to the VPS-native equivalent
- `docs/architecture/overview.md` — system map (replaces the master prompt's diagram)
- `docs/operations/runbook.md` — deploy, backup, recovery, rotation
- `docs/i18n/CONTRACT.md` — interface/content locale ownership, RSC boundary, RTL, copy, notification/email, and bilingual evidence rules
- `docs/decisions/0009-user-interface-locale.md` — accepted EN/AR locale architecture and rollback contract
- `docs/operations/environment.md` — every env var, what it does, where it lives
- `docs/testing/strategy.md` — test layers, fixtures, coverage targets
- `docs/implementation/progress.md` — live task list (per master prompt §0)
- `docs/visual-parity/PLAN.md` — M0–M6 plan that consumed the Stitch design
- `docs/visual-parity/MCP.md` — how to refresh the captured Stitch copy from the live MCP (auth, tools, gotchas, commit recipe)
- `docs/production-readiness/DESIGN_AUDIT.md` — structural audit that drove the M2/M3 refactor
- `docs/production-readiness/SCREEN_PARITY.md` — 27-row matrix tracking each Stitch screen against a laratik-planner route; the responsive matrix (23 unique routes × 6 viewports = 138 baselines) lives in `tests/e2e/visual-regression.spec.ts` and is gated by `tests/unit/stitch-cases.test.ts`
- `docs/content/format-payload-schemas.md` — per-format `formatPayload` jsonb schemas (the structured fields under "More details")
- `designs/stitch/DESIGN.md` — the captured token reference (color/typography/spacing)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
