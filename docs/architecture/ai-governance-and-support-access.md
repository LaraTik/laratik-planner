# M3 — AI governance and controlled support access

> **Status:** complete on `feat/m3-ai-governance-and-support-access` (2026-08-24).
> **Source spec:** `STUDIOFLOW_MASTER_PROMPT.md` §4 (Milestone 3).
> **Architecture plan:** `docs/m3-ai-governance-support/PLAN.md`.

This document is the read-side companion to the M3 service
modules. It describes how the AI capability intersection, the
per-user daily AI budget, and the ticketed support-access
workflow fit together. The implementation details live in
`src/lib/ai/governance.ts` and `src/lib/support/access.ts`.

## 1. AI governance

### 1.1 Capability intersection

The platform exposes six AI capabilities defined in master
prompt §15. An agency can use a capability only when:

- the agency admin has enabled it on the agency's
  `ai_feature_settings.enabled_capabilities` row, AND
- the agency's plan template allows it via
  `default_limits.enabled_capabilities`.

The intersection is the resolved set. The route
`/api/ai/generate` calls `loadEnabledCapabilities(agencyId)` to
load the set once per request; any capability not in the set
returns 403. The agency can never widen the intersection
beyond the plan ceiling — this is the §15 contract.

### 1.2 Per-user daily budget

The agency's `daily_ai_requests_per_user` plan limit (or
override) caps the number of AI requests a single user can
make in one UTC calendar day. The budget is enforced inside
the same transaction as the monthly reservation, so concurrent
requests from the same user cannot exceed the cap.

The counter is `ai_daily_budget_usage` (PK
`agency_id, user_id, usage_date`). The service UPSERTs the
counter with `+1` per request; if the post-update count
exceeds the cap, the transaction rolls back and the route
returns 429 with the `LimitExceededError` payload.

The route never writes to `ai_daily_budget_usage` outside
`enforceAiBudget`; the counter is a request-count, not a
token-count, and is intentionally not touched by
`recordUsage` (which only adjusts the monthly token
counters).

### 1.3 Token reconciliation

The provider response carries actual `input_tokens` and
`output_tokens` counts. The service reserves an estimate
(roughly `prompt.length / 4` input, capped `output_tokens`).
After the provider responds, `reconcileAiBudget` is called
once with the actual counts:

- positive delta (over-estimate): reserve additional capacity
  via `reserveCapacity` (which uses the agency-scoped
  advisory lock to serialize concurrent reservations).
- negative delta (under-estimate): refund the unused tokens
  via `recordUsage` (negative delta).

The reconciliation is idempotent. The daily counter is not
touched (a request always counts as 1, regardless of tokens).

## 2. Support access workflow

### 2.1 State machine

```
                 ┌─────────────────┐
                 │   pending        │
                 └─────────────────┘
                       │  │
        ┌──────────────┘  └──────────────┐
        │ agency admin approves          │ agency admin rejects
        ▼                                 ▼
  ┌─────────────────┐                ┌─────────────────┐
  │   approved       │                │   rejected       │
  │ (grant row written)               │ (no grant)       │
  └─────────────────┘                └─────────────────┘
        │
        │  grant revoked by either party
        ▼
  ┌─────────────────┐
  │   (revoked)      │  ← grant row stays for audit; gate returns null
  └─────────────────┘
        │
        │  grant expires (expires_at <= now)
        ▼
  ┌─────────────────┐
  │   expired        │  ← request status flipped; gate returns null
  └─────────────────┘
```

The `support_access_request.status` column is the source of
truth for the platform console's "My requests" / "Open
requests" lists. The `support_access_grant.revoked_at` +
`expires_at` columns are the source of truth for the
`isSupportAccessActive` gate.

### 2.2 Authority

- **Platform admin authority** is required to file a request
  (`createSupportAccessRequest` calls `requirePlatformAdmin`).
  Platform admin authority is _not_ a back door to tenant
  content; the request must be approved by an agency admin.
- **Agency admin authority** is required to decide a request.
  The service calls `isAgencyAdmin(actor, targetAgencyId)`.
  A cross-agency attempt is rejected.
- **Either side** can revoke: the platform admin who asked,
  the agency admin who approved, or any platform admin
  (incident response).

### 2.3 The gate

`findActiveSupportAccessGrant({ actor, targetAgencyId,
scopeWorkspaceId, metadataOnly })` is the only function every
tenant view calls before surfacing tenant data. It returns
the active grant row (or null) by:

1. Filtering `support_access_grant` by
   `granted_to_user_id = actor.id`,
   `target_agency_id = agencyId`,
   `revoked_at IS NULL`,
   `expires_at >= now()`.
2. Walking the rows in `activated_at DESC` order and
   returning the first one whose scope covers the request.

The caller is responsible for the audit row via
`recordSupportAccessAudit` (or the `authorizePlatformTenantView`
wrapper that bundles the two).

### 2.4 Audit contract

`support_access_audit` is the append-only audit table. The
BEFORE UPDATE / BEFORE DELETE trigger installed in migration
0012 raises an exception on any change after insert. The
service records:

- request creation (`support.request.create`).
- approval / rejection (`support.request.approve`,
  `support.request.reject`).
- grant revocation (`support.grant.revoke`).
- every view attempt, with success / denied / failed outcome
  (`support.view`).
- download attempts (`support.download.allowed`,
  `support.download.denied`).

No prompt / response bodies, no tenant content. The metadata
JSONB is intentionally narrow: route, request id, scope
flags.

### 2.5 Persistent banner

Every page rendered while a platform admin holds an active
grant shows a banner naming the target agency, the remaining
time, and the download state. The banner is rendered by the
`(app)` layout's `AppShell` wrapper. The layout re-queries
the active grants on every request; revocation reflects in
the next render without any client-side state.

## 3. Interaction with M1 / M2

- M1.1's `platform_administrator` table is the only place
  platform authority lives. M3 does not introduce a new
  authority model.
- M1.7's `agency` table no longer enforces a singleton. M3
  relies on this; the agency id flows through every query.
- M2.4's transactional quota enforcement is the foundation
  for `enforceAiBudget`. M3 adds the per-user daily counter
  on top of it.
- M2.5's atomic Add-Agency flow is preserved unchanged. New
  agencies start with the same Enterprise-compatibility plan
  and reconcile counters (per migration 0011). The support
  access surface is available immediately.
- M2.7's `platform_audit_event` table is unchanged. M3 adds
  `support_access_audit` as a separate, narrower audit log
  for support access (so the platform console's "My recent
  views" query does not pollute the platform audit timeline).

## 4. Failure modes

- AI provider returns no text → reservation is rolled back
  (the route's `catch` block calls `recordUsage` with the
  negative delta on the input + output counters; the daily
  counter is rolled back via the outer transaction).
- Two platform admins file requests for the same agency at
  the same time → no race; each request is independent, the
  agency admin decides each one separately.
- Agency admin approves a request, then the platform admin
  who asked revokes the grant → the grant is now
  `revoked_at IS NOT NULL`; the request status stays
  `approved` (the request was approved; the grant was later
  revoked). The `isSupportAccessActive` gate returns null.
- A platform admin is removed (revoked) while holding a
  grant → the grant stays valid (the `granted_to_user_id` FK
  is `ON DELETE RESTRICT`); the new platform console surfaces
  will surface this as a stale grant. The `isPlatformAdmin`
  check on the layout's banner render will hide the banner
  (the grants list is fetched only when the actor is a
  current platform admin).
- A support_access_audit row is updated outside the trigger
  → the trigger raises an exception; the application never
  has a code path that does this. The integration test
  documents the expected behaviour.
