# ADR 0010 — Meta publishing readiness foundation

Date: 2026-09-04
Status: accepted for implementation, live publishing disabled

## Context

LaraTik Planner already supports read-only Meta analytics through Facebook Login
for Business. It discovers managed Facebook Pages and linked Instagram
professional accounts, encrypts credentials, and stores channels with stable
external IDs. Its current publishing package is editorial and manual: it
stores platform payloads, approvals, and delivery references but does not call
Meta.

Direct Meta publishing requires extra permission health, provider-specific
format validation, externally fetchable media, asynchronous processing, and
idempotent attempts. A generic connected badge or the existing publication
record cannot represent these states safely.

## Decision

- Keep Facebook Login for Business as the first unified Meta connection mode
- Support managed Facebook Pages and Instagram professional accounts only
- Add a normalized per-channel capability record for analytics and publishing
- Add provider readiness fields to the per-agency Meta configuration
- Add a workspace-level publishing switch with a server-side environment kill
  switch defaulting to off
- Keep creative fields in `format_payload` and per-channel overrides in
  `platform_payload`
- Do not enable live provider mutation until media delivery and Meta sandbox/
  App Review evidence exists
- Preserve manual publishing as the fallback
- Keep provider execution jobs and attempts as a later milestone after the
  readiness foundation is verified

## Consequences

The UI can distinguish analytics-only, not configured, awaiting approval, needs
reauthorization, and ready-to-queue states without exposing credentials. Existing
channels and analytics history remain compatible. Live publishing remains
closed by default until the external provider contract is proven.

## Rollback and compatibility

The first migration is additive. Existing manual channels, provider grants,
analytics snapshots, publishing payloads, and publication records remain valid.
The environment flag and database switches default to disabled. Rollback is a
prior application image while retaining additive rows; dropping the new columns
or table requires a verified backup and is not part of normal rollback.
