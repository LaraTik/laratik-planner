# Community & Inbox architecture

Status: implemented foundation; provider operations and customer enablement remain blocked until external Meta UAT is complete.

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
and conversation history. The UI must show `unknown` until a capability has
been discovered and validated for the actual Meta login mode, account type,
permissions, and version.

The first release uses bounded polling and catch-up. Webhooks are represented
in the contract and schema but are not customer-enabled until provider UAT.
No publishing or autonomous provider action is included in this module.

## Delivery and safety state

Conversation identity is workspace-scoped and uses the provider root comment or
message identity, not only the post identity. Provider message IDs and
deterministic dedupe keys are unique within the workspace/provider scope.

Send attempts are at-least-once. `sent` is confirmed, `failed` is a confirmed
rejection, and `unknown` requires reconciliation before retry. A future
dispatcher must re-check workspace access, capability, mode, safety rules,
rate limits, and emergency stop immediately before dispatch.

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
