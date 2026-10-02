# Meedro MCP Connection → LaraTik Planner integration report

Date: 2026-10-02  
Source: authenticated Meedro web app, `https://app.meedro.com/mcp-connection`  
Status: live read-only capture plus LaraTik implementation preparation  
Audience: LaraTik Planner product, design, engineering, and AI-integration work

## Executive summary

Meedro presents MCP as a permission-first bridge from an AI client to its
research product. The page makes four promises before showing setup:

1. the assistant can read account data, search the viral library and ideas, and
   analyze trends;
2. the assistant cannot edit, publish, or access payment information;
3. the user can see connection status and revoke access;
4. the user can start with ready-made workflows and prompts.

This is a useful onboarding pattern for LaraTik, but LaraTik should retain its
existing personal-token, scope, role, workspace, workflow, and audit controls.
The recommended target is one provider-neutral MCP contract with client-specific
connection instructions for Claude, ChatGPT, and MiniMax. MiniMax must be kept
clear in the design: it may be an MCP client/agent, a server-side model provider,
or both. Those are separate trust boundaries.

No Meedro analysis, generation, connector setup, API-key creation, revocation,
or other credit-consuming action was performed. The inspected account showed
687 credits remaining.

## 1. Exact live Meedro page capture

### 1.1 Page positioning

**Heading:** `MCP Connection`

**Tagline:** `Turn Claude/ChatGPT into your Content Marketing Machine`

**Supporting text:**

> Give Claude, ChatGPT, or any AI assistant access to Meedro so it can find
> viral videos, write scripts, and manage your projects for you.

The page groups MCP under Meedro's `AUTOMATE / MCP` navigation and places the
connection surface beside `Workflows`.

### 1.2 Permission contract shown before setup

**Section heading:** `Meedro MCP Permissions`

Visible permissions:

- `Read your Meedro account data (analytics, content, competitors)`
- `Search viral library and content ideas`
- `Analyze trends and generate insights`
- `No access to editing, publishing, or payment info`

This is deliberately understandable to a non-technical user. It explains the
data the assistant can see and names the highest-risk actions it cannot perform.

### 1.3 Connection capacity and revocation

The live page displayed:

> You can revoke access at any time. 1 of 1 connections used You've used every
> connection on your plan. Disconnect one to connect another app.

This means the inspected account had a one-connection plan limit and already had
one connection in use. Treat this as an account-state observation, not as a
universal Meedro product rule.

### 1.4 Client tabs and inspected state

The tab group was labelled:

`Connect Meedro to Claude, Claude Code and ChatGPT`

The live state on 2026-10-02 was:

| Client tab  | State shown       | Notes                                      |
| ----------- | ----------------- | ------------------------------------------ |
| Claude      | `Not connected`   | Setup instructions available               |
| ChatGPT     | `Active recently` | `1 connected`; `Connected Oct 2, 2026`     |
| Claude Code | `Not connected`   | Terminal and `/mcp` instructions available |

The ChatGPT tab offered `Disconnect` and `Connect another device`. These are
account mutations and were not used during the inspection.

### 1.5 Claude setup instructions

**Heading:** `Connect Claude in a few steps`

**Step 1 — Copy the Meedro connector URL**

> You'll paste this URL into Claude in the next step.

```text
https://mcp.meedro.com/mcp
```

Button: `Copy`

**Step 2 — Go to Claude Connectors**

> Add a custom connector, name it Meedro, and paste the URL you copied.

Link: `Open Claude Connectors`  
Observed target: `claude.ai/customize/connectors?modal=add-custom-connector`

**Step 3 — Connect, sign in and start**

> Sign in, then ask Claude to use Meedro.

Link: `Analyze your first video`

The link prefilled this starter request:

```text
Use the Meedro MCP to analyze these two videos and tell me why they went viral:
https://www.instagram.com/p/DZXUbeGPBWp/
https://www.instagram.com/p/DXsJznEEsHp/
```

### 1.6 ChatGPT connected state

**Heading:** `ChatGPT is connected`

Visible state:

- `1 connected`
- `ChatGPT`
- `Active recently`
- `Connected Oct 2, 2026`

Visible controls:

- `Disconnect`
- `Connect another device`
- `Your API Keys`

Because the live account was already connected, the page did not show a fresh
ChatGPT setup wizard in this state. LaraTik should not infer a provider's exact
current connector UI from this one connected-state capture; validate ChatGPT's
current connector flow during implementation and keep the server contract
provider-neutral.

### 1.7 Claude Code setup instructions

**Heading:** `Connect Claude Code in a few steps`

**Step 1 — Add Meedro in your terminal**

> In your terminal, add the Meedro MCP server:

```bash
claude mcp add --transport http meedro https://mcp.meedro.com/mcp
```

Button: `Copy`

**Step 2 — Sign in to Meedro**

> Run `/mcp` inside Claude Code, pick Meedro, and sign in. `/mcp`

Button: `Copy`

**Step 3 — Connect, sign in and start**

> Restart Claude Code, then ask it to use Meedro.

No terminal command was run during the inspection.

### 1.8 API-key section

The page exposed the control:

`Your API Keys`

Accessible description:

> Personal keys for connecting Meedro to MCP clients. Revoke one anytime to cut
> off access.

Opening the section showed:

- `Create Key` disabled
- `Manual API keys are available on the Ultimate plan.`
- `Upgrade`

No key was created, copied, revealed, or revoked. The page therefore appears to
prefer an in-client sign-in connection for the inspected plan and reserves
manual API keys for a higher plan.

### 1.9 Starter prompts shown on the MCP page

**Section heading:** `What You Can Ask Meedro`  
**Helper text:** `Copy and use these prompts to get started.`

Visible actions/cards:

- `View all workflows`
- `Start here — Brand Voice — How do I talk, and how does my AI agent learn to sound like me?`
- `Understand content — The Teardown — Why did this video go viral?`
- `Understand content — The Batch Teardown — What do 10 winning videos have in common?`

The complete workflow text, hints, tool chains, and prompts are preserved in
[MEEDRO_WORKFLOW_CATALOG_2026-10-02.md](MEEDRO_WORKFLOW_CATALOG_2026-10-02.md).

## 2. What LaraTik should copy

### 2.1 Copy the information hierarchy

Use this order on LaraTik's MCP connection surface:

1. plain-language purpose;
2. permissions and exclusions;
3. current connection status and limit;
4. provider tabs;
5. short setup steps with copy controls;
6. starter workflow cards;
7. key management and revocation;
8. troubleshooting and support.

This lets an agency manager answer “what can this AI see and change?” before
connecting anything.

### 2.2 Copy the workflow entry point

MCP should not open as a blank technical integration. It should offer focused
recipes such as:

- build or review brand voice;
- inspect research and competitor signals;
- explain a winning post;
- compare a batch of winning posts;
- turn approved research into a draft brief;
- summarize the Command Center and suggest the next planning action;
- produce an English/Arabic content package without publishing it.

The recipe card must state its inputs, output, tool access, whether it writes a
draft, and the approval needed.

### 2.3 Do not copy the weak parts

- Do not make provider connection limits the permission model.
- Do not create a second token system beside LaraTik's existing personal MCP
  access tokens.
- Do not give an assistant hidden publishing or payment capability.
- Do not let a model write directly to the database or bypass domain services.
- Do not silently translate user-generated English or Arabic content.
- Do not treat a connector URL or a connected account as proof that analytics
  sync or external-service UAT is complete.

## 3. LaraTik target design for Claude, ChatGPT, and MiniMax

### 3.1 One server contract, three client experiences

The LaraTik MCP server should remain one provider-neutral endpoint:

```text
https://planner.laratik.com/api/mcp
```

The current endpoint uses Streamable HTTP and LaraTik personal access tokens.
The client-specific difference belongs in onboarding copy and authentication
adapters, not in duplicated business tools.

| Client                    | Intended connection experience                                                               | Authentication direction                                                                     | Implementation note                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude                    | Add a custom connector using the Planner endpoint, then sign in                              | OAuth/browser sign-in where supported; personal token fallback only when explicitly required | Show a copyable endpoint and a ready starter prompt                                  |
| ChatGPT                   | Add/connect the Planner connector from the current ChatGPT connector surface                 | Use the current supported connector authorization flow; verify the live UI before release    | Connected state must show account, workspace, scopes, last use, and revoke           |
| MiniMax as MCP client     | Add the Planner Streamable HTTP endpoint to the supported MiniMax agent/client configuration | Use the MiniMax-supported remote MCP auth mechanism; validate the exact product/version      | Do not hard-code an undocumented MiniMax UI or assume Claude's command syntax        |
| MiniMax as model provider | LaraTik calls MiniMax server-side for permitted AI capabilities                              | Server-side env-backed provider secret; never expose the key to browser or MCP client        | This is model routing, not an MCP connection, and needs separate quota/audit records |

### 3.2 Recommended permission contract

Show this before every connection. The exact final wording belongs in the EN/AR
catalogues, but the meaning should remain stable:

**The assistant may:**

- read the selected agency/workspace planning data;
- read approved brand-kit and voice guidance;
- read permitted research collections, saved observations, teardowns, and
  watchlists;
- read Command Center summaries and freshness metadata;
- generate research explanations, content suggestions, captions, hooks, and
  draft briefs through approved AI capabilities;
- create or update drafts only when the token scope, member role, workspace
  access, and tool-specific confirmation all permit it.

**The assistant may not by default:**

- publish or schedule content;
- send messages or alter social-provider credentials;
- access payment, invoices, secrets, raw OAuth tokens, or private media URLs;
- delete or archive content without an explicit destructive confirmation;
- bypass approval workflow, media readiness, or role gates;
- invent provider metrics or silently fill missing analytics;
- change the agency's AI capability policy.

### 3.3 Scopes and confirmation

Reuse the existing LaraTik MCP scopes:

| Scope                        | Use in the new connection UX                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `content:read`               | Default for all three clients; planning data, research, and brand kits within authorization |
| `content:write`              | Optional; draft creation/update and approved planning transitions only                      |
| `platform:diagnostics:read`  | Separate operational diagnostics domain; never bundled with content access                  |
| `platform:diagnostics:write` | Explicit operational triage only; never bundled with content write                          |

For high-impact tools, add a second confirmation even when `content:write` is
present. Examples: archive, transition to a review state, import/overwrite a
brand kit, or create a large batch of drafts. The confirmation must be explicit,
auditable, and visible in the client response.

### 3.4 Proposed provider-neutral tool groups

These are preparation recommendations, not claims that all tools already exist:

| Tool group                   | Read/write            | Safe first release                                                                                   |
| ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| Workspace and member context | Read                  | Resolve authorized workspace and role context without leaking unrelated workspaces                   |
| Planning and brand kit       | Read                  | Use existing planning and brand-kit tools                                                            |
| Research shelf               | Read                  | Use `laratik_planner_list_research` with bounded, workspace-scoped results                           |
| Command Center               | Read                  | Return period, account, freshness, sample size, partial-data state, and next action                  |
| Workflow recipes             | Read                  | List recipe metadata and return the prompt/contract without executing a write                        |
| Research-to-brief            | Write draft           | Create a draft only after user confirmation; preserve provenance and source links                    |
| AI generation                | Controlled write      | Route through existing capability allowlists, quota handling, and server-side provider configuration |
| Publishing                   | Not exposed initially | Keep publishing outside MCP until a separate product/security decision                               |

### 3.5 Recipe contract

Every recipe returned to Claude, ChatGPT, or MiniMax should carry the same
metadata:

```json
{
  "id": "research-to-brief",
  "title": "Turn approved research into a draft brief",
  "category": "create",
  "requires": ["workspace", "research_item"],
  "reads": ["research", "brand_kit"],
  "writes": ["draft_content_item"],
  "confirmation": "required",
  "publishes": false,
  "locales": ["en", "ar"]
}
```

The implementation should derive the actual response from existing domain
services and format-payload schemas. Do not introduce a second content model
just for AI clients.

## 4. Connection, key, and audit behavior

### 4.1 Connection record

The connection surface should show, for each provider/device:

- provider and client label;
- connected account;
- selected agency/workspace;
- granted scopes;
- connected at and last used at;
- current status: active, expired, revoked, or needs re-authentication;
- revoke/disconnect action;
- link to audit activity.

One connection per provider/device is a reasonable first UI default, but the
limit must come from configuration and plan policy rather than being encoded in
the MCP authorization logic.

### 4.2 Token and secret handling

Use the existing LaraTik behavior:

- display a plaintext personal token once;
- store only a SHA-256 digest;
- require expiry and scope selection;
- show last-use telemetry without exposing prompts or sensitive payloads;
- revoke immediately and make the state visible;
- never place MiniMax, OAuth, SMTP, or other provider secrets in client code;
- never include raw tokens in logs, screenshots, reports, or MCP responses.

The API-key panel should explain whether the current plan supports manual keys.
If not supported, show a disabled state and a safe upgrade explanation, as
Meedro does, while keeping in-client sign-in available where supported.

### 4.3 Audit events

Record at minimum:

- connection created, re-authorized, expired, and revoked;
- scope grant or change;
- tool name, workspace, actor, provider, and outcome;
- draft creation/update and user confirmation;
- AI capability, model/provider, quota result, and latency class;
- refusal reason for blocked publish, payment, secret, cross-workspace, or
  role-gated requests.

Persist technical/audit language as stable codes. Render English or Arabic user
copy at the page/client boundary.

## 5. MiniMax-specific preparation

### 5.1 Keep the two MiniMax roles separate

“MiniMax support” can mean two different products:

1. MiniMax connects to LaraTik as an MCP client and calls Planner tools.
2. LaraTik uses MiniMax's API as its server-side text/video model provider.

The first is an external-client authorization problem. The second is an agency
AI-provider configuration and quota problem. They must not share a browser
secret, token table, permission label, or audit event shape by accident.

### 5.2 If MiniMax is an MCP client

Provide:

- the same `https://planner.laratik.com/api/mcp` endpoint;
- a client-specific setup card once the exact MiniMax product/version is
  validated;
- OAuth or the provider-supported secure authorization mechanism;
- a copyable starter prompt;
- visible scopes and workspace selection;
- revoke and last-use status in LaraTik.

Do not document a guessed command or configuration key. Confirm the live MiniMax
MCP transport and authentication behavior during the implementation spike.

### 5.3 If MiniMax is the model provider

Expose MiniMax only through the server-side AI provider abstraction already
required by the Planner. The agency admin can configure capability access and
the provider can be selected server-side, but:

- the browser never receives `MINIMAX_API_KEY`;
- an MCP client never receives the provider credential;
- each generation records capability, actor, workspace, provider/model, and
  quota outcome;
- outputs remain drafts/suggestions unless a separate approved workflow writes
  them;
- English/Arabic content direction and translation storage follow the existing
  `formatPayload.translations` contract.

## 6. UX and bilingual requirements

The connection experience is an authenticated Planner surface and therefore
must ship in English/LTR and Arabic/RTL:

- use central message catalogues, not hard-coded component copy;
- use logical spacing and alignment;
- preserve readable Western digits for dates, counts, quotas, and timestamps;
- use content-driven direction for pasted URLs, commands, handles, emails,
  tokens, and prompts;
- keep setup commands and endpoint URLs visibly LTR inside Arabic UI;
- show translated permissions, connection states, error codes, and revoke
  confirmations;
- ensure keyboard access for tabs, copy controls, cards, and dialogs;
- test 375/768/1024/1280/1440+ layouts, loading, empty, expired, revoked,
  missing-scope, and provider-error states.

Suggested Arabic labels for editorial review:

| English                           | Draft Arabic wording      |
| --------------------------------- | ------------------------- |
| MCP Connection                    | اتصال MCP                 |
| Permissions                       | الصلاحيات                 |
| Connected                         | متصل                      |
| Not connected                     | غير متصل                  |
| Revoke access                     | إلغاء الوصول              |
| Read planning data                | قراءة بيانات التخطيط      |
| Create draft                      | إنشاء مسودة               |
| This action requires confirmation | يتطلب هذا الإجراء تأكيدًا |

These are draft catalogue values and require native editorial review before
shipping.

## 7. Rollout plan

### P0 — document and harden the existing contract

- Add this provider comparison and connection UX to the product reference.
- Keep `docs/api/mcp.md`, `docs/api/README.md`, MCP evaluation, Account UI, and
  maintenance checklist synchronized.
- Verify token expiry, revocation, scope enforcement, workspace isolation, and
  audit evidence at the exact clean commit.
- Add the permission-first connection page copy in EN/AR.

### P1 — research-first MCP experience

- Add a connection status surface with provider tabs.
- Add recipe cards for research, teardown, brand voice, and research-to-brief.
- Make read-only research the default.
- Add explicit draft confirmation and provenance to research-to-brief.
- Add bounded Command Center and Research Shelf read tools where the read model
  is already authorized.

### P2 — provider expansion and AI routing

- Validate the current ChatGPT and MiniMax connector flows.
- Add the MiniMax client adapter only after its transport/auth contract is
  confirmed.
- Add server-side MiniMax model routing behind agency capability controls.
- Measure successful connections, useful tool calls, draft conversion, refusal
  rate, and revocation/expiry behavior.

Publishing, payment operations, social credential changes, and automatic
high-volume generation remain outside the first MCP release.

## 8. Acceptance checklist

- [ ] Permission summary is visible before connection and has an Arabic version.
- [ ] Claude, ChatGPT, and MiniMax each have a setup card with verified current
      instructions; no guessed provider UI is shipped.
- [ ] Provider status distinguishes connected, expired, revoked, and re-auth.
- [ ] User can see workspace, scopes, last use, and revoke access.
- [ ] Default connection is read-only.
- [ ] Write tools require scope, role, workspace authorization, and confirmation.
- [ ] No MCP tool publishes, accesses payment data, returns secrets, or bypasses
      approval gates.
- [ ] MiniMax client access and MiniMax model-provider configuration are tested
      as separate flows.
- [ ] Existing LaraTik MCP endpoint, token storage, and domain services remain
      the single source of truth.
- [ ] EN/AR, LTR/RTL, keyboard, axe, loading, empty, error, and responsive
      evidence is captured at the exact clean HEAD.
- [ ] `docs/api/mcp.md`, `docs/api/README.md`, `docs/api/mcp-evaluation.xml`,
      tests, and production-readiness evidence are updated together.

## Related LaraTik references

- [Meedro feature audit → LaraTik Planner roadmap](MEEDRO_FEATURE_AUDIT_2026-09-30.md)
- [Meedro workflow catalog → LaraTik Planner preparation](MEEDRO_WORKFLOW_CATALOG_2026-10-02.md)
- [LaraTik Planner MCP reference](../api/mcp.md)
- [MCP API overview](../api/README.md)
- [MCP maintenance contract](../operations/mcp-maintenance.md)
- [Bilingual implementation contract](../i18n/CONTRACT.md)
