# StudioFlow Production Development Master Prompt

> **For the MiniMax development agent:** Read this entire file before changing any code. Execute the work phase by phase and task by task. Track every checkbox and never claim completion without the required verification evidence.

**Goal:** Build and deploy StudioFlow as a secure, fully running, responsive production web application for one social-media agency managing one brand per workspace.

**Architecture:** Build one modular Next.js App Router application rather than premature microservices. Use Supabase for PostgreSQL, authentication, private storage, migrations, and Row Level Security. Keep business rules in focused server-side domain modules, keep secrets server-only, and implement the UI as small reusable feature components mapped to the approved Stitch design.

**Tech stack:** Node.js 24 LTS, pnpm, current stable Next.js App Router, React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui with accessible primitives, Supabase Postgres/Auth/Storage, Zod, React Hook Form, TanStack Table, TanStack Query only where client caching is justified, dnd-kit, FullCalendar, date-fns, Vitest, React Testing Library, pgTAP, Playwright, axe-core, Sentry, Resend, Vercel, and MiniMax M2.7 through the official-compatible AI SDK provider.

---

## How to hand this to the coding agent

1. Place this file in the repository root as STUDIOFLOW_MASTER_PROMPT.md.
2. Start the MiniMax coding agent in that repository.
3. Send: “Read STUDIOFLOW_MASTER_PROMPT.md completely. Follow its operating contract. Inspect the repository, create the progress file, and begin Goal 0. Continue phase by phase and show verification evidence after every goal.”
4. Provide secrets only through the local/host environment when a phase genuinely requires them. Never paste keys into this document or source code.
5. Review each goal checkpoint. Do not approve release merely because the UI looks complete.

## 0. Operating contract for the development agent

You are the senior engineer responsible for taking this product from an empty repository to a production deployment. You own architecture, implementation, testing, documentation, and verification.

Follow these rules throughout:

1. Read this document completely before creating files.
2. Inspect the repository and environment before assuming their state.
3. If the repository is empty, scaffold it exactly as described here. If code already exists, preserve good work and adapt this structure without destructive rewrites.
4. Create docs/implementation/progress.md before implementation. Record the current phase, completed criteria, commands and results, decisions, migrations, risks, blockers, and next action.
5. Keep only one task marked in progress. Finish and verify it before starting another.
6. Use test-driven development for domain rules, authorization, transitions, calculations, and regressions: failing test, expected failure, minimal complete behavior, focused pass, relevant suite, commit.
7. Prefer vertical, usable slices. Do not build every database table first and postpone all user-visible behavior.
8. Keep files focused. A React component should normally remain under 200 lines and a domain or service module under 300 lines. Split by responsibility.
9. Do not duplicate validation, authorization, status-transition, or KPI logic. Define one server-side source of truth and reuse typed outputs.
10. Do not place business logic inside page components.
11. Do not expose Supabase service-role credentials, MiniMax keys, email keys, encryption keys, or monitoring secrets to browser code.
12. Do not put real secrets in source files, examples, screenshots, prompts, logs, fixtures, commits, or client bundles.
13. Do not implement automatic social publishing or live social analytics in version one.
14. Do not weaken requirements to make tests pass.
15. Do not add unrequested billing, multi-agency tenancy, native mobile applications, or a generic no-code form builder.
16. Do not use permanent deletion for normal product flows. Archive, cancel, deactivate, revoke, or restore while preserving history.
17. Use realistic loading, empty, error, permission-denied, archived, and no-results states. Never leave blank screens.
18. Every write must validate input, authorize the actor, enforce workspace scope, execute atomically where needed, and create an activity or audit event.
19. After every phase, provide a checkpoint report containing outcome, changed files, database changes, test results, routes verified, unresolved risks, and the next phase.
20. Ask the human only when a credential, external account, destructive action, financial choice, or genuine product decision is required. Continue independently for normal implementation choices.
21. A scaffold, mocked dashboard, passing smoke test, or successful build is not the finished product.
22. Final completion requires every release gate in Section 24.

### Required execution documents

Create and maintain:

- docs/implementation/progress.md — live checklist and evidence.
- docs/architecture/overview.md — architecture and boundaries.
- docs/architecture/data-model.md — schema, relationships, and invariants.
- docs/architecture/authorization.md — role matrix and RLS explanation.
- docs/architecture/workflow.md — state machine and approval-reset rules.
- docs/operations/runbook.md — setup, deployment, monitoring, backup, and recovery.
- docs/operations/environment.md — environment-variable reference without values.
- docs/testing/strategy.md — test layers, fixtures, coverage, and commands.
- docs/decisions/ — short ADRs for material deviations from this prompt.

### Source-of-truth precedence

When two sources differ, follow this order:

1. Security, privacy, and data-integrity rules in this file.
2. Product requirements and workflow rules in this file.
3. Canonical Stitch screens listed in this file.
4. Existing code that already passes relevant tests.
5. Superseded Stitch drafts or incidental sample copy.

If a canonical screen conflicts with a written invariant, implement the invariant and record the visual adjustment.

---

## 1. Product mission and production success

StudioFlow is the internal operations platform of one social-media agency. The agency manages multiple client brands. Each brand is one workspace. Agency staff and invited client reviewers use it to plan monthly content, produce creative work, discuss requirements, approve content and creative, deliver versioned files, and record manual publishing per social channel.

The product must make work fast by default, simple for first-time users, transparent across roles, safe for client access, traceable through immutable history, responsive across desktop/tablet/mobile, accessible to WCAG 2.2 AA, and reliable enough for daily production use.

Production success means:

- an administrator can bootstrap the first account, create brand workspaces, invite users, and configure defaults;
- a planner can create a draft in seconds using four initial fields;
- content can complete the full two-gate workflow without manual database edits;
- designers can receive or claim work, discuss clarifications, and submit delivery versions;
- internal and client reviewers see only what their role permits;
- publishers can record each selected channel independently;
- managers can see plan coverage and delivery health;
- all critical paths are protected by RLS and automated tests;
- the application is deployable from a clean checkout using documented commands;
- CI, observability, backups, and a rollback path exist;
- no critical or high-severity accessibility, authorization, security, or data-loss defect remains.

---

## 2. Version-one scope

### Included

- Closed email/password authentication and non-enumerating password reset.
- One-time first-agency-administrator setup when no administrator exists.
- Invitation-only onboarding after bootstrap.
- One agency in the deployed system.
- Multiple workspaces, exactly one brand per workspace.
- Global My Work, Workspaces, User Management, and Agency Settings.
- Workspace Overview, Planning, Calendar, Reviews, Social Channels, Brand Kit, Team, and Workspace Settings.
- Multiple workspace roles per user.
- Month-based planning list and workflow board.
- Month/week calendar and authorized rescheduling.
- Quick Create and spreadsheet-style Batch Add.
- Campaigns, content pillars, templates, and duplication.
- Format-specific briefs.
- Threaded discussion, mentions, visibility, attachments, resolve/reopen.
- Two approval gates with simple or internal-then-client modes.
- Default assignment or unassigned design queue.
- Versioned delivery links and previews.
- Manual per-channel publishing records.
- Notifications and preferences.
- Archive-first administration.
- Optional MiniMax assistance that never bypasses human control.
- Responsive desktop, tablet, and mobile experiences.

### Explicitly excluded from version one

- Direct publishing to social platforms.
- OAuth connections to social platforms.
- Live follower, reach, engagement, or growth analytics.
- Multiple independent agencies in one deployment.
- Subscription billing.
- Native iOS or Android applications.
- Custom workflow designer.
- Custom form builder.
- Permanent deletion through the normal UI.
- Large-file video hosting or transcoding.
- Autonomous AI status changes, submissions, approvals, or publishing.

Design future extension points without implementing these excluded capabilities.

---

## 3. Approved UX and visual system

### Product character and UX rules

StudioFlow is calm, clear, operational, trustworthy, efficient, and human. It is a professional B2B workspace, not a social feed and not a marketing website.

1. Fast by default: minimize required input and apply useful defaults.
2. Progressive disclosure: advanced details remain collapsed until needed.
3. One dominant next action per screen.
4. Scan before reading: status, title, date, channel, owner, and warning hierarchy is consistent.
5. Status always uses text and an icon, never color alone.
6. Preserve context with drawers and sheets for quick actions.
7. Use dedicated pages for complex production work.
8. Client-facing screens are simpler and never expose internal material.
9. Destructive-looking actions require confirmation and explain consequences.
10. Drafts may be incomplete; review submission must validate completeness.

### Design tokens

| Token          | Value   |
| -------------- | ------- |
| Canvas         | #F7F7F5 |
| Surface        | #FFFFFF |
| Surface subtle | #F1F3F5 |
| Border         | #DDE1E6 |
| Text primary   | #172033 |
| Text secondary | #5D6678 |
| Text muted     | #7B8495 |
| Primary        | #4F46E5 |
| Primary hover  | #4338CA |
| Primary subtle | #EEF2FF |
| Focus ring     | #6366F1 |
| Success        | #15803D |
| Success subtle | #ECFDF3 |
| Warning        | #B45309 |
| Warning subtle | #FFF7E6 |
| Danger         | #B91C1C |
| Danger subtle  | #FEF2F2 |
| Info           | #0369A1 |
| Info subtle    | #F0F9FF |

Use Inter. Page title 28/36 semibold; section title 20/28 semibold; card title 16/24 semibold; body 14/21; dense table 13/18; label 12/16; button 14/20 semibold.

Use a 4px spacing base, 24–32px desktop screen padding, 16–20px card padding, 40px standard controls, 36px compact controls, 10px card radius, 8px input/button radius, and pill badges. Prefer borders to shadows. Use shadows only for menus, dialogs, drawers, and temporary overlays.

### Responsive rules

- Desktop 1280px and above: expanded or collapsible left sidebar, 64px top bar, multi-column detail layouts, dense planning tables.
- Tablet 768–1279px: collapsed navigation, touch targets at least 44px, stacked secondary panels, master-detail where useful.
- Mobile below 768px: compact top navigation or bottom navigation, full-screen sheets, one visible primary action, list alternatives to seven-column boards, simplified administration.
- Do not merely shrink desktop layouts.
- Validate at 360px, 390px, 768px, 1024px, 1280px, and 1440px.

### Canonical Stitch reference

- Project: StudioFlow — Social Media Agency Platform
- Project ID: 5403097764334458790
- Visibility: Private
- Design system: assets/e2bbd2e84f524a5eb7e1aa20a22d7531

| Area                         | Canonical screen ID              |
| ---------------------------- | -------------------------------- |
| Workspace Overview           | f2bf40ae3420498a89916892864a95d9 |
| Monthly Planning List        | 96f0dd19cc194373a56b78f813388750 |
| Workflow Board               | f9e58e53b3dd4b61914ce4638a8e8652 |
| Quick Create                 | 9794f1aaedf4415ca45ea078ef9f1a27 |
| Batch Add                    | 43a166eded3d4edd8c90512958dbcc11 |
| Content Production Detail    | f7159c3ea90242d88d7dc15ea6a3fd02 |
| Delivery and Creative Review | 879e7539314c4b9aa4f3c2b8df5c888d |
| Calendar                     | 8c0ec0b08e4440fcab83f25817647214 |
| Reviews                      | bb6ac00d2518497eb0200c5911ed9612 |
| Publishing                   | 9cf65ebdff874456bbf5317161783dac |
| Publishing Recovery          | 382b940536414e8ab7d2c2d4f1c68624 |
| Client Review                | c7dd77e009204fbbb7be6d2f12b66dab |
| Client Calendar              | 218f259a1b61459c8aa87316f1aa45f4 |
| Login                        | 2dafd80a096644e6ae120a185c3d798d |
| Forgot Password              | 793a08d8197948449fa7ea1b3c754e76 |
| First Administrator          | a3631dbf967144a3a316b1b8ffb8fe95 |
| My Work                      | f4dc67d1520545d59782aa466ae3ddd2 |
| Workspaces                   | 01aa8faf8f564f318ac75fef64962954 |
| User Management              | 89113980349a4be89a72b4acb00c8667 |
| Planning Library             | 7493876f69694919943a1ae5495ccfbd |
| Unassigned Design Queue      | 5ad5fffcb25c48b9b8c6867b713c453d |
| Social Channels              | 45d945d704bc449188d1e0c0e336ab05 |
| Team and Invitations         | 2db8ec6ed9ad46b1933db661f07d3d1c |
| Workspace Settings           | 2f6acd26c17c40858d61e2ca577dd36f |
| Agency AI Settings           | cb0de669a5c644b083acf3edb377a87b |
| Brand Kit                    | 16aaf0a9ada7414088b5abdc45062923 |
| Operational States           | 21068e5ad24645849c5b721b3227aa95 |

Responsive reference IDs:

- Tablet Planning: 0480cbe9232d44bf8bd5d9c2d72fdb2e
- Tablet Overview: d9bb7ef2f71349c2b2701dc712285182
- Tablet Calendar: e5d3f628b2554f5dbd1ebeb948b9811c
- Tablet Detail: 12d2ff28dfe146279d81dfbc1e63a386
- Tablet Reviews: 9e0f61c2ce014f1a988e11d321ef2051
- Mobile My Work: 4ce1582bcffd41feaa3e66254fe5c34f
- Mobile Quick Create: 9d70e67a3bae4cdab9de663dea2da370
- Mobile Notifications: 1272d1faeffb4bff8c854886d4bd2a92
- Mobile Content and Discussion: 84b2d2b838d1410083a10a6e98ecd7ac
- Mobile Review: 686650a11f0e4e9bb92696fdd33e8ce7
- Mobile Publishing: c44445d58bb543a186e1df7b27ca3c2e

Do not implement from known superseded screens: 78083c8ba53243239a09405a3e9e3b86, 7ff4ca0d6ddc4439a79134b6f2839c78, b2677b3c624f4d8daf3a747b6531121f, 129bd2e9495a40e49f7bd67790a1e247, e522f7d862424136a5db4dbd1799b8b5, e350b62a7ac74793834cc532ae78bc60, 7ec810113aa447ea9a6075bc74903210, or 116b6e363e21419087b29da9a01e7a0f.

---

## 4. Fixed technical decisions

### Runtime and package management

- Use Node.js 24 LTS.
- Use pnpm and commit pnpm-lock.yaml.
- Declare Node and pnpm requirements in package.json and .nvmrc.
- Pin exact dependency versions in the lockfile. Use stable releases, not prereleases.
- Use the Next.js App Router with a src directory and the @/* alias.
- Keep React Strict Mode enabled.
- Keep TypeScript strict mode enabled, including noUncheckedIndexedAccess and exactOptionalPropertyTypes.

### Application shape

- One Next.js deployment.
- Server Components by default.
- Client Components only for interactive islands such as forms, drawers, tables, drag/drop, calendar interaction, comment composer, and realtime notifications.
- Route Handlers for health checks, signed uploads, scheduled jobs, callbacks, and streaming AI.
- Server Actions or server-side feature commands for application mutations.
- Domain services are framework-independent TypeScript wherever practical.
- PostgreSQL is the authority for persisted state.
- Supabase RLS is mandatory defense in depth.

### UI, data, and integration libraries

- Tailwind CSS 4 and CSS variables for StudioFlow tokens.
- shadcn/ui source components using accessible primitives.
- Lucide icons and an accessible live-region toast system.
- TanStack Table for dense planning and administration.
- FullCalendar day-grid, time-grid, and interaction packages.
- dnd-kit for workflow cards and format-block reordering.
- React Hook Form plus Zod.
- @supabase/ssr and @supabase/supabase-js.
- Supabase SQL migrations and generated database types; do not add a second ORM.
- date-fns and date-fns-tz; store timestamps in UTC and display in workspace timezone.
- Vercel AI SDK with vercel-minimax-ai-provider.
- Resend for action emails and digests; configure production SMTP for Supabase auth emails.
- Sentry for errors and performance traces.

### Testing and deployment

- Vitest for domain and server modules.
- React Testing Library and user-event for components.
- pgTAP for schema, functions, constraints, and RLS.
- Playwright for end-to-end and responsive browser tests.
- @axe-core/playwright for automated accessibility checks.
- MSW or explicit adapter fakes for external HTTP integrations.
- Vercel for the application and managed Supabase for data/auth/storage.
- Separate local, preview/staging, and production environments.
- Never point preview deployments at the production database.

---

## 5. Repository and module structure

Use this target structure. Add files only when their responsibility is real; do not create empty shells.

```text
studioflow/
  .github/
    workflows/ci.yml
    dependabot.yml
  docs/
    architecture/
    decisions/
    implementation/
    operations/
    testing/
  e2e/
    fixtures/
    auth/
    workspaces/
    planning/
    workflow/
    client/
    publishing/
    accessibility/
  public/
  scripts/
    check-env.mjs
    seed-test-users.mjs
  src/
    app/
      (auth)/
        login/page.tsx
        forgot-password/page.tsx
        reset-password/page.tsx
        accept-invitation/page.tsx
      setup/page.tsx
      (app)/
        layout.tsx
        my-work/page.tsx
        workspaces/page.tsx
        users/page.tsx
        agency-settings/page.tsx
        w/[workspaceSlug]/
          layout.tsx
          overview/page.tsx
          planning/page.tsx
          calendar/page.tsx
          reviews/page.tsx
          content/[contentId]/page.tsx
          social-channels/page.tsx
          brand-kit/page.tsx
          team/page.tsx
          settings/page.tsx
      api/
        health/route.ts
        bootstrap/status/route.ts
        bootstrap/admin/route.ts
        invitations/accept/route.ts
        uploads/sign/route.ts
        ai/generate/route.ts
        cron/daily-digest/route.ts
      error.tsx
      global-error.tsx
      loading.tsx
      not-found.tsx
      layout.tsx
      globals.css
    components/
      ui/
      app-shell/
      feedback/
      status/
      data-display/
    features/
      auth/
      agency/
      workspaces/
      members/
      channels/
      brand-kit/
      campaigns/
      content/
      planning/
      calendar/
      discussions/
      deliveries/
      reviews/
      publishing/
      notifications/
      ai/
      activity/
    lib/
      supabase/
        browser.ts
        server.ts
        admin.ts
        middleware.ts
        database.types.ts
      auth/
      security/
      dates/
      validation/
      observability/
      email/
      storage/
      result.ts
    middleware.ts
  supabase/
    config.toml
    migrations/
    seed.sql
    tests/
      database/
      rls/
  test/
    setup.ts
    factories/
    helpers/
  .env.example
  .nvmrc
  components.json
  next.config.ts
  package.json
  playwright.config.ts
  postcss.config.mjs
  tsconfig.json
  vitest.config.ts
```

### Feature-module rule

Each src/features/<feature> folder may contain:

- components/ — feature-specific UI.
- schemas.ts — Zod inputs and inferred types.
- queries.ts — read operations returning view models.
- commands.ts — authorized server mutations.
- service.ts — framework-independent domain behavior.
- permissions.ts — feature permission helpers.
- types.ts — domain types not generated from the database.
- *.test.ts or *.test.tsx — colocated focused tests.

Do not create generic utils.ts dumping grounds. Name helpers by purpose.

---

## 6. Initial setup commands

Run these from the directory that should contain the project. If the repository already contains an application, inspect it and install only missing dependencies.

```bash
corepack enable
pnpm create next-app@latest studioflow --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
cd studioflow
pnpm dlx shadcn@latest init -t next
pnpm add @supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers date-fns date-fns-tz @tanstack/react-table @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction @fullcalendar/react lucide-react sonner ai vercel-minimax-ai-provider resend @sentry/nextjs
pnpm add -D supabase vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @playwright/test @axe-core/playwright msw prettier prettier-plugin-tailwindcss eslint-plugin-jsx-a11y
pnpm supabase init
pnpm exec playwright install
```

Expected results:

- pnpm dev starts the application without warnings caused by project code.
- pnpm supabase start starts a local Supabase stack using Docker.
- pnpm exec playwright --version prints an installed version.
- package.json and pnpm-lock.yaml are committed.

Add these scripts to package.json:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:unit": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:db": "supabase test db",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm build",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts"
  }
}
```

CI is authoritative; local Git hooks are optional and must never replace CI.

---

## 7. Environment contract

Create .env.example containing names and safe descriptions only:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BOOTSTRAP_SETUP_TOKEN=
MINIMAX_API_KEY=
MINIMAX_MODEL=MiniMax-M2.7
MINIMAX_BASE_URL=https://api.minimax.io/anthropic
AI_FEATURE_ENABLED=false
RESEND_API_KEY=
EMAIL_FROM=
CRON_SECRET=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
VERCEL_ENV=
```

Rules:

- NEXT_PUBLIC variables are the only values allowed in browser bundles.
- SUPABASE_SERVICE_ROLE_KEY may be imported only from src/lib/supabase/admin.ts, marked server-only.
- MINIMAX_API_KEY is server-only and must never be saved in browser state or returned by an API.
- BOOTSTRAP_SETUP_TOKEN is required only for the first administrator and becomes operationally irrelevant after bootstrap is locked.
- The AI settings UI displays enabled state, model, last successful test, and a masked suffix only if explicitly stored safely. Prefer an environment-managed key and display “Configured by environment.”
- Fail fast during boot if required production variables are absent.
- Redact secret-looking keys and authorization headers from logs and Sentry events.
- Keep .env*, except .env.example, out of version control.

Create src/lib/validation/env.ts with separate client and server schemas. Tests must prove that client configuration cannot include server secrets.

---

## 8. Database model and invariants

Use UUID primary keys generated by gen_random_uuid(). Use timestamptz in UTC. Every mutable business table has created_at, updated_at, and where relevant archived_at. Use database constraints, foreign keys, indexes, and RLS rather than relying only on TypeScript.

### Required enums

- agency_member_status: active, deactivated
- workspace_status: active, archived
- workspace_role: workspace_manager, content_planner, designer, internal_reviewer, client_reviewer, publisher, viewer
- invitation_status: pending, accepted, expired, revoked
- social_platform: instagram, facebook, tiktok, linkedin, youtube, x, threads, pinterest, snapchat, other
- content_format: static_post, carousel, story, short_form_video, long_form_video, live_content, article, other
- content_status: draft, content_review, approved_for_design, in_design, creative_review, ready_to_publish, partially_published, published, changes_requested, blocked, cancelled
- review_gate: content, creative_internal, creative_client
- review_status: pending, approved, changes_requested, cancelled
- comment_visibility: internal, client
- comment_label: question, feedback, decision, general
- delivery_provider: google_drive, dropbox, onedrive, frame_io, figma, canva, other
- publication_status: pending, published, failed, skipped
- notification_kind: assignment, review_request, approval, changes_requested, mention, reply, unresolved_question, deadline, delivery, ready_to_publish, system
- activity_kind: create, update, schedule_change, assignment, status_transition, comment, review, approval_reset, delivery, publication, archive, restore, invitation, ai_assistance

### Core identity and tenancy

#### profiles

- id uuid primary key references auth.users(id) on delete restrict
- display_name text not null
- avatar_path text null
- locale text not null default en
- last_active_at timestamptz null
- created_at and updated_at

#### agencies

- id uuid primary key
- name text not null
- slug text unique not null
- singleton_key boolean not null default true unique with a check that it is true
- bootstrap_completed_at timestamptz null
- created_at and updated_at

Invariant: production contains exactly one active agency row. Do not hard-code its UUID.

#### agency_memberships

- agency_id references agencies on delete restrict
- user_id references profiles on delete restrict
- status agency_member_status not null
- is_agency_admin boolean not null default false
- deactivated_at timestamptz null
- created_at and updated_at
- primary key agency_id plus user_id

#### bootstrap_locks

- agency_id primary key references agencies
- completed_by references profiles
- completed_at timestamptz not null

Bootstrap must run in one transaction using an advisory lock. It succeeds only when no bootstrap lock and no active administrator exist. Repeated requests return a stable already-configured result without creating another administrator.

### Workspaces and access

#### workspaces

- id uuid primary key
- agency_id references agencies on delete restrict
- name text not null
- slug text not null
- timezone text not null default UTC
- status workspace_status not null default active
- logo_path text null
- archived_at and archived_by
- created_by references profiles
- created_at and updated_at
- unique agency_id plus slug

#### workspace_settings

- workspace_id primary key references workspaces on delete cascade
- default_designer_id references profiles null
- default_content_reviewer_id references profiles null
- default_internal_creative_reviewer_id references profiles null
- default_client_reviewer_id references profiles null
- approval_mode text constrained to simple or internal_then_client
- content_approval_lead_days smallint default 10 and greater than or equal to zero
- design_complete_lead_days smallint default 5
- creative_approval_lead_days smallint default 2
- ready_to_publish_lead_days smallint default 1
- monthly_target integer null and greater than zero when present
- channel_targets jsonb not null default empty object
- format_targets jsonb not null default empty object
- created_at and updated_at

Default assignee IDs must belong to active workspace members with appropriate roles. Enforce in an authorized command and test it.

#### workspace_memberships

- id uuid primary key
- workspace_id references workspaces on delete restrict
- user_id references profiles on delete restrict
- status agency_member_status not null default active
- joined_at timestamptz
- deactivated_at timestamptz null
- unique workspace_id plus user_id

#### workspace_membership_roles

- workspace_membership_id references workspace_memberships on delete cascade
- role workspace_role not null
- primary key workspace_membership_id plus role

Agency administrators receive effective full access through authorization helpers; they do not need duplicate role rows in every workspace.

#### invitations

- id uuid primary key
- agency_id references agencies
- email citext not null
- invitee_name text null
- token_hash text unique not null
- status invitation_status not null default pending
- grants_agency_admin boolean not null default false
- expires_at timestamptz not null
- invited_by references profiles
- accepted_by references profiles null
- accepted_at, revoked_at, last_sent_at
- created_at and updated_at

#### invitation_workspace_roles

- invitation_id references invitations on delete cascade
- workspace_id references workspaces on delete cascade
- role workspace_role not null
- primary key invitation_id plus workspace_id plus role

Never store a raw invitation token. Default expiry is seven days. Resend invalidates the previous token and updates expiry. Accepting an invite is idempotent. Only an active Agency Admin may grant Agency Admin access.

### Workspace configuration

#### social_channels

- id uuid primary key
- workspace_id references workspaces
- platform social_platform not null
- account_name text not null
- handle text null
- url text null
- account_type text null
- is_active boolean not null default true
- notes text null
- archived_at and archived_by
- created_at and updated_at

URLs must use https except approved local test values. Channels are informational in v1. Keep stable channel IDs and clean account identity fields so a future daily-metrics table can reference channels without changing the content model. Do not implement metrics collection now.

#### brand_assets

- id uuid primary key
- workspace_id references workspaces
- kind text constrained to logo, color, font, guideline, reference, other
- name text not null
- value jsonb not null
- storage_path text null
- external_url text null
- archived_at
- created_by, created_at, updated_at

#### brand_voice_rules

- id uuid primary key
- workspace_id references workspaces
- rule_type text constrained to tone, do, dont
- content text not null
- sort_order integer not null default zero
- created_by, created_at, updated_at

### Planning library

#### campaigns

- id uuid primary key
- workspace_id references workspaces
- name text not null
- objective text null
- description text null
- start_date and end_date date null
- owner_id references profiles null
- cover_color text null
- status text constrained to draft, active, completed, archived
- archived_at
- created_by, created_at, updated_at

#### content_pillars

- id uuid primary key
- workspace_id references workspaces
- name text not null
- color text null
- description text null
- archived_at
- created_by, created_at, updated_at
- unique active name per workspace using a partial unique index

#### content_templates

- id uuid primary key
- workspace_id references workspaces
- name text not null
- format content_format not null
- default_channel_ids uuid array not null default empty
- content_pillar_id references content_pillars null
- brief_template text null
- format_payload jsonb not null default empty object
- default_designer_id and default_reviewer_id references profiles null
- relative_schedule_rule jsonb null
- archived_at
- created_by, created_at, updated_at

Validate format_payload and relative_schedule_rule with versioned Zod schemas before write.

### Content production

#### content_items

- id uuid primary key
- workspace_id references workspaces
- campaign_id references campaigns null
- content_pillar_id references content_pillars null
- title text not null
- format content_format not null
- brief text not null default empty string
- format_payload jsonb not null default object containing schemaVersion 1
- planned_publish_at timestamptz not null
- status content_status not null default draft
- status_return_target content_status null
- change_request_gate review_gate null
- priority text constrained to low, normal, high, urgent and default normal
- content_owner_id references profiles not null
- designer_id references profiles null
- content_reviewer_id references profiles null
- internal_creative_reviewer_id references profiles null
- client_reviewer_id references profiles null
- approved_delivery_version_id uuid null and added as a deferred foreign key
- blocked_reason text null
- cancellation_reason text null
- revision integer not null default zero
- archived_at and archived_by
- created_by, created_at, updated_at

Constraints:

- blocked requires blocked_reason.
- cancelled requires cancellation_reason.
- changes_requested requires change_request_gate; every other status clears it.
- partially_published and published are derived through the publishing service, not arbitrary UI choices.
- published cannot be entered until every active selected channel is published or skipped.
- revision increments on material edits.

#### content_item_channels

- id uuid primary key
- content_item_id references content_items on delete cascade
- social_channel_id references social_channels on delete restrict
- planned_publish_at_override timestamptz null
- caption text null
- call_to_action text null
- hashtags text array not null default empty
- platform_payload jsonb not null default empty object
- created_at and updated_at
- unique content_item_id plus social_channel_id

Every new item selects all active workspace channels by default. Users may remove them. The effective schedule is the override or the item default.

#### content_assignments

- id uuid primary key
- content_item_id references content_items
- assignment_type text constrained to owner, designer, content_reviewer, internal_creative_reviewer, client_reviewer, publisher
- user_id references profiles
- assigned_by references profiles
- active boolean not null default true
- assigned_at and released_at

Keep assignment history even though current IDs also exist on content_items for efficient reads.

### Discussion and attachments

#### comments

- id uuid primary key
- content_item_id references content_items
- parent_comment_id self reference null
- author_id references profiles
- visibility comment_visibility not null
- label comment_label not null default general
- body text not null
- resolved_at and resolved_by null
- edited_at null
- created_at and updated_at

Client reviewers may read only client-visible comments on items available to them. A reply cannot be less restrictive than an internal parent.

#### comment_mentions

- comment_id references comments on delete cascade
- mentioned_user_id references profiles on delete cascade
- created_at
- primary key comment_id plus mentioned_user_id

#### attachments

- id uuid primary key
- workspace_id references workspaces
- content_item_id references content_items null
- comment_id references comments null
- delivery_version_id uuid null
- kind text constrained to reference, preview, logo, brief, comment
- storage_path text not null
- original_name text not null
- mime_type text not null
- byte_size bigint not null
- uploaded_by references profiles
- created_at

Use a private storage bucket. Generate short-lived signed download URLs after authorization.

---

### Deliveries and approvals

#### delivery_versions

- id uuid primary key
- content_item_id references content_items
- version_number integer not null and greater than zero
- description text not null
- designer_note text null
- included_formats text array not null default empty
- submitted_by references profiles
- submitted_at timestamptz not null
- is_final_approved boolean not null default false
- created_at and updated_at
- unique content_item_id plus version_number

Allocate version numbers in a transaction using row locking. Never calculate a version only in the browser.

#### delivery_links

- id uuid primary key
- delivery_version_id references delivery_versions on delete cascade
- provider delivery_provider not null
- label text not null
- url text not null
- is_preview boolean not null default false
- created_at

Require https URLs and reject script, data, file, and javascript schemes.

#### approval_requests

- id uuid primary key
- content_item_id references content_items
- gate review_gate not null
- delivery_version_id references delivery_versions null
- requested_by references profiles
- requested_at timestamptz not null
- due_at timestamptz null
- status review_status not null default pending
- sequence integer not null
- invalidated_at and invalidation_reason null
- created_at and updated_at

#### approval_decisions

- id uuid primary key
- approval_request_id references approval_requests
- reviewer_id references profiles
- decision review_status constrained to approved or changes_requested
- feedback text null
- decided_at timestamptz not null
- created_at

Changes requested requires non-empty feedback. Only one effective decision per request. Historical invalidated approvals remain immutable.

### Publishing

#### publication_records

- id uuid primary key
- content_item_channel_id references content_item_channels
- status publication_status not null default pending
- actual_published_at timestamptz null
- published_url text null
- publisher_id references profiles null
- note text null
- failure_reason text null
- attempt_number integer not null default zero
- verified_at timestamptz null
- created_at and updated_at
- unique content_item_channel_id

Rules:

- published requires actual_published_at, published_url, and publisher_id.
- skipped requires a note explaining why.
- failed requires failure_reason.
- pending clears publication-specific values.
- published_url must use https.
- overall content status is partially_published when at least one selected channel is published or skipped and at least one remains pending or failed.
- overall content status is published only when every selected channel is published or skipped.

### Notifications, activity, AI, and operational support

#### notifications

- id uuid primary key
- user_id references profiles
- workspace_id references workspaces null
- content_item_id references content_items null
- kind notification_kind not null
- title text not null
- body text not null
- action_url text null
- read_at timestamptz null
- created_at

#### notification_preferences

- user_id references profiles
- kind notification_kind
- in_app_enabled boolean not null default true
- email_enabled boolean not null default false
- digest_enabled boolean not null default false
- primary key user_id plus kind

Invitations and security events cannot be disabled. Important approval and assignment email defaults may be enabled but remain user-configurable where permitted.

#### outbox_events

- id uuid primary key
- event_type text not null
- aggregate_type text not null
- aggregate_id uuid not null
- payload jsonb not null
- available_at timestamptz not null default now
- processed_at timestamptz null
- attempt_count integer not null default zero
- last_error text null
- created_at

Create outbox events in the same transaction as the business change. A scheduled worker delivers notifications and email idempotently.

#### activity_events

- id uuid primary key
- workspace_id references workspaces
- content_item_id references content_items null
- actor_id references profiles null
- kind activity_kind not null
- summary text not null
- before_data jsonb null
- after_data jsonb null
- metadata jsonb not null default empty object
- created_at

Activity events are append-only. Prevent UPDATE and DELETE for normal application roles.

#### security_audit_events

- id uuid primary key
- actor_id references profiles null
- action text not null
- target_type text not null
- target_id text null
- outcome text constrained to success, denied, failed
- request_id text null
- ip_hash text null
- metadata jsonb not null default empty object
- created_at

Never store passwords, tokens, raw authorization headers, full API keys, or client file contents in audit metadata.

#### ai_feature_settings

- agency_id primary key references agencies
- enabled boolean not null default false
- model text not null default MiniMax-M2.7
- enabled_capabilities text array not null default empty
- key_source text constrained to environment or managed_secret
- masked_key_suffix text null
- last_connection_test_at timestamptz null
- last_connection_test_ok boolean null
- updated_by references profiles
- updated_at

Do not store the plaintext API key in this table.

#### ai_usage_events

- id uuid primary key
- agency_id references agencies
- workspace_id references workspaces
- content_item_id references content_items null
- user_id references profiles
- capability text not null
- model text not null
- input_tokens integer null
- output_tokens integer null
- context_manifest jsonb not null
- request_id text not null
- succeeded boolean not null
- created_at

The context manifest records categories used, not raw private content.

#### rate_limit_events

- id bigserial primary key
- scope text not null
- subject_hash text not null
- occurred_at timestamptz not null default now

Use a security-definer database function to atomically enforce fixed-window limits for bootstrap, invitation acceptance, password-reset requests, upload signing, and AI generation. Index scope, subject_hash, occurred_at and prune old rows.

### Required indexes

At minimum create and test:

- content_items on workspace_id plus planned_publish_at.
- content_items on workspace_id plus status.
- content_items on designer_id plus status where archived_at is null.
- content_items on content_owner_id plus status where archived_at is null.
- content_item_channels on social_channel_id and effective schedule support.
- approval_requests on content_item_id plus status.
- comments on content_item_id plus created_at.
- notifications on user_id plus read_at plus created_at descending.
- activity_events on workspace_id plus created_at descending.
- outbox_events on processed_at plus available_at where processed_at is null.
- partial unique indexes for active names and single pending approval per gate where applicable.

### Generated types and format payloads

After every migration run pnpm db:types and commit database.types.ts. Build a discriminated Zod union keyed by content_format and schemaVersion.

Required format payloads:

- static_post: visualDirection, textOverlay, imageSource, ratio, brandElements, altText.
- carousel: slides defaulting to five; each slide has id, heading, body, visualDirection, attachmentId.
- story: frames defaulting to three; each frame has id, message, visualDirection, attachmentId, interactiveElement.
- short_form_video: ratio defaults 9:16, durationSeconds defaults 30, hook, mainMessage, callToAction, scenes, onScreenText, voiceOverNotes, audioReference, coverDirection, captionsEnabled.
- long_form_video: ratio defaults 16:9, durationSeconds, title, hook, chapters, script, shotList, presenterNotes, thumbnailDirection, captionsEnabled, youtubeMetadata.
- live_content: startAt, durationMinutes, hosts, objective, runOfShow, talkingPoints, audienceQuestions, promotionPlan, technicalChecklist, replayUrl.
- article: headline, summary, outline, draftUrl, author, featuredImageDirection, keywords, callToAction, relatedLinks, seoMetadata.
- other: flexibleBrief, notes, attachmentIds, links.

Migrations of JSON payload schema versions must be explicit and tested.

---

## 9. Row Level Security and authorization

Enable RLS on every exposed public table. Do not grant anonymous access to business data.

Create stable SQL helper functions:

- current_user_is_agency_admin(agency_id uuid) returns boolean.
- current_user_is_workspace_member(workspace_id uuid) returns boolean.
- current_user_has_workspace_role(workspace_id uuid, roles workspace_role[]) returns boolean.
- current_user_can_view_content(content_item_id uuid) returns boolean.
- current_user_can_manage_content(content_item_id uuid) returns boolean.
- current_user_can_review(content_item_id uuid, gate review_gate) returns boolean.

Use security definer only when necessary. Every security-definer function must:

- set search_path explicitly to an empty or trusted value;
- schema-qualify referenced objects;
- expose the narrowest possible operation;
- validate auth.uid();
- be covered by pgTAP tests;
- revoke public execute unless intentionally granted.

### Role capability matrix

Legend: F full; M manage within workspace; W work on assigned or owned items; R review; C restricted client behavior; V view/comment; dash denied.

| Capability                    | Agency Admin | Workspace Manager | Planner |                Designer | Internal Reviewer |        Client Reviewer | Publisher |    Viewer |
| ----------------------------- | -----------: | ----------------: | ------: | ----------------------: | ----------------: | ---------------------: | --------: | --------: |
| Create/archive workspace      |            F |                 - |       - |                       - |                 - |                      - |         - |         - |
| Manage workspace settings     |            F |                 M |       - |                       - |                 - |                      - |         - |         - |
| Manage team and roles         |            F |                 M |       - |                       - |                 - |                      - |         - |         - |
| Manage channels and brand kit |            F |                 M |       M |                       V |                 V |                      C |         V |         V |
| Create/edit draft content     |            F |                 M |       W | limited assigned fields |                 V |                      - |         V |         V |
| Submit content review         |            F |                 M |       W |                       - |                 - |                      - |         - |         - |
| Content approval              |            F |                 - |       - |                       - |                 R | C only when configured |         - |         - |
| Assign/reassign designer      |            F |                 M |       - |      claim/release self |                 - |                      - |         - |         - |
| Edit production details       |            F |                 M |       W |      W on assigned item |                 V |                      - |         V |         V |
| Internal discussion           |            F |                 M |       W |                       W |                 W |                      - |         W | V/comment |
| Client-visible discussion     |            F |                 M |       W |                       W |                 W |                      C |         W | V/comment |
| Submit delivery               |            F |                 M |       - |                       W |                 - |                      - |         - |         - |
| Internal creative review      |            F |                 - |       - |                       - |                 R |                      - |         - |         - |
| Client creative review        |            F |                 - |       - |                       - |                 - | C assigned submissions |         - |         - |
| Record publishing             |            F |                 M |       - |                       - |                 - |                      - |         W |         - |
| View internal activity        |            F |                 M |       W |                       W |                 W |                      - |         W |         V |
| View client-safe history      |            F |                 M |       W |                       W |                 W |                      C |         W |         V |

Rules:

- Multiple roles combine permissions, but client_reviewer never grants internal visibility.
- If a person has both client_reviewer and an internal role, their internal access comes only from the internal role. Test the union explicitly.
- Client reviewers see only submitted items that require their decision, approved history, relevant delivery versions, client-visible comments, and a read-only calendar.
- Archived workspace access is read-only except restore operations for authorized administrators.
- Deactivated users cannot authenticate into application routes and are excluded from new assignment lists, but their historical authorship remains.
- Every server command repeats authorization even if the UI hides the action.

---

## 10. Content workflow state machine

No route, component, or database client may change content_items.status directly. All transitions pass through src/features/content/service.ts using a typed TransitionCommand, authorization context, database transaction, validation result, and activity event.

### Primary lifecycle

Draft → Content Review → Approved for Design → In Design → Creative Review → Ready to Publish → Partially Published → Published

### Supporting conditions

- Changes Requested stores a status_return_target and returns work to the responsible person.
- Blocked stores the prior status in status_return_target and requires a reason.
- Unblock restores the prior valid status after permission checks.
- Cancelled is terminal for active workflow but may be restored to Draft by a manager or administrator.
- Overdue is computed, never stored as a lifecycle status.
- Partially Published is derived from per-channel publication records.

### Transition table

| From                | Action                    | To                                  | Authorized roles                                          | Required validation                                  |
| ------------------- | ------------------------- | ----------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| draft               | submit_content_review     | content_review                      | admin, manager, planner/owner                             | review-readiness schema passes; at least one channel |
| content_review      | approve_content           | approved_for_design                 | admin, assigned content/internal reviewer                 | pending content request exists                       |
| content_review      | request_content_changes   | changes_requested                   | content reviewer                                          | non-empty feedback                                   |
| changes_requested   | resubmit_content          | content_review                      | owner, planner, manager                                   | required feedback addressed and readiness passes     |
| approved_for_design | assign_or_claim           | in_design                           | manager/admin assign; designer claims if unassigned       | active designer membership                           |
| in_design           | submit_delivery           | creative_review                     | assigned designer, manager/admin                          | delivery version and at least one valid link         |
| creative_review     | approve_internal_creative | creative_review or ready_to_publish | internal reviewer                                         | latest version; next step depends on approval mode   |
| creative_review     | request_creative_changes  | changes_requested                   | internal/client reviewer at active gate                   | non-empty feedback                                   |
| creative_review     | approve_client_creative   | ready_to_publish                    | assigned client reviewer, admin                           | internal approval exists when two-step mode          |
| changes_requested   | submit_revised_delivery   | creative_review                     | assigned designer                                         | new delivery version                                 |
| ready_to_publish    | record_channel            | partially_published or published    | publisher, manager, admin                                 | valid publication record                             |
| partially_published | record_channel            | partially_published or published    | publisher, manager, admin                                 | aggregate is recalculated                            |
| any active          | block                     | blocked                             | manager/admin; assigned worker for own item if configured | reason                                               |
| blocked             | unblock                   | status_return_target                | manager/admin or blocker                                  | target still valid                                   |
| any non-published   | cancel                    | cancelled                           | manager/admin                                             | reason                                               |
| cancelled           | restore                   | draft                               | manager/admin                                             | new schedule if old date invalid                     |

### Approval modes

Simple mode:

- Content approval uses the configured content reviewer.
- Creative review uses one effective creative approval.
- If a client reviewer is configured as that reviewer, the request is client-visible and internal material remains hidden.

Internal-then-client mode:

- Internal creative approval must complete first.
- A client request is created only after internal approval.
- Client approval moves the item to Ready to Publish.
- Client change requests return the item to the designer and invalidate the client request; internal approval may remain valid only when changes are non-material to the internally approved concept. Default to reset both for safety unless the internal reviewer explicitly reaffirms.

### Material edit policy

Centralize materiality in src/features/content/materiality.ts.

Material edits include:

- title, format, brief, objective, audience, campaign, pillar, or format payload;
- selected social channels;
- default or per-channel publishing schedule after approval;
- captions, calls to action, or required specifications;
- delivery links, files, or version selection;
- changing a reviewer or designer after their relevant approval.

Administrative edits include:

- correcting a non-semantic label;
- notification preference changes;
- marking a comment resolved;
- adding an internal note that does not change requirements.

On a material edit after approval:

1. increment content revision;
2. invalidate affected pending/approved requests;
3. clear final approved delivery when relevant;
4. move to the earliest required gate;
5. create a visible Approval reset activity event naming fields changed;
6. notify owner, assignees, and affected reviewers.

Write unit tests for each field classification and integration tests for resets.

### Assignment rules

- At approval for design, use workspace default designer when active and appropriately assigned.
- Otherwise keep designer_id null and surface the item in Unassigned Design Queue.
- A designer may atomically claim an unassigned item.
- A designer may release an item only before a delivery is under review unless a manager approves reassignment.
- Managers and administrators may assign or reassign.
- Reassignment after delivery submission creates an activity event and never changes delivery authorship.

### Review-readiness validation

Quick Create saves incomplete drafts. Submit Content Review validates:

- non-empty title and brief;
- valid format;
- valid future or explicitly accepted past planned date;
- at least one active or historically retained selected channel;
- required fields for the chosen format payload;
- owner is active;
- requested reviewer is active and authorized;
- channel-specific required captions/specs when workspace rules enable them.

Return field-level errors and an accessible summary. Do not discard draft data.

---

## 11. Planning, calendar, KPI, and publication calculations

### Planning

- Default to month list grouped by week and sorted by effective planned date.
- Provide list/board toggle, month picker, search, filters, summary counts, Quick Add, and Batch Add.
- Filters: status, format, channel, campaign, pillar, owner, designer, risk.
- Batch Add accepts pasted rows with title, format, date/time, brief, and channels. Validate every row. Allow saving valid rows only after an explicit confirmation, otherwise make the batch atomic.
- Save every batch item as Draft.

### Calendar

- Month and week views.
- Cards show title, format, channel icons, and text/icon status.
- Planners, managers, and administrators may reschedule.
- Keyboard users receive an “Move item” dialog equivalent to drag/drop.
- Rescheduling an approved or later item requires confirmation and runs the material-edit reset policy.
- Client calendar is read-only and excludes internal drafts, internal notes, risk internals, and unsubmitted work.

### Plan coverage

Plan coverage answers whether the month has enough planned content:

- total planned count divided by optional monthly target;
- per-channel planned count divided by optional channel target;
- per-format planned count divided by optional format target.

When a target is absent, show counts without a misleading percentage.

### Delivery health

For an item with publish time P, calculate:

- content approval milestone = P minus content_approval_lead_days;
- design complete milestone = P minus design_complete_lead_days;
- creative approval milestone = P minus creative_approval_lead_days;
- ready milestone = P minus ready_to_publish_lead_days.

Default values are 10, 5, 2, and 1 day.

Health:

- On Track: all milestones due by now are complete and the next milestone has safe remaining time.
- At Risk: next milestone is within the configured warning window or unresolved blocking signals exist.
- Behind: a due milestone is incomplete.
- Blocked: item is explicitly blocked.

Store no stale health label. Compute it in a tested query or pure domain function using a supplied current time.

Overview shows plan coverage separately from delivery health, plus total items, Draft, Awaiting Review, In Design, Ready to Publish, Published, Overdue, Blocked, upcoming this week, and current-user actions. KPI cards apply filters.

### Publishing aggregation

Implement derivePublishingStatus(records):

- no selected channels is invalid;
- all pending returns ready_to_publish;
- any failed and none published/skipped remains ready_to_publish with failure warning;
- at least one published/skipped plus at least one pending/failed returns partially_published;
- every record published or skipped returns published.

Publishing remains manual. The UI must say StudioFlow records the result but does not publish to the platform.

---

## 12. Discussion, delivery, notification, and activity rules

### Discussion

- Threaded comments with Question, Feedback, Decision, and General labels.
- Internal or Client-visible visibility.
- @mentions only for users who can access the item and visibility level.
- Attachments are private and access checked on every signed URL.
- Resolve/reopen a thread without deleting it.
- Unresolved questions warn but do not automatically block.
- Client users never receive notifications that reveal internal comment text.

### Deliveries

- Each new submission creates the next immutable version.
- One or more provider-independent links.
- Supported provider detection: Google Drive, Dropbox, OneDrive, Frame.io, Figma, Canva, Other.
- Display description, preview indicator, included formats, author, designer note, and timestamp.
- Old versions remain visible.
- A review request points to one exact delivery version.
- Final approved version is unmistakable.

### Notifications

Create in-app notifications for assignment, claim/release, review request, approval, change request, mention, reply, unresolved question, deadline, delivery, and ready-to-publish.

Email:

- always send invitation and password-reset emails through the auth provider;
- send important assignment/review/action emails based on preferences;
- support optional daily digest;
- use an outbox for retries and idempotency.

### Activity history

Show a read-only timeline of edits, schedule changes, assignments, transitions, reviews, approval resets, deliveries, publishing confirmations, archive/restore, and AI assistance. Present a client-safe filtered history to client reviewers.

---

## 13. Authentication, bootstrap, invitations, and sessions

### Closed authentication

- Login uses email/password.
- There is no public signup link or public signup route.
- Middleware redirects unauthenticated users to Login while preserving a validated relative return path.
- Authenticated users without active agency membership see a controlled access-pending screen.
- Use secure, httpOnly, sameSite cookies through the official Supabase SSR pattern.
- Refresh sessions on the server and never trust browser-provided role claims alone.

### First administrator

GET /api/bootstrap/status returns only configured true/false and never user counts or emails.

The setup page asks for:

- agency name;
- administrator name;
- email;
- password;
- password confirmation;
- bootstrap setup token.

POST /api/bootstrap/admin:

1. applies a strict rate limit;
2. validates same-origin request and input;
3. verifies BOOTSTRAP_SETUP_TOKEN using constant-time comparison;
4. acquires a PostgreSQL advisory lock;
5. checks no bootstrap lock and no active administrator;
6. creates the Supabase auth user through the server-only admin client;
7. creates profile, agency, membership, and bootstrap lock transactionally or compensates safely if auth creation succeeded but database work failed;
8. records a security audit event;
9. clears sensitive values from memory and response;
10. returns a generic success.

After success, setup routes return not found or redirect to login. Test concurrent requests; exactly one administrator may be created.

### Forgot/reset password

- Forgot Password always returns the same response whether an email exists.
- Rate limit by normalized email hash and source hash.
- Reset callback validates the auth exchange and sends the user to a password form.
- Changing the password invalidates other sessions when supported.
- No password is logged.

### Invitations

- Admin/manager selects name, email, one or more workspaces, and one or more roles per workspace.
- Validate that the inviter can grant every selected role.
- Default expiry is seven days.
- Store only token hash.
- Email the raw token only in a one-time HTTPS link.
- Accepting creates or attaches the auth user, active agency membership, workspace memberships, and roles.
- Existing users can accept additional workspace access without creating duplicates.
- Resend rotates the token.
- Edit access changes pending role grants.
- Revoke prevents future acceptance.
- Deactivate preserves history and removes new access/assignability.

### Session security

- Set a Content Security Policy and safe security headers in next.config.ts.
- Validate callback and return URLs against same-origin relative paths.
- Never expose whether an email is registered.
- Audit repeated denied authorization actions.
- Provide a user-facing sign-out action that clears the session.

---

## 14. Application commands, queries, and route contracts

Prefer typed feature commands over a broad generic API. A command returns a discriminated result:

```ts
export type CommandResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code:
          | "UNAUTHENTICATED"
          | "FORBIDDEN"
          | "NOT_FOUND"
          | "VALIDATION"
          | "CONFLICT"
          | "RATE_LIMITED"
          | "EXTERNAL_SERVICE";
        message: string;
        fieldErrors?: Record<string, string[]>;
        requestId: string;
      };
    };
```

Do not return stack traces, SQL text, provider secrets, or internal IDs not required by the client.

### Required commands

- bootstrapAgencyAdministrator
- createWorkspace
- archiveWorkspace and restoreWorkspace
- inviteUser, resendInvitation, editInvitationAccess, revokeInvitation
- deactivateUser and reactivateUser
- upsertWorkspaceSettings
- createChannel, updateChannel, archiveChannel, restoreChannel
- updateBrandKit
- createCampaign, archiveCampaign
- createPillar, archivePillar
- createTemplate, duplicateContentItem
- quickCreateContentItem
- batchCreateContentItems
- updateContentDetails
- updateContentChannels
- rescheduleContentItem
- transitionContentItem
- claimDesignTask, releaseDesignTask, assignDesigner
- addComment, editComment, resolveComment, reopenComment
- signAttachmentUpload and signAttachmentDownload
- submitDeliveryVersion
- requestReview and decideReview
- recordPublication and retryPublicationRecord
- markNotificationRead and updateNotificationPreferences
- testMiniMaxConnection and generateAiSuggestion

### Query/view models

Create purpose-built reads:

- getMyWork
- listWorkspaces
- getWorkspaceOverview
- getMonthlyPlan
- getWorkflowBoard
- getCalendarRange
- getContentDetail
- getReviewQueue
- getClientReviewItem
- listUnassignedDesignWork
- listWorkspaceMembers
- listAgencyUsers
- listNotifications
- getAgencyAiSettings

Return only fields needed by the route and permitted to the user. Never return a full database row to a client component by default.

### Concurrency and idempotency

- Use revision or updated_at optimistic concurrency for content edits.
- Return CONFLICT with current revision when stale.
- Claim, version allocation, approval decision, publication aggregation, bootstrap, and invitation acceptance are transactional.
- Mutations susceptible to retries accept an idempotency key stored with outcome.
- Disable repeat-submit controls while pending but do not rely on UI prevention.

---

## 15. MiniMax AI integration

AI is optional. The entire product must work when AI_FEATURE_ENABLED is false, the provider is unavailable, or the key is missing.

Use MiniMax M2.7 through the compatible AI SDK provider. The official international base is https://api.minimax.io/anthropic. Keep provider access in src/features/ai/provider.ts behind this interface:

```ts
export interface AiProvider {
  testConnection(): Promise<{ model: string; latencyMs: number }>;
  generateSuggestion(input: AiSuggestionRequest): Promise<AiSuggestionResponse>;
}
```

Supported capabilities:

- campaign ideas;
- brief improvement;
- caption, hook, and CTA drafts;
- platform adaptation;
- related-format ideas;
- brief-completeness check.

### Context policy

Before generation show and submit a context manifest. Allowed when selected:

- Brand Kit;
- selected campaign;
- content pillars;
- active social channels;
- current brief and format fields;
- specifically requested approved content.

Excluded by default:

- internal comments;
- user directory;
- client comments;
- unpublished delivery links;
- unrelated workspaces;
- secrets or credentials.

The server independently rebuilds allowed context from IDs. Never trust raw context text supplied by the browser as authorization.

### AI safety and UX

- Suggestions are editable drafts.
- Actions: Insert, Replace, Copy, Try Again, compare alternatives.
- AI never changes status, submits, approves, assigns, publishes, or writes without explicit human action.
- Record model, capability, context categories, token usage, success, and request ID.
- Do not store hidden reasoning.
- Remind users to verify claims and platform policy.
- Apply per-user and per-agency rate limits.
- Cap context and output tokens.
- Set timeouts and one controlled retry for transient failures.
- Redact provider errors before returning them.
- Stream text only when it materially improves UX and cancellation is supported.
- Unit-test context exclusion and prompt construction.
- Contract-test provider behavior with a fake; never call paid AI from CI.

### Agency AI Settings

Show:

- enabled/disabled;
- configured by environment or managed secret;
- masked suffix only when available safely;
- model selector limited to server allowlist;
- Test Connection;
- capability toggles;
- last test status;
- monthly usage summary;
- privacy/context explanation.

Never accept or reveal a full key through a normal client read. If the owner later requires key entry in the UI, implement a cloud secret-manager adapter and one-way write endpoint; do not encrypt it with another key stored beside it in the same database.

---

## 16. Security, privacy, and file handling

### Mandatory security controls

- RLS on all public tables.
- Server-side authorization on every command.
- Zod validation at every trust boundary.
- Same-origin checks for sensitive POST routes.
- Rate limiting for auth-sensitive and AI operations.
- CSP, HSTS in production, frame restrictions, Referrer-Policy, Permissions-Policy, and nosniff.
- Output encoding through React; sanitize any future rich text with an allowlist.
- No dangerouslySetInnerHTML for user content.
- Safe external-link rel attributes and explicit new-tab behavior.
- HTTPS URL validation and blocked unsafe schemes.
- Dependency audit and secret scan in CI.
- No service-role access from browser code.
- Minimal database grants and explicit RLS.
- Append-only audit history.

### Private storage

Use separate private buckets:

- brand-assets
- content-attachments
- delivery-previews

Large deliverables remain external links. Enforce:

- allowlisted MIME types and extensions;
- maximum file sizes by category;
- generated storage path, never a user path;
- randomized object names;
- no public bucket;
- short-lived signed upload/download URLs;
- authorization before signing;
- metadata verification after upload;
- future malware-scanner hook.

Recommended limits:

- logos and images: 10 MB;
- documents: 25 MB;
- comment attachments: 25 MB;
- previews: 50 MB;
- reject executable, archive, HTML, SVG unless sanitized, and unknown binary types in v1.

### Privacy

- Client access is least privilege.
- Do not expose internal discussions, user lists, AI context, unpublished links, or other workspaces.
- Audit exports and privileged actions.
- Document data retention and archive behavior.
- Provide admin-assisted account deactivation without breaking historical records.
- Backups and recovery are an operational requirement.

---

## 17. UI implementation map and reusable components

Build reusable behavior, not one enormous dashboard component.

### Shared primitives

- AppShell, Sidebar, WorkspaceSwitcher, TopBar, MobileNav
- PageHeader, SectionHeader, Breadcrumbs
- Button, IconButton, Input, Textarea, Select, Combobox, DateTimeField
- Dialog, AlertDialog, Drawer, Sheet, Popover, Tooltip, Menu
- StatusBadge, RiskBadge, ChannelBadge, RoleBadge
- Avatar, AvatarGroup, EmptyState, ErrorState, PermissionState, LoadingSkeleton
- DataTable, Pagination, FilterBar, SearchField, DensityToggle
- FormField, FieldError, ErrorSummary, SaveBar
- ActivityTimeline, CommentThread, AttachmentList
- ConfirmMaterialChangeDialog

Components in src/components/ui contain no StudioFlow business rules. Business-aware compositions belong to features.

### Authentication

- LoginForm
- ForgotPasswordForm
- ResetPasswordForm
- FirstAdminSetupForm
- InvitationAcceptanceForm

No signup UI.

### Workspace and administration

- WorkspaceCard and WorkspaceSetupWizard
- UserAccessTable and WorkspaceRoleEditor
- InvitationDrawer
- SocialChannelCard and SocialChannelForm
- BrandAssetGrid, BrandVoiceEditor, BrandLinkList
- WorkspaceDefaultsForm
- WorkflowLeadTimeForm
- ApprovalModeForm
- AiSettingsForm

### Planning and content

- PlanningToolbar
- PlanningTable and WeekGroup
- WorkflowBoard and WorkflowColumn
- CalendarView and MoveItemDialog
- QuickCreateDrawer
- BatchAddGrid
- ContentHeader and NextActionPanel
- ContentBriefForm
- ChannelScheduleEditor
- FormatEditor with one focused editor per format
- AssignmentPanel
- RiskAndMilestonePanel
- Campaign/Pillar/Template library tabs

### Production and review

- CommentComposer and CommentThread
- DeliveryVersionCard and DeliverySubmissionForm
- ReviewDecisionPanel and RequestChangesDialog
- ClientReviewShell
- PublicationChannelCard and PublicationConfirmationSheet
- NotificationList and NotificationPreferenceForm

### Route behavior

Every page implements:

- loading state;
- no-data/first-run state;
- filtered no-results state;
- recoverable error state with retry;
- permission-denied state without leaking resource existence;
- archived state when applicable;
- responsive design;
- keyboard focus placement after route/action changes.

### Quick Create

Initially show only:

1. Title.
2. Format.
3. Planned publishing date/time.
4. Short brief.

Automatically apply:

- all active channels;
- creator as content owner;
- workspace timezone;
- Draft;
- format defaults;
- workspace default designer/reviewers.

Keep campaign, pillar, objective, audience, priority, captions, CTA, hashtags, references, assignments, specifications, and overrides under More details.

### Client UI

Client Reviewer navigation contains only relevant reviews, approved history, client-visible discussion, and read-only calendar. Never render hidden internal data and then hide it with CSS.

---

## 18. Accessibility, usability, and performance

### WCAG 2.2 AA

- Semantic landmarks and headings.
- One h1 per page.
- Every input has a persistent programmatic label.
- Errors are associated with fields and summarized.
- Visible 2px focus ring using #6366F1.
- Complete keyboard operation.
- Escape closes dismissible overlays; focus returns to trigger.
- Dialog focus trap and accessible title/description.
- Status, risk, and required state never rely on color alone.
- Touch targets at least 44 by 44 CSS pixels on touch layouts.
- Reduced-motion support.
- Alt text for meaningful images; decorative images use empty alt.
- Tables have captions/headers; mobile alternatives retain meaning.
- Drag/drop has keyboard controls.
- Calendar rescheduling has a non-drag dialog.
- Toasts use an appropriate live region and never contain the only error detail.
- Maintain zoom usability at 200 percent.

Run axe on every main route, but also manually test keyboard order, focus restoration, screen-reader names, zoom, and reduced motion. Automated axe passing alone is insufficient.

### Performance budgets

Target on production-like staging:

- Largest Contentful Paint under 2.5 seconds at p75 for key routes.
- Interaction to Next Paint under 200ms at p75.
- Cumulative Layout Shift under 0.1.
- Initial JavaScript for common routes controlled through Server Components and route-level splitting.
- No unbounded list queries.
- Planning/calendar queries limited by workspace and date range.
- Paginate activity, notifications, users, and comments.
- Use responsive image sizes.
- Avoid loading FullCalendar, dnd-kit, or rich editors on routes that do not use them.

Add indexes based on EXPLAIN ANALYZE for representative planning, dashboard, review queue, and My Work queries. Record findings in docs/architecture/data-model.md.

### Caching and freshness

- Cache static design/reference data where safe.
- Do not cache permission-sensitive data across users.
- Revalidate affected routes after mutations.
- Use TanStack Query only for client experiences needing optimistic updates or incremental refresh.
- Realtime notifications are optional enhancement; polling with visibility-aware intervals is acceptable if simpler and tested.
- Never make optimistic status transitions that can hide an authorization or validation failure.

---

## 19. Observability and operations

### Logging

Use structured logs containing timestamp, severity, requestId, userId when safe, workspaceId when safe, action, outcome, and latency. Redact secrets and sensitive text. Do not log full briefs, comments, file links, passwords, tokens, or AI prompts by default.

### Sentry

- Server and browser error capture.
- Source maps uploaded securely.
- Environment and release tags.
- Request ID correlation.
- Data-scrubbing hooks.
- Performance traces sampled responsibly.
- Alert on repeated authorization failures, failing cron, delivery of outbox, AI provider failures, and elevated 5xx rate.

### Health and scheduled jobs

GET /api/health returns:

- application version;
- environment name;
- database connectivity;
- migration compatibility;
- timestamp.

It returns no secret or user data.

POST /api/cron/daily-digest:

- requires CRON_SECRET;
- processes due outbox events in bounded batches;
- is idempotent;
- records failures and retries with backoff;
- does not hold a request open indefinitely.

### Backups and recovery

- Enable managed Supabase backups appropriate to the plan.
- Document point-in-time recovery availability.
- Test a staging restore before production launch.
- Document RPO and RTO agreed with the owner.
- Database migrations must be forward-safe and include rollback or corrective migration instructions.
- Never use production as a migration experiment.

### Environments

Local:

- local Supabase stack;
- fake email inbox or test domain;
- fake MiniMax adapter by default.

Staging:

- separate Supabase project;
- restricted test users;
- real email and AI only behind explicit flags;
- production-like monitoring.

Production:

- protected branch deployment;
- manual approval after staging gates;
- managed secrets;
- backups and alerting enabled.

---

## 20. Test strategy and quality gates

### Unit tests

Use Vitest for:

- format defaults and payload validation;
- workflow transition table;
- material-edit classification and approval reset;
- assignment/claim rules;
- publishing aggregation;
- plan-coverage calculations;
- milestone and health calculations with fixed clocks;
- URL validation and provider detection;
- context-manifest filtering for AI;
- invitation expiry and role-grant validation;
- notification preference decisions;
- command error mapping.

Target at least:

- 90 percent line and branch coverage for domain services and permissions;
- 80 percent line and 75 percent branch coverage for the overall tested src subset;
- 100 percent coverage of permitted status transitions and role capabilities.

Coverage is a floor, not a substitute for meaningful assertions.

### Component tests

Use React Testing Library from a user perspective:

- Quick Create initially exposes exactly four fields.
- More details reveals advanced fields.
- validation summary links/focuses invalid fields.
- status badges have text and icons.
- change-request feedback is required.
- client components do not render internal data.
- keyboard alternatives work for reorder/move interactions.
- dialogs restore focus.
- responsive navigation exposes equivalent actions.

Avoid testing private implementation details or snapshots of entire pages.

### Database and RLS tests

Use pgTAP with test identities for every role. Prove:

- anonymous users cannot read business tables;
- users cannot access another workspace;
- viewers cannot mutate;
- planners cannot approve their own work unless separately assigned an allowed reviewer role;
- designers can change only assigned/claimed production fields;
- clients cannot read internal comments, internal activity, unrelated items, or other workspace data;
- publishers cannot alter creative approval;
- managers are scoped to their workspace;
- agency admins have intended access;
- deactivated users are denied;
- append-only tables reject update/delete;
- helper functions use safe search_path;
- constraints reject invalid states;
- private attachment metadata follows access rules.

For every new table, add a test proving both intended access and denial.

### Integration tests

Run against local Supabase:

- first-admin concurrency and lock;
- invitation create/resend/accept/revoke;
- quick create with workspace defaults;
- batch creation transaction behavior;
- content review submit/approve/change/resubmit;
- default assignment and atomic claim conflict;
- material edit invalidates approvals;
- delivery version allocation under concurrent requests;
- internal-then-client approval;
- per-channel publication aggregation;
- outbox event created with business write;
- signed upload/download authorization;
- AI context rebuilt server-side.

### End-to-end tests

Use Playwright storage states for roles. Do not share one state across tests that mutate the same records.

Required journeys:

1. First administrator bootstraps the empty system; second setup attempt is denied.
2. Admin creates Northstar Coffee workspace and sets defaults.
3. Admin invites all sample roles; invite acceptance creates correct access.
4. Omar creates “Autumn Recipe in 30 Seconds” through four-field Quick Create.
5. Omar completes the brief and submits Content Review.
6. Jon requests changes; Omar updates and resubmits; Jon approves.
7. Elena is assigned or claims the task, asks a client-visible question, and resolves it.
8. Elena submits Delivery V1; reviewer requests changes; Elena submits V2.
9. Internal reviewer approves V2; Sophie sees client-safe UI and approves.
10. Daniel records Instagram and TikTok, sees Partially Published, handles a failed Facebook attempt, skips YouTube with reason, then reaches Published.
11. Client cannot navigate to internal Team, Settings, draft details, or internal comments.
12. Planner reschedules an approved item and sees approval-reset confirmation/history.
13. Archive and restore preserve history.
14. Mobile review and publishing flows work at 390px.
15. Keyboard-only user completes login, Quick Create, review decision, and move-item dialog.

Run critical e2e on Chromium, Firefox, and WebKit. Run full responsive projects at desktop, tablet, and mobile in CI or scheduled CI according to execution time.

### Accessibility tests

- axe scan every principal route with zero serious or critical violations.
- manual keyboard checklist.
- screen-reader smoke test for Login, Quick Create, Content Detail, Review, Publishing.
- contrast verification against StudioFlow tokens.
- 200 percent zoom check at 1280px.
- reduced-motion check.
- status and validation text review.

### Visual regression

Capture stable Playwright screenshots for:

- Login;
- My Work;
- Workspace Overview;
- Planning List;
- Quick Create;
- Content Detail;
- Reviews;
- Client Review;
- Publishing;
- key tablet/mobile screens.

Mask timestamps and dynamic IDs. Compare to approved StudioFlow direction, not pixel-perfect incidental Stitch rendering. Review intentional changes.

### CI workflow

On pull requests run:

1. pnpm install --frozen-lockfile
2. pnpm format:check
3. pnpm lint
4. pnpm typecheck
5. pnpm test:unit
6. local Supabase startup
7. database reset and migrations
8. pnpm test:db
9. pnpm build
10. selected Playwright smoke tests
11. dependency and secret scanning

On main/staging run full Playwright, accessibility, migration, and visual tests. Upload test reports and traces on failure.

No phase is complete while relevant tests are skipped, flaky, or only passing locally without explanation.

---

## 21. Seed data and deterministic fixtures

Seed fictional data only:

- Agency: StudioFlow Agency
- Workspace: Northstar Coffee
- Timezone: Europe/Vienna unless owner configures another
- Channels: Instagram, TikTok, Facebook, YouTube
- Month: September 2026
- Campaign: Autumn Blend Launch
- Monthly target: 24
- Planned count fixture: 18
- Plan coverage fixture: 75 percent
- Delivery health fixture: 82 percent on track, 3 at risk, 1 blocked

Users:

- Maya Chen — Agency Admin and Workspace Manager
- Omar Haddad — Content Planner
- Elena Rossi — Designer
- Jon Bell — Internal Reviewer
- Sophie Laurent — Client Reviewer
- Daniel Kim — Publisher

Content fixtures:

- First Sip of Autumn — Short-form Video — Published
- Meet the Roaster: Lina — Carousel — Content Review
- Three Ways to Brew the Autumn Blend — Story — Approved for Design
- Autumn Blend Reveal — Short-form Video — In Design
- Behind the Beans — Static Post — Creative Review
- Weekend Brewing Guide — Carousel — Ready to Publish
- Customer Morning Ritual — Story — Blocked

Seed scripts must be idempotent for development and tests. Never seed default passwords into production. E2E credentials live in CI secrets or are created in isolated local setup.

---

## 22. Guided execution roadmap

Execute phases in order. Within each phase, turn every checkbox into a small tracked task. For every domain behavior use the failing-test → implementation → passing-test sequence. Commit coherent verified slices; do not create a commit after every trivial line.

### Requirement-to-goal traceability

| Requirement area                                               | Delivery goals             |
| -------------------------------------------------------------- | -------------------------- |
| Authentication, bootstrap, password reset, invitations         | Goals 1–2                  |
| One agency and one brand per workspace                         | Goals 1, 3                 |
| Roles, multi-role access, client restriction                   | Goals 1–4, 7–9             |
| Social Channels and Brand Kit                                  | Goal 4                     |
| Quick Create, defaults, formats, campaigns, pillars, templates | Goal 5                     |
| Planning list, board, Batch Add, calendar                      | Goal 6                     |
| KPI plan coverage and delivery health                          | Goal 6                     |
| Workflow, assignments, claim/release, approval reset           | Goal 7                     |
| Discussion, mentions, attachments, notifications               | Goal 8                     |
| Deliveries and two approval gates                              | Goal 9                     |
| Per-channel manual publishing and failure recovery             | Goal 10                    |
| Optional MiniMax assistance                                    | Goal 11                    |
| Responsive, accessibility, visual fidelity, performance        | Goal 12                    |
| Security, monitoring, CI, backups, operations                  | Goals 13–14                |
| End-to-end production proof                                    | Goal 14 and Sections 23–24 |

### Goal 0 — Repository, design foundation, and quality harness

**Objective:** A clean, reproducible application skeleton with StudioFlow tokens, CI, local Supabase, test runners, environment validation, and health reporting.

**Primary files:**

- package.json, pnpm-lock.yaml, .nvmrc, .env.example
- tsconfig.json, next.config.ts, vitest.config.ts, playwright.config.ts
- src/app/globals.css, src/app/layout.tsx
- src/lib/validation/env.ts and env.test.ts
- src/app/api/health/route.ts and route.test.ts
- .github/workflows/ci.yml
- docs/implementation/progress.md

**Tasks:**

- [ ] Inspect repository, Git status, available runtime, and existing files.
- [ ] Create progress and architecture document skeletons with real initial content.
- [ ] Scaffold Next.js only if no compatible app exists.
- [ ] Install and lock dependencies.
- [ ] Enable strict TypeScript options and typed routes if stable.
- [ ] Implement StudioFlow CSS variables, typography, focus ring, reduced motion, and base page styles.
- [ ] Add the smallest accessible Button, Input, FormField, StatusBadge, Dialog, EmptyState, and LoadingSkeleton primitives.
- [ ] Implement split client/server environment schemas and fail-fast production validation.
- [ ] Initialize Supabase local configuration.
- [ ] Configure Vitest, Testing Library, Playwright, and axe.
- [ ] Implement health route with version/environment/database result and no secrets.
- [ ] Create CI using frozen install, format, lint, typecheck, tests, database, build, and smoke e2e.
- [ ] Add README setup summary that links to full operations docs.

**Verification:**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm supabase start
curl --fail http://localhost:3000/api/health
```

Expected: all commands exit zero; health returns a non-sensitive JSON success locally.

**Exit criterion:** A clean checkout can install, start the local stack, render the StudioFlow base shell, run tests, and build using documented commands.

**Commit:** chore: establish StudioFlow production foundation

---

### Goal 1 — Database foundation, tenancy, RLS, and generated types

**Objective:** Create the initial identity, agency, workspace, membership, invitation, settings, channel, and audit schema with tested isolation.

**Primary files:**

- supabase/migrations/0001_extensions_and_enums.sql
- supabase/migrations/0002_identity_and_workspaces.sql
- supabase/migrations/0003_authorization_helpers_and_rls.sql
- supabase/migrations/0004_audit_and_rate_limits.sql
- supabase/tests/database/identity.test.sql
- supabase/tests/rls/workspaces.test.sql
- src/lib/supabase/database.types.ts
- src/lib/supabase/server.ts, browser.ts, admin.ts, middleware.ts

**Tasks:**

- [ ] Write pgTAP tests asserting required extensions/enums/tables do not yet exist; confirm failure.
- [ ] Add citext, pgcrypto, pgTAP, enums, identity, agency, workspace, membership, role, invitation, settings, and social-channel migrations.
- [ ] Add audit/activity/rate-limit structures.
- [ ] Add constraints, partial unique indexes, foreign keys, timestamps, and update trigger.
- [ ] Implement authorization SQL helpers with safe search_path.
- [ ] Enable RLS and explicit policies.
- [ ] Add role fixture helpers for pgTAP.
- [ ] Prove anonymous denial, cross-workspace denial, viewer read-only, manager scope, admin access, and deactivated denial.
- [ ] Generate and commit TypeScript database types.
- [ ] Add safe server/browser/admin Supabase clients and middleware session refresh.
- [ ] Document schema and RLS decisions.

**Verification:**

```bash
pnpm db:reset
pnpm test:db
pnpm db:types
pnpm typecheck
```

Expected: migrations apply from zero; all pgTAP tests pass; generated types introduce no TypeScript error.

**Exit criterion:** Database isolation is proven for every table created in this phase and no business table is readable anonymously.

**Commit:** feat: add secure agency and workspace data foundation

---

### Goal 2 — Closed authentication, bootstrap, reset, and invitation onboarding

**Objective:** Deliver secure first-run setup and all account entry paths without public signup.

**Primary files:**

- src/features/auth/schemas.ts, service.ts, commands.ts, permissions.ts
- src/app/setup/page.tsx
- src/app/(auth)/login/page.tsx
- src/app/(auth)/forgot-password/page.tsx
- src/app/(auth)/reset-password/page.tsx
- src/app/(auth)/accept-invitation/page.tsx
- src/app/api/bootstrap/status/route.ts
- src/app/api/bootstrap/admin/route.ts
- src/app/api/invitations/accept/route.ts
- e2e/auth/
- supabase/tests/rls/invitations.test.sql

**Tasks:**

- [ ] Write failing unit/integration tests for first-admin concurrency, token validation, and locked setup.
- [ ] Implement bootstrap status and atomic administrator creation with advisory lock.
- [ ] Implement Login without signup and safe return path.
- [ ] Implement non-enumerating Forgot Password and Reset Password.
- [ ] Implement invitation creation, token hashing, expiry, resend rotation, edit, revoke, and idempotent acceptance.
- [ ] Implement access-pending and deactivated-user states.
- [ ] Apply rate limits and audit events.
- [ ] Add email adapters and test templates with no secrets.
- [ ] Add all role-access pgTAP tests for invitation data.
- [ ] Add Playwright flows for bootstrap, login, reset request, invite acceptance, and second-setup denial.
- [ ] Test focus order, error summary, autofill attributes, and keyboard submission.

**Verification:**

```bash
pnpm test:unit -- auth
pnpm test:db
pnpm test:e2e --grep "authentication|bootstrap|invitation"
pnpm build
```

Expected: exactly one admin in concurrency test; public signup route absent; generic reset response; invite grants exact roles.

**Exit criterion:** An empty deployment can be bootstrapped once, and every later user enters through a secure invitation.

**Commit:** feat: implement closed authentication and onboarding

---

### Goal 3 — App shell, My Work, workspace creation, and overview

**Objective:** Provide the navigable responsive product shell, workspace setup, cross-workspace home, and initial operational dashboard.

**Primary files:**

- src/components/app-shell/
- src/features/workspaces/
- src/features/agency/
- src/app/(app)/layout.tsx
- src/app/(app)/my-work/page.tsx
- src/app/(app)/workspaces/page.tsx
- src/app/(app)/w/[workspaceSlug]/layout.tsx
- src/app/(app)/w/[workspaceSlug]/overview/page.tsx
- e2e/workspaces/

**Tasks:**

- [ ] Implement role-filtered global and workspace navigation.
- [ ] Implement global search shell without fake unsupported results.
- [ ] Implement workspace switcher preserving authorized destination.
- [ ] Implement six-step workspace setup wizard with defaults and one-brand wording.
- [ ] Implement workspace list, archive, restore, and archived read-only state.
- [ ] Implement My Work categories for assignments, reviews, mentions/questions, publishing, and deadlines.
- [ ] Implement Overview skeleton with real query contracts and calculated cards, not hard-coded values.
- [ ] Make KPI cards link to filtered planning views.
- [ ] Implement desktop, tablet, and mobile navigation behavior.
- [ ] Add permission, empty, loading, error, and archived states.
- [ ] Add component and Playwright tests for navigation visibility by role.

**Verification:**

```bash
pnpm test:unit -- workspaces
pnpm test:e2e --grep "workspace|navigation|My Work"
pnpm test:e2e --project=mobile-chromium --grep "My Work"
```

Expected: users see only authorized routes; workspace creation produces a configured active workspace; overview cards use persisted data.

**Exit criterion:** Admin and invited users can enter the correct shell, switch workspaces, and reach authorized functional areas on all target viewport classes.

**Commit:** feat: deliver workspace shell and operational overview

---

### Goal 4 — Workspace administration, users, channels, Brand Kit, and defaults

**Objective:** Complete the administrative foundation required for content defaults and safe collaboration.

**Primary files:**

- src/features/members/
- src/features/channels/
- src/features/brand-kit/
- src/features/workspaces/components/settings/
- src/app/(app)/users/page.tsx
- src/app/(app)/w/[workspaceSlug]/team/page.tsx
- src/app/(app)/w/[workspaceSlug]/social-channels/page.tsx
- src/app/(app)/w/[workspaceSlug]/brand-kit/page.tsx
- src/app/(app)/w/[workspaceSlug]/settings/page.tsx
- e2e/workspaces/administration.spec.ts

**Tasks:**

- [ ] Implement global user management with workspace/role summary.
- [ ] Implement invite, resend, edit access, revoke, deactivate, and reactivate UI.
- [ ] Implement Social Channels using approved default platforms and platform-aware labels.
- [ ] Keep channels informational; show no connect/OAuth/publish automation.
- [ ] Implement archive/restore for channels.
- [ ] Implement Brand Kit logos, colors, fonts, tone, do/dont rules, guideline files, and external links.
- [ ] Implement private signed upload/download for allowed brand assets.
- [ ] Implement Workspace Settings for timezone, default designer/reviewers, approval mode, targets, channel defaults, and lead times.
- [ ] Validate default assignees against active membership/roles.
- [ ] Add client-role restrictions and tests.
- [ ] Add responsive admin simplification; mobile may be read-only or task-focused when complex editing is unsafe.

**Verification:**

```bash
pnpm test:unit -- "members|channels|brand-kit|workspace-settings"
pnpm test:db
pnpm test:e2e --grep "administration|channel|Brand Kit|settings"
```

Expected: defaults persist; invalid assignee roles are rejected; client cannot access administration; private files require authorization.

**Exit criterion:** A workspace is fully configured to provide useful creation, assignment, review, and KPI defaults.

**Commit:** feat: complete workspace administration and brand configuration

---

### Goal 5 — Content model, Quick Create, format editors, campaigns, and templates

**Objective:** Deliver fast draft creation and complete format-aware editing with correct defaults.

**Primary files:**

- supabase/migrations/0005_planning_library.sql
- supabase/migrations/0006_content.sql
- src/features/content/
- src/features/campaigns/
- src/app/(app)/w/[workspaceSlug]/content/[contentId]/page.tsx
- test/factories/content.ts
- e2e/planning/quick-create.spec.ts

**Tasks:**

- [ ] Write failing schema and domain tests for every content format default.
- [ ] Add campaigns, pillars, templates, content items, channels, and assignments migrations/RLS/tests.
- [ ] Implement versioned discriminated Zod format payloads.
- [ ] Implement Quick Create with exactly four initial fields.
- [ ] Apply all active channels, creator owner, timezone, Draft, format defaults, and configured assignments server-side.
- [ ] Implement More details without making optional fields mandatory.
- [ ] Implement format-specific editors, slide/frame add/remove/duplicate/reorder, and alt-text support.
- [ ] Implement full Content Detail with assignment, schedule, channels, milestones, history panel, and next action.
- [ ] Implement campaigns/pillars/templates library inside Planning.
- [ ] Implement duplicate item, save as template, and create from template.
- [ ] Implement private reference attachment uploads.
- [ ] Add optimistic concurrency for edits.
- [ ] Add desktop/mobile Quick Create tests and draft persistence tests.

**Verification:**

```bash
pnpm test:unit -- "content|format|template|campaign"
pnpm test:db
pnpm test:e2e --grep "Quick Create|format|template"
```

Expected: a four-field save creates a persisted Draft with correct defaults; incomplete Draft is allowed; format data round-trips through typed schemas.

**Exit criterion:** A planner can create and fully specify any supported format without losing data or being forced through unnecessary fields.

**Commit:** feat: implement defaults-first content creation

---

### Goal 6 — Monthly planning, Batch Add, board, calendar, and KPI calculations

**Objective:** Provide managers and planners with consistent operational views backed by tested calculations.

**Primary files:**

- src/features/planning/
- src/features/calendar/
- src/features/workspaces/overview/
- src/app/(app)/w/[workspaceSlug]/planning/page.tsx
- src/app/(app)/w/[workspaceSlug]/calendar/page.tsx
- e2e/planning/

**Tasks:**

- [ ] Write failing tests for plan coverage, milestones, risk, and timezone boundaries.
- [ ] Implement month-range planning query with pagination/filtering.
- [ ] Implement list grouped by week as default.
- [ ] Implement workflow board with seven primary columns and supporting-state indicators.
- [ ] Implement Batch Add paste parser, row validation, defaults, and Draft creation.
- [ ] Implement month/week calendar and effective per-channel schedule display.
- [ ] Implement drag rescheduling and keyboard Move dialog.
- [ ] Add material-change confirmation hook for post-approval rescheduling.
- [ ] Implement Overview KPI and current-user action queries.
- [ ] Implement filters and URL-search-parameter persistence.
- [ ] Test Europe/Vienna daylight-saving boundaries and UTC storage.
- [ ] Add table/board/calendar loading, empty, no-results, and error states.
- [ ] Validate 1440, 1024, 768, and 390 layouts.

**Verification:**

```bash
pnpm test:unit -- "planning|calendar|coverage|health|milestone"
pnpm test:e2e --grep "Planning|Batch Add|Calendar|Overview"
pnpm test:e2e --project=mobile-chromium --grep "Planning|Calendar"
```

Expected: list, board, calendar, and overview show consistent statuses/counts; timezone and filters are stable; all batch rows become Drafts.

**Exit criterion:** The agency can plan a full month and understand coverage versus delivery health without spreadsheets.

**Commit:** feat: deliver monthly planning and operational KPIs

---

### Goal 7 — Workflow transitions, assignments, review readiness, and audit history

**Objective:** Make the lifecycle enforceable end to end, including change requests, blocks, assignment, and approval resets.

**Primary files:**

- supabase/migrations/0007_workflow_and_activity.sql
- src/features/content/service.ts
- src/features/content/materiality.ts
- src/features/content/transition-table.ts
- src/features/content/permissions.ts
- src/features/activity/
- e2e/workflow/content-workflow.spec.ts

**Tasks:**

- [ ] Encode the complete transition table as typed data and tests.
- [ ] Add database constraints preventing invalid status-specific values.
- [ ] Implement review-readiness validator with field errors.
- [ ] Implement content review submit, approve, request changes, and resubmit.
- [ ] Implement default assignment, unassigned queue, atomic claim, release, assign, and reassign.
- [ ] Implement Blocked/unblock and Cancelled/restore.
- [ ] Implement material edit classification and approval reset.
- [ ] Append activity events in every transition transaction.
- [ ] Implement status and next-action panels using server-derived available actions.
- [ ] Add authorization tests for every role/action pair.
- [ ] Add concurrent claim test proving only one designer wins.
- [ ] Add Playwright journey from Draft through In Design.

**Verification:**

```bash
pnpm test:unit -- "transition|materiality|assignment|readiness"
pnpm test:db
pnpm test:e2e --grep "content workflow|claim|approval reset"
```

Expected: no disallowed transition succeeds; change feedback is required; claim is atomic; material changes reset the correct approval and create history.

**Exit criterion:** Content can move safely from Draft to In Design using only authorized application actions.

**Commit:** feat: enforce StudioFlow content workflow

---

### Goal 8 — Discussion, mentions, attachments, and notifications foundation

**Objective:** Enable safe internal/client collaboration with actionable notifications.

**Primary files:**

- supabase/migrations/0008_discussion_notifications_outbox.sql
- src/features/discussions/
- src/features/notifications/
- src/features/activity/
- src/app/api/uploads/sign/route.ts
- src/app/api/cron/daily-digest/route.ts
- e2e/workflow/discussion.spec.ts

**Tasks:**

- [ ] Add comment, mention, attachment, notification, preference, and outbox schema/RLS.
- [ ] Prove client cannot read internal comments or internal notification content.
- [ ] Implement threaded comments and labels.
- [ ] Enforce reply visibility inheritance.
- [ ] Implement accessible mention picker limited to visible/eligible users.
- [ ] Implement resolve and reopen.
- [ ] Implement private attachment sign/upload/verify/download.
- [ ] Implement in-app notification list, unread state, mark read, and preferences.
- [ ] Create outbox events transactionally from assignments, comments, mentions, reviews, and deadlines.
- [ ] Implement bounded digest/outbox worker with retry and idempotency.
- [ ] Add mobile discussion and notification layouts.
- [ ] Test comment keyboard behavior and focus after submission.

**Verification:**

```bash
pnpm test:unit -- "discussion|notification|outbox|attachment"
pnpm test:db
pnpm test:e2e --grep "comment|mention|notification|attachment"
```

Expected: internal/client boundaries are proven at database and UI layers; notifications link only to authorized resources; private attachments cannot be guessed or fetched publicly.

**Exit criterion:** Teams and clients can collaborate safely without leaking internal information.

**Commit:** feat: add secure collaboration and notifications

---

### Goal 9 — Delivery versions and two-stage creative review

**Objective:** Complete the designer-to-reviewer handoff with immutable versions and optional client approval.

**Primary files:**

- supabase/migrations/0009_deliveries_and_approvals.sql
- src/features/deliveries/
- src/features/reviews/
- src/app/(app)/w/[workspaceSlug]/reviews/page.tsx
- src/features/reviews/components/client-review-shell.tsx
- e2e/workflow/delivery-review.spec.ts
- e2e/client/client-review.spec.ts

**Tasks:**

- [ ] Add delivery, links, requests, and decisions schema/RLS.
- [ ] Add transactional delivery version allocation and concurrent test.
- [ ] Implement provider detection and safe URL validation.
- [ ] Implement Delivery Submission with version description, links, preview, formats, and note.
- [ ] Implement Reviews queue with content/creative tabs and due indicators.
- [ ] Implement request changes with mandatory feedback.
- [ ] Implement V1 → changes → V2 history.
- [ ] Implement simple approval mode.
- [ ] Implement internal-then-client mode.
- [ ] Implement client-safe review route/data model that never fetches internal fields.
- [ ] Mark exact approved delivery version.
- [ ] Reset approval when a new material delivery/edit occurs.
- [ ] Add responsive review decisions and focus-safe change-request sheet.

**Verification:**

```bash
pnpm test:unit -- "delivery|review|approval"
pnpm test:db
pnpm test:e2e --grep "delivery|creative review|client review"
```

Expected: immutable versions remain visible; decisions apply to one exact version; internal approval precedes client approval when configured; client data is restricted.

**Exit criterion:** An item can reach Ready to Publish through both approval modes with complete traceability.

**Commit:** feat: implement versioned delivery and creative approval

---

### Goal 10 — Manual publishing, partial completion, failure recovery, and history

**Objective:** Accurately record publication per selected channel without implying automatic publishing.

**Primary files:**

- supabase/migrations/0010_publication_records.sql
- src/features/publishing/
- src/features/activity/
- e2e/publishing/publication-flow.spec.ts

**Tasks:**

- [ ] Add publication schema, constraints, indexes, and RLS.
- [ ] Write exhaustive publishing aggregation unit tests.
- [ ] Implement per-channel Pending, Published, Failed, and Skipped forms.
- [ ] Require URL/time/publisher for Published, reason for Failed, and note for Skipped.
- [ ] Implement atomic aggregate status recalculation.
- [ ] Implement failed-record edit/retry.
- [ ] Show Partially Published until every channel is Published or Skipped.
- [ ] Create activity and notifications for each record.
- [ ] Show a clear manual-publishing notice.
- [ ] Implement desktop and mobile publishing confirmations.
- [ ] Test stale/concurrent publisher updates.

**Verification:**

```bash
pnpm test:unit -- publishing
pnpm test:db
pnpm test:e2e --grep "publishing|Partially Published|Failed"
```

Expected: Published is impossible while any channel remains pending/failed; invalid URLs and incomplete records are rejected; history identifies the publisher.

**Exit criterion:** The idea-to-published journey is functionally complete for every selected channel.

**Commit:** feat: add manual multi-channel publishing records

---

### Goal 11 — Optional MiniMax assistance

**Objective:** Add secure, transparent AI suggestions without making AI a dependency or authority.

**Primary files:**

- supabase/migrations/0011_ai_settings_and_usage.sql
- src/features/ai/provider.ts
- src/features/ai/context.ts
- src/features/ai/prompts.ts
- src/features/ai/service.ts
- src/features/ai/components/
- src/app/api/ai/generate/route.ts
- src/app/(app)/agency-settings/page.tsx
- test/factories/ai.ts

**Tasks:**

- [ ] Write failing context allow/deny tests before provider code.
- [ ] Add AI settings and usage schema/RLS.
- [ ] Implement provider interface and fake provider.
- [ ] Implement MiniMax provider using MiniMax-M2.7 and server-only key.
- [ ] Implement connection test with timeout and redacted error.
- [ ] Implement server-rebuilt context manifest.
- [ ] Add campaign idea, brief improvement, copy drafting, platform adaptation, related formats, and completeness capabilities.
- [ ] Add editable Insert/Replace/Copy/Try Again/compare UX.
- [ ] Log usage categories and activity without raw sensitive context.
- [ ] Add rate limits, token limits, abort, one transient retry, and feature flag.
- [ ] Prove the entire workflow passes e2e with AI disabled.
- [ ] Mock AI in CI; add a manual staging provider test.

**Verification:**

```bash
AI_FEATURE_ENABLED=false pnpm test:unit -- ai
pnpm test:e2e --grep "workflow works without AI"
pnpm build
```

Expected: no client bundle contains the key; excluded context never reaches provider; disabling AI removes suggestions but not workflow.

**Exit criterion:** AI is a safe optional assistant with visible context and human-controlled writes.

**Commit:** feat: add secure optional MiniMax assistance

---

### Goal 12 — Responsive completion, accessibility, visual fidelity, and performance

**Objective:** Make every critical role journey intentional and usable across device classes, with measured accessibility and performance.

**Primary files:**

- src/app and feature component responsive styles
- e2e/accessibility/
- e2e/visual/
- playwright.config.ts
- docs/testing/accessibility-checklist.md
- docs/testing/performance-report.md

**Tasks:**

- [ ] Audit all routes at 360, 390, 768, 1024, 1280, and 1440.
- [ ] Replace compressed mobile tables/boards with lists or sheets.
- [ ] Complete mobile My Work, notifications, details/discussion, review, and publishing.
- [ ] Complete tablet Overview, Planning, Calendar, Detail, and Reviews.
- [ ] Add accessible keyboard alternatives for drag/drop and rescheduling.
- [ ] Add axe scans for every principal route.
- [ ] Perform manual keyboard and focus audit.
- [ ] Perform screen-reader smoke tests and record results.
- [ ] Verify 200 percent zoom and reduced motion.
- [ ] Add visual baselines aligned to canonical Stitch screens.
- [ ] Profile bundles and remove unnecessary client boundaries/dependencies.
- [ ] Run Lighthouse or equivalent production-like measurement on Login, My Work, Overview, Planning, and Detail.
- [ ] Optimize queries with EXPLAIN ANALYZE and add justified indexes.
- [ ] Fix all critical/serious accessibility and material responsive defects.

**Verification:**

```bash
pnpm test:e2e --project=chromium
pnpm test:e2e --project=webkit
pnpm test:e2e --project=firefox
pnpm test:e2e --project=mobile-chromium
pnpm build
```

Expected: no serious/critical axe issue; no horizontal page overflow at target widths; critical journeys work keyboard-only; performance budgets are met or documented with approved exception.

**Exit criterion:** The product is intentionally responsive, accessible, and visually faithful rather than merely technically rendered.

**Commit:** feat: complete responsive accessible StudioFlow experience

---

### Goal 13 — Security hardening, observability, CI, staging, and recovery

**Objective:** Prepare a safe and operable staging candidate.

**Primary files:**

- next.config.ts
- src/lib/security/
- src/lib/observability/
- src/instrumentation.ts
- .github/workflows/ci.yml
- docs/operations/runbook.md
- docs/operations/environment.md
- docs/operations/incident-response.md

**Tasks:**

- [ ] Add and verify CSP/security headers in preview/staging.
- [ ] Review all server/client boundaries for secret leakage.
- [ ] Run a role-by-route and role-by-command authorization audit.
- [ ] Run dependency audit, license review, and secret scan.
- [ ] Review upload allowlist and signed URL expiry.
- [ ] Configure Sentry scrubbing, releases, alerts, and source maps.
- [ ] Configure production-like SMTP, email domain, and digest worker in staging.
- [ ] Configure separate staging Supabase/Vercel environment.
- [ ] Apply migrations to staging from zero and from previous schema snapshot.
- [ ] Seed staging fictional data.
- [ ] Run full CI/e2e against staging.
- [ ] Test backup restore to a disposable staging project.
- [ ] Document rollback, feature-disable, AI-disable, and emergency access procedures.
- [ ] Verify no preview deployment points to production data.

**Verification:**

```bash
pnpm verify
pnpm test:e2e
pnpm audit --prod
```

Also verify headers, Sentry test event, cron authorization, email delivery, migration logs, and restore evidence manually.

Expected: all automated gates pass; monitoring sees controlled test errors; restore succeeds; no committed secret or high/critical dependency issue remains.

**Exit criterion:** A staging release can be monitored, recovered, and safely promoted.

**Commit:** chore: harden StudioFlow for production operations

---

### Goal 14 — UAT, production deployment, and final proof

**Objective:** Prove the complete product with role-based acceptance testing and release it using a reversible deployment.

**Tasks:**

- [ ] Freeze release candidate and record commit SHA.
- [ ] Run full verification from a clean checkout.
- [ ] Run the primary acceptance journey in Section 23.
- [ ] Run a permission-denial UAT for every role.
- [ ] Run responsive UAT on real or representative desktop/tablet/mobile browsers.
- [ ] Review all empty/loading/error/archived/no-results states.
- [ ] Confirm project and application privacy.
- [ ] Confirm Supabase production backups and alert contacts.
- [ ] Apply production migrations with reviewed logs.
- [ ] Deploy application with AI disabled initially if provider verification is pending.
- [ ] Run production smoke tests using dedicated test workspace and remove/archive test content afterward.
- [ ] Enable AI only after connection, context, rate-limit, and redaction checks.
- [ ] Verify Sentry, health, email, cron, and audit events.
- [ ] Record known low-risk limitations with owner acceptance.
- [ ] Tag release and publish runbook/handoff.
- [ ] Monitor error rate and core workflows during the first release window.

**Verification:**

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm test:e2e
```

Expected: zero failing required tests; production health passes; the complete role journey succeeds without direct database intervention.

**Exit criterion:** Every release gate in Section 24 is evidenced, the owner can operate the system, and rollback/recovery is documented and tested.

**Commit/tag:** release: StudioFlow v1 production

---

## 23. Primary acceptance journey

This scenario must pass in staging and production using authorized test accounts. It is the minimum proof of a complete running system.

1. Start with a new deployment containing no agency administrator.
2. Maya completes Create Agency Administrator.
3. A second browser attempting setup receives the configured result and cannot create another administrator.
4. Maya creates Northstar Coffee with Europe/Vienna timezone, monthly target 24, and four channels: Instagram, TikTok, Facebook, YouTube.
5. Maya configures Omar as default content owner/planner where appropriate, Elena as default designer, Jon as internal reviewer, Sophie as client reviewer, and internal-then-client approval.
6. Maya invites Omar, Elena, Jon, Sophie, and Daniel with their exact roles.
7. Each invitation is accepted; a client account cannot see Workspaces, User Management, Team, Brand Kit internals, Settings, drafts, or internal comments.
8. Omar lands on My Work and opens Northstar Coffee Planning for September 2026.
9. Omar opens Quick Create. Initially only Title, Format, Planned date/time, and Short brief are visible.
10. Omar creates “Autumn Recipe in 30 Seconds” as Short-form Video.
11. The Draft receives all four active channels, workspace timezone, Omar as owner, Elena as designer, configured reviewers, 9:16 defaults, 30-second suggestion, and Draft status.
12. Omar opens More details, completes Hook → Main message → CTA, scenes, captions, and channel copy.
13. Omar submits Content Review; readiness validation passes.
14. Jon requests changes with required feedback. Omar sees the notification, edits, and resubmits.
15. Jon approves. The item becomes Approved for Design and then In Design with Elena assigned.
16. Elena adds a client-visible clarification question. Sophie sees it; neither Sophie nor the client data response contains internal discussion.
17. The clarification is resolved and appears in activity.
18. Elena submits Delivery V1 with a Frame.io preview and Google Drive production link.
19. Jon requests creative changes. Elena submits Delivery V2. Both versions and feedback remain visible.
20. Jon approves V2 internally.
21. Sophie receives a client review containing only client-safe content, V2, relevant context, and client-visible discussion.
22. Sophie approves. The item becomes Ready to Publish and identifies V2 as final approved version.
23. Daniel records Instagram and TikTok as Published. Overall status becomes Partially Published.
24. Facebook is recorded Failed, edited, retried, then Published.
25. YouTube is Skipped with a reason.
26. Overall status becomes Published.
27. Overview, Planning List, Board, Calendar, Reviews, My Work, Notifications, and activity all show consistent final state.
28. An archived/restored check confirms history remains.
29. Mobile screens allow a review decision, comment reply, and publishing confirmation.
30. Keyboard-only operation completes Login, Quick Create, review request, review decision, and calendar move dialog.

Failure of any numbered step means the production goal is not complete.

---

## 24. Definition of done and release gates

### Functional gates

- [ ] One-time bootstrap works and is concurrency-safe.
- [ ] Public signup is absent.
- [ ] Invitations, role assignment, deactivation, and access editing work.
- [ ] One workspace clearly equals one brand.
- [ ] Quick Create initially has exactly four fields and applies defaults server-side.
- [ ] All eight content formats validate and persist.
- [ ] Planning list, board, and calendar agree.
- [ ] Plan Coverage and Delivery Health are separately calculated.
- [ ] Full workflow and supporting conditions work.
- [ ] Content and creative approvals are separate.
- [ ] Internal-then-client approval works.
- [ ] Material edits visibly reset approval.
- [ ] Assignment/default/claim/release/reassign work atomically.
- [ ] Internal/client discussion boundaries work.
- [ ] Delivery versions and past feedback remain visible.
- [ ] Publishing is tracked separately per selected channel.
- [ ] Partially Published and Published aggregate correctly.
- [ ] Archive/restore preserves history.
- [ ] AI can be disabled without losing any workflow.

### Security and privacy gates

- [ ] RLS enabled and tested on every exposed business table.
- [ ] Cross-workspace and client-data denial tests pass.
- [ ] No service role or provider secret exists in browser bundles.
- [ ] No real secret exists in source, prompt, logs, fixture, screenshot, or Git history.
- [ ] Shared Stitch/MiniMax credentials used during design/development have been rotated.
- [ ] Uploads are private, allowlisted, size-limited, and authorization-checked.
- [ ] CSP and security headers verified in production.
- [ ] Rate limits cover sensitive routes.
- [ ] Dependency/secret scans have no unaccepted high or critical result.
- [ ] Audit history is append-only for application roles.

### Quality gates

- [ ] Formatting, lint, strict typecheck, unit, database, build, and e2e pass from a clean checkout.
- [ ] Domain/permission coverage thresholds pass.
- [ ] Required Chromium, Firefox, WebKit, tablet, and mobile projects pass.
- [ ] No serious or critical automated accessibility violation.
- [ ] Manual keyboard, screen-reader smoke, zoom, and reduced-motion checks pass.
- [ ] Responsive checks pass at all target widths without page overflow.
- [ ] Performance budgets pass or have explicit owner-approved exceptions.
- [ ] Visual regression changes are reviewed.
- [ ] No required test is skipped or flaky.

### Operational gates

- [ ] Local setup works from documentation.
- [ ] Staging and production use separate databases and secrets.
- [ ] Production migrations are reviewed and reproducible.
- [ ] Health, Sentry, email, cron, and outbox are verified.
- [ ] Backup/restore evidence exists.
- [ ] Rollback and incident procedures exist.
- [ ] Owner/admin can operate the product using the runbook.
- [ ] Known limitations are documented and accepted.
- [ ] Primary acceptance journey passes in production.

Do not use “production-ready,” “complete,” or “done” until every applicable checkbox has evidence.

---

## 25. Required response format from the MiniMax agent

### First response before coding

Return:

1. Repository-state summary.
2. Assumptions.
3. Confirmed architecture.
4. Phase checklist with Goal 0 marked in progress.
5. Immediate commands/actions.
6. Credentials or external decisions genuinely required now.

Then start Goal 0. Do not wait for confirmation unless a genuine blocker exists.

### After every goal

Return:

```text
Goal N — <name>
Outcome: PASS | FAIL | BLOCKED

Implemented:
- ...

Changed files:
- ...

Database:
- migrations...
- RLS/constraints...

Verification:
- command — PASS/FAIL — concise result

Manual checks:
- route/device/role — result

Risks or deviations:
- none, or exact issue and ADR

Next:
- Goal N+1 and first task
```

Update docs/implementation/progress.md before reporting.

### If blocked

State:

- exact blocker;
- evidence;
- safe work already completed;
- alternatives attempted;
- smallest human action required;
- whether work can continue elsewhere without creating rework.

Do not report a vague blocker such as “need clarification” when a safe reversible default exists.

### Final response

Provide:

- production URL and environment;
- release tag/SHA;
- feature summary;
- architecture summary;
- migration status;
- role-by-role acceptance evidence;
- automated test counts and reports;
- accessibility/performance results;
- security and secret-scan results;
- backup/restore evidence;
- monitoring/alert evidence;
- known accepted limitations;
- runbook links;
- explicit release-gate checklist.

If any required evidence is missing, report the system as not complete.

---

## 26. Official implementation references

Use official documentation and recheck it when dependency APIs change:

- Next.js App Router installation: https://nextjs.org/docs/app/getting-started/installation
- Tailwind CSS with Next.js: https://tailwindcss.com/docs/installation/framework-guides/nextjs
- shadcn/ui with Next.js: https://ui.shadcn.com/docs/installation/next
- Supabase Next.js Auth: https://supabase.com/docs/guides/auth/quickstarts/nextjs
- Supabase local development: https://supabase.com/docs/guides/local-development/cli/getting-started
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase database testing: https://supabase.com/docs/guides/local-development/testing/overview
- Vitest: https://vitest.dev/guide/
- Playwright: https://playwright.dev/docs/intro
- Playwright accessibility testing: https://playwright.dev/docs/accessibility-testing
- MiniMax API overview: https://platform.minimax.io/docs/api-reference/api-overview
- MiniMax AI SDK: https://platform.minimax.io/docs/api-reference/text-ai-sdk
- MiniMax Anthropic-compatible API: https://platform.minimax.io/docs/api-reference/text-anthropic-api

---

## Final directive

Build the complete production system described here. Work phase by phase, keep the product runnable, write tests before critical logic, preserve the fixed product boundaries, and provide evidence after every goal. Prefer simple focused modules and explicit domain rules over clever abstractions. Stop only for a true external blocker. Do not declare success until the complete acceptance journey and every release gate pass.
