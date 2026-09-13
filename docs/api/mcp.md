# LaraTik Planner MCP

The planner exposes a production remote MCP endpoint at:

`https://planner.laratik.com/api/mcp`

The endpoint uses the MCP Streamable HTTP transport in stateless JSON mode.
Each request is authenticated with a LaraTik personal MCP access token:

```http
Authorization: Bearer lpm_<token>
Content-Type: application/json
```

## Create and manage a token

Signed-in users create tokens from **Account → MCP access**. The plaintext
token is displayed once. The database stores only a SHA-256 digest, and every
token has an expiry, a scope set, last-use telemetry, and a revoke action.

Start with `Read planning data`. Grant `Change planning data` only to a token
used by a trusted automation. A token does not grant access by itself: every
tool call still runs the existing user, agency, workspace, role, and workflow
policy checks.

## Tools

| Tool                                 | Scope           | Purpose                                                      |
| ------------------------------------ | --------------- | ------------------------------------------------------------ |
| `laratik_planner_list_workspaces`    | `content:read`  | List active internal workspaces available to the token owner |
| `laratik_planner_list_content`       | `content:read`  | Filter and paginate planning items                           |
| `laratik_planner_get_content`        | `content:read`  | Read one item, selected channels, and assignment history     |
| `laratik_planner_create_content`     | `content:write` | Create a draft using Quick Create rules                      |
| `laratik_planner_update_content`     | `content:write` | Update an editable draft or changes-requested item           |
| `laratik_planner_reschedule_content` | `content:write` | Change the planned publish date only                         |
| `laratik_planner_change_owner`       | `content:write` | Reassign the coordinating owner                              |
| `laratik_planner_transition_content` | `content:write` | Run an explicit workflow transition                          |
| `laratik_planner_archive_content`    | `content:write` | Soft-archive one item; requires `confirm: true`              |
| `laratik_planner_duplicate_content`  | `content:write` | Create a new draft copy                                      |

Write tools use the domain services already used by the web UI. The MCP
surface does not offer direct SQL, raw file access, publishing credentials,
social-provider credentials, or spreadsheet import.

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

## Recommended client setup

Configure the MCP client with the endpoint URL and the token as a secret
bearer header. Do not put the token in a repository, prompt, screenshot,
spreadsheet, URL, or shared chat. Rotate it by revoking the old token and
creating a replacement from the Account page.

## Deployment and rollback

The endpoint ships in the normal planner application image. Migration `0046`
creates the token table and is applied by the existing production migrator
before the app is restarted. A deployment is not complete until the normal
health endpoint is green and an authenticated MCP `initialize` plus
`tools/list` smoke check succeeds. Roll back the application image and follow
the standard database rollback procedure if a migration or MCP smoke check
fails; do not delete the token table manually.
