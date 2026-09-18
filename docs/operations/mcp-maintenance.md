# Remote MCP maintenance contract

This document keeps the LaraTik Planner remote MCP surface synchronized as it
evolves. It applies to the production endpoint at
`https://planner.laratik.com/api/mcp` and to every future MCP tool, scope,
transport, authentication, or Account-page change.

This is the **Planner MCP**, not the Google Stitch design MCP or the Meta
Developer Tools MCP. Those integrations have separate contracts:
[`docs/visual-parity/MCP.md`](../visual-parity/MCP.md) and
[`docs/operations/meta-devtools-mcp.md`](./meta-devtools-mcp.md).

## Source-of-truth map

Keep every row in sync in the same commit when its contract changes.

| Concern                                                                                                                                                                                                 | Authoritative implementation                                                                                                                                                                                     | Required companion documentation / evidence                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP transport, host/origin policy, authentication response, rate-limit entry                                                                                                                           | [`src/app/api/mcp/route.ts`](../../src/app/api/mcp/route.ts)                                                                                                                                                     | [`docs/api/mcp.md`](../api/mcp.md), [`docs/api/README.md`](../api/README.md), `tests/e2e/mcp-auth.spec.ts`                                                     |
| Tool names, input schemas, scopes, result shapes, and domain delegation                                                                                                                                 | [`src/lib/mcp/server.ts`](../../src/lib/mcp/server.ts)                                                                                                                                                           | [`docs/api/mcp.md`](../api/mcp.md), [`docs/api/mcp-evaluation.xml`](../api/mcp-evaluation.xml), unit/integration coverage                                      |
| Brand-kit export / import tools (`laratik_planner_export_brand_kit`, `laratik_planner_import_brand_kit`) — JSON envelope + signed logo URLs, conflict strategies, byte caps                             | [`src/lib/mcp/server.ts`](../../src/lib/mcp/server.ts) brand-kit helpers, [`src/lib/brand/service.ts`](../../src/lib/brand/service.ts), [`src/lib/storage/index.ts`](../../src/lib/storage/index.ts) `writeFile` | [`docs/api/mcp.md`](../api/mcp.md) `## Brand-kit export and import`, evaluation cases 11–17, integration coverage in `tests/integration/mcp-brand-kit.test.ts` |
| Workspace resolver — `list_workspaces` accepts an optional `name_query` (1–120 chars, ILIKE on `name` + `slug`, ESCAPE-wrapped) so a caller can resolve a single workspace UUID without paging 200 rows | [`src/lib/mcp/server.ts`](../../src/lib/mcp/server.ts) `laratik_planner_list_workspaces` handler                                                                                                                 | [`docs/api/mcp.md`](../api/mcp.md) Tools table, evaluation cases 18–19, integration coverage in `tests/integration/mcp-brand-kit.test.ts`                      |
| Token format, hashing, expiry, revocation, and last-use telemetry                                                                                                                                       | [`src/lib/mcp/tokens.ts`](../../src/lib/mcp/tokens.ts)                                                                                                                                                           | Account UI/actions, security notes in [`docs/api/mcp.md`](../api/mcp.md), token tests                                                                          |
| User-facing creation and revocation flow                                                                                                                                                                | [`src/app/(app)/app/account/mcp-access-tokens-card.tsx`](../../src/app/%28app%29/app/account/mcp-access-tokens-card.tsx) and `actions.ts`                                                                        | English/Arabic catalog keys, `tests/unit/mcp-access-tokens-card.test.tsx`, live Account-page review                                                            |
| Token table and migrations                                                                                                                                                                              | [`src/lib/db/schema.ts`](../../src/lib/db/schema.ts), `src/lib/db/migrations/`                                                                                                                                   | [`docs/production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md), migration drill, backup/rollback evidence              |
| Client-side wiring pattern (no-plaintext rule, `mavis mcp create` recipe, `.env.example` placeholder)                                                                                                   | n/a (documentation only)                                                                                                                                                                                         | [`docs/api/mcp.md`](../api/mcp.md) `## Client wiring`, [`.env.example`](../../.env.example) `MCP_ACCESS_TOKEN=`                                                |

When implementation and documentation disagree, inspect the source first,
correct the documentation in the same change, and add or update a regression
test where the mismatch could recur.

## Changes that require a synchronized update

Before merging any MCP change, update all affected surfaces below. Do not let a
new tool, scope, error, or client requirement exist only in code.

- Add or remove the tool in `src/lib/mcp/server.ts`, `docs/api/mcp.md`, and
  `docs/api/mcp-evaluation.xml`.
- When a planning write tool changes its content contract, keep the
  corresponding domain-service schema, normalized response fields, API docs,
  evaluation cases, and integration coverage synchronized. In particular,
  `format_payload` must always be validated by the per-format content service;
  MCP must never write the JSONB column directly.
- Keep tool descriptions, required scopes, input constraints, response fields,
  confirmation requirements, and error codes identical across source and docs.
- Update `docs/api/README.md` whenever the route method, path, auth gate,
  request/response contract, error behavior, or rate-limit scope changes.
- Update `src/lib/mcp/tokens.ts`, Account actions, the Account card, and the
  English/Arabic account catalogs when token scopes, expiry, lifecycle, or
  user-facing copy changes.
- Add a migration and production-readiness evidence when persistence or token
  lifecycle data changes. Never edit production token rows manually as a
  substitute for a migration or service change.
- Update `tests/e2e/mcp-auth.spec.ts`, unit/integration tests, and the matching
  evaluation cases. Security-sensitive behavior must be tested at the route
  boundary and at the domain-service boundary where practical.
- Update this maintenance contract when the source-of-truth map, release
  procedure, client setup, or security model changes.

## Compatibility and security rules

- Preserve the endpoint URL and bearer-token contract unless a deliberate
  migration plan documents the compatibility window.
- Treat `content:read` as the least-privilege default. Any write capability
  must remain explicit, scope-checked, and limited by the existing actor,
  agency, workspace, role, and workflow policies.
- Never store or print a plaintext `lpm_…` token in source, fixtures, logs,
  screenshots, URLs, spreadsheets, or shared chat. The Account UI displays it
  once; the database stores only its digest.
- Do not add direct SQL, raw file access, publishing credentials,
  social-provider credentials, or a bypass around existing domain services to
  the MCP surface.
- Preserve stateless transport behavior: clients send the bearer token on
  every POST, and unsupported methods continue to return the documented
  response.
- If a tool changes data, require an explicit confirmation field for
  destructive or irreversible behavior and document the idempotency/retry
  expectation.

## Verification checklist

Run the narrow checks first, then the normal release gates. Use a disposable
database for tests; never point test commands at production.

1. Review the source/docs diff against the source-of-truth map above.
2. Run formatting, lint, typecheck, targeted MCP tests, and the catalog parity
   test:

   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm vitest run tests/unit/mcp-access-tokens-card.test.tsx tests/unit/i18n/catalogs.test.ts
   ```

3. Run the full required verification for the repository:

   ```bash
   pnpm verify
   pnpm migration-drill       # required when schema/migrations changed
   pnpm test:integration      # required when service/auth/data behavior changed
   ```

4. Run the MCP transport and UI checks through the repository’s isolated
   Playwright setup. For production-like verification, create a temporary
   token only through the Account page, use it for `initialize` and
   `tools/list`, and revoke it immediately afterward. Never paste that token
   into a command that will be committed or logged.
5. Confirm the public boundary after deployment:

   ```bash
   curl -fsS https://planner.laratik.com/api/health
   curl -sS -i -X POST https://planner.laratik.com/api/mcp \
     -H 'content-type: application/json' --data '{}'
   curl -sS -i -X GET https://planner.laratik.com/api/mcp
   ```

   The first command must report `db: "up"` and `schema: "ready"`; the
   unauthenticated POST must return `401` with `WWW-Authenticate: Bearer`, and
   GET must remain `405` with `Allow: POST`.

6. Verify the exact deployed SHA in `/api/health`, the CI deploy job, and the
   Account-page Application information before calling the change complete.

## Release and rollback

MCP code and docs ship in the normal planner image. A schema change also
requires the standard backup, forward migration, compatibility, rollback,
from-zero, and upgrade evidence. Deployment is complete only after the exact
SHA is healthy and the authenticated MCP smoke check succeeds.

If an MCP smoke check fails, stop client rollout, inspect the deployment and
migration evidence, and use the standard application-image rollback procedure.
Do not drop the token table, delete tokens in bulk, or bypass authentication
to make a smoke check pass. Record the incident and update this document if
the failure reveals a missing maintenance rule.
