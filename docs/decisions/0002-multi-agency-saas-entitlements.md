# ADR 0002: Multi-agency SaaS entitlements

- Status: accepted
- Date: 2026-08-23
- Scope: M1–M2 multi-agency SaaS extension

## Context

The original StudioFlow specification assumes a single agency. LaraTik Planner must operate as a SaaS where a platform operator provisions multiple agencies and controls each agency's workspace, user, social-profile, storage, and AI capacity.

## Decision

Use a shared-schema multi-tenant model with explicit `agency_id` boundaries. Keep platform authority separate from agency membership. Represent commercial policy as plan templates plus per-agency replacement overrides, and represent consumption in dedicated counters.

All capacity reservations run inside the same transaction as the protected create operation. A per-agency/per-resource advisory transaction lock serializes concurrent allocations. Total and per-network social-profile capacity are reserved together. User capacity includes pending invitations. Monthly AI request/token counters and per-user daily request counters reset on UTC boundaries.

Agency creation provisions the organization, entitlement, first-admin membership or invitation, initial usage counter, and platform audit record in one transaction. Invitation email is attempted only after commit. Lifecycle operations are soft and recoverable; suspended or archived agencies cannot resolve an active tenant context.

## Consequences

- A platform administrator can manage agencies without automatically reading their content.
- Concurrent creates cannot exceed a finite entitlement.
- Lowering a limit below current usage preserves existing tenant data and marks the live state over-limit; only new allocations are blocked.
- `null` consistently means unlimited, not zero.
- Plan override submissions replace the prior override set, preventing stale limits from leaking across plan changes.
- Billing remains manual in v1; no payment provider or automatic suspension is added.

## Migration, compatibility, and rollback

Migrations `0007`–`0011` are additive. Existing agencies receive an Enterprise-compatible plan and reconciled counters. The application remains compatible with existing tenant identifiers and rows. Rollback is application-first: deploy the prior image while retaining the additive tables/columns. Destructive schema rollback requires a verified backup and separate approval because entitlement audit and usage history are production evidence.
