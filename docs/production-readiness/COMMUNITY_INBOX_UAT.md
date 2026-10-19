# Community & Inbox production-readiness and Meta UAT

Status: `Implemented`, not `Verified`.

This checklist is the release gate for Community & Inbox. It is intentionally
separate from the implementation plan: a route, build, or unit test passing
does not prove that a Meta account can read or send customer conversations.
Never mark this feature `Verified` until the evidence below exists on one exact
clean commit and an independent reviewer has checked it.

## Current known boundary

- Community access is fail-closed behind the plan, agency, and workspace gates.
- Analytics access does not grant messaging access.
- Facebook private-message operations remain blocked until Meta grants
  `pages_messaging`, the customer reconnects Meta, and capability validation
  succeeds against the connected Page.
- Comment operations may be released independently when their own capability
  and UAT evidence passes.
- Webhooks and expanded conversation history remain `Unknown` by design while
  bounded manual sync is the operational path.
- AI Test Lab, AI draft generation, autonomous sending, and utility-message
  templates are separate gates; none may be inferred from this checklist.

## Facebook Messenger integration assumptions

The current LaraTik Meta connection uses **Facebook Login for Business** with
an agency-specific `config_id` and `graph.facebook.com`. The configured Graph
version is used at runtime and defaults to `v26.0`. Facebook Page Messenger
access is not provided by Instagram Login.

For Facebook Page conversations, Meta's current Messenger Platform reference
requires:

- a Page access token issued from a person with the Page `MESSAGING` or
  `MODERATE` task;
- `pages_messaging`, `pages_manage_metadata`, and `pages_read_engagement`;
- the Page selected through the Facebook Login for Business flow; and
- Advanced Access / the required App Review and business-verification state
  when conversations involve people who are not app, Page, business, or
  account roles.

For a normal reply, the recipient must have recently messaged the Page (the
standard response window is 24 hours) or otherwise satisfy Meta's allowed
messaging-window rules. A successful OAuth connection or analytics grant is
not proof that a reply can be sent.

Current Meta references:

- [Messenger Platform API](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api)
- [Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a)
- [Send API](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api)

Do not request `pages_utility_messaging` for ordinary human replies. That is
a separate utility-notification/template use case and does not unblock normal
Page Messenger responses.

## Evidence rules

For every completed row record the exact clean commit SHA, command or provider
operation, date/time, operator, sanitized evidence location, and result. Do not
record access tokens, message bodies, customer handles, raw provider payloads,
or private screenshot data.

The automated contract test protects route inventory, permission-matrix
completeness, and EN/AR catalog parity. It does not replace browser evidence,
assistive-technology review, database isolation tests, or external Meta UAT.

## Release gate matrix

| Area                       | Required evidence                                                                                                                          | Status before customer enablement                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Route inventory            | 13 Community routes render at their canonical URLs, including loading, empty, error, denied, stale, and disconnected states                | Pending dedicated bilingual browser run                           |
| English/LTR and Arabic/RTL | Every route renders in both locales at 375, 768, 1024, 1280, and 1440 widths with no horizontal overflow                                   | Pending dedicated browser and visual evidence                     |
| Accessibility              | Chromium axe scan has no serious/critical violations; keyboard focus reaches filters, panels, dialogs, forms, and primary actions          | Pending Community route scan and manual review                    |
| Workspace isolation        | A user cannot read or mutate conversations, messages, drafts, events, capabilities, or send attempts belonging to another workspace        | Pending disposable-Postgres integration evidence                  |
| Agency isolation           | A workspace cannot use another agency's plan, module switch, provider connection, capability, or credentials                               | Pending disposable-Postgres integration evidence                  |
| Role boundaries            | Viewer/client reviewer cannot reply; writers cannot manage connections/settings/automation; manager-only actions are rejected server-side  | Unit matrix exists; server-action integration evidence pending    |
| Delivery state             | `sent`, confirmed `failed`, and `unknown` are distinct; an `unknown` attempt blocks blind retry and requires reconciliation                | Contract exists; provider failure/reconciliation evidence pending |
| Meta comments              | Read and public reply are separately validated per account and platform                                                                    | Local provider tests exist; real-account UAT pending              |
| Facebook private messaging | Read Page conversations, ingest a bounded message window, send one controlled reply, confirm it, then reconcile a forced unknown outcome   | Blocked by Meta `pages_messaging` approval/reconnect              |
| Instagram messaging        | Validate the selected Instagram login mode, professional account, scopes, read path, and reply path independently                          | External provider UAT pending                                     |
| Operations                 | Polling catch-up, overlapping windows, duplicate/out-of-order events, deletion handling, rate limits, and sanitized failures are evidenced | Pending operational UAT                                           |

## Meta UAT: Facebook Page private messaging

Run this only with an explicitly authorized Page and a test user. The test
operator must use the app's configured Graph version and must redact all
provider identifiers in the evidence.

### Meta App Review checklist

- [ ] Confirm the canonical Meta app is attached to the correct verified
      business and uses the LaraTik Facebook Login for Business configuration.
- [ ] Confirm the Page-selection prerequisites remain available, including
      `pages_show_list` and `pages_read_engagement`.
- [ ] Add `pages_manage_metadata` and `pages_messaging` to the app's requested
      and reviewable permissions. `pages_messaging` is the permission currently
      blocking Facebook private messaging in LaraTik.
- [ ] Complete Meta's allowed-usage description for `pages_messaging`.
- [ ] Upload a screencast showing the real end-to-end flow: connect the Page
      through LaraTik, receive/read a Page Messenger message, compose a human
      reply in Community & Inbox, send it, and show the confirmed result.
- [ ] Provide reviewer instructions, a test Page, and a test user with the
      required Page messaging task. Keep credentials in Meta's reviewer fields;
      never add them to the repository or evidence.
- [ ] Perform the required non-production API test calls and retain only
      sanitized request IDs, timestamps, endpoint names, and result states.
- [ ] Agree to Meta's allowed-usage terms, submit the review, and record the
      submission status/date. LaraTik remains blocked until Meta shows the
      permission approved/available for the app.

### Preconditions

1. The Meta app is in the mode required for the test account and the app has
   completed the relevant App Review/Business verification requirements.
2. The Page is eligible for Messenger and is connected through the LaraTik Meta
   OAuth flow; do not reuse an analytics-only connection.
3. The OAuth grant includes `pages_messaging` and the other scopes required by
   the selected login mode. A requested scope is not proof of approval.
4. Reconnect Meta after approval so the stored grant is refreshed, then run
   Community → Connections → Validate capabilities.

The validator and bounded sync must use the same Facebook Messenger surface:

| Purpose                   | Expected request                                                                                                                                      | Pass condition                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Granted-scope diagnostics | `GET /v26.0/me/permissions`                                                                                                                           | The token reports `pages_messaging` as granted.                                                                               |
| Comment read check        | `GET /v26.0/{page-id}/feed?fields=id,comments.limit(1){id,message,from,created_time}&limit=1`                                                         | The selected Page is readable for comments.                                                                                   |
| Messenger read check      | `GET /v26.0/{page-id}/conversations?platform=messenger&fields=id,updated_time&limit=1`                                                                | The Page Messenger edge returns a valid response. Empty `data` is valid zero-conversation evidence, not a missing permission. |
| Bounded inbox sync        | `GET /v26.0/{page-id}/conversations?platform=messenger&fields=id,updated_time,participants,messages.limit(25){id,message,from,created_time}&limit=25` | LaraTik can normalize a bounded conversation window without duplicates.                                                       |
| Controlled reply          | `POST /v26.0/{page-id}/messages` with `recipient.id` set to the user's Page-scoped ID and a text message                                              | Meta returns a provider message ID within the allowed messaging window.                                                       |

The exact configured Graph version replaces `v26.0` in these examples. Never
put access tokens, app secrets, raw provider bodies, or customer message text
in evidence.

### Required checks

| ID       | Check               | Pass condition                                                                                                                                      | Evidence                                 |
| -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| FB-PM-01 | Scope grant         | The sanitized granted-scope record contains `pages_messaging` and the connection is active                                                          | Scope names only + connection status     |
| FB-PM-02 | Read probe          | The Page conversations read returns a valid response; an empty `data` array is a valid zero-conversation result, not an automatic failure           | Request path/version + redacted status   |
| FB-PM-03 | Bounded ingestion   | A test conversation and messages are stored under the intended workspace; replaying the same window creates no duplicates                           | Counts, dedupe result, workspace ID hash |
| FB-PM-04 | Private reply       | A human-authorized reply uses the private-message operation and provider confirms one message ID                                                    | Redacted request ID + delivery state     |
| FB-PM-05 | No cross-visibility | A different workspace/agency cannot view, reply to, or reconcile the test conversation                                                              | Integration result                       |
| FB-PM-06 | Unknown outcome     | Simulate timeout after dispatch; LaraTik records `unknown`, blocks retry, reconciles by provider lookup, and only then marks `sent` or `failed`     | Send-attempt/event states                |
| FB-PM-07 | Reconnect/revoke    | Revoke or remove the scope, reconnect, validate again, and confirm private-message operations become unavailable without affecting comment evidence | Capability rows + sanitized audit event  |

### What to do while `pages_messaging` is blocked

Keep Facebook private-message read and reply operations unavailable in the UI.
Do not work around the missing grant with a Page token copied from another
tool, a hidden endpoint, or an analytics connection. Finish the Meta App Review
submission for `pages_messaging`, provide the reviewer flow and test evidence,
wait for the decision, then reconnect the Page in LaraTik and validate again.

Do not request `pages_utility_messaging` for ordinary human replies. That
permission is for a separate utility-notification/template workflow and would
expand the review scope without unblocking normal inbox replies. Request it
only if that product capability is explicitly designed, implemented, and
tested later.

## Unknown-send acceptance criteria

An unknown outcome means the provider may have accepted the request but LaraTik
did not receive confirmation. The acceptance contract is:

1. Persist one workspace-scoped send attempt with state `unknown` and a
   reconciliation key; never claim `sent` in the UI or analytics.
2. Persist a sanitized activity event that says confirmation was unavailable;
   never include the message body or token.
3. Disable retry for the same deterministic idempotency key until reconciliation
   completes.
4. Reconcile through a provider read that can identify the exact conversation
   and message, using the same workspace and connection authorization checks.
5. Mark `sent` only when the provider confirms the outgoing message, or
   `failed` only when the provider confirms rejection. Keep `unknown` and alert
   an operator when reconciliation cannot decide.
6. Prove replay safety: repeated reconciliation is idempotent and never creates
   duplicate local messages or a second provider reply.

## Browser and responsive evidence to collect

For each of the 13 routes capture EN/LTR and AR/RTL at 375, 768, 1024, 1280,
and 1440 widths. Record the primary action, focused control, loading/empty/error
state, permission-denied state, disconnected/stale state, and whether the
layout preserves the package hierarchy. Pair screenshots with an axe result
and a behavioral assertion; screenshots alone are not release evidence.

## Commands for the next release-candidate run

```text
pnpm exec vitest run tests/unit/community-production-contract.test.ts tests/unit/community-permissions.test.ts tests/unit/community-meta-capability-probe.test.ts tests/unit/community-provider.test.ts
TEST_DATABASE_URL=postgresql://…/planner_test pnpm test:integration
pnpm test:e2e:isolated -- tests/e2e/community-inbox-audit.spec.ts --project=chromium --project=firefox --project=webkit --project=mobile-chrome --project=mobile-safari
pnpm migration-drill
```

The dedicated Community audit fixture uses synthetic conversations in a disposable
test database. Its browser results do not replace the external Meta UAT rows
above. Run the full `pnpm test:e2e:release` gate before merge.
