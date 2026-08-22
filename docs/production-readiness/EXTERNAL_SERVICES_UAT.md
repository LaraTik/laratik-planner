# External-services UAT

> **Purpose.** Owner-completed evidence for the external-service checks
> called out in `STUDIOFLOW_MASTER_PROMPT.md` §23/§24 and
> `PRODUCTION_READINESS_TRACKER.md` (rows OBS-001, OPS-001, AI-001).
> These are checks that **cannot be automated** because they require a
> real Google OAuth client, a real Mailcow account, a real Anthropic
> API key, a real Sentry project, an offsite backup repository, and
> a credentials vault. The build, typecheck, unit, and axe-core
> automated gates are recorded separately in
> [`TEST_EVIDENCE.md`](./TEST_EVIDENCE.md) and
> [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md); this file is the
> controlled end-to-end sign-off for each external dependency.
>
> **Rules.**
>
> 1. Record only operator, date, environment and result. Never record
>    secret values, real invitation URLs, raw session tokens, or
>    production user data (per
>    `docs/production-readiness/README.md` evidence rule 2).
> 2. The operator for a check is named in the **Owner** column at
>    the time the check is run; if ownership changes, the new owner
>    updates the column.
> 3. The next rotation date in the credential-rotation section is
>    the date the credential is **next** rotated, not the date it
>    was last rotated (the rotation history is in
>    `MIGRATION_DEPLOYMENT.md` / `OPS-001` evidence in the tracker).
> 4. `Pass` requires the operator to have observed the documented
>    behaviour in the named environment on the named date; `Fail`
>    requires a tracking issue link; `Blocked` requires the owner
>    and the external action.

## Pass criteria

A row may be marked `Pass` only when the operator observed the
documented behaviour against a real external account on the named
date, the automated contract for the same surface is still green
(see `TEST_EVIDENCE.md`), and no tracking issue is open. `Fail`
must link to a tracking issue with a reproduction. `Blocked` must
name the owner and the external action required (typically a
missing credential or an external account that the owner has not
provisioned yet). The independent reviewer flips `Pass` rows to
`Verified`; this file never self-assigns `Verified`.

## Google OAuth

| #   | Service      | Check                                                                                                                                                                                  | Owner                  | Environment                                | Date | Result | Evidence link |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------ | ---- | ------ | ------------- |
| 1   | Google OAuth | Redirect URL — `/api/auth/signin/google` produces a valid `accounts.google.com` consent URL with the production `client_id`, `redirect_uri` and PKCE `state`                           | Implementation / Owner | production (`https://planner.laratik.com`) |      |        |               |
| 2   | Google OAuth | Callback exchange — the Google redirect back to `/api/auth/callback/google` returns `200` with a session cookie; the `code` is exchanged exactly once; replay fails closed             | Implementation / Owner | production                                 |      |        |               |
| 3   | Google OAuth | Session establishment — the session cookie sets `httpOnly`, `secure` and `sameSite=lax`; subsequent `GET /api/auth/session` returns the expected user identity (no role/email leakage) | Implementation / Owner | production                                 |      |        |               |

## Mailcow SMTP

| #   | Service      | Check                                                                                                                                                                                                                                       | Owner                  | Environment | Date | Result | Evidence link |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------- | ---- | ------ | ------------- |
| 1   | Mailcow SMTP | Invitation delivery — `POST /api/invitations` triggers a templated email to the new member's address; the email contains the invitation URL, the workspace name and a single-use token; the token is invalidated after first acceptance     | Implementation / Owner | production  |      |        |               |
| 2   | Mailcow SMTP | Magic-link delivery — the email magic-link request flow sends a sign-in link to the address on file; the link is single-use, scoped to the next sign-in attempt, and expires within 15 minutes                                              | Implementation / Owner | production  |      |        |               |
| 3   | Mailcow SMTP | Password-reset delivery — `/signin/forgot-password` sends a reset link to the address on file; the link is single-use, expires within 1 hour, and cannot enumerate accounts (response shape is identical whether the address exists or not) | Implementation / Owner | production  |      |        |               |

## MiniMax (Anthropic) AI

| #   | Service    | Check                                                                                                                                                                                                                                                        | Owner                  | Environment | Date | Result | Evidence link |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----------- | ---- | ------ | ------------- |
| 1   | MiniMax AI | Enabled path — with `AI_ENABLED=true` and a valid API key, the `POST /api/ai/generate` route returns a 2xx response with the model output; `aiUsageEvents` records one row with the model, prompt and completion token counts; rate-limit policy is enforced | Implementation / Owner | production  |      |        |               |
| 2   | MiniMax AI | Disabled path — with `AI_ENABLED=false` (or no API key), the `POST /api/ai/generate` route returns 4xx with a user-visible "AI is disabled" message; the workflow remains usable (no `generate` button on disabled surfaces)                                 | Implementation / Owner | production  |      |        |               |
| 3   | MiniMax AI | Provider error path — when the upstream returns a 5xx or the response parse fails, the route returns a redacted 502; `public-error` ensures no provider detail leaks; `aiUsageEvents` records the failure row                                                | Implementation / Owner | production  |      |        |               |

## Sentry

| #   | Service | Check                                                                                                                                                                                                                                                                       | Owner | Environment | Date | Result | Evidence link |
| --- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------- | ---- | ------ | ------------- |
| 1   | Sentry  | Release tagging — every production deploy writes a Sentry release with the exact commit SHA; the release is visible in the Sentry UI alongside its source maps                                                                                                              | Owner | production  |      |        |               |
| 2   | Sentry  | Source maps — stack traces in the Sentry UI for a production error show the original TypeScript frame, not the minified bundle; source maps are deleted from the upload pipeline after upload (per `next.config.ts` `withSentryConfig`)                                     | Owner | production  |      |        |               |
| 3   | Sentry  | Data scrubbing — a deliberately injected `Authorization: Bearer <test-token>` header and a deliberate `password=<test-secret>` request body do **not** appear in the captured event payload in the Sentry UI; `lib/observability/logger.ts` recursive scrubber catches both | Owner | production  |      |        |               |
| 4   | Sentry  | Alert delivery — a deliberately triggered error sends the configured alert to the on-call channel within the Sentry alert-rule SLA; the alert includes the release SHA and the affected route                                                                               | Owner | production  |      |        |               |

## Encrypted offsite backup

| #   | Service                  | Check                                                                                                                                                                                                                                  | Owner | Environment                    | Date | Result | Evidence link |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------ | ---- | ------ | ------------- |
| 1   | Encrypted offsite backup | Production backup — the daily backup job writes a restic-encrypted snapshot to the offsite repo; the snapshot contains the full database and the private storage volume; the snapshot is verifiable (`restic check` reports no errors) | Owner | production                     |      |        |               |
| 2   | Encrypted offsite backup | Timed disposable restore — a fresh throwaway Postgres instance is restored from the latest offsite snapshot; total wall-clock time (download + restore + connect + smoke query) is recorded and is under the agreed RTO                | Owner | production (disposable target) |      |        |               |

## Credential rotation

| #   | Service      | Check                                                                                                                                                     | Owner | Environment | Date | Result | Evidence link |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------- | ---- | ------ | ------------- |
| 1   | Database     | Credential rotation — production DB username/password rotated; old credential revoked in lockstep; next rotation date                                     | Owner | production  |      |        |               |
| 2   | Google OAuth | Credential rotation — production OAuth client id/secret rotated; new credentials pushed via the secret store; old credentials revoked; next rotation date | Owner | production  |      |        |               |
| 3   | Mailcow SMTP | Credential rotation — production SMTP password rotated; old password revoked at the provider; next rotation date                                          | Owner | production  |      |        |               |
| 4   | Sentry       | Credential rotation — production Sentry DSN and auth token rotated; old token revoked; next rotation date                                                 | Owner | production  |      |        |               |
| 5   | MiniMax AI   | Credential rotation — production MiniMax API key rotated; old key revoked; next rotation date                                                             | Owner | production  |      |        |               |

## How this file links to the rest of the evidence

- Automated contracts:
  - `tests/e2e/a11y-routes.spec.ts` (axe-core per route, mirrored in
    [`TEST_EVIDENCE.md`](./TEST_EVIDENCE.md))
  - `tests/integration/invitation-concurrency.test.ts` (invitation
    invariant, mirrored in `SECURITY_AUDIT.md`)
  - `lib/observability/logger.test.ts` (secret/private-data
    scrubbing, mirrored in `TEST_EVIDENCE.md`)
- 30-step UAT that touches the same services end-to-end:
  [`UAT_RELEASE.md`](./UAT_RELEASE.md) § "2026-08-21 — 30-step
  separated-account UAT" (invitation delivery, magic-link,
  password-reset, AI toggle).
- Production deploy / migration / backup chain:
  [`MIGRATION_DEPLOYMENT.md`](./MIGRATION_DEPLOYMENT.md).
