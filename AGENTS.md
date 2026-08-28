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

## Bilingual content (EN/AR) + RTL

The layout is bilingual from v1. The agency's `locale`
(`agencies.locale`) drives the document `lang` / `dir`
attributes on the root `<html>` (`src/app/layout.tsx`).
v1 supports `en` and `ar`; adding a locale is a one-line
change in `src/lib/i18n/locales.ts` (`SUPPORTED_LOCALES`).
`resolveLocale()` is total — unknown codes fall back to
`en` so a stale `agencies.locale` row from a legacy agency
can't crash the layout.

- Per-field direction is _content_-driven, not
  locale-driven. `DirAwareTextarea` / `DirAwareInput`
  (`src/components/forms/dir-aware-textarea.tsx`) detect
  the first non-whitespace char: Arabic Unicode blocks
  → `rtl`, otherwise `ltr`. A user typing an English
  hashtag inside an Arabic form gets LTR alignment
  inside the field; the page chrome is whatever the
  agency locale says.
- All text uses Tailwind 4 logical properties
  (`text-start` / `text-end`, `ps-*` / `pe-*`,
  `ms-*` / `me-*`) so layouts mirror correctly when
  the document `dir` flips. **Never** hard-code
  `text-left` / `text-right` in a component that's
  used in a workspace — use the logical property.
- Translations live inside `formatPayload.translations[locale]`
  (see the `formatPayload` rule below). The editor's
  per-field sidecar (`TranslationPanel`) is the UI;
  the mapper (`lib/format-payload/mapper.ts`) is the
  read side that feeds the publish form.

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

## Cross-references

- `STUDIOFLOW_MASTER_PROMPT.md` — the source spec (3,010 lines, 26 sections)
- `PORT_NOTES.md` — every Supabase / Vercel / Resend / pgTAP reference mapped to the VPS-native equivalent
- `docs/architecture/overview.md` — system map (replaces the master prompt's diagram)
- `docs/operations/runbook.md` — deploy, backup, recovery, rotation
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
