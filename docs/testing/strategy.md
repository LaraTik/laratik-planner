# Testing strategy

> Per master prompt §20. Five test layers, each with a clear scope, fixture strategy, and CI gate.

## Test pyramid

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲          Playwright (chromium + mobile-chrome)
                 ╱──────╲         + @axe-core/playwright (a11y)
                ╱        ╲
               ╱Integration╲      Vitest + real Postgres test container
              ╱──────────────╲
             ╱                ╲
            ╱  Component       ╲   Vitest + Testing Library + jsdom
           ╱────────────────────╲
          ╱                      ╲
         ╱     Unit / domain      ╲  Vitest (pure)
        ╱──────────────────────────╲

```

| Layer       | Tool                             | Scope                                                   | Speed | Where it runs                           |
| ----------- | -------------------------------- | ------------------------------------------------------- | ----- | --------------------------------------- |
| Unit        | Vitest                           | Domain logic, Zod schemas, pure functions               | < 1s  | Local + CI                              |
| Component   | Vitest + Testing Library + jsdom | shadcn primitives, form components                      | < 5s  | Local + CI                              |
| Integration | Vitest + Postgres test container | DB queries, Drizzle schema, authorization helpers       | < 30s | Local + CI                              |
| E2E         | Playwright                       | Full user flows (signin, create content, submit review) | < 60s | Local + CI (smoke) + manual pre-release |
| A11y        | @axe-core/playwright             | Every page, WCAG 2.2 AA                                 | < 60s | Local + CI                              |

## Commands

```bash
pnpm test                # vitest watch (unit + component + integration)
pnpm test:unit           # vitest run, no watch
pnpm test:coverage       # with v8 coverage report

# E2E
pnpm test:e2e            # Playwright (boots dev server first via webServer)
pnpm test:e2e:run        # Chromium only, no dev-UI
pnpm test:e2e:ui         # Playwright UI mode (local only)
pnpm test:e2e:smoke      # public + auth-gate + health (fast, ~3s)
pnpm test:e2e:public     # public.spec.ts only
pnpm test:e2e:auth       # auth-gate.spec.ts only
pnpm test:e2e:workspace  # workspace.spec.ts only
pnpm test:e2e:content    # content-flow.spec.ts only
pnpm test:a11y           # Playwright grep @a11y

pnpm verify              # format:check + lint + typecheck + test:unit + build
```

## E2E auth bypass (dev-only)

The Playwright suite needs to bypass Google OAuth + Mailcow magic-link to run in CI. The test fixtures are wired through three dev-only API endpoints — all guarded by `NODE_ENV !== "production"` (in the route handler AND the proxy allowlist):

| Endpoint                 | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `POST /api/dev/seed`     | Idempotent: creates a test agency + workspace + 3 channels + admin user |
| `POST /api/dev/sign-in`  | Sets the `authjs.session-token` JWT cookie for a given email            |
| `POST /api/dev/sign-out` | Clears the cookie                                                       |

Use them via `bootstrapTestSession(page)` in `tests/e2e/_helpers.ts` — that single call seeds + signs in, ready for the `/app/*` shell.

## Per-feature fixture strategy

Each `src/features/<feature>/` directory has a colocated `__fixtures__/` folder with typed builders. Fixtures write to the **integration test database** (a real Postgres, not a mock), and are wrapped in a transaction that rolls back at the end of the test.

```ts
// src/features/content/__fixtures__/index.ts
export const makeContentItem = (overrides: Partial<ContentItem> = {}): ContentItem => ({
  id: crypto.randomUUID(),
  workspaceId: "ws_test",
  title: "Test post",
  status: "draft",
  format: "static_post",
  // ... all required fields with sensible defaults
  ...overrides,
});
```

## Coverage targets

| Layer                         | Target | Current       |
| ----------------------------- | ------ | ------------- |
| Domain logic (pure functions) | 95%    | n/a (Goal 1+) |
| Components (UI primitives)    | 80%    | n/a           |
| API routes                    | 90%    | n/a           |
| Authorization helpers         | 100%   | n/a           |
| E2E happy paths               | All    | n/a           |

`pnpm test:coverage` produces an HTML report in `./coverage/index.html`. CI uploads the report as a workflow artifact (no Codecov for v1).

## CI gates

`.github/workflows/ci.yml` runs on every push + PR:

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check` (Prettier)
3. `pnpm lint` (ESLint, `--max-warnings=0`)
4. `pnpm typecheck` (`tsc --noEmit`)
5. `pnpm db:generate` + `pnpm db:migrate` (against the test Postgres)
6. `pnpm test:unit --reporter=verbose` (Vitest with the test Postgres)
7. `pnpm build` (Next.js standalone)
8. `docker build` (catches Dockerfile regressions)
9. Smoke `/api/health` against the built image

Merge to `main` is blocked if any step fails. Per master prompt §0.21, "a passing smoke test, or successful build, is not the finished product" — these gates catch regressions, they don't certify correctness.

## What's NOT covered (yet)

- **Visual regression** — defer to Goal 12 (Chromatic / Percy add significant cost; skip until the design is stable)
- **Load testing** — defer until the app is in production with real traffic
- **Penetration testing** — defer to a future audit cycle (out of scope for the initial build)
- **Mobile native** — out of scope per master prompt §2 (no native iOS / Android in v1)

## Determinism

All timestamps in fixtures are frozen. All UUIDs are deterministic (`uuidv5` with a per-test namespace). All LLM calls (Goal 11) are mocked. CI runs against a fixed `seed.sql` snapshot, not a live Supabase.
