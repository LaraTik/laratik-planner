# Meta Publishing Readiness Audit

Date: 2026-09-04  
Scope: future direct publishing from LaraTik Planner to Facebook Pages and Instagram professional accounts  
Repository: `laratik-planner`  
Decision requested: determine whether the existing product and architecture are ready to make Meta publishing a later milestone

## Executive verdict

Meta publishing is a realistic future capability, but the repository is not yet implementation-ready for a safe “Publish to Meta” button.

The current codebase has a useful foundation:

- Meta OAuth and account discovery already exist for read-only analytics
- Facebook Pages and linked Instagram professional accounts are represented as `social_channel` rows with stable external IDs
- Per-channel publishing payloads, approvals, rights declarations, alt text, captions, hashtags, scheduling overrides, and delivery-version references already exist
- Credentials are encrypted server-side and the current Meta adapter already preserves Page-specific access tokens
- The current publishing UI already has the right broad shape: destination, copy, media/accessibility, preview, readiness, approval, and a final action

The missing pieces are fundamental to reliable provider publishing:

1. A deliberate Meta publishing authorization/capability model is missing. The current Meta connection requests analytics scopes only
2. The media path is not yet a provider-fetchable delivery contract. Internal signed upload URLs are private, short-lived, and browser-oriented
3. There is no durable asynchronous publish job/attempt model for Meta’s container creation, processing, polling, retries, rate limits, re-authentication, and idempotency
4. The current readiness checks validate editorial fields but not provider capability, token health, media reachability, or Meta-specific format rules
5. The current UI needs a Meta-specific setup/readiness layer and a publishing-status distinction. It must clearly separate “connected for analytics” from “authorized and ready to publish.”
6. Existing publishing copy still has localization debt in the publish form and Meta account picker. A future flow must be English/Arabic and LTR/RTL complete before it is released

Recommended conclusion: keep Meta direct publishing out of the current release, reserve it as a new milestone after the analytics foundation, and implement the readiness/specification work below before wiring any live provider mutation.

## Audit method and evidence limits

This audit combined:

1. Repository instructions, the StudioFlow master prompt, the production-readiness tracker, the social analytics ADR, the UX discovery notes, and the existing Meta/TikTok implementation plan
2. CodeGraph inspection of the social schema, Meta adapter, content/publishing payloads, readiness service, publishing UI, channel connection flow, and provider configuration UI
3. Static inspection of the upload/storage and delivery schemas
4. Current official Meta material, prioritizing Meta’s official Postman API collections because the Meta developer pages returned rate-limit/safe-browsing errors from this environment
5. A current UI smoke attempt against the local development server

Current visual evidence is limited. The local browser could not produce an inspectable page: the development server’s client bundle failed on missing workspace dependencies, including `@swc/helpers/_/_interop_require_default`, and Docker/Postgres was unavailable. The blank browser surface was rejected as audit evidence. Therefore this report does not claim current visual, keyboard, screen-reader, axe, or responsive compliance for the future Meta flow. Those checks remain required at implementation time.

The report is a readiness analysis, not an approval to request Meta permissions, submit App Review, or publish real content.

## Meta platform reality

### Supported account targets

The natural first target is:

- Facebook Pages managed by the connected business user
- Instagram professional accounts (Business or Creator), preferably those linked to a managed Facebook Page when using the existing Facebook Login for Business integration

The target is not:

- Personal Facebook profiles
- Consumer Instagram accounts
- Arbitrary Instagram accounts that the connected user does not manage

Meta’s official Instagram collection describes content publishing for professional accounts and the Facebook Login path’s relationship with managed Pages and linked professional Instagram accounts. It also documents that the collection’s newer Instagram Login path uses a different permission model. The implementation must choose one explicit integration mode instead of mixing scopes and token assumptions.

Sources reviewed:

- [Meta Instagram API official Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-ab559ffb-8e2c-4b0a-b43a-5737b6d2f672)
- [Meta Facebook API official Postman collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api?entity=request-23987686-0b79260c-96bd-49de-875b-6076213785fc)
- [Meta Instagram official workspace](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00)

Meta changes permissions, API versions, review requirements, and endpoint behavior. The exact scopes and endpoints must be revalidated in the Meta developer dashboard and official documentation immediately before implementation.

### Authentication and authorization

The existing connection is designed around Facebook Login for Business:

- one Meta grant can discover multiple Facebook Pages;
- each Page can expose a linked Instagram professional account;
- Page access tokens are retained per managed resource;
- the provider configuration stores the app ID, encrypted app secret envelope, Login Configuration ID, and Graph API version

That is the correct starting point for a unified Facebook Page + linked Instagram publishing experience. However, the existing request is read-only. `src/lib/social/providers/meta.ts` currently requests:

- `pages_show_list`
- `pages_read_engagement`
- `instagram_basic`
- `instagram_manage_insights`

There is no publish capability in the current scope request, capability check, or App Review state. Adding a scope string alone would be insufficient. The product must also:

- record which operation was authorized and when it was last checked;
- distinguish analytics-only connections from publish-enabled connections;
- validate the selected Page tasks/permissions and linked Instagram eligibility;
- handle token reauthorization without exposing or logging tokens;
- show the account owner what will be enabled before consent;
- keep analytics working if publishing is later revoked;
- support Meta App Review, business verification, privacy policy, data deletion, and least-privilege documentation

The alternative Instagram Login flow may be useful if the product later wants Instagram-only connections, but it does not replace the Facebook Page integration. It should be treated as a separate product/architecture decision, not an incremental scope toggle.

### Publishing is asynchronous

Instagram publishing is not a single synchronous “send post” operation for all media:

1. The planner creates an Instagram media container
2. Meta fetches the media from a URL that Meta can reach
3. The planner polls the container status until it is ready or failed
4. The planner publishes the ready container and records the returned media ID and URL

Reels, carousels, and video processing make this especially important. The official collection shows the container/status/publish sequence and requires provider-fetchable media URLs. Facebook Page publishing has its own platform-specific post, photo, video, and Reel flows; the planner should not assume that the Instagram payload can be sent unchanged to Facebook.

Operational consequences:

- A user request must enqueue work and return a visible “queued” state
- A worker must own retries and provider polling
- A retry must not create a duplicate post after a timeout
- A failed token, expired container, rejected media file, rate limit, or provider outage needs a distinct user-facing state
- The UI must show the last attempt, provider status, and the safe next action

### Media must be reachable by Meta

The repository’s current local storage is intentionally private:

- files live under `UPLOADS_DIR` in a per-workspace path;
- browser access uses short-lived signed URLs;
- the upload route is authenticated by a signed token;
- the download response is `Cache-Control: private`;
- `delivery_link.url` is an HTTPS link, but it is a link submitted with a delivery version, not a first-class media asset/provider-delivery record

This is appropriate for internal review and brand assets. It is not yet enough for a dependable Meta publish pipeline. A signed URL could expire while Meta is fetching it, be inaccessible to Meta’s crawler, or leak a private workspace asset if made public without a scoped delivery policy.

The future design needs one of these explicit contracts:

- a provider-facing, time-bounded, immutable media URL generated for an approved delivery and validated before enqueueing; or
- a durable object-storage/CDN delivery layer with provider-safe access controls and lifecycle cleanup

The implementation must also validate MIME type, byte size, dimensions, duration, aspect ratio, audio codec, video codec, and file availability before calling Meta. The current repository has aspect-ratio helpers and internal upload handling, but no evidence of a complete delivery-asset metadata pipeline for Meta.

## Existing repository coverage

### Coverage matrix

| Area                        | Existing implementation                                                                                                                                             | Status for future Meta publishing               | Required decision or change                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Destination identity        | `social_channel` stores platform, account name, handle, URL, external account ID, connection ID, connection status, sync timestamps, and errors.                    | Strong foundation                               | Reuse stable IDs. Add provider capability/publish health and make the Page → linked Instagram relationship first-class rather than relying mainly on loose metadata.                                                                                               |
| Meta discovery              | `meta.ts` discovers managed Pages and linked Instagram professional accounts through `/me/accounts`; Page access tokens are retained per managed profile.           | Strong for analytics; partial for publishing    | Keep discovery. Add explicit Page tasks, account type, linked-parent relationship, eligibility reason, and publish-capability checks.                                                                                                                              |
| OAuth secrets               | Encrypted connection credentials and per-agency social DEK exist. `SocialCredentials` supports a user token, optional refresh token, and per-profile access tokens. | Good security base                              | Reuse encryption. Add scope/capability history and safe reauth state. Never put provider credentials in payloads or client props.                                                                                                                                  |
| Provider app config         | Per-agency Meta app ID, encrypted secret envelope, Login Configuration ID, Graph API version, enabled/test state.                                                   | Partial                                         | Add a cohesive publishing-readiness status: app mode, requested/granted scopes, App Review state, Business Verification state, last permission test, and kill switch.                                                                                              |
| Caption and text            | Common payload supports caption, description, first comment, hashtags, mentions, collaborators, CTA, destination URL, language, and location.                       | Mostly ready                                    | Add platform-specific validation. Do not imply that first comment, location, collaborators, or CTA are supported identically on every Meta format. Decide which fields are publishable, manual-only, or unsupported.                                               |
| Accessibility               | Alt text exists; Reel transcript and review flags exist; audio rights confirmation exists.                                                                          | Good editorial base                             | Connect fields to provider capability and actual format checks. Define behavior when Meta cannot carry a field. Keep rights confirmation blocking where appropriate.                                                                                               |
| Instagram format model      | Separate `instagram` and `instagram_reel` payload variants; feed crop, carousel order, cover frame, subtitles, transcript, audio rights, comments/remix controls.   | Good shape; not provider-complete               | Add media cardinality, asset metadata, provider format validation, and carousel child ordering. Confirm which controls are actually available in the chosen Meta API mode.                                                                                         |
| Facebook format model       | Facebook payload has title, description override, media presentation (`feed`, `story`, `reel`, `marketplace_listing`), and interaction flags.                       | Too broad and currently under-validated         | Narrow the first publish scope to Facebook Page feed photo/video/text and explicitly decide whether Page Reels are phase one. Remove or label unsupported variants until an adapter exists. Marketplace listing should not be treated as ordinary Page publishing. |
| Media source                | Approved delivery version plus HTTPS `delivery_link` rows; internal local storage uses private signed downloads.                                                    | P1 blocker                                      | Create a provider-fetchable, immutable media delivery contract and metadata validation. Link it to the exact approved delivery version and publish attempt.                                                                                                        |
| Scheduling                  | Content planned time and per-channel override exist; timezone is available in payload.                                                                              | Editorially ready; operationally incomplete     | Add durable jobs, leases, state transitions, retry policy, cancellation, idempotency, and timezone-normalized execution.                                                                                                                                           |
| Readiness                   | Server-side readiness checks validate payload schema, destination, approvals, alt text, Reel rights/transcript/cover, approved delivery, and some recommendations.  | Insufficient for Meta                           | Add capability, token, Page task, media reachability, quota/rate-limit, provider-format, and API-version checks. A clean editorial report must not be called “ready to publish” when Meta is not publish-enabled.                                                  |
| Publishing adapter          | Registry exists but only LinkedIn and X stubs return `unsupported`; adapter has one `publish` method.                                                               | Not ready                                       | Replace the narrow contract with a lifecycle-aware worker contract carrying workspace/channel/connection, idempotency key, approved media, validated payload, and provider result identifiers.                                                                     |
| Publication persistence     | `publication_record` stores pending/published/skipped/failed, published URL, publisher user ID, note, failure reason, attempt number, and verification time.        | Useful aggregate; insufficient execution record | Add a separate publish job/attempt model or extend carefully with queued/processing/awaiting-provider states, provider IDs, container IDs, request IDs, retry time, sanitized provider error code, and idempotency key.                                            |
| Audit trail                 | Activity events record payload and approval changes; provider connection lifecycle is auditable.                                                                    | Good base                                       | Record consent/capability changes, enqueue/cancel/retry, provider response class, and final outcome without storing tokens or raw provider payloads.                                                                                                               |
| UI localization             | Much of the publish form is catalog-backed, but the form itself documents remaining English labels and the Meta picker contains hard-coded English strings.         | Not release-ready                               | Complete catalog coverage, Arabic editorial review, RTL layout, and localized errors before enabling the feature.                                                                                                                                                  |
| UI information architecture | Agency provider config, social DEK settings, workspace channel connection, and content publishing setup already exist as separate surfaces.                         | Usable foundation; needs consolidation          | Add a single Meta readiness narrative across those existing surfaces. Do not add a second nested settings rail or a duplicate Meta settings route.                                                                                                                 |

### Fields that should not be added as ordinary content columns

The existing `content_item.format_payload` and per-channel `platform_payload` split is the right conceptual model. Do not add `caption`, `hook`, `CTA`, scenes, or similar creative fields as new `content_item` columns. Keep creative structure in the format payload and keep channel-specific publication overrides in `platform_payload`.

The fields that are missing belong primarily to the provider execution boundary, not to the creative item:

- connection capability and permission health;
- immutable provider-facing media delivery;
- publish job and attempt lifecycle;
- provider identifiers and error metadata;
- idempotency and retry state;
- validated provider capability matrix

## Required product and UI/UX rearrangement

### 1. Agency administration: one Meta readiness card, not another settings area

Keep the existing agency social provider configuration route and existing social encryption/security surface. Reorganize their content into a clear readiness sequence:

1. Meta app connection: app ID, Login Configuration ID, callback URL, Graph API version
2. Security: encrypted secret status, social encryption status, last key/configuration test
3. Publishing approval: app mode, Business Verification, App Review status, requested/granted capabilities
4. Operational switch: analytics enabled, publishing enabled, last permission check, last successful test
5. Recovery: reauthorize, rotate/revoke, disconnect analytics, revoke shared Meta grant

The card should show separate statuses such as:

- Analytics: Connected
- Publishing: Not requested / Awaiting App Review / Ready / Needs reauthorization / Disabled

Do not show a generic green “Connected” badge when the grant can read analytics but cannot publish.

### 2. Workspace channels: explain the relationship and eligibility

The current Meta picker selects discovered profiles and links them to workspace channels. For future publishing, change the information hierarchy to:

- `Meta`
  - Facebook Page
    - linked Instagram professional account

Each row should show account type, handle, parent Page where relevant, analytics status, publishing status, and the reason when publishing is unavailable. Examples: “Analytics only,” “Needs reauthorization,” “Instagram professional account required,” or “Page publishing not approved.”

Use explicit consent copy: “Connect Facebook Pages and linked Instagram professional accounts for analytics and future publishing.” If the product is not yet enabling publish, say so plainly and do not imply that selecting an account will make it publishable.

Avoid silently selecting every discovered account as a future default. Keep a clear selection count, “Select all visible,” relationship grouping, and a review step that makes it obvious which Page and Instagram account will become a destination.

The channel table should keep its scan-friendly columns but add compact status badges for `Connection`, `Publishing`, `Last sync`, and `Needs reauthorization`. Put technical scope details in the row drawer/details panel.

### 3. Content detail: rename and restructure around “Publishing setup”

The existing UX discovery already recommends “Publishing setup” rather than “Publish package.” Keep that direction. The future Meta-ready surface should have:

- a top summary: destination, scheduled time in workspace timezone, editorial readiness, Meta capability readiness;
- per-channel cards or tabs: Destination, Copy, Media & accessibility, Platform options, Schedule, Approval;
- a sticky right-side preview/readiness panel on desktop;
- a mobile tab or bottom-sheet version of the preview/readiness panel;
- one dominant action whose label reflects the lifecycle: `Save draft`, `Confirm ready`, `Queue for publishing`, `Retry`, or `Reauthorize`

Editorial readiness and provider readiness must be separate. For example:

| Readiness       | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| Editorial       | Copy, approved delivery, rights, alt text, and final approval are complete. |
| Meta connection | The target Page/Instagram account is connected and the token is usable.     |
| Meta capability | The app/grant is approved for the exact publish operation.                  |
| Media delivery  | The exact approved asset is reachable and passes provider constraints.      |
| Queue           | The requested time is valid and one idempotent job is scheduled.            |

The action must remain disabled until all blocking rows pass. Recommendations such as rights confirmation should not be visually conflated with provider blockers.

### 4. Progressive disclosure by target format

Keep common fields visible, but reveal only relevant Meta fields:

- Instagram image: caption, alt text, crop, destination, optional location, approval
- Instagram carousel: ordered child assets, per-slide validation, caption, alt text strategy, approval
- Instagram Reel: video, cover, caption, transcript/accessibility, audio rights, allowed interactions, approval
- Facebook Page feed: text/caption, link/photo/video presentation, optional title/description, destination, approval
- Facebook Page Reel: separate capability and media validation; do not reuse Instagram Reel controls without a provider-specific mapping

Fields that Meta cannot reliably publish should be marked `Planner-only`, `Manual follow-up`, or `Not supported`, with a short explanation and an accessible details link. Do not silently drop user-entered data.

## Future architecture recommendation

### Keep and reuse

- `social_channel` as the canonical workspace destination
- `social_connection` and per-agency social DEK encryption
- The existing Meta discovery and per-profile Page token model
- `content_item.format_payload` for creative structure
- `content_item_channel.platform_payload` for per-destination overrides
- approved delivery version and final copy approval gates
- server-side Zod parsing and readiness evaluation
- non-destructive disconnect and explicit shared Meta grant revocation

### Add a normalized capability model

Prefer a small normalized table over putting all publishing state into the existing loose `metadata` JSONB. A capability record should identify at least:

- social connection or managed profile;
- operation, such as `analytics_read`, `facebook_page_publish`, `instagram_content_publish`;
- state: unavailable, requested, pending review, active, needs reauth, revoked, error;
- granted scope/task evidence, sanitized;
- checked at, granted at, expires at when applicable;
- last error code and safe human-readable recovery guidance

The exact table name is an implementation decision, but the data must be queryable by readiness checks and admin UI without parsing provider-specific blobs.

### Add a durable job and attempt model

A future migration should introduce the equivalent of:

`publish_job`

- content item/channel and workspace;
- approved delivery version and payload revision;
- effective publish time and timezone-normalized execution time;
- state: queued, running, waiting for provider, published, failed, canceled, needs reauth, expired;
- attempt count, lease owner/expiry, next retry time;
- stable idempotency key;
- cancellation and failure reason

`publish_attempt`

- job ID and attempt number;
- started/finished timestamps;
- provider request/correlation ID;
- Instagram container ID where applicable;
- provider media/post/video ID and URL;
- provider error class/code, sanitized message, retry-after time;
- response status and adapter version

Keep `publication_record` as the user-facing aggregate if useful, but do not force a multi-stage provider workflow into the current pending/published/failed row. The current `publisherId` is a planner user ID; it is not a substitute for a provider object ID.

### Redesign the adapter contract

The current one-method adapter accepts only `actorId` and a payload. A Meta adapter needs server-side execution context, including:

- workspace and channel identity;
- social connection/managed profile identity;
- resolved credentials from the secret store;
- validated provider capability;
- approved delivery/media references;
- stable idempotency key;
- provider/API version;
- an operation that can create, poll, publish, or reconcile

The adapter should return typed lifecycle results, not only a final published URL. Recoverable errors must distinguish invalid payload/media, token/permission failure, rate limiting, provider rejection, transient outage, expired container, and already-published reconciliation.

### Define the media delivery contract before the adapter

For each publishable asset, the system needs a server-side representation of:

- source delivery version and asset identity;
- immutable byte/object version;
- MIME type and size;
- dimensions, duration, frame rate, codecs, and audio presence where relevant;
- approved checksum or revision;
- provider-facing URL and expiry/lifecycle;
- fetch/HEAD validation result;
- cleanup policy after the provider attempt

The provider-facing URL must be generated only for a server-approved publish job, never exposed as a reusable workspace file URL, and never logged with credentials or sensitive query data.

## Recommended delivery scope for the first Meta milestone

Start smaller than the current schema’s full enum set:

1. Instagram professional single image
2. Instagram professional single video/Reel after the media pipeline is proven
3. Instagram carousel after child-container and partial-failure behavior is proven
4. Facebook Page photo/video/feed post
5. Facebook Page Reel only after a separate adapter and UX review

Defer until separately designed:

- Facebook Stories;
- Marketplace listings;
- personal Facebook profiles;
- consumer Instagram accounts;
- comments, messages, ads, demographic data, and engagement management;
- automatic cross-posting that silently changes format or copy;
- unsupported fields that are merely stored but cannot be delivered

The official Meta collections document different publishing flows and account/permission models across these targets. A narrow first release reduces App Review scope, provider ambiguity, and duplicate-post risk.

## Phased implementation roadmap

### Phase 0 — specification and UI readiness, no live publishing

- Freeze the supported target matrix and chosen Facebook Login/Instagram Login mode
- Write the exact field mapping and unsupported-field policy for each first-release format
- Define publishing capability states and user-facing recovery copy in English and Arabic
- Decide whether the current private local volume will gain a provider-facing delivery layer or whether media moves to durable object storage/CDN
- Add no Meta mutation yet

### Phase 1 — provider and media readiness

- Add normalized capability/permission health data
- Add provider-specific channel relationship and eligibility data
- Add media metadata and provider-fetchable immutable delivery
- Extend readiness checks and tests so a target can be “editorially ready” but “Meta not ready” without confusion
- Add an agency-level publishing kill switch and feature flag

### Phase 2 — asynchronous execution

- Add jobs, attempts, leases, idempotency, retry/backoff, cancellation, and reconciliation
- Implement Instagram container creation, status polling, publish, and result reconciliation
- Implement the smallest Facebook Page operation set separately
- Add provider request/error sanitization and structured operational logs

### Phase 3 — UI and account recovery

- Consolidate agency Meta readiness
- Rework workspace channel picker and status table
- Finish the Publishing setup layout, previews, blockers, queue state, retry state, and reauth state
- Complete catalog parity, Arabic editorial review, RTL, responsive states, keyboard access, axe, and screen-reader review

### Phase 4 — compliance and controlled rollout

- Use Meta test users, test Pages, and test professional Instagram accounts
- Complete App Review and Business Verification for the exact capabilities requested
- Document privacy policy, data deletion, token revocation, least privilege, support runbook, rate limits, and incident recovery
- Run canary publishing behind an agency/workspace feature flag
- Keep manual publishing fallback visible until the provider path is proven

## Acceptance gates before enabling Meta publishing

### Product behavior

- Only managed Facebook Pages and eligible Instagram professional accounts can be selected
- Personal Facebook and consumer Instagram accounts are clearly rejected with an explanation
- Analytics-only and publishing-enabled states are distinct everywhere
- The system never publishes without final copy approval, approved media, rights policy satisfaction, valid destination, and provider capability
- User-entered fields are never silently discarded; unsupported fields have an explicit policy

### Reliability and safety

- A timeout or worker restart cannot create a duplicate post
- Instagram container processing is polled and reconciled
- Rate limits, expired tokens, expired containers, provider rejection, and transient errors have separate states and retry rules
- No access token, signed media URL, raw provider payload, or secret appears in browser props, logs, audit text, or error messages
- Disconnect is non-destructive to historical analytics and publication records
- A kill switch can stop new Meta jobs without corrupting queued records

### UI/UX and accessibility

- Agency setup, workspace channel selection, publishing setup, queue status, failure, retry, and reauthorization all render in English and Arabic
- LTR/RTL and mixed-direction values are handled with the existing direction-aware field rules
- The flow is evidenced at 375, 768, 1024, 1280, and 1440+ widths
- Keyboard, focus order, screen-reader names, 200% zoom, reduced motion, loading, empty, error, and long-content states are reviewed
- Every blocking readiness reason has text, not color alone, and points to the field or recovery action

### Engineering and production evidence

- Unit and integration coverage exists for each provider mapping and state transition
- Disposable database migration drill passes from zero and upgrade paths
- Isolated E2E covers connect/select, readiness blockers, queueing, success, failure, retry, reauth, and cancellation
- Provider calls are mocked/recorded in tests; no production credentials are used in fixtures
- The exact clean commit SHA is recorded for all verification evidence
- Backup, rollback, monitoring, alerting, and runbook evidence exists before production enablement

## Risk register

| Risk                                      | Impact                                                                           | Mitigation                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Meta scope/API/version changes            | Existing OAuth or publish calls can stop working.                                | Pin and monitor API versions; record version per attempt; revalidate scopes before implementation and App Review. |
| App Review or Business Verification delay | Feature may work only for test accounts.                                         | Treat App Review as a release gate; build test-account fixtures and keep manual fallback.                         |
| Token/Page task drift                     | One Page or linked Instagram target may become analytics-only or need reauth.    | Capability checks, explicit statuses, reauth path, per-target diagnostics.                                        |
| Private media cannot be fetched           | Meta rejects or times out during container processing.                           | Provider-facing immutable delivery layer, preflight fetch checks, long-enough lifecycle, cleanup.                 |
| Duplicate posts                           | A timeout after provider acceptance can create duplicate content on retry.       | Idempotency key, provider ID/container reconciliation, persistent attempts, no blind retries.                     |
| Cross-platform field mismatch             | Copy or controls disappear or behave differently on Facebook and Instagram.      | Platform mapping matrix, format-specific validation, explicit unsupported/manual states.                          |
| Rate limits and processing latency        | Scheduled content misses its expected time.                                      | Queue lead time, backoff, quota checks, visible delayed state, operational alerts.                                |
| UI over-complexity                        | Users cannot tell whether content, connection, or provider approval is blocking. | Separate readiness dimensions, progressive disclosure, one dominant next action.                                  |
| Localization/RTL debt                     | Arabic users receive an incomplete or misleading publishing workflow.            | Catalog parity gate, Arabic editorial review, responsive RTL evidence before feature flag.                        |

## Final recommendation

Do not add direct Meta publishing code in the current pass. The repository is well positioned for a later implementation, but it needs a formal Meta capability layer, provider-safe media delivery, an asynchronous job/attempt engine, stronger readiness checks, and a clearer localized UI narrative first.

The best next engineering milestone is Phase 0 plus the non-mutating portions of Phase 1: finalize the target matrix, document the field mapping, decide the media delivery contract, and add the data model/UX specification for publishing readiness. That work will preserve the current analytics architecture and avoid prematurely coupling the existing manual publication record to Meta’s asynchronous provider lifecycle.

## Implementation follow-up — readiness slice

The first readiness slice described above has now been implemented without
enabling live Meta mutations:

- Added the supported-format and field-mapping matrix at
  `docs/content/meta-publishing-field-matrix.md`
- Added the bilingual responsive design brief at
  `docs/visual-parity/META_PUBLISHING_DESIGN_BRIEF.md`, based on UI/UX Pro Max
  and frontend-design review reconciled with StudioFlow/Stitch tokens
- Added the readiness decision record at
  `docs/decisions/0010-meta-publishing-readiness.md`
- Added disabled-by-default platform, agency, and workspace safety gates
- Added normalized per-destination Meta capability records
- Added the Facebook Page → linked Instagram professional-account relationship
- Added server-authoritative readiness states for provider, approval,
  verification, connection, capability, and destination blockers
- Added localized readiness cards to agency provider settings, workspace
  channels, and content publishing setup
- Added a workspace Settings control and a hierarchical bilingual destination
  picker using logical layout utilities
- Added readiness state-machine tests, catalog parity coverage, and migration
  drill coverage for the new additive migration

Verification for this working tree: targeted Meta/i18n/navigation tests pass
(35 tests), TypeScript passes, lint passes, formatting passes, the production
build passes, and the five-step disposable migration drill passes (31/31
ledger entries). The full unit suite passes 3,175 tests; three unrelated
failures remain in pre-existing CI workflow assertions and should be resolved
with the dirty `.github/workflows/*` changes before a release-gate claim.

Still intentionally deferred: provider-facing immutable media delivery and
media metadata persistence, `publish_job` / `publish_attempt`, live provider
adapters, App Review and Business Verification evidence, canary publishing,
and isolated browser evidence at every required bilingual viewport. The
platform flag remains `false`, and this release cannot publish a live post.
