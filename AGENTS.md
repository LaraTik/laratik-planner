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

# Daily ops report (read-only; see docs/operations/daily-report.md)
PLANNER_TOKEN=<read-only token> python3 scripts/daily-report.py
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

# Verify the URL actually reaches the container before trusting a local
# result. If a native Postgres (Homebrew / Postgres.app / another container)
# is already bound to 127.0.0.1:5432, the more specific loopback bind wins
# over Docker's 0.0.0.0:5432 and every check silently runs against the wrong
# server — `docker exec … pg_isready` still passes, so the failure only
# surfaces as `database "planner_test" does not exist` on a database you
# just created. Pick a free port for the test container if the two collide.
psql "$TEST_DATABASE_URL" -tAc 'select current_database()'
```

Run `NODE_ENV=test pnpm migration-drill` and `pnpm test:integration` before
browser checks. The `test:e2e:isolated`, `test:e2e:critical`, and `test:visual`
scripts all use `scripts/run-e2e-tests.ts`; it refuses non-test URLs, applies
migrations, and injects deterministic test-only Auth.js secrets. Never point
`TEST_DATABASE_URL` at `planner` or a production database.

## Design source — Google Stitch

The current visual target is the **LaraTik Planner** design system on Google
Stitch (project `16083107078886291815`, design system
`assets/14000568228937989951`). The current route/screen inventory and refresh
protocol live in `docs/visual-parity/CURRENT_SYNC.md`.

The older StudioFlow project (`5403097764334458790`) and the captured copy in
`./designs/stitch/` are retained as a historical baseline for traceability;
they are not the current source of truth. `docs/visual-parity/PLAN.md` records
the historical M0–M6 work, while `docs/production-readiness/SCREEN_PARITY.md`
labels its 27-row matrix as the archived baseline.

**Refresh from the live Stitch MCP** only when the user reports an upstream
change. The MCP endpoint is `https://stitch.googleapis.com/mcp`; auth is the
`X-Goog-Api-Key` header. The full recipe (auth, tools, gotchas, regeneration
of the current capture manifest, what to commit) is in **`docs/visual-parity/MCP.md`** — read
it before re-capturing. Key reminders:

- `list_screens` param is the bare integer `"16083107078886291815"`, not
  the `"projects/…"` form (the latter returns "Request contains an
  invalid argument")
- `get_screen` uses the `parent/child` shape
  `"projects/16083107078886291815/screens/<id>"` and also requires the bare
  `projectId` and `screenId` fields
- The CDN `downloadUrl` in `get_screen` is a **512px thumbnail**, not
  the 2560px original — full-res requires authenticated access
- Captured HTML uses arbitrary-value classes (`bg-[#3525cd]`,
  `p-[20px]`); always translate to the project's design tokens
  (`src/app/globals.css`), never copy-paste
- `designs/stitch-current/` is in `.prettierignore` — the captured HTML is
  auto-generated and must not be reformatted
- The Stitch API key is a personal secret. The captured copy in the
  repo is the build artifact; the MCP is only for refreshes

## Stack

| Layer     | Choice                                          | Why                                                                                       |
| --------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Framework | Next.js 16.3 (App Router) + TypeScript strict   | Per STUDIOFLOW_MASTER_PROMPT §4                                                           |
| UI        | Tailwind 4 + shadcn/ui + Radix                  | Per master prompt §4, §17                                                                 |
| DB        | Postgres 16 (sidecar container)                 | Dedicated, isolated, Drizzle-first-class                                                  |
| ORM       | Drizzle                                         | Type-safe, no codegen daemon, SQL-flavored migrations                                     |
| Auth      | NextAuth v5 (Auth.js) + Drizzle adapter         | Google OAuth + email magic link, JWT sessions                                             |
| Email     | Nodemailer → Mailcow SMTP                       | No new vendor, free, `mail.laratik.com` already running                                   |
| AI        | MiniMax (`MiniMax-M3`, Anthropic-compat)        | Goal 11 only; provider config is env-backed, agency enablement/capabilities are DB-backed |
| Tests     | Vitest (unit) + Playwright (E2E + a11y)         | Per master prompt §4, §20                                                                 |
| CI        | GitHub Actions → GHCR                           | Free, public-image-friendly                                                               |
| Deploy    | GHCR → `docker compose pull` on VPS via Traefik | Matches `mavis-trader` / `laratik-social-platform` pattern                                |

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
│   ├── ci.yml                      # deploy-gate: integration/audit/build/smoke/smtp-cert/lint-meta
│   ├── advisory-quality.yml        # non-blocking coverage + browser quality checks
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
- ✅ Pre-push hook runs the full unit suite and integration suite; critical E2E (`pnpm test:e2e:critical`) is an advisory signal and never blocks a normal push. Use `pnpm test:e2e:release` for the strict full browser + visual release-candidate check. Skip with `git push --no-verify`, `SKIP_PREPUSH=1`, or `SKIP_E2E=1` for trivial pushes.
- ✅ Always merge finished work to `main` — review, commit, push as soon as `pnpm verify` is green and the local pre-merge E2E checklist (full 5-browser matrix + visual) is complete on the release-candidate branch. No half-finished work sitting in the local working tree or on a stale local branch. The deploy workflow fires on `workflow_run: CI success`, so the change is live on production the moment the deploy job finishes.
- ✅ CI is authoritative — local git hooks are optional and never replace CI
- ✅ Keep the remote Planner MCP current on every change: update the implementation, `docs/api/mcp.md`, `docs/api/README.md`, `docs/api/mcp-evaluation.xml`, affected bilingual Account UI copy, tests, and production-readiness evidence together. Follow [`docs/operations/mcp-maintenance.md`](docs/operations/mcp-maintenance.md); never ship a new tool, scope, error, or transport behavior with stale client documentation.
- ✅ Staging before production: not yet (single-environment for v1, see Goal 14)
- ✅ Disk hygiene before deploy: ensure VPS `/` is < 70% (use the vps-ops `disk-cleanup.sh apply` if needed)
- ✅ Log rotation per container, not just daemon default (already in compose: 10m × 5)

## Meedro-informed shell and Command Center contract

Use `design-system.md` and `docs/implementation/MEEDRO_REFACTOR_PLAN.md` before
changing shared UI. Meedro is a reference for information hierarchy, not a
branding or implementation source.

- The persistent left sidebar owns agency/workspace context, location, grouped
  destinations, and attention badges. Workspace groups stay job-oriented:
  `Plan`, `Understand`, `Produce`, and `Manage`.
- The top bar owns global utilities such as notifications, account, help, and
  safe global actions. Do not duplicate sidebar destinations in the top bar.
- A page header owns title, scope/freshness, and one dominant next action. A
  page-local rail is allowed only for in-page anchors, never as a second app
  navigation system.
- Workspace Settings uses the compact `SettingsSidebar` anchor strip at every
  breakpoint; do not restore a sticky desktop rail or render the strip twice.
- The workspace root is the Command Center. Keep its order as scope/freshness,
  social KPI and growth signals, performance/outliers, timing/format signals,
  then planning handoff; planning execution KPIs follow the social decision
  layer.
- Extend the existing authorized social analytics read model. Do not create a
  second analytics store, scrape competitor data, infer missing provider
  metrics, or add publishing behavior while implementing research features.
- Keep provider post observations bounded (currently ten recent objects per
  connected-account sync). Instagram post metrics come only from the approved
  read-only insights response; unsupported fields stay nullable. The agency
  probe may test one Facebook Page post with the v25 viewer metrics
  `post_media_view` and `post_total_media_view_unique`, but normal Facebook
  observations remain metadata/engagement-only until controlled Page UAT proves
  the token, permissions, and viewer semantics.
- Command Center refresh is a workspace-manager action that reuses
  `runChannelTest` sequentially for connected channels. Do not add a second
  provider-sync path or expose refresh controls to planners/reviewers.
- Every signal must retain visible period, source account, freshness, sample
  size, partial-data state, and a route to a useful action such as Research,
  Create brief, or Planning. Preserve role gates, EN/AR catalogs, RTL layout,
  keyboard access, and accessible table/empty/error fallbacks.
- Social provider setup is per-agency, not global: app ID, app secret, Login
  for Business configuration ID, and optional Graph version belong in
  `agency_social_provider_config` through
  `/app/agency-settings/social/providers`. Never reintroduce these secrets in
  `.env`, client code, logs, screenshots, or fixtures.
- Keep the provider rollout staged and explicit: configured callback → tested
  credentials → connected profiles → read-only analytics probe → controlled
  sync/UAT. A configured app or connected profile alone is not Command Center
  evidence. Meta remains read-only until the external-service UAT is signed;
  publishing stays disabled by default.
- Use [`docs/operations/META_COMMAND_CENTER_SETUP.md`](docs/operations/META_COMMAND_CENTER_SETUP.md)
  for the current canonical-app decision, read-only scope list, callback
  pattern, sanitized evidence checklist, and rollout stop gates. Refresh that
  worksheet after any Meta app or Graph-version change.

## Settings architecture

Settings is a **nested group in the main sidebar**, not an inline nav inside a settings page. The Stitch design (`2f6acd26`) has 8+ sections; the inline 200px rail we shipped first was a stopgap that made the page feel nested twice. The rules:

- **Workspace manager sidebar** — `Settings` is a top-level expandable group under the workspace tabs. Sub-items live as `SidebarSubLink` inside it. Current sections: `Lifecycle`, `Lead times`, `Assignment defaults`, `Approval mode`, `AI assistance`.
- **Admin sidebar (global)** — `Agency Settings` is a top-level expandable group under the Admin section. Sub-items: `General` (the existing agency overview) and `AI configuration` (the editable surface at `/app/agency-settings/ai`).
- **Sections share one page when the data is one row.** Lifecycle / Lead times / Assignment defaults / Approval mode all read from the same `workspace_settings` row and live as anchor fieldsets on `/w/[slug]/settings`. Don't split them into separate routes until the data diverges.
- **The workspace display name is a Lifecycle card, not a route.** `WorkspaceNameForm` edits `workspace.name` (`lib/workspaces/rename-service.ts`). It lives in Lifecycle because the name sits on the same `workspaces` row as the timezone. **The slug is not editable** — it is the URL identity and the key of the anti-IDOR lookup; the card shows it read-only. See the Changelog entry above before adding a slug field.
- **AI lives inside Settings on both sides.** Agency admins configure at `/app/agency-settings/ai`. Workspace managers and planners see a read-only status card at `/w/[slug]/ai-settings` with a link to the agency config. The capability toggles are the agency's, not the workspace's.
- **New section** = add a `SidebarSubLink` in `src/components/app-shell/sidebar.tsx`, an anchor `id` on a `<Card>` or `<fieldset>` in the page, and the corresponding `Section` shape in the page's data load. Don't add a route unless the section needs its own server-only auth path.
- **Settings pages are not full-page replacements of the sidebar.** They are scrollable surfaces with the sidebar as the primary nav. The settings page may show a compact "overview strip" linking each section (the current implementation does this), but never a duplicate vertical nav.

## Form controls

For native HTML form controls, use the shared primitives in `src/components/forms/` (FormField, FormSubmitButton, PasswordInput, PasswordStrengthMeter). For checkboxes, **use `<Checkbox>` from `src/components/ui/checkbox.tsx`** — never raw `<input type="checkbox">`. The Radix-powered primitive bakes in the `checkbox` role, `aria-checked` state, keyboard handling (space to toggle), and indeterminate state, which are easy to get wrong with a native input. Pair the checkbox with a `<label htmlFor={id}>` and a helper `<p id="${id}-help">` (linked via `aria-describedby`) when the affordance needs explanation — see `app/users/add-directly-form.tsx` for the canonical pattern. The shared primitive intentionally includes `min-h-0`: the global mobile touch-target rule applies to every `button`/`role="button"`, and allowing that rule to stretch a 16px checkbox produces a broken tall rectangle. Put the checkbox in a labeled row/card that supplies the 44px touch target instead.

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

## Media floor on deliveries (optional media)

`content_item.media_required` (default `true`) decides whether a post
must ship stored media with its delivery. It exists because a real class
of posts has no creative file at all — caption-only announcements,
text-first/thread posts, link drops — and the old floor was
unconditional in three places (Zod `.min(1)`, the service guard, and the
form's `onSubmit`). Designers were attaching filler media to get past a
validator.

- **The floor lives in `submitDelivery`, not in `SubmitDeliverySchema`.**
  It is conditional on a column, and a static schema cannot read a
  column. Do not re-add `.min(1)` — it silently closes the bypass while
  looking like a safety net. The `.max(20)` ceiling is unconditional and
  _does_ belong in the schema.
- **Only `workspace_manager` / `content_planner` may set the flag**
  (`setMediaRequired`), matching `updateContentItem`. A designer
  submitting the delivery must not be able to lift the floor on their own
  submission. The form's checkbox is therefore `disabled` for them, with
  explanatory copy rather than a hidden control.
- **Only the pre-creative statuses** (`draft`, `content_review`,
  `approved_for_design`, `in_design`, `changes_requested`). The single
  source of truth is `MEDIA_REQUIRED_STATUSES`, exported from the
  service and consumed by both the guard and the page's
  `canSetMediaRequired` — do not re-enumerate the list at a call site.
- **An assetless delivery requires a non-empty `description`.** With no
  files attached, the `delivery_version` description is the only record
  of what was delivered. The service enforces it; the form mirrors it.
- **The review gate is untouched.** A zero-asset delivery still creates
  a `delivery_version`, still opens a `creative_internal` approval
  request, and still sets `approvedDeliveryVersionId` on approval — so
  `evaluateReadiness`'s `no_approved_delivery` blocker is unaffected. If
  you ever find yourself editing `readiness.ts` for this feature, the
  scope has drifted.
- **The checkbox is inverted relative to the column.** The control means
  "no creative" (`!media_required`); the conversion happens once, inside
  `setAssetsOptional` in `delivery-section.tsx`. Passing the checkbox
  state straight through as `mediaRequired` inverts the flag silently.

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
- **Monthly planning instruction packs.** The reviewed canonical pack is the paired Markdown source and manifest under `docs/ai-planning/source/` and `docs/ai-planning/defaults/`. Keep the nineteen source files mapped one-to-one in `manifest.json`; only published agency/workspace revisions may enter an AI context, while draft revisions remain editable and reviewable. Changes to the pack must update the source, manifest, validation, and the bilingual monthly-planning UI together.

## Goal progress (live)

| #   | Goal                                                                  | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Repository, design foundation, quality harness                        | ✅     | This commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1   | Database foundation, tenancy, RLS, generated types                    | ✅     | Drizzle schema port from master prompt §8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | Closed auth, bootstrap, reset, invitation onboarding                  | ✅     | NextAuth v5 + Google + Mailcow magic link + password sign-in (`c46fc21`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2.5 | Admin-initiated user creation (Add directly) + force-change           | ✅     | `feat/users-add-directly` — `users.must_change_password` (migration 0022) + `createUserDirectly` service + first-login redirect middleware + `/set-password` page. Tabs on `/app/users`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | App shell, My Work, workspace creation, overview                      | ✅     | M3b 27-row parity matrix closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4   | Workspace administration, users, channels, Brand Kit                  | ✅     | Brand Kit R1–R3 (`439a52d`…`b66d7ba`); R4 publishing + linked resources (`cef5ca3`…`b84c945`); settings polish (`acda5ef`…`7f32060`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | Content model, Quick Create, formats, campaigns, templates            | ✅     | M3b content + library routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Monthly planning, Batch Add, board, calendar, KPI                     | ✅     | FullCalendar + dnd-kit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7   | Workflow transitions, assignments, review readiness                   | ✅     | State machine in `src/lib/content/workflow.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | Discussion, mentions, attachments, notifications                      | ✅     | `CommentItem` + `CommentForm` extracted (`ca7ea77`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | Delivery versions and two-stage creative review                       | ✅     | Immutable versions, FOR UPDATE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 10  | Manual publishing, partial completion, failure recovery               | ✅     | `derivePublicationAggregate` + status guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11  | Optional MiniMax assistance                                           | ✅     | Gated by the agency `ai_feature_setting` master switch and capability allowlist; provider connection config remains env-backed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 12  | Responsive completion, accessibility, visual fidelity, perf           | ✅     | 23 route surfaces use the scoped visual contract: 19 non-planning × 3 viewports plus four planning × 4 viewports = 73 responsive baselines; 39 exact-reference captures (`a9fa300`, `3d40183`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13  | Security hardening, observability, CI, staging, recovery              | ✅     | Sentry + restic offsite + visual-test deploy gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 14  | UAT, production deployment, final proof                               | ⏳     | Verdict: `READY FOR INDEPENDENT REVIEW` (2026-08-24, post-M3 merge `4a999fe`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 15  | Media library navigation + bulk actions + reconcile                   | ✅     | FEAT-MEDIA-LIBRARY-2026-09-16 — collapsible tree, depth-aware breadcrumb, "In use by" panel, multi-select with capability-gated bulk Move/Trash/Tag/Visibility (cap 500, 5 s undo), silent `plannedPublishAt` reconcile + audit log, Brand-Kit top-level folder, UI/UX Pro Max discipline (full-row click, kebab actions, hide-not-disable, badge counts, bilingual catalog parity). Design: `docs/design/MEDIA_LIBRARY_AUDIT_2026-09-16.md`. Typecheck + bulk-cap / selection-store / sanitize-tags unit tests green. PR-2 (storage-cleanup cron + E2E) deferred.                                                                                            |
| 16  | Media library agency switcher + Add-media dialog + tree polish        | ✅     | FEAT-MEDIA-POLISH-2026-09-18 — interactive workspace-switcher popover on the agency page (preserves `q/kind/view/trash/folder/shared/sort/page` on every switch), `<MediaUploadDialog>` behind an "Add media" button (no more inline 250-line first-paint form), folder-tree sections + kebab row + CSS-var depth indent + independent scroll + Expand-all/Collapse-all + header search. UI/UX Pro Max discipline preserved (full-row click, kebab stopPropagation, hide-not-disable, badge counts, bilingual parity). Typecheck + 13 new unit tests green; full 3491-test suite green. Design memo: `docs/design/MEDIA_LIBRARY_POLISH_2026-09-18.md`.        |
| 17  | Delivery uploader: visible "From link" tab + canonical folder default | ✅     | FIX-DELIVERY-UPLOADER-2026-09-19 — Delivery tab uploader now uses `<MediaSourcePicker>` (device + link tabs visible), with the canonical `Posts / {Format} / {YYYY} / {MM}` folder resolved server-side via `ensurePlanningMediaFolderPathPublic` and forwarded as `defaultFolderId` so designers don't have to think about folder routing. New `defaultFolderId` + `onAssetReady` props on the picker, `defaultFolderId` prop on the upload form; picker stays backwards-compatible for the agency-level Add-media dialog. 5 new picker unit tests + 2 new delivery-section assertions; full 245 / 245 media + planning suite green. Lint + typecheck clean. |

See `docs/implementation/progress.md` for the live per-task checklist.

> **2026-09-09 navigation follow-up** — Trend Radar v1 is now discoverable
> through the capability-aware desktop and mobile shell: Trend Radar in
> workspace Understand, Trend settings for workspace managers, and Trend sources
> for agency admins. These links remain gated by the agency database master
> switch and the `trend_radar` capability, while provider configuration remains
> deployment-scoped.

> **2026-09-09 planning follow-up** — Monthly planning, Batch Add, Brand Profile,
> and Planning Packs are exposed through their intended workspace and agency
> surfaces. Monthly planning uses the agency database master switch plus the
> `monthly_planning_copilot` capability; provider configuration remains
> deployment-scoped and is not a product feature flag. The responsive and
> bilingual evidence is recorded in
> `docs/design/PLANNING_CANVAS_UI_UX_AUDIT_2026-09-09.md`.

**Release verdict (2026-08-24):** `READY FOR INDEPENDENT REVIEW` (shared across
`PRODUCTION_READINESS_TRACKER.md` and `docs/production-readiness/UAT_RELEASE.md`).
The independent reviewer (Task 13) flips the verdict to `READY` after the
30-step §23 journey and the owner checks in
`docs/production-readiness/EXTERNAL_SERVICES_UAT.md` are signed.

> Workflow contract — see `docs/testing/strategy.md` (Release gates). `ci.yml` is the **deploy-gate** (integration, audit, build, Docker smoke, SMTP-cert probe, workflow linters). `advisory-quality.yml` runs changed-line coverage and critical Chromium on every `main` push, then strict coverage and the full browser/visual matrix nightly and for release candidates. Format / lint / typecheck / full unit suite run locally in `.husky/pre-commit` and `.husky/pre-push`; critical E2E is advisory locally. `deploy.yml` fires on `workflow_run: CI success` and only deploys the exact `head_sha` (no `:latest`-only deploys).

## Activity log rendering

The workspace-wide feed (`/app/w/[slug]/activity`) and the
per-content-item timeline on the planning detail page both
read from the same `activity_event` table and render through
the **shared formatter + renderer**:

- **Pure formatter:** `lib/activity/format.ts` →
  `formatActivityEvent(event, context, t)` returns an
  `ActivityRenderSpec`. The function is a single
  `switch (event.kind)` covering every `activity_kind` enum
  value plus the `brand.<x>` dotted namespace.
- **Resolver:** `lib/activity/resolve.ts` →
  `buildActivityContext(workspaceId, events, locale)` batches
  ID → name lookups (users, channels, status enums) into one
  pass per workspace per page render.
- **Shared renderer:** `components/activity/activity-entry.tsx`
  - `<ActivityDiff />` consume the spec and emit the row. The
    same row shape renders on both surfaces.
- **Verb templates:** `messages/{en,ar}/activity.json` under
  `activity.verbs.<kind>`. `{target}`, `{before}`, `{after}`,
  `{metadata}`, `{count}` placeholders.

**Rule — adding a new `kind`:**

1. Add the new value to `activityKindEnum` (DDL migration).
2. Write the emitter call site with structured
   `beforeData` / `afterData` / `metadata`. **No raw UUID or
   raw enum in `summary`** — the renderer reads the structured
   payload.
3. Add one verb template under `activity.verbs.<kind>` in
   both catalogs.
4. (Only if the kind carries new ID-bearing fields) extend
   `buildActivityContext` to look them up.

**Never edit `<ActivityEntry />` to support a new kind.** The
contract is: a kind is rendered iff its verb template exists
and its structured payload is well-formed.

The kind list is exercised in
`tests/unit/planning/activity-timeline.test.tsx` ("renders a
verb for every known kind without leaking the raw enum").
Adding a kind without a verb template fails that test.

See `docs/architecture/activity-log.md` for the full pipeline,
diff shapes, and extension recipe.

## Conventions

- **Commits:** `<type>(<scope>): <description>`. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `upgrade`. Scopes: `db`, `auth`, `content`, `planning`, `workflow`, `discussions`, `deliveries`, `publishing`, `notifications`, `ai`, `infra`, `ci`, `deps`, `i18n`, `format-payload`.
- **Branches:** `main` is production. `feat/*` for features, `fix/*` for hotfixes, `chore/*` for chores. Squash-merge.
- **PRs:** must pass CI (`pnpm verify` + build + smoke e2e). Reference the goal number in the PR title.
- **ADRs:** material deviations from the master prompt go in `docs/decisions/`. The first one (`docs/decisions/0001-vps-port.md`) records the choice to self-host on the LaraTik VPS instead of Supabase + Vercel.
- **Merge on completion:** when a change is finished and `pnpm verify` is green AND the local pre-merge E2E checklist (`pnpm test:e2e:isolated` + `pnpm test:visual` on the release-candidate branch) is complete, commit it with a `<type>(<scope>): <description>` message and push to `main`. The deploy workflow fires on `workflow_run: CI success`, so the change is live on production the moment the deploy job finishes. No finished work sits in the local working tree or on a stale local branch; feature branches (`feat/*`, `fix/*`, `chore/*`) are temporary scratch space.

## Product UI/UX Engineering Rules

Every agent modifying user-facing UI in this repository — pages, components, layout, navigation, copy, color, motion, or interaction — MUST follow these rules. They are the durable UX contract that survives across PRs, branches, and goals. They are deliberately opinionated so future agents converge on a consistent product rather than re-deriving conventions per change.

### Planning UX contract

Planning keeps four production workspaces: Overview, Create, Publish, and
Activity. Create owns the brief, format-specific creative fields, production
notes, references, assets, and delivery versions. Publish owns canonical copy,
translations, channel overrides, destinations, schedule, previews, readiness,
approvals, and publishing. The compatibility hashes are part of the public UI
contract and must not be removed; `content`, `assets-versions`, and `delivery`
resolve to Create; `copy`, `preview`, `publishing`, and `messages` resolve to
Publish; and `workflow` resolves to Overview.

- Use the six active workflow stages everywhere: Planning, Content review,
  Creative production, Creative approval, Publishing setup, and Published.
- `blocked` and `cancelled` are conditions, not inferred stages. Blocked items
  belong in a separate Board grouping; cancelled items are not active Board
  work but remain available through List filters and direct links.
- `src/lib/planning/presentation.ts` is a projection of authoritative
  server/domain state. It may classify, explain, group, and route users, but
  must not reimplement authorization, readiness, approval materiality,
  publishing eligibility, or lifecycle transitions.
- Overview summarizes state and routes users. Workflow controls lifecycle
  state. Overview must not duplicate the full workflow controls.
- `Readiness` describes requirements and completeness; `Attention` describes
  operational risk. Do not combine them under a vague Health label.
- Required-field grouping and requiredness come from the shared format-field
  definitions. Do not repeat format-specific field rules in UI components.
- Audience Copy owns shared/channel-specific copy. Creative Brief must not
  duplicate caption, hashtags, CTA, first comment, description, or location.
- Current blockers, warnings, and future requirements must have distinct
  severity. Every blocker needs a deterministic resolver destination.
- List/Board use compact projections; Detail/Assets/Publish may use full
  projections. Shared semantics do not require identical data payloads.
- Material saves remain explicit and approval-impacting changes explain their
  consequence before commit where technically possible. Server responses stay
  authoritative for revision, readiness, permissions, and approvals.
- Do not add schema, public API, provider, or unrelated architecture changes
  to a Planning UX refactor without a separately scoped proposal.

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
- **Workflow stage** — current step in the six-stage Planning model (Planning, Content review, Creative production, Creative approval, Publishing setup, Published). Source: `src/lib/planning/presentation.ts`. Stage count is an inline summary only; the full stepper belongs in the detail view.
- **Approval state** — `pending` / `approved` / `changes_requested` / `rejected`. Source: `src/lib/deliveries/service.ts`. Visual: distinct from content status; never share a color with the corresponding content status unless intentional and documented in `docs/decisions/`.
- **Publishing state** — `not_started` / `pending` / `succeeded` / `failed` / `partially_failed`. Source: `src/lib/publishing`. Visual: success/warning/danger variants. Always paired with the channel name so the failure is actionable.
- **Readiness / attention** — readiness requirements and operational risk are separate concepts. Readiness comes from the authoritative publishing/readiness result; Attention comes from operational risk/overdue signals. Do not present either as a content status or collapse both into a generic Health label.
- **Ownership** — Owner, Designer, Reviewer. Three different responsibilities. Never collapse into a generic "assignee" — see `src/components/planning/overview-command-center.tsx` for the canonical role display.
- **Due / overdue** — always pair a planned date with its health state. Use the shared `DateBadge` primitive (if present) or the pattern in `src/components/planning/planning-list-grouped.tsx`. "Overdue" must be a color + an icon + a label, never color alone.

When a new visual treatment is needed twice, it is a candidate for extraction. When it is needed three times, extract it.

### D. Every screen must be responsive

Test at minimum: **375px (mobile)**, **768px (tablet portrait)**, **1024px (laptop)**, **1280px (desktop)**, **1440px+ (wide)**. The visual harness currently uses 360 / 768 / 1440 for non-planning surfaces and 375 / 768 / 1024 / 1440 for planning surfaces (73 scoped responsive baselines across 23 route surfaces, plus 39 exact-reference captures). The executable contract lives in `tests/e2e/visual-regression.spec.ts` and is pinned in `tests/unit/stitch-cases.test.ts`. Do not ship a screen that has not been verified at the relevant widths.

- Large desktop (≥1280px): persistent sidebar + main + optional inspector. Max content width 1440px (`max-w-[1440px]`) for planning/board; `max-w-7xl` (1280px) for forms.
- Standard laptop (1024–1279px): collapsed icon rail (72px), main, inspector drawer.
- Tablet (768–1023px): collapsed rail + collapsible inspector.
- Mobile (<768px): top app bar with workspace context (`MobileContextHeader`), bottom navigation, full-screen sheets for inspectors/dialogs. Never squeeze editor + preview + workflow into three tiny mobile columns.

Avoid fixed pixel widths in component CSS. Use Tailwind responsive prefixes (`md:`, `xl:`, `2xl:`) and the design tokens from `src/app/globals.css`. If a layout truly needs a fixed width, document the breakpoint in the component header.

### E. Avoid duplicate information

Do not show the same metadata repeatedly in the page header, tabs, cards, sidebar, and workflow rail unless repetition provides clear task context. The "what" appears once (e.g. content title in the header), the "who" appears once in the inspector, the "when" appears once. Cross-reference by anchor, not by repetition.

A link that crosses from one surface to another must land on a control that can actually resolve it, or it must not exist. A blocker that has no collectable control renders an explicit state (e.g. manual dispatch) — never a generic anchor that returns the operator to where they already were. There is deliberately **no fallback anchor**: an unmapped path renders no affordance, and `tests/unit/publishing/readiness-anchor-map.test.ts` enumerates the readiness service's own paths so a new field without an anchor fails the test. The map is `src/lib/publishing/blocker-targets.ts`.

### F. Make actions obvious

Every page and workflow state must answer "What can I do now?" The primary CTA is the visually dominant action (full-color button, top-right or in the inspector). Secondary actions are outline buttons. Tertiary actions are text links or menu items. **Never present five actions with identical hierarchy.**

The Next-Action card in the content detail (`OverviewCommandCenter` → `NextActionCard`) is the canonical source of "what to do now" for a content item. The primary action label is the same string in the workspace header (server-computed `nextActionLabel` in the page). The two must never disagree.

**One state, one action.** A screen shows exactly one primary action, and the level of that action must match the level of the screen: a package-level surface never offers a lifecycle advance. On the Publishing tab the command center's dominant CTA and the sticky bar are both gated on `workflowAtPublishingSetup`, so while the item is still at Planning the canonical next action stays "Submit for review" and the publish surface offers only package-level actions. Counting is by what _changed_, not by what exists: a channel that has **never been saved** is not dirty but has no persisted package either, so its primary action is still Save — collapsing it into "not dirty" would remove the only way to persist the draft, and offering "mark setup ready" would promise what the server cannot keep. That third state is why the rule needs three branches, not two.

A sticky action bar must not change height when its status line appears or disappears. `position: sticky` puts the control under the pointer as it shifts, so a `min-h` floor is required (`sm:min-h-[4.5rem]` in `publish-package-form.tsx`).

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

| Dimension             | Enum                                                                                                                                                                                 | Source                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Content status        | draft / content_review / changes_requested / approved_for_design / in_design / creative_review / approved / ready_to_publish / partially_published / published / blocked / cancelled | `ALL_STATUSES` in `src/lib/content/status.ts`                |
| Workflow stage        | Planning → Content review → Creative production → Creative approval → Publishing setup → Published (the user-facing projection)                                                      | `src/lib/planning/presentation.ts`                           |
| Approval state        | pending / approved / changes_requested / rejected (per delivery version)                                                                                                             | `src/lib/deliveries/service.ts`                              |
| Publishing state      | not_started / pending / succeeded / failed / partially_failed (per channel)                                                                                                          | `src/lib/publishing`                                         |
| Readiness / attention | Requirements/completeness and operational risk, kept separate from content status                                                                                                    | Authoritative readiness result plus operational risk signals |

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

## Changelog

### 2026-10-07 — Command Center observations collapse to one row per post

`social_post_observation` holds **one row per post per sync day** (the unique
index is channel + provider + post id + observation_date). That is the snapshot
history and is correct as designed — do not "fix" it by deleting rows. The bug
was in the read path, which returned those raw rows as if each were a distinct
post, so Top content ranked one post five times and every "Open source" link
was identical.

Two invariants to preserve:

- `querySocialPostObservations` returns **one row per post**, keeping the
  newest snapshot. Any new consumer of that table must not skip the collapse —
  ranking, averaging or paging over raw snapshots reintroduces the bug.
- The Overview page and `laratik_planner_get_command_center` read through the
  same `getCommandCenterSnapshot` service. Do not map those rows a second time;
  a page and a tool that map independently drift, and the bug hides.

`backfillMissingThumbnails` only ever selects `thumbnail_url IS NULL` rows, works
on distinct posts, is bounded, and never overwrites an existing image. If you
extend it, keep all four properties — an unbounded backfill turns a missing
thumbnail into a provider bill.

Reach it through `backfillWorkspaceThumbnails`, which resolves credentials the
same way the sync does (workspace → agency DEK → connection → access token).
Do not unwrap keys in a new script or route; that creates a second path to a
plaintext provider token. Operators trigger it through the
`laratik_planner_backfill_thumbnails` MCP tool, which defaults to `dry_run: true`.

### 2026-10-06 — Official brand marks, and post thumbnails + captions

Two related additions to the Command Center's content surfaces.

**Brand marks.** `components/workspace/brand-marks.tsx` owns the official
Instagram and Facebook marks; `PlatformIcon` references them directly, so every
call site picks them up. Instagram previously rendered a generic lucide
**Camera** icon. Keep the two rules that make this safe:

- Marks are `aria-hidden`. The account name beside them is the accessible name;
  a glyph must not announce itself separately. Never give a mark a tooltip.
- Marks carry brand colour and nothing else. `design-system.md` records this as
  the single exception to "no raw page-level colour"; do not let that colour
  bleed into a tile, a badge or any other part of the row. A platform with no
  mark keeps its Lucide glyph — do not hand-draw one elsewhere.

**Provider media.** `social_post_observation.thumbnail_url` and `.caption` are
new (migration `0070`). Both are nullable **by design**: rows written before the
migration have no thumbnail until their next sync, and not every provider
returns an image. `PostThumbnail` therefore treats the placeholder as a normal
state and also falls back to it on a failed load, because provider CDN links are
short-lived and 403 once expired. Never make a component assume `src` is
present.

**A reversed contract worth knowing.** `fetchMetaFacebookPageSnapshot`
previously stored metrics only, and a test asserted the post's `message` was
never persisted. There is no recorded reason for it — it arrived with the
foundation commit and is documented nowhere. Showing a post's title in Top
content needs the caption, so that contract is now reversed and the "bounded"
half (no wholesale copy of the feed payload into `sourceMetadata`) is still
tested. If storing post text turns out to matter for a data-minimisation or
legal reason, revert `caption` in the feed request and the observation mapping;
the thumbnail work is independent.

### 2026-10-05 — Command Center rebuilt to the reference screen; the best-time heatmap now shows data

The Workspace Overview Command Center was rebuilt to match the reference
StudioFlow screen, and the **Best time to post** panel was fixed — it had been
rendering an empty grid on every workspace.

**The bug, and why the fix is in the domain.** The grid drew six hardcoded band
rows (06/09/12/15/18/21) while `lib/social/command-center.ts` keyed slots by the
**exact** published hour. A post at 14:23 created a slot no row could render, so
the panel was blank even with full history, and `bestTime` was near-permanently
`null` because three posts had to share one exact hour on one weekday.

`toTimeBandHour()` now buckets in the domain, and `COMMAND_CENTER_TIME_BAND_HOURS`
is the single constant shared by the domain and the grid. **When a view's row set
and its data's key space can drift, define the row set in the domain and render
from it** — a component-side fix would have left the two definitions free to
diverge again. Pre-dawn hours fold into the first band rather than being dropped.

**What changed in the UI.**

- `Sparkline` (`components/workspace/sparkline.tsx`) — KPI trend glyph. Renders a
  flat baseline below two points rather than faking a trend; `aria-hidden`, because
  the card's own text carries the readable value.
- `BestTimeHeatmap` (`components/workspace/best-time-heatmap.tsx`) — the day × band
  grid. Intensity is relative to the strongest band, the best cell gets a ring as
  well as colour, and every cell carries its average and sample size in text.
- `command-center-panel.tsx` — one bordered panel with the window/tab bar in its
  header; `DataHealthCard`, `FollowerTrendCard`, `StrongestAccountsCard`,
  `BestTimeCard`; Top content as a ranked table. The old duplicate Data health
  panel was removed (it rendered twice).
- Observed content page size 10 → 6, to read as a preview rather than a catalogue.

**Invariants to preserve.**

- Status is never colour-only. The Data health counts were bare coloured numbers
  and now carry their status word plus an icon.
- A chart is never the only way to read a value: heatmap cells expose their number
  in text, and low-sample slots are flagged instead of presented as advice.
- The best-slot pill renders `21:00`, matching the heatmap row it points at.
- **There is exactly one sparkline implementation.**
  `components/workspace/sparkline.tsx` owns the geometry. Two callers use it with
  deliberately different policies expressed as props, NOT as two components:
  the Command Center KPI tile is decorative (`aria-hidden`, area fill, gaps
  collapse, flat baseline under two points) while `SocialSparkline` on the
  analytics page is self-describing (`ariaLabel`, `preserveGaps`, renders
  nothing under two points, `social-sparkline` testids). The two previously
  drifted into separate polyline implementations with different null handling —
  never add a second sparkline; add a prop.

### 2026-10-05 — Publish surface: one phase at a time, and the rail's duplicate cards removed

The Publish tab was carrying the same information twice and asking the operator
to reconcile it. `WorkflowRail` rendered **Blockers**, **Publishing
integrations**, and **Channel readiness** as compact cards; the channel setup
workspace rendered the same destination/blocker/integration facts inline. The
rail's copy was also the unreachable one (fixed in `def18671`). All four setup
phases were stacked open at once, producing one long unscannable column.

**What changed.**

- `PublishPhaseStepper` gained `activePhase` / `onPhaseChange` and is now a
  control, not an indicator. The four form regions toggle a `hidden` class
  against `activePhase` instead of unmounting, so drafts, scroll position, and
  focus survive a phase switch.
- `firstOpenPhase` opens a channel on its first blocking phase, defaulting to
  `content`, and deliberately **skips `destination`** — a selected channel
  already has a destination, so opening there is a read-only dead end.
- The stepper's blocker counts are scoped to the **active channel**, so a
  blocker on channel B no longer marks channel A's phases incomplete.
- `WorkflowRail` no longer takes `publishRail`; `page.tsx` no longer builds it.
  The `ReadinessIssue[]` prop, the `readinessAnchorForPath` deep links, and the
  tab-hash subscription they required are all deleted.
- Destination is now a real phase: `#publish-destination` confirms platform,
  account, and connection, shows the blocker count as a badge, and hosts
  `MetaPublishingReadinessCard`. The caption card's id moved to
  `#publish-content`.
- Approved delivery versions moved from the compliance card to the review card,
  next to the approval gate they feed.
- The action bar states the save state (`saved`/`saving`/`unsaved`/`error`) with
  `role="status"` and `data-save-state`. It reads the existing `error`,
  `pending`, `dirty`, `savedAt` state and adds no new bookkeeping.
- The preview is a sticky side panel at `xl`+, a `<details>` drawer below it.

**Two things worth keeping in mind when editing this surface.**

1. **`hidden`, not unmount.** The phase regions toggle a class precisely so that
   per-channel drafts and focus survive a phase switch. Swapping this for
   conditional rendering is a regression, not a cleanup.
2. **The channel tabs and the phase stepper are separate axes.** Switching
   channel re-runs `firstOpenPhase` for the incoming channel; switching phase
   does not touch `activeChannel`. Conflating them reintroduces the bug the
   previous entry documents.

Coverage: `tests/unit/publishing/publish-ia.test.tsx` asserts phase isolation
(`#publish-content` visible, the other two `hidden`, and a step swap).
`tests/e2e/publish-package.spec.ts` clicks the "Review & approval" stepper
link before touching the approval control, since that control is no longer in
the initial phase.

### 2026-10-04 — Publish surface: the compare-and-set could never match (saved every save)

Live regression from `c107e699`, caught by the advisory pre-push E2E subset and then
reproduced deterministically in isolation.

**The optimistic-concurrency guard broke every save.** The previous commit added
`eq(contentItemChannels.updatedAt, existingRow.updatedAt)` to the UPDATE's `WHERE` so a
concurrent writer would be caught rather than silently overwritten. It never matched:

```
content_item_channels.updated_at  timestamptz DEFAULT now()   → Postgres stores MICROSECONDS
value read back through a JS Date                              → truncated to MILLISECONDS
WHERE updated_at = '<ms-truncated value>'                       → never equals the stored row
```

So `written` was always empty, the new "lost race" branch threw `INVALID`, and the publish
form showed **"Check the platform-specific publish fields."** for a payload that was
perfectly valid. A 4-channel, multi-platform surface could not save anything at all.

**The fix is a row lock, not timestamp arithmetic.** Read, write, and the material-edit
record now happen inside one `db.transaction` with `SELECT … FOR UPDATE` on the channel
row, via `recordMaterialityEventInTx`. That serialises concurrent writers without
depending on how many digits a timestamp happens to carry, and it makes the single-channel
save atomic with its own materiality event — the same shape the batch path already used.
The client's `expectedUpdatedAt` is still checked, but only as a **user-facing staleness
signal** ("you loaded this before someone else saved"), not as the correctness guarantee.

**The batch path had the same latent defect** (`platform-payload-service.ts:417`) and was
masked because `publish-batch-save.test.ts` mocks the database, so the equality was never
exercised against a real `timestamptz`. It is fixed by the same reasoning and needs its own
check against a real row.

**Why the unit suite did not catch either bug:** every test mocks the db, so a predicate
that cannot match a real row is indistinguishable from one that can. This is a third
instance of the same lesson as the multi-channel save — _a mocked database cannot detect a
predicate that real data rejects._ Anything comparing a stored column for equality needs a
real-DB test (`tests/integration`) or it is unverified.

### 2026-10-04 — Publish surface: per-channel field errors

Found by a test-coverage audit after the browser gate, and live in production
since `3a8b4c99` until this commit.

**A batch validation error was painted on the wrong channel.** `fieldErrors` was a
flat `Record<fieldName, string>`, so `handleSaveAll`'s pre-flight loop left only the
**last** failing channel's errors in state, and they rendered inside whichever channel
happened to be active. With two Pinterest channels — A active and valid, B with an
empty board — Save all painted "Choose a Pinterest board." under **A's** board input
and pointed **A's** `aria-describedby` at **B's** error, while the status line said one
channel needed fixing. A correct message on an un-actionable control is worse than no
message, because the operator edits the one field that was already right.

Errors are now keyed by channel id, so each channel carries its own, and a server-side
`fieldPath` rejection additionally **switches the operator to the failing channel** — a
correct message on another channel's panel is invisible, which is the same defect in a
new place. Success clears only the channels that were actually saved, so saving one
channel no longer wipes another's errors.

The field error `<p>` also gained a `data-testid`; it had an `id` and `role="alert"` but
nothing addressable, which is part of why this went unnoticed.

`tests/unit/publishing/publish-field-errors-per-channel.test.tsx` reproduces the exact
two-Pinterest-channel scenario and asserts the error is absent from A and present on B.

### 2026-10-04 — Publish surface PR6: browser-gate findings (one real functional defect)

The browser gate was unblocked (disposable `TEST_DATABASE_URL` provisioned, Firefox and
WebKit installed) and immediately caught a defect the unit suite structurally could not.
Evidence in `docs/production-readiness/TEST_EVIDENCE.md`.

_There is no PR5 entry below because PR5 was the QA/parity leg, not a code change: it is
the gate this entry ran. Its results live in `docs/production-readiness/TEST_EVIDENCE.md`
and `docs/visual-parity/CURRENT_SYNC.md` rather than here._

- **fix(publishing): a single edited channel could not be saved on a multi-channel item.**
  PR4's one-action bar chose between "Save all" and "Save draft" on `channels.length > 1`,
  so on any item with two or more channels a **single** edited channel rendered
  "Save all changes (1)" and the per-channel Save disappeared entirely. The operator lost
  the ability to save one package, and a one-channel edit was presented as a batch. The
  count that decides this is how many channels _changed_, not how many exist: now
  `dirtyCount > 1`.
  **No unit test could have found this** — every `PublishPackageForm` component test
  fixtures a single channel, so `channels.length > 1` is never true. This is the concrete
  argument for the browser gate existing.

- **fix(publishing): the per-channel Save could target a channel with no loaded draft.**
  The button resolved its target through the dirty-channel lookup, and `handleSave` starts
  with `if (!draft) return` — a silent no-op: no request, no status, no error, and the
  action bar left showing an enabled-looking control. The active channel is now preferred
  whenever it is the one that needs saving, the dirty-channel lookup is only a fallback,
  and the handler is guarded with `drafts[target]` so a missing draft can never present
  itself as a working button.

- **fix(publishing): the sticky action bar changed height when its status line appeared.**
  `position: sticky; bottom: 0` plus a status line that appears on save and disappears on
  edit moved the buttons mid-interaction — the control was under the pointer as it shifted.
  `sm:min-h-[4.5rem]` gives the bar a stable floor.

- **test(e2e):** the save click now uses `noWaitAfter` — on success the state advances past
  "Save" and the re-render replaces the node, which Playwright otherwise waits on. The
  planner-permissions case now asserts the confirm-setup CTA is **absent** rather than
  disabled, which is a stronger statement of the same contract (one action, not two) and
  matches the lifecycle gate added in PR4.

**Not a defect, but worth knowing:** the harness runs `next dev`, so editing a source file
while a run is in flight triggers a Fast Refresh rebuild that can drop a server-action
request mid-flight and leave the client's promise pending. Two clean consecutive runs on
an unchanged tree confirm the flakiness is the dev server, not the application. Do not
edit `src/` while an e2e run is in progress.

### 2026-10-04 — Publish surface PR4: outcome workflow (phases, gate, one dominant action)

Fourth of five. Makes the outcome workflow's state machine explicit instead of
inferable, and stops two lifecycle-level CTAs competing on one screen.

- **fix(publishing): a newer readiness flag could hide a legacy item's publication
  history.** `#publish-outcomes` is now gated on `outcomesUnlocked` — setup readiness
  **or** any record of prior publication **or** a `partially_published` / `published`
  status — rather than on `publishingSetupReady` alone. Publication history is the one
  thing an operator can never recreate, so no later flag may hide it. The locked state
  says why it is locked instead of appearing as an empty collapsed section.

- **fix(publishing): two primary actions at different lifecycle levels.** The workspace's
  right rail publishes its own canonical next action, and while the item is still at
  Planning that is "Submit for review" — while the Publishing tab simultaneously offered
  "Mark setup ready". Both the command center's dominant CTA and the sticky bar are now
  gated on `workflowAtPublishingSetup` (`ready_to_publish` and later). Below that gate the
  panel still offers its package-level actions but never a lifecycle advance.

- **fix(publishing): the sticky bar had four competing controls in one line.** Now one
  state, one primary action: _Save_ (multi-channel dirty → Save all; otherwise per-channel),
  _Review blockers_ (a link, with the blocker count as its accessible description),
  _Record outcomes_ once setup is confirmed, or _Mark setup ready_ once the workflow has
  reached publishing setup. A third state was needed to make this correct: a channel that
  has **never been saved** is not dirty but also has no persisted package, so its primary
  action must be Save — collapsing it into "not dirty" would have removed the only way to
  persist the draft, and offering "mark setup ready" for it would be a promise the server
  cannot keep.

- **refactor(publishing): one canonical four-phase model.** The stepper's phases were
  `channels | copy | compliance | review`, a second proposal in the plan said three steps,
  and the Stitch screen said "Step 2 of 2". They are now `Package | Compliance |
Review & approval | Outcome`, and the strip is titled **"Publishing setup steps"** with
  a description that names it as per-channel preparation. It is explicitly not a second
  navigation model and explicitly not the workspace lifecycle — those are six stages and
  answer a different question ("what happens to this item next" vs "is this channel
  ready").

### 2026-10-04 — Publish surface PR3: information architecture (removals, not restyling)

Third of five. The Publishing tab had four surfaces describing the same
state and several blocks that restated what was already on screen. This PR deletes
and demotes; it does not add containers.

- **fix(publishing): the no-media preview was the single largest wasted area.** The empty
  state was rendered _inside_ the platform aspect-ratio box — `square: aspect-square`,
  `portrait: aspect-[4/5]`, `vertical: aspect-[9/16] max-h-[420px]`
  (`platform-preview.tsx`) — so a missing thumbnail cost several hundred pixels for two
  words of text, in a ~40%-width column. The ratio frame is now allocated only when media
  exists; the empty state is a compact block (icon, one sentence, `Review assets` →
  `#assets-versions`) with no nested `Card`. Shared with the Copy tab, so both benefit.

- **fix(publishing): three read-only `Field`s restated the page header.** Channel name, item
  title, and format were rendered as three labels plus three 44px controls while the
  channel name was already the active tab label and the title and format were already in
  `PlanningHeader`. Replaced by one meta row — `format · accountName · platform` plus the
  channel's blocker badge. `itemTitle` is no longer a prop of the form.

- **fix(publishing): `PreviewPane` echoed the two fields directly above it.** It rendered
  caption and hashtags with no media, no platform chrome, and no limit simulation. Deleted
  rather than replaced here; see the note below on why the real preview is PR4 work.

- **fix(publishing): the blocker list now lives in the command center.** The panel had four
  status surfaces — the command center, a full-width `PublishReadinessChecklist` above the
  editor, a red "Publishing requirements" block, and the red count pills on the channel
  tabs. The checklist is gone; the command center is the single status surface and hosts
  the aggregate issue list as a **collapsed** body, so the count appears once and the list
  only costs space when there is something to do. Its rows resolve through
  `blocker-targets`, so a manual-dispatch blocker renders an explicit state rather than a
  dead link — the behaviour the four `publish-package-form-locale` cases that asserted
  `publish-readiness-fix-*` covered is now asserted on the command center instead.

- **feat(publishing): the shared-copy → inherits → override chain is now visible.** The same
  text appeared in the Copy tab and again in the publish package with nothing saying which
  was which, so identical text read as a duplication bug. The form now states
  `Using shared audience copy` / `Channel override` / `Shared copy changed since this
channel last saved`, with a reset or refresh action — which also gives
  `copySourceRevision` a user-facing meaning.

- **feat(publishing):** the Meta readiness card collapses to a single line on healthy
  states, with the analytics / publishing / next-step prose behind a disclosure. It is only
  promoted to a warning treatment when the connection is genuinely blocking
  (`not_configured`). No new copy: the component keeps taking all strings through its
  `ReadinessCopy` prop.

**Deliberately deferred to PR4, not done:** `PlatformPreviewSwitcher` is not yet in the
publish form. It takes a `storage-object` media id, and the form has no storage context, so
wiring it properly needs a fourth prop plus a loader query — a guess would have produced a
preview that silently never resolves. PR4 adds it. PR3 leaves the preview absent in the
form rather than substituting a fake, and `publish-ia.test.tsx` asserts exactly that so the
gap stays visible instead of being papered over.

### 2026-10-04 — Publish surface PR2: atomic batch save, optimistic concurrency, approval ownership

Second of five PRs remodelling the Publishing tab. Changes the _save mechanics_; the
information architecture is unchanged until PR3.

- **fix(publishing): "Save all" was N material edits, not one.** The form looped the
  single-channel action client-side, so one click produced N sequential server round-trips,
  N `content_items.revision` increments and N reviewer-notification fan-outs — while a
  partial failure reported only "2 of 5 channels failed", with no way to identify which or
  to retry them. New `savePlatformPayloadsBatch` is **atomic**: every entry is validated
  first, and if any fails, **nothing** is written and each failing channel is reported
  with its own result. Otherwise one transaction writes all payloads, bumps the revision
  exactly once, and records one materiality event. The client-side loop is gone.
  Savepoints for partial persistence are deliberately not offered: half-saved publishing
  state is worse than a rejected batch, because the operator cannot tell which packages
  the notifications were about.

- **feat(publishing): optimistic concurrency on `content_item_channels.updated_at`.**
  Deliberately **not** `copySourceRevision` — that column is _provenance_ ("the content
  revision this channel last inherited shared audience copy from", `content.ts:163-165`)
  and is written as `materiality.revision` at save time, so the two diverge the moment
  anyone saves without touching shared copy. The token is enforced on **both** the single
  and the batch path, as a compare-and-set inside the transaction's `WHERE`, so a
  collaborator's commit between read and write is caught rather than silently overwritten.
  `ChannelPayloadState` now surfaces `updatedAt`. The form keeps every local draft on a
  conflict and says so — it never discards the operator's work to resolve one.

- **fix(publishing): the client was clearing an approval the server never revoked.**
  `updateDraft` reset `payload.approval` to unapproved on every keystroke, but
  `savePlatformPayload` re-reads the stored approval and spreads it **last**, discarding
  whatever the client sent (`platform-payload-service.ts:129-130,147-150`). So the form
  displayed "not approved" for a package the server still considered approved, and the
  discrepancy silently healed on the next render. The client-side reset is deleted, and
  with it the form's use of `approvalResetHint` — which promised a reset that never
  happened. The **catalog key itself is still present** in both `en` and `ar`
  `contentDetail.json` and now has no reader, so the string still ships unused; removing
  it is a catalog cleanup, not part of this change. Only `setFinalCopyApprovalAction`
  changes approval now.

- **fix(publishing): switching channel tabs silently carried an unsaved draft.** The
  unload and navigation guards only intercept leaving the page, so the one transition they
  cannot cover had no prompt and no autosave to catch it. Channel switching now confirms
  first. Autosave is still the wrong answer here: every save is a material edit that
  increments the revision and fans out approval activity.

- **refactor(publishing):** `recordMaterialityEvent` now delegates to a new
  `recordMaterialityEventInTx(tx, input)` so the batch can share one transaction. The
  member/item pre-flight stays **outside** the transaction — a missing item or a
  non-member must not take one at all, which
  `publishing-materiality.test.ts` asserts via `transactionCalls`. A new reason code
  `platform_payload.save_batch` distinguishes the batch audit row.

**Documented, not a defect:** the per-channel `invalidPlatformPayload` branch inside
`savePlatformPayloadsBatch` is defence in depth and unreachable with today's callers —
the batch input schema already validates each payload through `PlatformPayloadSchema`
before the loop. A schema-invalid payload surfaces as a `ZodError` with zero writes, and
it is the _action_ layer that reports it per channel with a `fieldPath`. Asserted as the
real observable behaviour rather than as a weakened expectation.

### 2026-10-04 — Publish surface PR1: correctness (platform fields, blocker→control map, write authority)

First of five PRs remodelling the Publishing tab. No IA change in this one — the page
looks the same, but it stops lying and stops failing on Pinterest/YouTube. Full plan:
5 PRs, each committed to `main` on its own gate.

- **fix(publishing): a YouTube or Pinterest package could not be saved at all.**
  `YouTubePayloadSchema.title` and `PinterestPayloadSchema.pinTitle` / `.boardId` are
  `z.string().min(1)` with no default, `defaultPayloadFor` seeded them to `""`, and the
  form had no input for any of them. Both platforms were selectable in `/channels`.
  `savePlatformPayload` calls `PlatformPayloadSchema.parse(...)`, which threw a
  `ZodError` — **not** a `PlatformPayloadError` — so `publish/actions.ts` collapsed it
  into a bare `saveFailed` with no field to fix. New
  `lib/publishing/platform-required-fields.ts` is the single source of truth for these
  controls (YouTube title + visibility, Pinterest pin title + board, TikTok audience);
  the form renders a **Platform settings** card from it, and a client pre-flight mirrors
  the `min(1)` constraint so the message is field-level before a request is sent. The
  action now also returns `fieldPath` from both the pre-flight `safeParse` and a
  server-side `ZodError`, satisfying "never a bare save failure".

- **fix(publishing): a readiness blocker could link to a page with no control to edit.**
  `readinessAnchorForPath` special-cased only delivery and approval paths and returned a
  bare `#publishing` for everything else, so `missing_title`, `missing_pin_title`,
  `missing_board`, `missing_privacy`, `missing_audio_rights`, `transcript_not_reviewed`,
  `missing_cover`, `missing_thumbnail` and `missing_music_rights` all produced a
  "Resolve in Publish" link that landed the operator exactly where they started. New
  `lib/publishing/blocker-targets.ts` maps **all 18** emittable paths to one of three
  states — editable here (an in-page anchor), editable elsewhere (Assets / Workflow), or
  an explicit `manual` state with **no fix link** for `payload.destinationProfile`
  (facebook / linkedin / ig_reel / other, which resolves at channel-link time and has no
  control on this page). There is deliberately no fallback: an unmapped path returns
  `undefined` and renders no affordance.
  `tests/unit/publishing/readiness-anchor-map.test.ts` reads the readiness service's own
  source to enumerate the paths it can emit, so adding a `REQUIRED_FIELDS` entry
  without an anchor fails the test rather than shipping a dead-end link.

- **fix(publishing): the form showed a Save the server would always reject.**
  `savePlatformPayload` authorises `workspace_manager` and `content_planner` only, while
  the page's `canEdit` also covers an assigned designer — so a designer got
  `FORBIDDEN — "Only workspace managers and content planners can save a publish package."`
  Conversely, a viewer with neither flag saw a **fully editable** form whose Save was
  permanently disabled, and typing still marked the channel dirty. The form's single
  write path now takes a single write-authority flag, `canSavePackage` (`canEdit` is
  removed from its props), and renders a **read-only definition list** when it is false —
  a definition list, not disabled inputs, because a disabled input looks editable until
  the operator types into it. The two independent gates that must stay independent:
  excluding a channel from publication is a publisher/manager lifecycle decision, so it
  sits **outside** the `canSavePackage` gate.

- **fix(publishing): the per-platform rights confirmations were unreachable.**
  `audioRightsConfirmed` (Reel), `transcriptReviewed` (Reel) and `musicRightsConfirmed`
  (TikTok) are `false`-defaulted booleans, so an unedited package always fails the
  matching readiness rule, and the form exposed no control for any of them. Rendered
  from the same table, each with its own anchor so a blocker deep-links to the box.

- **fix(publishing): `<details open={defaultOpen}>` re-drove the operator's choice.**
  `<details>` has no `defaultOpen` attribute — only `open` — so React reset the
  attribute on every render and any `router.refresh()` after a server action reverted a
  manual collapse. The disclosure is now uncontrolled state initialised once, split into
  `planning-section-disclosure.tsx` so the parent stays a Server Component. Invariant:
  the server value decides the state at mount; after that the operator's toggle wins.

- **fix(publishing):** `readiness-presentation.ts` gained titles for the per-platform
  blocker codes, which previously reached the Overview panel through `humanizeCode` as
  "Missing Title" / "Missing Board" — reading as a UI bug rather than a field to fill.

**Known divergence, not in scope:** the Stitch screen for this surface shows a "Step 2 of
2" proof capture accepting a PNG/JPG/PDF upload and a "Mark as delayed" state. The code
accepts a URL only, and `publication_status` is
`pending|published|failed|skipped`. Recorded in `docs/visual-parity/CURRENT_SYNC.md`.

### 2026-09-27 — Pre-deploy review of the observability / publications / rename / assetless batch

Reviewed the five unpushed commits on `main` (`ff5ef3b1` observability,
`80df5e6f` ephemeral publications, `35224b8a` workspace rename, `daa9b17d`
activity jsonb, `4eadc7f1` assetless deliveries) before they reached
production. Three high-severity defects and three smaller ones were found and
fixed. Two were secret-leak paths inside the module introduced specifically to
prevent secret leakage, and one silently granted a privilege the operator never
selected.

- **fix(security) — a free-text log-context string bypassed the scrubber.**
  `sanitizeLogContext` returned every non-object value verbatim, so only `Error`
  instances ever reached `serializeError`. A credential arriving under an
  innocuous key (`detail`, `dsn`, `url`, `reason`) was written to Docker **and**
  to `app_error_event.context.logs` byte-identical. This contradicted
  `redact.ts`'s own axis-2 contract ("a log context string"). Strings now route
  through `scrubText`; numbers, booleans, `null` and `undefined` still pass
  through untouched, and the key-name denylist is unchanged.

- **fix(security) — `redact.ts` had no rule for `scheme://user:pass@host`.**
  Every driver uses that shape, and `DATABASE_URL` — the highest-value secret in
  this stack, and a named hard-rule secret — matched no key name in the rule
  table, carried no query parameter, and is far shorter than the 64-character
  entropy floor. `DATABASE_URL=postgres://planner:hunter2@db:5432/planner` came
  through completely unsanitized. New rule 5 replaces **only** the password half;
  scheme, user, host, port and database are the diagnostic part. It requires
  userinfo (`:` and `@` together), so `https://example.com:8080/health` and
  stack frames are untouched. Downstream rules renumbered 6–10.

- **fix(authz) — diagnostics token scopes were silently downgraded to
  `content:read`.** `issueMcpTokenAction` filtered the submitted scopes against a
  hardcoded `content:read | content:write` pair instead of consulting
  `MCP_TOKEN_SCOPES`, which is documented as the single source of truth. Every
  `platform:diagnostics:*` checkbox the Account UI already renders was discarded,
  the filter came back empty, and the fallback issued a **content** token. So the
  five diagnostics MCP tools were unreachable from the product's own UI, and an
  operator who ticked only the diagnostics boxes received a cross-domain content
  grant they had never selected — in a module that goes out of its way to
  document the two domains as strictly non-implying. The filter now derives from
  `MCP_TOKEN_SCOPES`, so a future scope cannot be added to the list without also
  being accepted here, and an unrecognised value still falls through as invalid.

- **fix(authz) — `submitDelivery` validated the media floor before authorizing.**
  The floor and its assetless-description check ran ahead of `requirePolicy`, so a
  caller with no role in the workspace could still distinguish "this item
  requires media" from "this item is assetless" from the error text.
  Authorization now precedes all business validation, which is also the ordering
  the sibling delivery action already used.

- **fix(i18n) — the "this post ships no creative" toggle returned English prose.**
  `setMediaRequiredAction` returned a hardcoded English string and, on the catch
  path, the raw `error.message` — so an Arabic user read an English error and
  whatever the driver said (constraint names, SQL fragments) reached the surface.
  The bilingual contract requires server actions to return _stable codes_ and the
  client boundary to translate them, which the sibling `MetaPublication` action
  twenty lines below already did. The action now returns
  `SetMediaRequiredErrorCode` (`invalidRequest` / `forbidden` / `updateFailed`),
  the real reason goes to the log, and `DeliverySection` renders
  `contentDetail.deliveries.noMediaError.*` with full EN/AR parity. `forbidden`
  maps on the typed `PermissionDeniedError`; the service's "not found" and
  status-guard paths throw plain `Error`, and guessing between them by message
  would show the user a distinction the code cannot actually make, so they share
  `updateFailed`.

- **fix(tooling) — `fingerprint.ts` was committed as a binary blob.** A literal
  NUL byte in `HASH_SEPARATOR` made `file` report `data` and `git show --stat`
  report `Bin`, so the fingerprinting core for the entire error mirror never
  appeared in a diff and was opaque to `git blame`. Replaced with `"\u0000"` —
  identical runtime behaviour, reviewable text from now on.

- **fix(ci) — `tests/integration/error-diagnostics.test.ts` failed 6 of 22
  against a real Postgres.** This was the deploy blocker nobody would have seen
  locally, because the file has never been on `origin` and so has never run in
  CI. Confirmed pre-existing by re-running it at `HEAD~1`. Four distinct causes,
  all test-isolation defects rather than product bugs — the product behaviour
  under test was correct in every case:

  1. The burst-cap, ring-buffer, and aggregation blocks call `captureAppError`
     **directly** (they must control `APP_ERROR_BURST_LIMIT`, the request
     scope, and the loop), so they bypassed the `capture()` helper that owns
     cleanup. Their groups and event rows were never registered, survived
     `beforeEach`, and inflated every later table-wide count. A new
     `rememberEventsFor(route)` helper registers the rows a direct call wrote,
     scoped to a route so a test never deletes another test's rows.
  2. The retention tests aged rows with an **unscoped** `update app_error_event
set created_at = …` / `update app_error_group set last_seen_at = …`. That
     ages out every row in the table, including anything a prior test leaked, so
     `groupsDeleted` was 1 instead of 0 for a reason that had nothing to do with
     the retention rule. Both are now scoped with `where route = …`.
  3. Single-row reads used a bare `select().limit(1)`, which returns whichever
     row Postgres hands back first. Nine assertions about "the row I just wrote"
     were really assertions about row order. Replaced with `latestEvent(route)`
     / `latestGroup(route)`, ordered by `createdAt` / `lastSeenAt desc`.
  4. **The aggregation assertion was unsatisfiable.** It captured
     `row a` / `row b` / `row c` — three messages differing by a _letter_ — and
     then asserted `occurrenceCount === 3`. `normalizeErrorMessage` collapses
     numbers, not letters, so those are three distinct fingerprints and three
     groups of one. The fixtures now vary a bare number (`row 1042 / 2077 /
3391`), which is the case grouping actually exists to handle: the same bug
     from three row ids must land on one fingerprint. The old assertion only
     ever "passed" or "failed" by accident, depending on which row came back.

- **fix(ci) — four Markdown files failed `prettier --check`.** `AGENTS.md`,
  `docs/decisions/0016-ephemeral-publication-expiry.md`,
  `docs/architecture/data-model.md`, and
  `docs/production-readiness/EXTERNAL_SERVICES_UAT.md` carried hand-edited
  `*italic*` and unaligned table columns. This is a hard deploy blocker: the
  Deploy workflow fires on `workflow_run: CI success`, and CI's first step is
  `format check`, so these four files would have taken the whole pipeline red.

- **fix(a11y) — the error mirror's two filter `<select>`s had no focus ring.**
  Every other control in the codebase uses `focus-visible:ring-focus-ring`
  (145 files); these two were the outliers, against AGENTS.md §I.

- **Repo hygiene.** `fix/planning-detail-500-activity-jsonb` and
  `feat/optional-media-landing` were deleted. Both were fully superseded — the
  first was a strict subset of `daa9b17d` / `35224b8a`, the second pointed at
  the same SHA as `main` — and the single worktree is now `main`.

- **Known follow-up (not deploy-blocking).** The Drizzle snapshot chain in
  `src/lib/db/migrations/meta/` still ends at `0053_snapshot.json`; `0052`,
  `0054`, and `0055` have no snapshot, and `0047` / `0048` were already missing
  before this batch. The migrator (`src/lib/db/migrate.ts`) and the migration
  drill read the journal and the `.sql` files only, so **neither the deploy nor
  `pnpm migration-drill` is affected**. The hazard is the _next_
  `pnpm db:generate`, which diffs the live schema against the stale `0053`
  snapshot and will emit duplicate `CREATE TABLE` / `ADD COLUMN` statements.
  Backfilling the chain needs a live database and a real `drizzle-kit generate`
  pass, which would also mint a `0056`; it is deliberately left as a separate
  scoped task rather than attempted blind.

- **Verified.** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and the full
  unit suite (428 files / 4013 tests) are green. Each fix is locked by a test
  that was confirmed to **fail** against the pre-fix code first: 10 failures for
  the three security/authorization fixes, 1 for the authorization ordering.

### 2026-09-27 — Ephemeral publications: Stories without a permanent link

**Gap.** `publication_record` carried a hard `CHECK`
(`publication_published_needs_url_time_publisher`) requiring
`published_url IS NOT NULL` whenever `status = 'published'`. An Instagram Story
is live for 24 hours and has no durable public link, so it could never satisfy
that invariant. Stories were not merely hard to link — they were _unlinkable_:
`persistLinkedCandidate` wrote `status = 'published'` with a null permalink and
the whole `db.transaction` rolled back, and `recordPublication` independently
threw `published requires a publishedUrl`. Nothing in the product could record a
Story as published. Behind that, Stories were also mislabelled: Meta reports a
Story with `media_type` IMAGE/VIDEO and carries the real type in
`media_product_type`, which the provider already requested and `mediaTypeValue()`
discarded — so every Story rendered as "Image" or "Video".

- **feat(db):** `publication_record.expires_at` (migration
  `0053_ephemeral_publication_expiry`). The invariant is _widened_, not removed:
  a published row still needs `actual_published_at` + `publisher_id`, and needs a
  URL only when `expires_at IS NULL`. No backfill — every existing published row
  already has a URL. DROP/ADD live in one `DO` block so the swap is atomic even
  under `migrate-concurrent.ts`, which bypasses the transaction. Deliberately did
  NOT tighten `publication_pending_clears_published_fields`: a scheduled Story is
  legitimately `pending` while carrying a notional window, so the service only
  writes `expires_at` on the transition into `published`.

- **fix(social):** `STORY` branch in `mediaTypeValue()` + `expiresAt` on
  `MetaPublicationCandidate`, derived as `published_at + 24h`
  (`META_STORY_TTL_MS`) with a `?? now` fallback so a linkless Story always
  satisfies the relaxed `CHECK`. `src/lib/social/providers/meta.ts` is unchanged —
  it already requested `media_product_type` on both the list and by-id paths.

- **feat(social):** Meta-free `expireEphemeralMetaPublications` pass in
  `reconcileMetaPublicationLinks` degrades an expired Story's _external_ status to
  `unavailable` and writes a `meta_expired` activity event. It never touches the
  Planner `status`: the content was published, the artifact is gone by design.
  Idempotent (only matches rows still at `externalStatus = 'published'`) and it
  issues no provider call, so it cannot fail on a Meta outage. `expires_at` is
  written on _every_ link/refresh/reconcile — including as `null` — because
  `publication_record_channel_unique` means re-linking mutates the same row.

- **feat(publishing):** `RecordPublicationSchema` gains `expiresAt`; the
  unconditional throw becomes "published requires a publishedUrl or expiresAt".

- **feat(ui):** link dialog labels Stories and explains a missing link rather than
  rendering an absent control. Channel card has three states — live link + expiry
  hint, expired (no link, `Clock` icon), or published with no link by nature — and
  never renders a link already known to be dead, even when the permalink is still
  stored per ADR 0015. Markup is unchanged when `expires_at` is null. The manual
  outcome form reveals an optional "Link expires at" field once the URL is blank.
  Icons are `aria-hidden` beside visible text, so status is never colour alone.

- **test:** Story detection + expiry window pinned in
  `social-meta-publications.test.ts`; snapshot shape in
  `meta-publication-service.test.ts`; url-less published accepted and expiry
  cleared on non-published outcomes in `publishing-service.test.ts`; three-state
  card coverage in both locales; dialog Story label / no-anchor cases; and four
  `CHECK` cases against real Postgres proving the relaxation accepts
  url-less+expiry while still rejecting no-url+no-expiry, no-publisher, and
  no-publish-time. en/ar parity holds at 895 keys each.

- **docs:** ADR 0016, a Stories section in `docs/operations/meta-publication-linking.md`,
  `expires_at` in `docs/architecture/data-model.md`, and a Story row in
  `EXTERNAL_SERVICES_UAT.md`.

- **Known limits:** the 24h Story window is hardcoded (Meta exposes no expiry
  field); and Stories arriving via `/{ig-user-id}/media` is an _observed_
  behaviour, not a documented guarantee — Meta documents a separate `/stories`
  edge. The labelling ships either way; only a Stories-disappeared regression
  would justify adding that fetch path, and the UAT row is what catches it.

### 2026-09-27 — Workspace rename (display name) from Settings → Lifecycle

**Gap.** `workspace.name` was write-once. It was set by the seed route
and had no editing surface anywhere in the app — renaming a workspace
required a direct SQL update against production. This adds the first
write path for that column.

- **`lib/workspaces/rename-command.ts`** is the single definition of a
  valid workspace name. It normalises (trim, then collapse internal
  whitespace runs) **before** validating, so the stored value is the
  value that was length-checked — a name cannot pass the 80-char bound
  by padding with spaces that collapse away afterwards.

- **`lib/workspaces/rename-service.ts`** — `renameWorkspace(actor, cmd)`
  follows the shape of `updateWorkspaceSettings`:
  `requirePolicy(hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]), "rename_workspace")`,
  then a transaction that locks the workspace row `FOR UPDATE` before
  reading the current name. Every real rename writes a
  `workspace_rename` row to `security_audit_event` with the
  `{ from, to }` pair. The name appears in app chrome, in the bulk-reset
  typed confirmation, and in exported reports, so the change is
  audit-relevant even though the value is not sensitive.

  A rename that changes nothing is a **no-op** — no `UPDATE`, no audit
  row. `changed: false` lets the UI say "that is already the name"
  instead of writing a duplicate event on every double-click.

- **The slug is deliberately immutable.** `workspace.slug` is the URL
  identity (`/app/w/[slug]/…`) _and_ the key of the anti-IDOR lookup in
  `lib/workspaces/context.ts`. Changing it would invalidate every
  bookmark, notification deep link, and browser-history entry, and
  keeping the old URL resolving needs a slug-redirect table the current
  lookup has no support for. The settings card renders the slug
  read-only with an explicit line that the URL does not follow the
  rename. The reasoning is in `rename-command.ts` so the next person to
  add a slug field meets it before inventing a field. Changing the URL
  later is a migration, not a form field.

- **Action returns error codes, not sentences.** `renameWorkspaceAction`
  returns `unauthorized` / `not_found` / `forbidden` / `invalid_name` /
  `save_failed`, resolved to copy on the server page — same pattern as
  `MetaPublishingActionState`, so the AR catalog actually reaches the
  AR user instead of an English string leaking out of the action module.

- **Revalidation is `/app` layout-wide, not the settings path.** The
  name is app-shell chrome: sidebar switcher, `PageHeader` eyebrow,
  mobile context header, task / media / bulk-reset surfaces.

- **No migration.** Existing column, plus the free-text
  `security_audit_event.action`. Nothing in `src/lib/db/migrations/`
  changed, so no migration-drill evidence applies.

- **React note.** `WorkspaceNameForm` reconciles the controlled input
  with the server-normalised value using the render-phase
  "adjust state when a prop changes" pattern (guarded by `syncedName`),
  **not** `useEffect` — `react-hooks/set-state-in-effect` rejects the
  effect form, and the render-phase form also avoids a frame with a
  stale draft.

Tests: `tests/unit/workspaces-rename.test.ts`,
`tests/integration/workspace-rename.test.ts` (audit row lands; client
reviewer and cross-agency manager both denied; slug + old URL survive),
`tests/unit/workspace-settings/workspace-name-form.test.tsx`.

### 2026-09-27 — Planning-detail 500: bare scalars in `activity_event` jsonb (fix/planning-detail-500)

**Symptom.** `/app/w/just-halal/planning/c80a552a-…` (and any content item with a material-edit audit row) failed to open with "We hit an error loading this content item". Production logs:

```
TypeError: Cannot use 'in' operator to search for 'status' in 2026-09-26T21:00:00.000Z
    at <unknown> (.next/server/app/(app)/app/w/[slug]/planning/[id]/page.js)
    at Array.map
    digest: 288870229
```

**Scope found in production:** 18 malformed rows across **12 of 83** content items — i.e. the detail route and the workspace activity feed (`/app/w/[slug]/activity`) were broken for 14% of items.

- **Root cause — the writer.** `recordMaterialityEvent` (`src/lib/publishing/materiality.ts`) is the single funnel for material mutations. Its schema types `beforeValue` / `afterValue` as `z.unknown()`, and callers legitimately pass **scalars**: `inlineUpdateBriefAction` / `inlineUpdateTitleAction` pass the raw text, `inlineUpdateDateAction` passes an ISO string, `platform-payload-service` passes the literal `"(payload)"`. The service wrote those straight into `activity_event.before_data` / `after_data`, coercing only `null`, behind an `as never` cast that silenced the Drizzle type check. `jsonb` accepts any JSON value, so the bad shape persisted silently. Every other writer in the repo (`content/service.ts`, `publishing/service.ts`, `deliveries/service.ts`, `social/meta-publication-service.ts`, `planning/*`) writes an object literal — this funnel was the sole offender.

- **Root cause — the reader.** `activity/format.ts` did `const before = event.beforeData ?? {}` then `"status" in before`. `??` does **not** help: a string is not nullish, so it reached the `in` operator, which throws on primitives. The blast radius came from `buildVerb` computing `beforeLabel` / `afterLabel` **unconditionally for every event** to populate template params — and the `update` verb template (`"updated {target}"`) never even interpolates them. A value that was computed, discarded, and rendered nowhere was enough to 500 the page.

- **fix(writer): `toAuditData(resource, value)`** normalises every before/after value at the funnel into the JSON object the columns are documented to hold. Objects pass through untouched (so `{ changedKeys }` from `content/service.ts` keeps its shape), `null`/`undefined` → `{}` (the columns are `NOT NULL`), `Date` → ISO string, and scalars are wrapped under a key the formatter can actually render (`schedule` → `plannedPublishAt`, the long-form text resources → `brief`, everything else → `value`). The `as never` cast is gone. The untouched value is still preserved in `metadata.before` / `metadata.after`, so no audit fidelity is lost.

- **fix(reader): shared `asRecord()` in `lib/activity/lookups.ts`.** All reads of the `jsonb` payload columns in `format.ts` (`beforeLabel`, `afterLabel`, `buildDiff`, `buildMetadataLabel`, `mergedFields`, `readCount`, `templateForKind`) and in `resolve.ts` (`collectChannelIds`, `collectUserIds`) now go through it. It lives in `lookups.ts` rather than `format.ts` because both the server resolver and the client formatter need it, and `lookups.ts` is the module `ca37cd3e` created for exactly that reason. The reader fix alone unbreaks the already-persisted rows; the writer fix alone would not have.

- **fix(types): `RawActivityEvent.beforeData` / `afterData` / `metadata` are now `unknown`.** They are `jsonb`; the old `Record<string, unknown> | null` was a contract the runtime did not honour, and that lie is what let the bug through review. `ActivityEventView` in `activity-timeline.tsx` follows. This is what makes the normalisation mandatory rather than optional for the next writer.

- **fix(schema): migration `0052_activity_event_jsonb_object_guard.sql`.** (1) Backfills the historical rows from `metadata.before` / `metadata.after` + `metadata.resource`, so the audit data is _readable_ again, not merely non-crashing — `schedule` rows become `{ plannedPublishAt }` and render a real date chip instead of vanishing. (2) Installs a `BEFORE INSERT OR UPDATE` trigger that **coerces** any non-object into the resource-keyed object shape, mirroring `toAuditData`. Records the pre-migration row/item counts in `migration_evidence_0052`. Idempotent.

  A **coercing trigger, deliberately not a `CHECK` constraint**: `scripts/deploy.sh` runs migrations (line 70) _before_ recreating the app (line 74) and its rollback path (line 83) restores the previous _image_ without touching the schema. A validated `CHECK (jsonb_typeof(before_data) = 'object')` would therefore bind against code that still writes scalars — every date / brief / title / payload edit during the migration window, or after a failed deploy rolled back to the buggy image, would 500 on a constraint violation. Trading a page-level 500 for write-level 500s is not a fix. The trigger gives the same invariant (the columns only ever hold objects) while an older writer degrades gracefully and its row still saves, so schema and code version stay independent. Verified on a scratch database against the real Postgres 16: backfill values asserted, an old-code scalar `INSERT` accepted and coerced, the `UPDATE` path coerced, re-run a no-op.

- **test:** 34 cases in `tests/unit/activity/format.test.ts` (every scalar shape × every kind that reads before/after, plus degradation-not-throw and "a real object still renders unchanged") and 32 in `tests/unit/publishing-materiality.test.ts` (the `toAuditData` contract + a persisted-row assertion that no writer path can emit a non-object). Both suites were verified to **fail** against the pre-fix code (11 failures) before being accepted.

**Lesson.** `jsonb` has no shape. Two independent halves had to be wrong for this to reach production: a writer that stored a scalar where a `Record` was declared (hidden by `as never`), and a reader that used `?? {}` as if it validated the type. `??` defends against `null` and `undefined` only — never against a wrong _type_. Guard reads of untyped `jsonb` at the boundary, and type the boundary `unknown` so the compiler enforces it.

### 2026-09-26 — Unified calendar card (feat/unified-calendar-card)

DRY + accessibility fix across the two calendar surfaces. The per-workspace `/app/w/[slug]/calendar` and the agency-wide `/app/calendar` previously rendered the same event with two different components: the workspace calendar used `CalendarEventCard` (status badge + left-border colour accent + format chip) while the global calendar inlined its own `EventCard` with status as plain text. Admins using the global overview could not spot blocked / in-review / done items at a glance — exactly the quick-overview use case the surface is meant to serve.

- **feat(ui): unify `CalendarEventCard` — one component, two surfaces.** New `kind: "plan" | "task"` and `variant: "compact" | "default"` props let the same component render the tight workspace day-cell chip (`compact` + `plan`) and the agency-overview card (`default` + plan or task). The workspace calendar keeps its current rendering via the defaults; the global calendar now consumes the same component with `variant="default"` and gets the status badge + left-border accent for free. (`src/components/workspace/calendar-event-card.tsx`).

- **feat(ui): agency-overview calendar gains status + priority colour cues (admin quick overview).** Status badge maps plan + task statuses to the existing `Badge` variant set (`success` / `warning` / `danger` / `info` / `default`); the same colour drives the left-border accent so the day cell carries the cue even when the badge text is truncated. Tasks additionally render the priority as a coloured secondary line (urgent → danger, high → warning, low → info, normal → default) so admins can scan a dense month grid for blockers without reading every card. (`src/app/(app)/app/calendar/page.tsx`).

- **feat(lib): `taskBadgeVariant(status)` + `priorityBadgeVariant(priority)` helpers.** Single source of truth for the task-side colour mapping; the existing `TaskStatusBadge` continues to use its inline classes (no visual regression on `/app/tasks`) but the calendar surfaces now use the variant-aware path so the swatches stay in lock-step with content statuses. (`src/lib/tasks/status-badge.ts`).

- **test: 6 new cases on `CalendarEventCard`** for task kind (success/danger swatches, priority secondary line), default variant (kind label + workspace + assignee metadata), noWorkspace fallback, and plan-without-assignee. **11 new cases on `taskBadgeVariant` / `priorityBadgeVariant`** pinning every enum value to its swatch so a future status/priority addition can't silently desync. All 30 cases pass; tsc clean.

- **Companion**: `chore/ui-ux-pass3` (round 3, 2026-09-25) — scroll-spy jitter, member-list responsive collapse, Mail icon for pending invites, agency-settings hover treatment, sr-only duplication removal, `ApplicationInfoCard` label column widening. Both rounds share the same design-system contract (44px touch targets, focus rings, semantic color tokens, bilingual catalog parity, status never colour alone).

### 2026-09-25 — UI/UX round 2 (chore/ui-ux-pass2)

Round-2 of the `/ui-ux-pro-max` polish pass. Built on the round-1 sidebar rebuild + mobile `My Work` route restore + trend-radar glyph swap.

- **feat(ui): `SettingsSidebar` — sticky left rail (lg+) / horizontal chip strip (mobile) on the workspace Settings overview.** Mirrors the same scroll-spy contract as `WorkspaceTopTabs` on Brand Kit. Five nav items map 1:1 to the existing `<section id=...>` anchors (lifecycle / lead-times / defaults / approvals / meta-publishing), so `?wsBase#section` deep links keep working. New `src/components/workspace/settings-sidebar.tsx` + `tests/unit/workspace/settings-sidebar.test.tsx`.

- **fix(ui): `/app/users` MemberList shows per-workspace role chips inline** (max 3 + `+N` overflow). Matches the workspace Team table's `Roles` column so the assignment context is visible on both surfaces without opening the edit drawer. The drawer wiring is unchanged.

- **perf(media): `/app/media` default page size 48 → 24.** A 48-row page routinely pushed 48 concurrent signed-URL fetches at the Cloudflare edge on cold cache, producing the "images-not-loaded-until-I-open" reload-recovery pattern. Users can still widen with `?size=48` if they want a denser grid.

- **feat(ui): wall-clock UTC build timestamp in the user avatar menu + Application Info card.** New `ARG APP_BUILD_AT` in the Dockerfile (CI stamps `--build-arg $(date -u +%Y-%m-%dT%H:%M:%SZ)` for both the app + migrator builds); new `APP_BUILD_AT` + `NEXT_PUBLIC_APP_BUILD_AT` env vars; `createBuildInfo` extended with `builtAt` / `builtAtLabel` (Intl-localised) / `detailsLabel`. Empty / malformed inputs collapse to `null` so the UI never renders `Invalid Date`. Both the desktop dropdown and the mobile sheet action show build time as the secondary row + environment as tertiary.

- **feat(ui): mobile workspace section gets the Analytics link.** The desktop sidebar had it under the Channels group; the mobile menu's workspace section was missing it (only the URL-driven `isAnalyticsRoute` flag existed, used to hide the create-content FAB). Added a `BarChart3` MobileMenuLink to `/w/[slug]/analytics/social` so the surface is reachable from a phone.

- **test: build-info + build-info-ui + settings-sidebar cases added.** All 414 files / 3689 tests pass. tsc + eslint clean on touched files.

### 2026-09-25 — UI/UX round 3 (chore/ui-ux-pass3)

Round-3 of the `/ui-ux-pro-max` polish pass. Built on the round-2 sidebar TOC + media page-size cap + build timestamp + mobile Analytics additions. The audit ran the `ui-ux-pro-max` skill against the current chrome (app shell, sidebar, mobile nav, topbar), workspace settings, global users page, media library, workspace team, agency settings, account, error boundaries, loading states, and the build-info surfaces. Picked the highest-impact fixes that respect the existing design system (44px touch targets, focus rings, bilingual catalog parity, semantic color tokens).

- **fix(ui): `SettingsSidebar` no longer tears down its scroll-spy effect on every active-id flip.** The `setActiveId` setter is now stored in a ref so the scroll + `IntersectionObserver` effect depends only on `items`. The observer is also restricted to PROMOTE the active state (never demote), which kills the active-state jitter users saw when two sections were simultaneously visible. Added `px-2` to the mobile strip so the chips aren't hard-against the viewport edge (`src/components/workspace/settings-sidebar.tsx`).

- **fix(ui): `/app/users` member rows stack on `<sm` and collapse action buttons into a dedicated group on wide viewports.** Previously the row used `flex-wrap` and the action buttons could end up mid-line on 360-414px phones; the new `flex-col sm:flex-row` + nested action group guarantees the buttons always live on a single row below the avatar+name block, then settle into a horizontal pill strip on tablet+. (`src/app/(app)/app/users/member-list.tsx`).

- **fix(ui): workspace team pending invitations use a `Mail` icon instead of the literal `@` glyph.** The `@` was the only non-icon character rendered through `IconTile` in the app shell; replacing it with a lucide `Mail` keeps the stroke + weight consistent with every other member row. (`src/app/(app)/app/w/[slug]/team/page.tsx`).

- **fix(ui): agency-settings service rows use `hover:bg-surface-subtle active:opacity-80` instead of `hover:opacity-80`.** Hover-opacity on text caused contrast flicker against the row separator; the new treatment keeps contrast stable and gives a tactile press state. (`src/app/(app)/app/agency-settings/page.tsx:502`).

- **fix(ui): remove the redundant `sr-only` "Copy build information" suffix from both the user-menu dropdown item and the mobile sheet action.** The visible `Build <short-sha>` + environment + build-time label already names the row; the duplicated sr-only suffix produced a doubled screen-reader announcement. Tests updated to look up the row by its visible name. (`src/components/build-info/copy-build-info.tsx`, `tests/unit/build-info-ui.test.tsx`).

- **fix(ui): `ApplicationInfoCard` grid label column widened from 7rem to 8rem** so the new "Built at" label fits without wrapping at common locale formats. (`src/components/build-info/application-info-card.tsx`).

- **chore(refactor): drop the dead `void React` line in `sidebar.tsx`** left over from an earlier refactor. (`src/components/app-shell/sidebar.tsx:124`).

- **test: `tests/unit/users/member-list.test.tsx` — new file, 5 cases.** Covers per-workspace role-chip overflow (`+N`), the responsive `flex-col sm:flex-row` class set on each row, the Edit / Deactivate / Reactivate aria-labels, and the empty-state path. All 414 test files / 3693 tests pass (`pnpm test:unit`). tsc clean.

- **Companion**: `chore/ui-ux-pass2` (round 2) shipped the settings sidebar TOC, the media page-size cap (48→24), the build-timestamp in the user avatar menu + account card, and the mobile Analytics link. Both rounds share the same design-system contract (44px touch targets, focus rings, semantic color tokens, bilingual catalog parity).

### 2026-09-22 — media Cloudflare-asset audit + refinement (chore/audit-cloudflare-assets)

Follow-up audit after the three media-perf PRs landed (Tier 1 cache + fetchpriority, Tier 2 480px WebP preview variant, Tier 3 per-page R2 signed URLs). The audit traced every Cloudflare R2-backed read path, every cache header, and the full trash → expunge → hard-delete lifecycle. Four real issues shipped; one deferral recorded.

- **fix(media): `/api/deliveries/assets/[id]` cache TTL bumped from 300s to 86400s** with `Vary: Cookie`. The route serves brand-kit + media previews on the delivery strip and was the odd one out — every other authenticated image route had been migrated to the 24h policy by the three media-perf PRs. `Content-Type` now comes from the row's stored mime, not the R2 passthrough (the previous code put `content-type` in the passthrough list AND set the explicit header, which meant the explicit header could be silently overwritten by R2's value if the rows disagreed). `Content-Disposition: no-store` is now set when `?download=1` so a download click never serves a stale body. `src/app/api/deliveries/assets/[id]/route.ts:42-67`.
- **fix(storage): `/api/storage/objects/[id]` (brand-kit storage proxy) cache TTL bumped from 300s to 86400s** with `Vary: Cookie` and explicit `Content-Type: <object.mimeType>` sourced from the `storage_objects` row. Same passthrough-order bug as the delivery route; the new code selects `mimeType` directly from the row and sets it before the response stream. `src/app/api/storage/objects/[id]/route.ts:42-67`.
- **fix(media): `expungeExpiredTrashedMedia(limit)` — the trash lifecycle now actually closes.** The audit found that `media_assets.delete_after` was populated by `trashMediaAsset` but nothing ever read it: trashed media sat in the DB indefinitely and the storage bytes stayed reserved forever. New helper in `src/lib/media/service.ts:1493-1591` that, per call, scans `status="trashed" AND delete_after <= now()` rows, soft-deletes every tied storage row (original + preview variant) in one transaction, releases the recorded quota via `releaseCapacityAmount` in the same transaction (so a quota-release failure rolls back the soft-delete and we never under-report), and hard-deletes the `media_asset` row. Per-row errors are caught + warned so one corrupt row doesn't poison the rest of the batch. Bound is `Math.min(Math.max(limit, 1), 500)`; default 100. Wired into `src/app/api/cron/storage-cleanup/route.ts` between `processPendingMediaAssets` and `purgeSoftDeletedStorageObjects`; the response JSON gains an `expunged: { media, storageObjects, bytesReleased }` block. The 30-day secondary retention on the soft-deleted storage rows means a user who immediately restores a trashed asset still gets a working preview for a brief window — the `fetchPreviewForActor` `status = "active"` check blocks restoring a soft-deleted row anyway, but the secondary retention is the safer default.
- **test(media): `tests/unit/media/expunge-trashed.test.ts` — 3 tests pinning the contract.** Outer query returns candidates → loop processes them → return shape `{ media, storageObjects, bytesReleased }`. Empty candidate query → no transaction started (the cron tick is cheap when the queue is empty). Per-row errors are caught + warned so `mediaCount` advances for the rows that succeeded while the failing row is logged. The mock plumbing exposes the drizzle thenable shape so the test pins the real call chain (`db.select(...).from(...).where(...).orderBy(...).limit(...)` for the outer scan, `db.select(...).from(...).where(inArray(...))` for the inner storage lookup, `db.transaction(fn)` with a tx stub for the cascade).
- **docs(media): brand-kit preview variant is deferred to a follow-up PR.** A natural symmetry with Tier 2 would add a 480px WebP variant for brand-kit logos and a `preview_storage_object_id` on `brand_assets`. The schema migration is straightforward but the blast radius is non-trivial (the brand-kit proxy route, the gallery hero, the Linked-from-media dialog all need updating), so it's its own PR. Brand-kit logos also load less frequently than media-library thumbnails, so the perf win is smaller. Documented here so the audit trail stays intact.

### 2026-09-22 — media performance, Tier 3 of 3 (feat/perf-media-tier3)

PR 1 fixed the cache policy + fetchpriority + deduped probes; PR 2 generated a 480px WebP preview variant and served it from `/api/media/assets/[id]/preview`. The preview route is fast but every byte still passes through the Node process. This PR closes the loop: the media library page + planning detail page now issue **per-page R2 signed URLs** so the bytes flow R2 → browser directly, no Next.js hop.

- **feat(media): `getSignedPreviewUrl(actor, assetId)` helper** in `src/lib/media/thumbnails.ts`. Reuses `fetchPreviewForActor` for the auth gate (same per-asset visibility + workspace-membership check the `/preview` route uses — so the two read paths can never drift on permissions), then calls `createStorageObjectReadUrl` with `expiresInSeconds: 900` (the adapter's hard max from `r2-adapter.ts:143`). Returns null on any failure — auth denied, signing error, R2 outage — so the components can fall through to the proxy route.
- **feat(media): Media Library page renders signed URLs directly.** The server-side page now calls `getSignedPreviewUrl` for every row in the page (one Promise.all over the 48 rows; HMAC sigs are ~10–30µs each so the batch is sub-millisecond) and attaches the result as `signedPreviewUrl` on each row. The `MediaCard` + `MediaListRow` components prefer that field over both the proxy route and the legacy URL. A 48-card page now makes **zero** requests to the Next.js image path on first paint.
- **feat(media): planning detail's Preview tab signs the first image's URL.** The signing call is hoisted to the top of the page function (the renderer is a sync `.map()` so we can't await inside JSX). One R2 sign call per page render — negligible cost. Falls through to `/preview` (PR 2) and the legacy URL in that order if the signer returns null.
- **chore(media): `/api/media/assets/[id]/preview` is now the documented fallback.** Nothing about the proxy route changed in this PR — it still serves the preview with `Cache-Control: private, max-age=86400, immutable` for any caller that doesn't have a fresh signed URL (e.g. a user opens the page just as the previous signed URL expires and the browser is mid-fetch). The route's X-Preview-Width / X-Preview-Height response headers also serve the "fallback after expiry" case where the components can't get intrinsic dimensions from the row.
- **docs(media): the three-tier arc.** The three PRs collapse to: **PR 1** (cache policy + fetchpriority) makes the request cheaper on the network. **PR 2** (preview variant) makes the bytes themselves cheaper — 30× smaller. **PR 3** (signed URL) removes the server hop entirely. Each PR is independent and ships a real, measurable improvement on its own. The full re-architecture was scoped in `docs/media-library-plan.md:207,250` — the `Phase B — release hardening` section that lists "Asynchronous thumbnail/poster generation and responsive image variants" is now implemented across all three PRs.

### 2026-09-22 — media performance, Tier 2 of 3 (feat/perf-media-tier2)

PR 1 stacked the cheap half of the perf fix (cache policy + fetchpriority + deduped probes); this PR ships the structural half — a 480px WebP preview variant generated at upload time and served from a dedicated `/api/media/assets/[id]/preview` route. The full re-architecture closes with PR 3 (bypass the proxy).

- **feat(media): new `src/lib/media/thumbnails.ts` module** — three pure helpers (`generatePreviewBuffer`, `storePreviewForAsset`, `fetchPreviewForActor`) plus a backfill hook. `generatePreviewBuffer` is a pure function over (bytes, mimeType): sharp pipeline that honours EXIF orientation, keeps aspect ratio, caps the longest edge at `THUMBNAIL_MAX_WIDTH = 480`, encodes WebP at quality 80, and uses `withoutEnlargement` so a 64×64 favicon stays 64×64 instead of being upscaled. `storePreviewForAsset` reads the bytes via the existing proxy path, runs the generator, uploads the variant under a new `preview/` key prefix, and writes a `storage_objects` row + `media_assets.preview_storage_object_id` in a single transaction that reserves the variant's bytes against the agency's storage quota. `fetchPreviewForActor` enforces the same per-asset auth gate `mediaAssetForActor` uses so a non-owner with no agency membership can't enumerate which assets have previews. The unsupported-mime path covers SVG (sharp would have to pull in librsvg) and PDF/DOCX (which are not images); the encode/decode-failed path is classified by inspecting the libvips error code so Sentry dashboards can distinguish "user's image was corrupt" from "libvips blew up".
- **feat(media): `/api/media/assets/[id]/preview` route.** Same auth gate as the full route (`session.userId` first, fall back to `currentActor()` for the auth-action path). `Cache-Control: private, max-age=86400, immutable` — the variant is content-addressed by its storage_object id, so the bytes never change in place and `immutable` lets the browser skip revalidation entirely. `Vary: Cookie` so role/visibility changes invalidate within the 24h window. The route also forwards intrinsic width/height as `X-Preview-Width` / `X-Preview-Height` response headers so the browser can reserve layout space before the body finishes decoding (the components already pin `width`/`height` from the source row, but the preview's smaller dimensions are useful when a component renders the variant without first loading the original). 502 on R2 outage, 404 when no preview or no access — never distinguishable to a non-owner so existence doesn't leak.
- **feat(media): every new upload gets a preview variant.** `registerUploadedMediaAsset` now calls `storePreviewForAsset` after a successful insert, wrapped in try/catch so a generator outage degrades to "no preview yet" rather than failing the upload. The legacy assets with `preview_storage_object_id IS NULL` continue to serve the full URL — `backfillPreviewIfMissing` is a one-shot helper ready for a future cron that sweeps the table once the variant pipeline has been live long enough to make a backfill cheap.
- **feat(media): Media Library grid + planning preview now prefer the preview variant.** The grid card and the list-row thumb both construct the URL conditionally: `row.object.previewStorageObjectId` present → `/api/media/assets/<uuid>/preview`, else the legacy `/api/media/assets/<uuid>`. A 48-card grid drops from ~50 MB of full-resolution bytes on first paint to ~1.5 MB of WebP variants — a 30× reduction at the same visual fidelity for the rendered scale. The planning-detail `<img>` (the page the user's complaint was about) gets the same treatment. The `MediaAssetGallery` type grew an optional `previewUrl` field so a future change to the gallery strip can use it without re-typing the component; v1 keeps the hero on the full URL because the user opens the gallery to inspect the asset at full resolution.
- **chore(deps): add `sharp@^0.35.0` as a direct dependency.** Was already in the lockfile transitively via Next.js (`@img/sharp-darwin-arm64`); pinning it directly makes the contract explicit for security audits and lets CI surface a sharp CVE before it lands via a Next.js bump.
- **test(media): `tests/unit/media/thumbnails.test.ts` — 8 tests pinning the generator's contract.** PNG / WebP round-trip preserves the format; `withoutEnlargement` keeps tiny inputs tiny; 3:1 aspect ratio preserved on resize; SVG / octet-stream / PDF rejected with `unsupported_mime_type`; corrupt bytes rejected with `decode_failed`. `THUMBNAIL_MAX_WIDTH = 480` pinned as a public constant — a future bump forces an explicit review of every consumer.
- **test(media): `tests/unit/media/preview-route.test.ts` — 7 tests pinning the route contract.** Cache-Control immutable + Vary: Cookie; X-Preview-Width/Height headers; ETag / Content-Length passthrough; 404 on missing variant, 502 on R2 outage, 401 without a session, and a defensive assertion that `Cache-Control` never contains `no-store` so a future safety-PR doesn't silently defeat the whole point.
- **docs(media): PR 3 closes the loop.** `docs/media-library-plan.md:207,250` describes the original plan; PR 3 will switch the grid / planning `<img>` from authenticated `/preview` to direct R2 signed URLs so the bytes stream R2 → browser without the Next.js hop. The preview variant is the cache-friendly content; the signed URL is the transport.

### 2026-09-22 — media performance, Tier 1 of 3 (feat/perf-media-tier1)

Planners opening an idea in the Media Library reported "the page takes forever to load." Audit found the library ships 48 full-resolution images per page and proxies every one through the Next.js server — including thumbnail-sized renders. This PR stacks the cheap half of the fix; the structural half lands in two follow-up PRs (preview-variant pipeline; bypass the proxy). Existing test suite (133 unit tests across media / preview / brand-kit / planning) passes. New: 9 pinning tests for the contract below.

- **perf(media): media-library grid cards carry intrinsic `width`/`height`, `sizes`, and `fetchpriority="high"` for the first row above the fold.** Intrinsic dimensions come from `storage_objects.width/height` (populated by the upload validator); `sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"` matches the grid's 3-up / 2-up layout. Above-the-fold cards (`index < 6`, the visible window at sm and xl breakpoints) get `loading="eager"` + `fetchpriority="high"`. Older browsers (Safari < 17.4) ignore `fetchpriority` but still see the eager/lazy split. `src/components/media/media-library-page.tsx:489-535,649-672`.
- **perf(media): the MediaAssetGallery dialog now renders the active hero eagerly and only the active strip thumbnail eagerly.** Pre-PR 1, all 20 strip thumbnails started the moment the dialog mounted, each fetching the full-resolution original. Now only the active tile in the strip carries `fetchpriority="high"`; the rest stay lazy. `src/components/media/media-asset-gallery.tsx:101-160`.
- **perf(planning): the planning-detail Preview tab no longer waits for a `useImageDimensions` probe of the same image it already rendered.** `PlatformPreview` accepts new `thumbnailWidth` / `thumbnailHeight` props sourced from `storage_objects` (already on the page from `linkedMediaAssets`); when both are present, the supplied dimensions are used directly. The hook's probe is still called as a fallback but the planning URL (`/api/media/assets/<uuid>`) short-circuits to "skipped" in the hook so the cost is a single `useState` initialiser — no extra R2 round-trip. `src/components/planning/platform-preview.tsx:14-156`, `src/components/planning/platform-preview-switcher.tsx:42-95`, `src/app/(app)/app/w/[slug]/planning/[id]/page.tsx:1166-1194`.
- **perf(preview): `useImageDimensions` deduplicates probes per URL via a module-level Map.** The hook module keeps `{promise, result}` keyed by URL; subsequent subscribers for the same URL attach to the in-flight load. The cost goes from O(2 probes per Preview tab open, one per subscriber) to O(1). `src/lib/preview/use-image-dimensions.ts:23-58`.
- **perf(media): `/api/media/assets/[id]` cache TTL moves from 5 min to 24 h for previews**; `private, no-store` for `?download=1` so a download click never serves a stale body. `Vary: Cookie` added so role/visibility changes invalidate the browser cache within the 24 h window. ETag, Content-Length, Last-Modified are still passed through from the R2 response so the browser revalidates cheaply when the object does change. `src/app/api/media/assets/[id]/route.ts:43-83`.
- **perf(brand-kit): logo grid + identity hero carry `loading`, `decoding`, `fetchpriority`, `sizes`.** The hero (`brand-identity-hero.tsx`) gets `fetchpriority="high"` because it's the only above-the-fold image on the page; the grid (`logo-grid.tsx`) marks the first 6 tiles eager with `fetchpriority="high"`. `src/app/(app)/app/w/[slug]/brand-kit/brand-identity-hero.tsx:76-94`, `src/app/(app)/app/w/[slug]/brand-kit/logo-grid.tsx:78-94`.
- **perf(workspace): `DeliveryVersionCard` strip thumbnails lazy-load below the first 3.** Above-the-fold thumbnails (`index < 3`) keep `preload="metadata"` for video tiles; below the fold they switch to `preload="none"` so the browser doesn't fetch 20 video metadata blocks at once. `src/components/workspace/delivery-version-card.tsx:241-282`.
- **test(media): `tests/unit/media/asset-route-cache-headers.test.ts`** — 4 tests pinning the new cache policy: max-age=86400 for previews, no-store for downloads, Vary: Cookie, ETag pass-through, 401 without a session.
- **test(preview): `tests/unit/preview/use-image-dimensions-dedup.test.tsx`** — 5 tests pinning the precedence: stored dims > probe; `useImageDimensions` is called regardless but the rendered dimensions are always the supplied values; the `<img>` emits `sizes` so PR 2's thumbnail variant pipeline can plug in without a component change; one-sided dimensions are intentionally omitted (would mislead the browser about the aspect ratio).
- **docs(media): deferred to follow-up PRs.** PR 2 generates a 480×360 WebP variant on upload and serves it from `/api/media/assets/[id]/preview` with `Cache-Control: private, max-age=86400, immutable`. PR 3 short-circuits the proxy entirely with a per-page signed-URL pattern so bytes flow R2 → browser. See `docs/media-library-plan.md:207,250` for the original plan and the phases that remain.

### 2026-09-21 — planning detail: idea-update timezone + materiality audit (fix/idea-update-tz-and-materiality)

Some users reported issues while updating an idea's publish data or time. Two real bugs shipped together with a UX hint:

- **fix(content): timezone-safe `<input type="datetime-local">` round-trip.** The quick-create, edit-form, and inline date editor pre-filled the input via `toISOString().slice(0, 16)` — that re-emits the **UTC** wall-clock, but `datetime-local` interprets the value in the browser's local clock. A planner in New York editing a Berlin-timezone workspace saw a default that was hours off, and an unmodified save persisted the wrong UTC instant. New helpers in `src/lib/utils/date.ts`: `formatDateInTimeZoneForInput` formats a `Date` as wall-clock in a supplied IANA timezone (`formatInTimeZone` from `date-fns-tz`); `parseInputAsWorkspaceDate` parses a typed `YYYY-MM-DDTHH:mm` as a workspace-local instant (`fromZonedTime`). The three form sites take a `workspaceTimezone` prop and call the helpers. Old `formatDateForInput` / `parseInputAsLocalDate` are kept as deprecated back-compat shims so any remaining callers stay compile-clean. 9 new unit tests (`tests/unit/utils/date-workspace-timezone.test.ts`) pin the format & DST behaviour.
- **fix(content): inline edits now trigger `recordMaterialityEvent`.** The `inline-update.ts` docstring claimed each inline mutation funnels through `recordMaterialityActivity`, but the actual server actions never did. A planner could change the date / title / brief on an item past `changes_requested` without bumping `revision`, cancelling open `approval_request`s, or notifying reviewers — breaking the master-prompt §4 materiality contract. Now `inlineUpdateBriefAction` (→ `audience_copy`), `inlineUpdateTitleAction` (→ `audience_copy.update`), and `inlineUpdateDateAction` (→ `schedule.update`) each call `recordMaterialityEvent` with the matching resource code and before/after values. The page-level capability flag (`canEditOverview`) and the server-side gate now share a single `INLINE_EDITABLE_STATUSES` constant exported from `lib/content/inline-update.ts`, so the two cannot drift. 5 new unit tests (`tests/unit/planning/inline-update-materiality.test.ts`) pin the materiality call, the activity_event kind, and the allow-list contents.
- **feat(planning-ui): workspace-timezone hint on the edit form.** `<FormField>` for `plannedPublishAt` now shows `Workspace timezone: Europe/Berlin` as a hint so the planner always knows which wall-clock their typed time will be interpreted in — closing the user-visible loop. New bilingual copy in `messages/{en,ar}/planning.json` (`planning.editForm.plannedPublishTimezone`).
- **chore(types): `EditDetailsDrawer` and the `edit-form-channel-state` test now pass `workspaceTimezone` through.** `EditDetailsDrawer` gained a required `workspaceTimezone` prop matching `EditIdeaForm`'s; the existing `tests/unit/planning/edit-form-channel-state.test.tsx` provides `Europe/Berlin` so it stays compile-clean.

### 2026-09-21 — folder-link import (Media "From link" picker)

- **feat(media): the "From link" picker now recognises Google Drive shared-folder URLs and walks the user through a small wizard — link → browse → import → done.** The picker detects `/drive/folders/<id>` and `/drive/u/<int>/folders/<id>` and routes them through the new `/api/media/import/folder` endpoint (two modes: `inspect` and `import`). The single-file contract is unchanged: `MediaSourcePicker`'s `forwards contentItemId (but not defaultFolderId) to the link child` test still passes. All importable items are preselected by default; rows that preflight 401/403 start unchecked with a "Private — share or connect Drive" chip. Per-row inline rename + Retry on failure; the import step uses `aria-live="polite"` for the progress counter. No emoji (Lucide icons throughout). Wizard lives inside `MediaLinkImporter` — no change to the picker surface.
- **feat(media): folder listing uses a `MediaFolderSourceAdapter` interface (`folder-sources/types.ts`)** with a v1 `GoogleDriveHtmlAdapter` (pure HTML parser + fixtures under `tests/fixtures/drive-folder-html/`) and a stub `GoogleDriveServiceAccountAdapter` for a future service-account implementation. The router (`folder-sources/index.ts`) selects the adapter via `GOOGLE_DRIVE_FOLDER_ADAPTER` env var, defaulting to HTML. No new operator setup is required for v1.
- **feat(media): `runMediaFolderBatch` (`folder-import.ts`) fans out across `FOLDER_IMPORT_CONCURRENCY = 4` workers and reuses `importPublicMediaAsset` per file.** Every imported asset lands through the existing storage-intent, signature check, quarantine, and audit paths. No new storage or token surface is introduced. `MAX_FOLDER_BATCH_IMPORT = 25` (Import button disabled with `folderTooManyHint` when exceeded); `MAX_FOLDER_ITEMS = 500` (listing cap; surfaces `too_large`).
- **feat(security): two new rate-limit scopes — `media_folder_inspect = 15/h`, `media_folder_import = 5/h`** — added to `RULES` in `src/lib/security/rate-limit.ts`. Each import call counts as one batch regardless of item count, on top of the per-batch 25-item cap.
- **feat(i18n): 25 new bilingual keys added to `messages/{en,ar}/media.json`** (`media.folderImportTitle`, `…Browse`, `…Import`, `…Done`, `…Retry`, `…TooManyHint`, etc.). The "From link" copy itself is unchanged.
- **docs(media): new "Folder import" subsection in `docs/media-library.md`** describing the v1 URL forms, the public-folder requirement, the 25/4/500 envelope, the v2 service-account seam, and the OneDrive + recursion deferrals.
- **perf(media): per-item HEAD preflights run in a 4-way bounded pool** so a 50-item folder inspect p95 stays inside the budget without serialising the folder HTML fetch. The folder HTML itself is fetched once and discarded after parsing.

### 2026-09-20 — delivery picker + reset-content bug fix

- **fix(deliveries): link-imported assets now appear in the picker without a hard refresh.** `DeliverySection` used `useState(mediaAssets)` for `availableAssets`, so the picker stayed empty after the "From link" importer's `router.refresh()` handed the new asset down through props. Added a `useEffect` that merges any newly-arrived `mediaAssets` ids into `availableAssets` and `selectedAssetIds`. The effect preserves search results and explicit selections — only _new_ ids are appended. Regression test in `tests/unit/planning/delivery-section.test.tsx` (`syncs mediaAssets prop changes into the picker without remounting`).
- **fix(content): "Reset idea" now succeeds for posts with prior activity.** `resetIdeaAction` did the `DELETE FROM content_items` BEFORE the `INSERT INTO activity_events` inside the same transaction, but `activity_event.content_item_id` is a FK to `content_items.id` with `ON DELETE SET NULL` (`src/lib/db/schema/notifications.ts:152-154`). The FK check rejected the activity insert (the parent row was already gone), the whole transaction rolled back, and the operator saw `The idea could not be deleted. Try again or contact platform support.` — even though the content_item row was already half-deleted. Pre-existing activity_events on the post had already been SET-NULL'd in the same doomed transaction, leaving orphans with `content_item_id = NULL` visible to the activity timeline. Surfaces reliably once a post has any activity history (the `ae2aa8fe-…` post on `just-halal` had 6 activity rows — that's the "Activity events (orphaned, link cleared) 6" line in the dialog). Fixed by reordering: insert the activity row FIRST (still pointing at the live content_item), then delete the content_item. The `ON DELETE SET NULL` cascade then nulls `content_item_id` on the inserted row once the delete commits. Regression test in `tests/unit/reset-idea-action.test.ts` (`inserts the activity_event row BEFORE deleting content_item (FK ordering)`) — records operation order inside the transaction and pins `insert.indexOf < delete.indexOf`. Red-pinned on the unfixed code.

## UI refactor contract — Meedro-informed, LaraTik-owned

Before changing shared UI, the app shell, themes, analytics, or navigation,
read [`design-system.md`](design-system.md) and
[`docs/implementation/MEEDRO_REFACTOR_PLAN.md`](docs/implementation/MEEDRO_REFACTOR_PLAN.md).

The current Google Stitch project remains the visual parity source of truth;
Meedro is a reference for information hierarchy and product patterns, not a
replacement brand or route source. Keep the existing workspace-aware sidebar,
global top bar, mobile navigation, English/Arabic contract, and permission
boundaries. Do not introduce a second navigation tree, analytics store, or
page-specific colour system.

For UI work, use the installed UI/UX Pro Max guidance plus the project-local
`ui-design` skill when available. Resolve the visual direction before coding,
reuse the existing primitives and semantic tokens, and verify loading, empty,
error, stale, keyboard, RTL, reduced-motion, and light/dark states at the
required responsive widths. Command Center work must extend the existing social
analytics read model and expose a planning handoff for every useful signal.
Observed-post handoffs must re-resolve the source inside the workspace and
store provenance in `content_research_link`; never trust a client-supplied
permalink or copy provider content directly into a draft without review. A
research bookmark stores only a workspace-scoped pointer to the authorized
observation (never a provider-content copy), and the saved item must retain a
reviewable path to Quick Create. Research collections are the Meedro-style
`Save to Project` layer: only workspace managers/content planners create or
assign them, visibility is explicitly `me` or `workspace`, and collection
membership points to the bookmark/validated teardown rather than copying source
media or notes. v1 permits one active collection per item; do not introduce a
second generic project taxonomy unless multi-collection reuse is evidenced.

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
- `docs/operations/meta-devtools-mcp.md` — Meta Developer Tools MCP (`meta-devtools` on streamable-http) for the Just Halal GmbH business; OAuth flow, tools, app anchors, gotchas, when _not_ to use it
- `docs/production-readiness/DESIGN_AUDIT.md` — structural audit that drove the M2/M3 refactor
- `docs/design/PLANNING_CANVAS_UI_UX_AUDIT_2026-09-09.md` — responsive, bilingual, and interaction evidence for the planning canvas follow-up
- `docs/production-readiness/SCREEN_PARITY.md` — 27-row matrix tracking each Stitch screen against a laratik-planner route; the responsive matrix (23 route surfaces with 73 scoped baselines) lives in `tests/e2e/visual-regression.spec.ts` and is gated by `tests/unit/stitch-cases.test.ts`
- `docs/content/format-payload-schemas.md` — per-format `formatPayload` jsonb schemas (the structured fields under "More details")
- `designs/stitch/DESIGN.md` — the captured token reference (color/typography/spacing)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
