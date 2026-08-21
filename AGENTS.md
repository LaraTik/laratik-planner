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
| AI        | MiniMax (`MiniMax-M3`, OpenAI-compat)           | Goal 11 only, optional, `AI_FEATURE_ENABLED=false` default |
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
│   ├── ci.yml                      # lint, typecheck, test, build, smoke e2e
│   └── deploy.yml                  # main push → build + push GHCR → ssh deploy
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
- ✅ Always merge finished work to `main` — review, commit, push as soon as `pnpm verify` is green. No half-finished work sitting in the local working tree or on a stale local branch. The deploy workflow fires on `workflow_run: CI success`, so the change is live on production the moment the deploy job finishes.
- ✅ CI is authoritative — local git hooks are optional and never replace CI
- ✅ Staging before production: not yet (single-environment for v1, see Goal 14)
- ✅ Disk hygiene before deploy: ensure VPS `/` is < 70% (use the vps-ops `disk-cleanup.sh apply` if needed)
- ✅ Log rotation per container, not just daemon default (already in compose: 10m × 5)

## Goal progress (live)

| #   | Goal                                                        | Status | Notes                                              |
| --- | ----------------------------------------------------------- | ------ | -------------------------------------------------- |
| 0   | Repository, design foundation, quality harness              | ✅     | This commit                                        |
| 1   | Database foundation, tenancy, RLS, generated types          | ⏳     | Drizzle schema port from master prompt §8          |
| 2   | Closed auth, bootstrap, reset, invitation onboarding        | ⏳     | NextAuth v5 + Google + Mailcow magic link          |
| 3   | App shell, My Work, workspace creation, overview            | ⏳     |                                                    |
| 4   | Workspace administration, users, channels, Brand Kit        | ⏳     |                                                    |
| 5   | Content model, Quick Create, formats, campaigns, templates  | ⏳     |                                                    |
| 6   | Monthly planning, Batch Add, board, calendar, KPI           | ⏳     | FullCalendar + dnd-kit                             |
| 7   | Workflow transitions, assignments, review readiness         | ⏳     | State machine in `src/features/content/service.ts` |
| 8   | Discussion, mentions, attachments, notifications            | ⏳     |                                                    |
| 9   | Delivery versions and two-stage creative review             | ⏳     |                                                    |
| 10  | Manual publishing, partial completion, failure recovery     | ⏳     |                                                    |
| 11  | Optional MiniMax assistance                                 | ⏳     | Gated by `AI_FEATURE_ENABLED`                      |
| 12  | Responsive completion, accessibility, visual fidelity, perf | ⏳     | axe-core per route                                 |
| 13  | Security hardening, observability, CI, staging, recovery    | ⏳     | Sentry + restic offsite                            |
| 14  | UAT, production deployment, final proof                     | ⏳     |                                                    |

See `docs/implementation/progress.md` for the live per-task checklist.

## Conventions

- **Commits:** `<type>(<scope>): <description>`. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `upgrade`. Scopes: `db`, `auth`, `content`, `planning`, `workflow`, `discussions`, `deliveries`, `publishing`, `notifications`, `ai`, `infra`, `ci`, `deps`.
- **Branches:** `main` is production. `feat/*` for features, `fix/*` for hotfixes, `chore/*` for chores. Squash-merge.
- **PRs:** must pass CI (`pnpm verify` + build + smoke e2e). Reference the goal number in the PR title.
- **ADRs:** material deviations from the master prompt go in `docs/decisions/`. The first one (`docs/decisions/0001-vps-port.md`) records the choice to self-host on the LaraTik VPS instead of Supabase + Vercel.
- **Merge on completion:** when a change is finished and `pnpm verify` is green, commit it with a `<type>(<scope>): <description>` message and push to `main`. The deploy workflow fires on `workflow_run: CI success`, so the change is live on production the moment the deploy job finishes. No finished work sits in the local working tree or on a stale local branch; feature branches (`feat/*`, `fix/*`, `chore/*`) are temporary scratch space.

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
- `docs/production-readiness/SCREEN_PARITY.md` — 27-row matrix tracking each Stitch screen against a laratik-planner route
- `designs/stitch/DESIGN.md` — the captured token reference (color/typography/spacing)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
