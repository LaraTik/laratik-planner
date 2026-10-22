# Module ownership and refactoring rules

This document defines how application code is grouped and when code belongs in
a shared module. It complements the runtime and data-flow description in
[`overview.md`](./overview.md), the authorization rules in
[`authorization.md`](./authorization.md), and the day-to-day conventions in
[`../contributing/conventions.md`](../contributing/conventions.md).

## Target organization

The App Router remains the route and transport layer. Feature behavior moves
gradually into `src/features/<feature>/`; platform-wide capabilities remain in
`src/lib/`; design primitives and genuinely cross-feature presentation remain
in `src/components/`.

```text
src/
  app/                 Next.js routes, layouts, loading/error surfaces, adapters
  features/<feature>/  feature UI, schemas, queries, commands, domain behavior, tests
    index.ts           client-safe feature entry point
    server.ts          optional server-only entry point for queries/commands
  components/          shared design primitives and cross-feature presentation
  lib/                 auth, database, i18n, security, storage, observability, integrations
```

Only add a file or subfolder when it has a real owner and responsibility. A
feature module may contain `components/`, `schemas.ts`, `queries.ts`,
`commands.ts`, `service.ts`, `types.ts`, and focused tests as needed; it does
not need empty placeholders for unused roles. Existing domain modules under
`src/lib/<domain>/` remain valid during migration. Each behavior must have one
canonical implementation; compatibility exports may forward to it temporarily.

## Ownership rules

- **Routes adapt and compose.** A page or route handler resolves route inputs,
  calls the appropriate feature query or command, and renders or serializes the
  result. It must not become a second owner of domain policy or persistence.
- **Features own product behavior.** A feature owns its validation contract,
  use cases, permissions specific to that feature, and feature-only UI. Tenant
  scope is explicit in every data operation. Shared authorization policy stays
  in the established auth modules.
- **Platform modules own cross-cutting behavior.** Database setup, auth
  context, localization, security headers, error reporting, storage adapters,
  and common transport helpers live in their existing platform areas.
- **Shared UI owns stable presentation contracts.** `src/components/ui/`
  contains low-level controls. Shared forms, tables, navigation, status, and
  feedback patterns belong in shared presentation modules only when multiple
  features use the same behavior and accessibility contract. Feature-specific
  composition stays with its feature. Route-specific server actions and their
  result state stay in route wrappers; pass the action and serializable state
  into shared presentation components instead of importing route modules.
- **Feature internals are private.** One feature imports another feature's
  documented exports through its `index.ts`, not its internal files.
  Cross-feature needs should use a stable shared module or a deliberate
  feature interface.
- **Client code receives serializable, least-privilege props.** Database
  clients, secrets, privileged actors, and server-only modules never cross into
  a Client Component. Keep the interactive client surface as small as the
  behavior allows.

## Import boundaries

- `src/app/` may import a feature's public `index.ts`, its explicit
  server-only `server.ts` entry point, shared presentation, and platform
  infrastructure. It must not reach into feature-private files or own domain
  rules in a route adapter. Keep `index.ts` client-safe; server-only data
  access belongs behind `server.ts` so importing a catalog into a Client
  Component cannot pull server modules into its bundle.
- `src/features/<feature>/` may import `src/components/` and platform
  capabilities from `src/lib/`. It must not import `src/app/`; cross-feature
  calls go through the other feature's documented public entry point.
- `src/components/` may depend on design primitives and platform-safe types or
  helpers, but not on routes or product feature modules. Feature-specific
  composition belongs in the feature.
- `src/lib/` owns platform and integration capabilities and must not depend on
  routes, feature modules, or presentation components.
- Persistence and provider clients stay behind server-only adapters. A client
  component receives serializable view data but cannot import those adapters.

These rules guide new code and incremental migrations. The unit suite includes
a static import-ownership guard for feature entry points and dependencies into
features from shared presentation or platform modules. Existing route/UI
action imports and platform presentation-type imports remain visible migration
work. The import guard records the exact legacy shared-component-to-route
imports and rejects new ones; remove an entry when its caller moves behind a
feature entry point or into its route owner. Migrate these imports in bounded
changes with focused regression coverage.

## Extraction and split rules

- Extract a shared module when the same responsibility appears in at least
  three places, or in two places when a shared invariant (such as tenant
  authorization, validation, accessibility, localization, or error mapping)
  must remain identical.
- Before extraction, compare semantics and failure behavior, not just markup
  or text. Give real variants explicit typed options; leave distinct workflows
  distinct.
- Apply the deletion test: deleting the proposed module should remove
  complexity from callers. If it only moves lines into a pass-through, do not
  extract it.
- Treat the master prompt's usual file-size guidance (roughly 200 lines for a
  React module and 300 for a domain module) as a review prompt, not an automatic
  split. Split when a module has separate reasons to change or obscures its
  interface.
- Do not add generic `utils.ts`, `helpers.ts`, or `common.ts` buckets. Name a
  module after the behavior or domain it owns.

## Trust, errors, and tests

- Validate untrusted input at every external seam: server actions, route
  handlers, provider callbacks, scheduled jobs, and inter-service requests.
- Server actions and route handlers repeat authentication and authorization
  checks; hiding a control in the UI is not an access check.
- Feature commands and services return the established structured result/error
  contracts. Translate stable domain codes at the UI, email, notification, or
  API presentation layer. Never return provider secrets or raw internal error
  bodies to clients.
- Keep authorization, workflow derivation, and transaction-sensitive behavior
  at one domain-owned seam. Persist material state, activity, audit, and outbox
  changes in the same transaction where the existing contract requires it.
- Test through the module's public interface. Use unit tests for pure rules,
  integration tests for database and transaction behavior, adapter tests for
  external services, and browser tests for route behavior and accessibility.
- A refactor must retain observable behavior. A confirmed bug fix is a
  separate change with a regression test that demonstrates the prior failure.

## Page quality contract

Every touched page must provide the states and contracts relevant to its task:
loading, empty, error, denied, and successful output; keyboard and screen-reader
access; semantic theme tokens; responsive layouts; EN/AR copy and RTL; and
role-appropriate actions. Reuse the established `PageHeader`, form, table,
status, and feedback patterns when their semantics match. Distinct workflows
must not be forced into one presentation merely for visual uniformity.

For localized UI, use the canonical message catalogs and i18n contract. Keep
data direction content-driven and preserve the workspace timezone and existing
route-level locale behavior.

## Incremental migration

1. Record the current route and dependency map and protect pre-existing work.
2. Select a bounded feature slice from the reviewed priority list.
3. Add or move one canonical implementation, updating its callers and tests in
   the same change. Keep a forwarding adapter only when it reduces risk.
4. Verify focused domain behavior and the required repository gates for the
   touched area. For UI, include bilingual, RTL, responsive, keyboard, a11y,
   and visual evidence. For database changes, use the migration evidence
   contract.
5. Remove compatibility adapters only after the dependency graph shows that
   callers have moved. Record deviations and remaining work in the tracker.

## Validation cadence

- During implementation, run the narrowest relevant unit, integration, or
  browser check after a behavior change. Do not rerun the full repository gate
  after each small edit.
- At a milestone, batch independent final checks once: formatting/lint/type/unit
  and build through `pnpm verify`, plus the service-specific checks required by
  the changed code. Run checks that mutate the same disposable database
  sequentially.
- Run the full five-browser and visual release suite once on the final code
  candidate. If that run exposes a code defect, fix it with focused regression
  coverage and rerun the affected browser area before repeating the release
  suite. Do not treat runner failures as product failures without an isolated
  reproduction.
- Documentation-only edits after code verification require formatting and
  diff checks; they do not invalidate unrelated code or persistence evidence.
  Record all evidence against the exact clean commit and keep `Tested` separate
  from independent `Verified` status.

No new package or public route, API, permission, workflow, or persisted-data
change is implied by this organization. Such changes require their existing
review, decision, and evidence process.
