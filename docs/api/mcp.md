# LaraTik Planner MCP

The planner exposes a production remote MCP endpoint at:

`https://planner.laratik.com/api/mcp`

The endpoint uses the MCP Streamable HTTP transport in stateless JSON mode.
Each request is authenticated with a LaraTik personal MCP access token:

```http
Authorization: Bearer lpm_<token>
Content-Type: application/json
```

Keep this reference, the route catalog, evaluation cases, tests, Account UI,
and production evidence synchronized. The mandatory change checklist is in
[`docs/operations/mcp-maintenance.md`](../operations/mcp-maintenance.md).

## Create and manage a token

Signed-in users create tokens from **Account → MCP access**. The plaintext
token is displayed once. The database stores only a SHA-256 digest, and every
token has an expiry, a scope set, last-use telemetry, and a revoke action.

Start with `Read planning data`. Grant `Change planning data` only to a token
used by a trusted automation. A token does not grant access by itself: every
tool call still runs the existing user, agency, workspace, role, and workflow
policy checks.

## Tools

| Tool                                 | Scope           | Purpose                                                                                                                                                                                                             |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `laratik_planner_list_workspaces`    | `content:read`  | List active internal workspaces available to the token owner; accepts optional `name_query` (1–120 chars, case-insensitive substring on `name` + `slug`) to resolve a single workspace UUID without paging 200 rows |
| `laratik_planner_list_content`       | `content:read`  | Filter and paginate planning items                                                                                                                                                                                  |
| `laratik_planner_get_content`        | `content:read`  | Read one item, selected channels, and assignment history                                                                                                                                                            |
| `laratik_planner_create_content`     | `content:write` | Create a draft using Quick Create rules; optionally write a validated format-specific `format_payload` in the same create operation                                                                                 |
| `laratik_planner_update_content`     | `content:write` | Update an editable draft or changes-requested item, including an optional validated format-specific `format_payload`                                                                                                |
| `laratik_planner_reschedule_content` | `content:write` | Change the planned publish date only                                                                                                                                                                                |
| `laratik_planner_change_owner`       | `content:write` | Reassign the coordinating owner                                                                                                                                                                                     |
| `laratik_planner_transition_content` | `content:write` | Run an explicit workflow transition                                                                                                                                                                                 |
| `laratik_planner_archive_content`    | `content:write` | Soft-archive one item; requires `confirm: true`                                                                                                                                                                     |
| `laratik_planner_duplicate_content`  | `content:write` | Create a new draft copy                                                                                                                                                                                             |
| `laratik_planner_export_brand_kit`   | `content:read`  | Read the full brand-kit (logos, colors, fonts, voice rules, publishing rules, linked resources, content pillars); logo binaries referenced by signed download URL                                                   |
| `laratik_planner_import_brand_kit`   | `content:write` | Apply a brand-kit envelope to a workspace; supports `merge`/`fail`/`overwrite` conflict strategies; logo binaries via `base64`, `source_url`, or `external_url`                                                     |

Write tools use the domain services already used by the web UI. The MCP
surface does not offer direct SQL, raw file access, publishing credentials,
social-provider credentials, or spreadsheet import.

### Structured content payloads

`laratik_planner_create_content` and `laratik_planner_update_content` accept
an optional `format_payload` object. It is validated and normalized by the
same per-format Zod schemas used by the Planner's **More details** editor;
unknown fields are discarded and invalid fields return a tool error. The
payload must include `schemaVersion: 1` or the service will normalize the
version to `1`.

The supported top-level fields depend on `format` (`caption`, `hook`,
`visualDirection`, `slideOutline`, `scenes`, `references`, and so on). The
`translations` map is also supported, but v1 accepts only `en` and `ar`, in
line with the product locale contract. Use `additionalNotes` or the source
caption to preserve source-plan text in other languages until those locales
are formally enabled.

Example carousel create:

```json
{
  "workspace_id": "<uuid>",
  "title": "New delivery area",
  "format": "carousel",
  "brief": "Explain the new delivery area and the customer action.",
  "planned_publish_at": "2026-09-21T17:00:00Z",
  "format_payload": {
    "schemaVersion": 1,
    "contentLanguage": "ar",
    "slideCount": 4,
    "caption": "…",
    "visualDirection": "…",
    "references": ["https://example.com/source"],
    "translations": { "ar": { "caption": "…" } }
  },
  "response_format": "json"
}
```

The create response includes `format_payload_written`; update responses use
the same flag. The returned content item from
`laratik_planner_get_content` includes the normalized `formatPayload`, which
is the read-after-write verification path for automations and imports.

## Brand-kit export and import

Two tools round-trip a brand-kit between LaraTik Planner instances. The
common pattern is `export_brand_kit` against the source workspace, then
`import_brand_kit` against the target workspace. Both tools reuse the
existing brand-service helpers (`src/lib/brand/service.ts`) so the actor,
agency, and workspace tenancy checks apply unchanged.

### `laratik_planner_export_brand_kit`

Input:

```json
{
  "workspace_id": "<uuid>",
  "include_archived": false,
  "include_logo_urls": true,
  "response_format": "json"
}
```

Output envelope:

```json
{
  "workspace_id": "<uuid>",
  "brand_assets": {
    "logos": [
      {
        "id": "<uuid>",
        "name": "primary",
        "external_url": null,
        "storage_path": "<workspaceId>/<fileId>.png",
        "storage_object_id": "<uuid>",
        "download_url": "https://planner.laratik.com/api/uploads/<fileId>?token=…&expiresAt=…",
        "archived_at": null
      }
    ],
    "colors": [
      {
        "id": "<uuid>",
        "name": "Brand Red",
        "hex": "#C8102E",
        "color_role": "primary",
        "archived_at": null
      }
    ],
    "fonts": [
      {
        "id": "<uuid>",
        "name": "Headline",
        "family": "Inter",
        "weight": 700,
        "role": "headline",
        "archived_at": null
      }
    ],
    "other": []
  },
  "voice_rules": [
    { "id": "<uuid>", "rule_type": "tone", "content": "warm but precise", "archived_at": null }
  ],
  "publishing_rules": [
    {
      "id": "<uuid>",
      "rule_type": "alt_text",
      "title": "Always describe the subject",
      "content": "…",
      "archived_at": null
    }
  ],
  "linked_resources": [
    {
      "id": "<uuid>",
      "provider": "figma",
      "name": "Brand library",
      "url": "https://figma.com/…",
      "description": null,
      "archived_at": null
    }
  ],
  "content_pillars": [
    { "id": "<uuid>", "name": "Education", "color": "#0EA5E9", "description": null }
  ]
}
```

`download_url` is generated via the storage helper
(`getSignedDownloadUrl`) and bound to the operator's signing secret. It is
short-lived (300 s default) and intended to be fed straight into
`import_brand_kit` on the receiving instance. Logos that were saved with
`external_url` only (no upload) keep the original URL and `download_url`
is `null`.

### `laratik_planner_import_brand_kit`

Input:

```json
{
  "workspace_id": "<uuid>",
  "conflict_strategy": "merge",
  "confirm": false,
  "logos": [
    {
      "name": "primary",
      "source_url": "https://planner.laratik.com/api/uploads/<fileId>?token=…&expiresAt=…",
      "mime_type": "image/png",
      "ext": "png"
    }
  ],
  "colors": [{ "name": "Brand Red", "hex": "#C8102E", "color_role": "primary" }],
  "fonts": [{ "name": "Headline", "family": "Inter", "weight": 700, "role": "headline" }],
  "voice_rules": [{ "rule_type": "tone", "content": "warm but precise" }],
  "publishing_rules": [
    { "rule_type": "alt_text", "title": "Always describe the subject", "content": "…" }
  ],
  "linked_resources": [
    {
      "provider": "figma",
      "name": "Brand library",
      "url": "https://figma.com/…",
      "description": "Source of truth"
    }
  ],
  "response_format": "json"
}
```

Logo binaries can be supplied three ways, mutually exclusive:

- `source_url` — server fetches the URL (HTTPS only), enforces a 10 MB
  cap and a 30 s timeout, writes the bytes via the local-volume storage
  adapter, and records the resulting `storage_path`.
- `base64` — server decodes the payload (raw or `data:` URL wrapper),
  enforces the same 10 MB cap, writes via the storage adapter.
- `external_url` — no binary fetched; the URL is recorded as-is.

Conflict strategies:

- `merge` (default) — skip duplicates by name (or
  `${rule_type}:${content}` for voice rules, `${rule_type}:${title}` for
  publishing rules, URL for linked resources). Idempotent.
- `fail` — throw on the first duplicate. Use when you want a clean
  diff before applying changes.
- `overwrite` — soft-archive the existing row, create the new one.
  Requires `confirm=true` because it is destructive.

Output envelope:

```json
{
  "created": {
    "logos": 1,
    "colors": 1,
    "fonts": 1,
    "voice_rules": 1,
    "publishing_rules": 1,
    "linked_resources": 1
  },
  "skipped": {
    "logos": ["secondary"],
    "colors": [],
    "fonts": [],
    "voice_rules": [],
    "publishing_rules": [],
    "linked_resources": []
  },
  "failed": []
}
```

Per-row failures (validation, fetch error, byte cap, manager-role
denied) are collected into `failed` so one bad logo does not abort the
whole import. The token owner must already be a workspace manager on
the target workspace — every `create_*` helper in
`src/lib/brand/service.ts` re-checks that role.

The maintenance contract forbids raw file access in the MCP surface.
Logo binaries move via signed download URLs rather than as opaque MCP
primitives, and the import tool persists them only through the same
`createLogoAsset` path that the UI uses.

## Operational contract

- Requests are limited to 120 per token per minute and receive `429` with a
  `Retry-After` header when the budget is exhausted.
- Tokens are rejected after expiry or revocation. Revocation is checked on
  every request.
- Production requests are accepted only for the planner host and same-origin
  browser requests. The route runs on Node.js because it uses Postgres and the
  official TypeScript MCP SDK.
- The server is stateless: clients must send the bearer token on every POST;
  no in-memory MCP session or resumability state is relied upon.
- Dates are ISO-8601 values. Use the exact workspace UUID returned by
  `laratik_planner_list_workspaces`; workspace slugs are display identifiers,
  not cross-tenant lookup keys.
- Tool results include both JSON structured content and a readable text
  representation. Pass `response_format: "markdown"` when a client needs
  human-readable output.

## Client wiring

A client is anything that wants to call this endpoint: the Mavis desktop
agent, a CI job, a personal automation. The wire contract is fixed — one
`POST` per JSON-RPC request, `Authorization: Bearer lpm_<token>` on every
request, no in-memory session state on the server.

Plaintext `lpm_…` tokens must never appear in source, fixtures, logs,
screenshots, URLs, spreadsheets, or shared chat. This rule is repeated in
[`docs/operations/mcp-maintenance.md`](../operations/mcp-maintenance.md)
and enforced by the maintenance checklist.

### Local shell wiring (Mavis desktop profile)

This is the recommended path for a developer machine or a personal Mavis
profile.

1. Mint a token from **Account → MCP access**. Pick the smallest scope set
   you need — `content:read` is the safe default; only add `content:write`
   when a trusted automation must mutate data.
2. Keep the plaintext out of every committed file. Reference it via a
   shell variable that exists only in the session that will hand it to the
   MCP client. `.env.example` ships an empty `MCP_ACCESS_TOKEN=` placeholder
   for this purpose; copy the line into your local `.env` / `.env.local`
   and fill it there. **Do not commit the filled value.**
3. Register the endpoint with the Mavis profile, injecting the bearer as
   a write-only `Authorization` header. Headers are stored by the local
   runtime and never echoed back, so the plaintext does not leak through
   subsequent `mcp` commands:

   ```bash
   mavis mcp create \
     --name laratik-planner \
     --transport streamable-http \
     --url https://planner.laratik.com/api/mcp \
     --headers "$(printf '{"Authorization":"Bearer %s"}' "$MCP_ACCESS_TOKEN")"
   ```

   The equivalent `mavis mcp update --headers …` is used to rotate without
   re-registering the server.

4. Verify with a single `initialize` + `tools/list` round-trip and revoke
   the token immediately if the smoke check fails or the work is finished.

### CI / automation wiring

For non-interactive environments, source the token from the platform's
secret store (GitHub Actions secret, GitLab masked variable, 1Password
CLI, etc.) and pass it through the same `mavis mcp create --headers …`
shape, or any other MCP client that accepts a bearer header. The
maintenance contract forbids logging or echoing the value at any point in
the pipeline.

### Rotation

Rotate by revoking the old token in **Account → MCP access** and minting
a replacement. There is no way to recover a forgotten plaintext; the
Account UI shows it once. After rotation, re-run `mavis mcp update` (or
the equivalent client setup) with the new value and verify a single
authenticated request before declaring the rotation done.

## Deployment and rollback

The endpoint ships in the normal planner application image. Migration `0046`
creates the token table and is applied by the existing production migrator
before the app is restarted. A deployment is not complete until the normal
health endpoint is green and an authenticated MCP `initialize` plus
`tools/list` smoke check succeeds. Roll back the application image and follow
the standard database rollback procedure if a migration or MCP smoke check
fails; do not delete the token table manually.

For future tool, scope, transport, token-lifecycle, or client-setup changes,
update this document in the same commit as the implementation and run the
maintenance checklist before release.
