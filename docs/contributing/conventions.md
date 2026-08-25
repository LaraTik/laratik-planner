# Coding conventions

> Companion to `AGENTS.md:232-238` (commit / branch / PR scope) and `docs/architecture/authorization.md` (the `(actor, agencyId)` pattern). This file lifts the day-to-day code patterns out of `AGENTS.md` Hard Rules so a new contributor has a single reference for the decisions that recur on every PR.

## 1. TypeScript strictness consequences

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. The day-to-day consequences are:

- **Indexed access returns `T | undefined`.** `arr[i]` is **never** a `T`. Always guard: `const item = arr[i]; if (!item) return ...` or use a non-null assertion only inside a guarded branch. ESLint flags `!` after indexed access; the guard is the only correct path.
- **Optional properties do not accept `undefined` explicitly.** If a prop is `optional: true` in a Zod schema, the resulting TypeScript type is `field?: string` (not `field: string | undefined`). Pass `omit` to remove the key, never `field: undefined`. The same rule applies to `Object.assign`, `{ ...obj, field: undefined }`, and React props.
- **Strict null checks are non-negotiable.** `if (value)` and `if (value !== null && value !== undefined)` are the only safe guards. The lint rule `no-unnecessary-condition` flags the rest.
- **Discriminated unions over optional fields.** Use `type: 'meta' | 'tiktok'` for variant surfaces; the type narrows correctly in `switch` and the build fails on a missing case.

If a third-party type does not survive strict mode, wrap it in `src/types/external.ts` with a `// @ts-expect-error` plus a one-line comment explaining the upstream issue. Do not relax the strictness flags for the whole project.

## 2. Server / component rules

The App Router is the surface. The decision rule is:

- **Server component (default)** — the file does not start with `"use client"`. Use for data loading, server-only auth gates, and any JSX that does not need interactivity. The server can `await` Drizzle queries, read cookies, and call `resolveActiveAgencyContext`.
- **Server action** — exported from a `"use server"` file or a `"use server"` function inside a server component. Use for mutations: form submits, button clicks that change DB state, and any side effect that must run on the server. Always returns a typed `Result<T, E>` from `src/lib/result.ts`; the client never sees an unhandled throw.
- **Client component** — the file starts with `"use client"`. Use only when the component needs state, effects, event handlers, browser APIs, or third-party React libraries that require it. A client component receives only the props it needs; never receives a `db` client, an `Actor` with privileged data, or a server-only helper.

**Rule of thumb:** start as a server component. Add `"use client"` only when the lint rule `react-hooks/exhaustive-deps` complains or the component needs `useState` / `useEffect`. If the component is a 30-line form, it is probably still a client component — the boundary moves down to the leaves.

**Server actions vs API routes:** prefer server actions for form submits inside the same origin; reserve `src/app/api/**` for webhook receivers (social OAuth callbacks, cron workers, external integrations). See `docs/contributing/adding-a-social-provider.md` for the provider-specific boundary.

## 3. Service vs command

Each domain under `src/lib/<domain>/` follows the `service.ts` + `command.ts` split:

- **`command.ts`** — pure data shapes (Zod schemas) for inputs and outputs. The `Command` is the request, the `Result` is the response. Commands never import `db`, `next/cache`, or `next/headers`. They are easy to unit-test.
- **`service.ts`** — the only place that touches `db`, `next/cache`, `next/headers`, or external services. The service takes a typed `Command` plus an `Actor` (and an `agencyId` for agency-scoped services), and returns a `Result<T, ServiceError>`. The service is the unit-test target; mock the DB via `tests/setup.ts`.

**The `command.ts` / `service.ts` split is enforced by code review.** A `command.ts` that imports `db` is a review-blocker. A `service.ts` that returns a raw object instead of a `Result` is a review-blocker. The split is what makes the unit test suite fast and the integration test suite focused.

For UI state machines, follow the same pattern: a `workflow.ts` (or `<domain>-state.ts`) for the state graph, a `service.ts` for the side effects. The content workflow is the canonical example (`src/lib/content/workflow.ts`).

## 4. The `(actor, agencyId)` pattern

Every helper that touches tenant data takes an `Actor` and an `agencyId` explicitly. The pattern is documented in `docs/architecture/authorization.md:75-90` and lifted to a general rule here:

- **No global `activeAgencyId()`.** It is gone for production code paths. A helper that needs the active agency gets it as an argument; the boundary (server action / route handler / page server component) is the only place that calls `resolveActiveAgencyContext`.
- **Helpers are agency-scoped or workspace-scoped, not both.** A helper that takes `(actor, agencyId)` is **agency-scoped** and may not silently cross to another agency. A helper that takes `(actor, workspaceId)` is **workspace-scoped** and must resolve the workspace's `agencyId` internally before any membership check.
- **No silent fallthrough on a denied result.** If the membership check fails, the helper returns `null` (or a `Result.err(...)`); it does not fall through to a fallback path. The chain is fail-closed; the caller decides what to do with the `null`.

The bootstrap path (`src/lib/auth/bootstrap.ts`) is the only surviving use of a global `activeAgencyId()` lookup, and it is marked `@deprecated`. It is not a model for new code.

## 5. The `formatPayload` jsonb rule

Format-specific structured fields (Hook, Main message, CTA, scenes, captions, references, etc.) live in `content_item.format_payload` (jsonb), not in new columns. The rule is `AGENTS.md:184-190` and is the only place those fields are allowed to live.

- **No new columns on `content_item` for these fields.** Adding a column duplicates the JSONB, breaks the format-driven UX, and forces a backfill migration.
- **Per-format schemas are the source of truth.** See `docs/content/format-payload-schemas.md`. The implementation derives from it; the schemas are versioned (`schemaVersion: 1`) and a future migration is the only way to introduce `schemaVersion: 2`.
- **The `brief` field is separate.** It is a one-line text intent. The `brief` and the `formatPayload` are independent: rewriting the brief for clarity does not reset creative's notes, and vice versa.

The same rule applies to any new jsonb-shaped surface: a new `*_settings` table, a new `*_metadata` jsonb column, a new `*_config` row. The schema is the source of truth; the jsonb is the storage; the service enforces the schema at the boundary.

## 6. Do not / always cheat sheet

A condensed version of the patterns above, mirroring the `AGENTS.md` Hard Rules but at the code-pattern level. Pair this with the per-migration author checklist in `docs/architecture/migrations.md:6`.

**Do not:**

- ❌ Use `arr[i]` without a guard. The type is `T | undefined`.
- ❌ Pass `undefined` for an optional prop. Use `omit` to remove the key.
- ❌ Read a global `activeAgencyId()` in production code. Pass it explicitly.
- ❌ Mix `db` access into a `command.ts`. The `service.ts` is the boundary.
- ❌ Return a raw object from a service. Use `Result<T, ServiceError>`.
- ❌ Add a column to `content_item` for a format-specific field. Use `formatPayload`.
- ❌ Use `next/dynamic` without a server-only guard when the dynamic import is server-only.
- ❌ Catch and swallow an error. Return a `Result.err` or re-throw with context.
- ❌ Open a transaction without an explicit `await tx.commit` (or `db.transaction(async (tx) => { ... })` block).
- ❌ Use `Date.now()` for a Drizzle journal timestamp. Pick a value manually.

**Always:**

- ✅ Start as a server component; add `"use client"` only when needed.
- ✅ Use server actions for form submits inside the same origin; reserve `src/app/api/**` for webhooks.
- ✅ Take an `Actor` and an `agencyId` explicitly in any helper that touches tenant data.
- ✅ Enforce per-agency and per-workspace boundaries at the service layer, not the UI layer.
- ✅ Test the service with a unit test that mocks the DB; test the boundary with an integration test against disposable Postgres.
- ✅ Run `pnpm verify` (format:check, lint, typecheck, unit, build) before pushing.
- ✅ Reference the goal number in the PR title and the gap audit ID when the work is part of a sweep.
- ✅ Record material deviations with reason, impact, security / data implications, and approval requirement.
- ✅ Preserve production identifiers / data. Every migration needs forward, compatibility, backup, and rollback evidence (see `docs/architecture/migrations.md`).
- ✅ Use `<type>(<scope>): <description>` for commit messages. Scopes: `db`, `auth`, `content`, `planning`, `workflow`, `discussions`, `deliveries`, `publishing`, `notifications`, `ai`, `infra`, `ci`, `deps`, `docs`, `architecture`, `operations`, `contributing`, `testing`.
