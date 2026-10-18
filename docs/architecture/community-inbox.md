# Community & Inbox architecture

Status: implemented foundation; customer enablement remains gated by the Meta
permission grant, provider UAT, and production-readiness evidence.

## Authority and rollout

The product plan and design package define the Community & Inbox workflow and
screen composition. LaraTik routing, shell, tokens, authorization,
localization, and production-readiness rules are authoritative for the
implementation. The module is fail-closed for existing agencies:

1. The effective agency plan must include `community_inbox`.
2. An agency administrator must enable the module.
3. A workspace manager must enable the individual workspace.

The agency and workspace switches are stored independently. A switch cannot
grant access when the preceding gate is missing. The sidebar is exposed only
after the plan and agency gates pass; the route still evaluates all three
gates server-side.

## Provider boundary

Community messaging is not an extension of the analytics adapter. The
provider contract in `src/lib/community/provider.ts` requires capability
discovery for comments, private messages, replies, webhooks, media context,
and conversation history. The Meta connection flow requests analytics scopes
and the explicit Community scopes (`pages_manage_engagement`,
`pages_manage_metadata`, `pages_messaging`, `instagram_manage_comments`, and
`instagram_manage_messages`). A customer must reconnect after the Meta app has
the relevant permissions approved; an existing analytics-only grant does not
gain messaging access automatically.

Capability validation combines the persisted granted-scope set with a live,
non-mutating endpoint check. An operation is not shown as available merely
because the OAuth dialog requested its scope. Webhooks remain gated until the
callback subscription and operational UAT are complete.

The first release uses bounded polling and catch-up. Webhooks are represented
in the contract and schema but are not customer-enabled until provider UAT.
Human public comment replies and private-message replies now use the dedicated
Meta messaging adapter after a capability check; autonomous provider action
and publishing remain excluded from this module.

The operator runbook for Facebook Messenger approval, reconnect, capability
validation, controlled read/reply UAT, and unknown-outcome reconciliation is
[`docs/production-readiness/COMMUNITY_INBOX_UAT.md`](../production-readiness/COMMUNITY_INBOX_UAT.md).

## Delivery and safety state

Conversation identity is workspace-scoped and uses the provider root comment or
message identity, not only the post identity. Provider message IDs and
deterministic dedupe keys are unique within the workspace/provider scope.

Send attempts are at-least-once. `sent` is confirmed, `failed` is a confirmed
rejection, and `unknown` requires reconciliation before retry. The human reply
service re-checks workspace access, capability, safety rules, and emergency
stop immediately before dispatch, and uses a workspace-scoped deterministic
idempotency key to prevent duplicate sends.

AI Assist creates drafts only. Playbooks and knowledge must carry ownership,
approval, revision, expiry, and stale-source state. Test Lab is simulation
only. Controlled Auto and provider sending remain disabled until controlled
UAT and independent production-readiness verification.

## Persistence

Migration `0086_lyrical_night_thrasher.sql` adds the module switch, workspace
settings, provider capability/sync state, conversation/message/draft/send
attempt/event records, routing/playbook/automation records, and test-case
records. All records carry workspace scope; provider-facing records carry
provider identifiers and safe dedupe or idempotency fields.

The migration also captures pre-existing schema drift that had no snapshots in
the repository's manually maintained migration history. That drift must be
included in migration-drill evidence before release; it is not a reason to
enable Community & Inbox early.
