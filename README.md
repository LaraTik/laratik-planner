# StudioFlow / laratik-planner

Social-media planning, design, review, and publishing operations for one agency. One workspace represents one brand.

## Release status

The authoritative release verdict and implementation evidence live in [`PRODUCTION_READINESS_TRACKER.md`](./PRODUCTION_READINESS_TRACKER.md). A successful build is not a release decision. Production remains blocked until every P0/P1 item is independently verified and the operational UAT is complete.

## Stack

- Next.js 16 App Router, React 19, strict TypeScript
- PostgreSQL 16 and Drizzle ORM
- Auth.js / NextAuth with verified Google OAuth and passwordless email
- Tailwind CSS, Radix primitives, responsive server-rendered UI
- Vitest, isolated PostgreSQL integration tests, Playwright and axe
- Docker Compose, immutable GHCR images, dedicated migrator and Traefik
- Optional MiniMax AI and Sentry, configured only through server environment variables

## Local setup

```bash
pnpm install
cp .env.example .env
./scripts/dev.sh
```

Required secrets and provider combinations are documented in [`docs/operations/environment.md`](./docs/operations/environment.md). Production fails before startup if authentication or an enabled provider is only partially configured.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
TEST_DATABASE_URL=postgresql://.../planner_test pnpm test:integration
pnpm test:coverage
pnpm build
pnpm audit --prod
pnpm test:e2e
```

Integration tests require a disposable database whose URL contains `test` or `ci`; the runner refuses any other database name. Browser CI covers Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari.

## Deployment

Deployment runs only after the CI workflow succeeds for the exact main-branch commit. It builds immutable application and migrator images, captures and verifies a database backup, applies migrations without suppressing errors, checks schema readiness, and rolls the application image back if the health check fails.

Use [`docs/operations/runbook.md`](./docs/operations/runbook.md) and [`docs/production-readiness/MIGRATION_DEPLOYMENT.md`](./docs/production-readiness/MIGRATION_DEPLOYMENT.md); do not deploy manually from an unverified working tree.

## Source documents

- [`STUDIOFLOW_MASTER_PROMPT.md`](./STUDIOFLOW_MASTER_PROMPT.md) — product and engineering source of truth
- [`PRODUCTION_READINESS_TRACKER.md`](./PRODUCTION_READINESS_TRACKER.md) — implementation and release tracker
- [`AGENTS.md`](./AGENTS.md) — mandatory agent protocol
- [`docs/production-readiness/`](./docs/production-readiness/) — parity, security, test, migration, UAT, and release evidence
- [`PORT_NOTES.md`](./PORT_NOTES.md) — approved self-hosting deviations

Private — LaraTik GmbH internal use only.
