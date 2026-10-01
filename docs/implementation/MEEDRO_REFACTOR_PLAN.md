# LaraTik Planner refactor and Meedro enrichment plan

Status: in progress — M1 theme foundation, M2 Command Center v1, and the first research-to-brief/collection handoffs are implemented; external Meta UAT and full release evidence remain open

This plan turns the Meedro audit into staged LaraTik work. The goal is not to
clone Meedro. The goal is to borrow the parts that make its product easy to
scan—clear shell ownership, a strong Command Center, decision-oriented
analytics, watchlists, and research-to-action handoffs—while preserving
LaraTik’s workspace permissions, approvals, bilingual copy, audit trail, and
existing data model.

## 0. Execution board

| Order | Milestone                  | Current state                                                                                                 | Next proof required                                                                            |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1     | M0 shell/design contract   | Implemented                                                                                                   | Keep the sidebar, top bar, page header, tabs, and mobile overflow responsibilities stable      |
| 2     | M1 themes and shell polish | Implemented and locally tested                                                                                | Complete the five-width, EN/AR, RTL, axe, and visual matrix                                    |
| 3     | M2 Command Center v1       | Implemented and tested across the configured browser projects                                                 | Complete provider-backed freshness/error evidence and independent review                       |
| 4     | M3 Meta readiness/UAT      | Code and owner worksheet prepared; no live UAT claimed                                                        | Use a LaraTik-owned test Page/Instagram profile, run one probe, then one controlled sync       |
| 5     | M4 research enrichment     | Notes-only teardown, saved artifact, provenance handoff, blank-field apply, and named collections implemented | Add authorized provider media or planner-owned asset input before richer teardown claims       |
| 6     | M5 release hardening       | Ongoing                                                                                                       | Verify the exact clean commit across themes, locales, roles, widths, axe, and production gates |

Latest evidence: the shared hash/scroll-spy hook now applies deep-link state
after mount, keeping the server and client first render identical. The full
settings responsive slice passes 23/23, and the focused sidebar/settings unit
slice passes 62/62. Workspace Settings now uses one compact in-page anchor
strip at every viewport; the global sidebar remains the only persistent rail.
Analytics charts now use theme-aware series tokens, and the Command Center
heatmap stays contained in RTL mobile layouts. The Chromium analytics slice
passes 14/14, including Arabic at 375px.

The immediate external prerequisite is one active LaraTik agency/workspace plus
one disposable or owned test Page with a linked Instagram professional profile.
Until that exists, do not connect the Just Halal asset, enable publishing, add
Meta scopes, or present provider-backed Command Center data as verified.

The broader visual gate is being treated as a review queue, not a snapshot
refresh exercise. The 2026-10-01 isolated run passed the Command Center,
analytics, planning, settings, and shell cases reached before the first stale
Media/Users/Reviews references. Those surfaces now need deliberate reference
review against their current behavior; no blanket update is an acceptable exit
criterion.

The first review queue is now closed for the affected surfaces: the current
Media (agency and workspace), Users, Reviews, and Research collections
references were recaptured intentionally. The priority group now passes 34/34
across the reviewed exact and responsive cases. A second production-workflow
group covering Channels, Library, Planning, and Brand Kit also passes 48/48;
Brand Kit Activity required a deliberate recapture because its old reference
captured a retired shorter empty state. The broad visual run then passed
226/244; the remaining 19 reviewed Media, provider-readiness, platform
access/admin/errors, and planning-edit cases pass in the targeted follow-up.
The current five-width visual inventory is therefore 244/244. Theme/locale
variants, broader role evidence, provider UAT, and independent review remain
open.

The remote Planner MCP now exposes the Meedro-informed Research shelf through
the read-only `laratik_planner_list_research` tool. It reuses the existing
workspace authorization and `content:read` scope, returns a stable envelope
for visible collections, saved observations, reviewed teardowns, and source-
only watchlists, and does not return provider media, raw provider bodies, or
raw planner notes. Focused MCP contract coverage passes 4/4; the public MCP
docs and evaluation case are updated with the tool.

The Command Center KPI strip now shows the latest metric date, authorized
read-model source, and contributing-channel coverage beside the aggregate
numbers. This keeps provider sync time distinct from the metric snapshot date,
which is important when a provider's current follower total and saved daily
snapshot differ by one or more units.

The provenance strip is covered by the focused Chromium Command Center journey
in both light and dark themes, together with the observed-content filter and
pagination path: 3/3 tests pass, including serious/critical axe checks.

The health panel now expands aggregate status badges into one row per connected
channel, showing account identity, platform, status, and relative last-sync
time. This keeps degraded or stalled data actionable without exposing provider
error payloads in the dashboard.

The Command Center also shows the workspace's source-only research watchlist
with a direct Research handoff. This borrows Meedro's competitor-radar
hierarchy without pretending that competitor metrics are available: manual
accounts remain labeled as source references until a controlled provider
capability populates a fresh snapshot.

The affected workspace overview reference remains stable without snapshot
refresh: the exact Stitch case passes 1/1 and its responsive matrix passes 3/3
at mobile-s, tablet, and wide.

## 1. What Meedro is doing well

### Navigation

Meedro uses one persistent left rail for the product map, grouped by job:
research, content studio, and automation/MCP. The active destination is strong
and the top bar is reserved for account context, credits/plan, help, and user
utilities. The rail is not repeated inside every page.

LaraTik already has the safer equivalent: a workspace-aware sidebar with
agency/workspace switchers, role-aware groups, badges, mobile navigation, and a
separate top bar. The refactor should clarify those jobs rather than replace
the shell.

### Command Center

Meedro’s dashboard has a useful vertical decision sequence:

`scope + freshness → KPI strip → growth → top content → performance → best
time/length → inventory → competitor scanning`

This makes the page answer “what changed?” and “what should I make or schedule
next?” instead of presenting an undifferentiated chart wall. The visual pattern
worth adopting is the hierarchy and evidence labels, not its neon treatment or
consumer-growth language.

### Visual language

The useful characteristics are dark-capable surfaces, restrained chrome,
strong number hierarchy, compact tabs, clear selected states, and charts that
lead to an action. The LaraTik version should stay calmer and more operational:
warm light canvas, blue-indigo action colour, semantic statuses, small number
of elevations, and no decorative gradient behind routine work.

The workspace overview now leads with the social Command Center after the page
header. Planning execution KPIs follow it, so the first scan answers “what
changed and what should we do next?” before the user moves into workflow
throughput and delivery health.

## 2. LaraTik baseline and constraints

The current repository already provides:

- a workspace-aware 248px desktop sidebar, 72px tablet rail, 64px top bar, and
  mobile bottom/More navigation in `src/components/app-shell/`;
- semantic light tokens in `src/app/globals.css`, Inter/Noto Sans Arabic, and
  reduced-motion/focus foundations;
- a real social analytics page at
  `src/app/(app)/app/w/[slug]/analytics/social`;
- normalized analytics selection, comparison, growth, health, and table logic
  in `src/lib/social/analytics-dashboard.ts`, `analytics-query.ts`, and the
  social analytics components;
- read-only Meta analytics connection, encrypted agency-scoped credentials,
  provider health, and cron synchronization;
- current Google Stitch parity as the visual source of truth at
  `docs/visual-parity/CURRENT_SYNC.md`;
- an established English/Arabic and LTR/RTL contract that every touched route
  must continue to satisfy.

Do not create a second dashboard data store, a second navigation system, a
second token file, or a direct-publishing dependency for this work.

## 2.1 Current implementation checkpoint — 2026-09-30

The first M1 slice is implemented and verified locally:

- `System` / `Light` / `Dark` is persisted per user in `user.theme_preference`,
  defaulting to `System`.
- The server-resolved preference is applied at the root `<html>` boundary;
  explicit light/dark tokens override the system media preference without a
  second theme library.
- Account now owns the appearance control, with English/Arabic labels and an
  optimistic client preview that rolls back on a failed save.
- Migration `0057_eminent_stryfe` is replay-safe and has passed the repository's
  five-part disposable migration drill.
- `pnpm verify` passes at the current working tree: Prettier, ESLint, strict
  TypeScript, 450 unit files / 4,304 tests, and the production build.

The authenticated a11y gate is now closed at 215/215 across five browser
projects, including dark-theme and Arabic/RTL journeys. The current
five-width visual inventory is also green at 244/244 after reviewed reference
recaptures. Still open for M1 is broader theme/locale visual evidence,
remaining role coverage, and independent review.

The authenticated Account theme journey now passes 1/1 in Chromium for
Light, Dark, and System persistence across reload. This proves preference
behavior, and the dark Account route passes its axe check 1/1 after the shared
semantic foreground fix. This does not replace the responsive, RTL, and full
visual evidence required for the M1 exit gate.

M2 has now started on the existing workspace root rather than creating a
second route: the Command Center reads connected social channels through
`querySocialAnalytics`, aggregates an explicit 30- or 90-day signal, and exposes
empty, KPI, trend/table, strongest-account, connected-channel comparison,
freshness, connected-account health, and planning-handoff states. Focused pure
tests and three Chromium route checks pass, including a 375px Arabic/RTL
check. Full visual/a11y coverage, all roles/locales, and provider UAT remain
open.

The shared workspace sidebar now follows the job-oriented shell contract in
practice: `Plan` (planning, reviews, design queue), `Understand` (Trend Radar,
analytics, channels), `Produce` (library, media, brand kit), and `Manage`.
This is a label and hierarchy change only; routes, permissions, and deep links
remain unchanged.

The first disposable authenticated render confirms the shell order in the
browser: Command Center first, planning KPIs after it, an actionable empty
connected-account state, and persisted Account-owned Light/Dark themes. A
workspace-creation probe also found and repaired a missing usage-threshold
deduplication index with migration `0063_repair_usage_threshold_dedupe`; the
five-part migration drill is green at 64/64 ledger entries. These are local
implementation checks, not production release evidence.

The focused disposable Chromium matrix now passes 15/15 across the theme and
Command Center journeys. It covers theme persistence, empty and connected
overview states, the section rail, Arabic/RTL at 375px, analytics comparison
and filtering, workspace switching, client-reviewer denial, and agency-admin
access. This is `Tested` evidence for the covered journeys; remaining role
coverage, provider UAT, and independent review are still required before
calling M1/M2 complete.

Verification note — 2026-10-01: the focused Command Center axe journeys remain
green across all five configured browser projects, and the theme journey passes
in isolated Chromium, Firefox, WebKit, and mobile runs. A combined five-project
run still intermittently leaves Firefox with a stale `system` Account select
after Chromium has exercised the same dev server; this is retained as an open
cross-project RSC/cache investigation rather than being hidden with a retry or
snapshot update.

The reviewed exact-reference visual suite now passes 24/24 after refreshing
only the three references affected by the fixed visual fixture:
workspace overview desktop/mobile and Planning mobile. The remaining
responsive matrix is still treated as open; no blanket snapshot update is an
exit criterion.

The first responsive planning-matrix audit found and fixed a deterministic test
fixture issue: visual runs now use the committed September 2026 reference month,
while normal E2E runs retain the relative `Date.now() + 7 days` behavior.
Planning responsive coverage passes 4/4 widths; reviewed Settings, overview,
analytics, Agency AI, and Board slices pass 3/3 each after intentional
reference refreshes. The broader responsive matrix is still open and
screenshot comparison remains strict.

The annotated a11y suite now passes 215/215 when run one browser project at a
time: Chromium, Firefox, WebKit, mobile-Chrome, and mobile-Safari each pass
43/43. This includes the corrected Arabic/RTL shell contract, dark-theme
Account coverage, Command Center, and the mobile route checks. The earlier
combined-run failures were caused by a stale Board assertion and long-lived
dev-server resource pressure; neither reproduces in the isolated evidence
runs.

The empty Command Center state now has a staged setup checklist rather than a
single dead-end CTA: connect an account, collect the first metric snapshot,
then review analytics. It reuses the existing Channels and Analytics routes,
keeps incomplete steps actionable, and marks completed steps from the same
authorized summary used by the dashboard. Responsive overview captures pass
3/3, the exact Stitch overview references pass 2/2, and the connected axe
matrix passes 10/10 across configured browsers. Provider media teardown, wider
bilingual/role evidence, and independent review remain open.

The research loop now has an explicit draft handoff: a manager or planner can
save the validated teardown, choose `Create draft`, review the seeded title and
brief, and create a normal planner item. The service verifies workspace scope
and writes a separate provenance link (`content_research_teardown_link`), so
the result is editable without duplicating research JSON into `formatPayload`.
Migration drill, schema integration, focused unit/catalog, and all-browser
handoff evidence are green; the linked draft's Brief tab now also has an
explicit blank-field apply for compatible hook/message/CTA/notes fields,
scenes, and slide outlines without overwriting planner copy.

The authenticated Meedro re-check on 2026-10-01 added one bounded M2
enrichment: an `Observed content` inventory now sits below the Command Center's
top-content summary. It reuses the same authorized post observations and adds
Recent / Most viewed / Outlier / Engagement filters, pagination, source links,
research bookmarking, and the existing Create brief handoff. It intentionally
does not add thumbnails, scrape competitor accounts, copy provider media, or
introduce another store; those require an approved source and controlled UAT.

## 3. Information architecture to lock

| Layer             | Owns                                                                       | Must not own                                                         |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Left sidebar      | location, agency/workspace context, grouped destinations, attention badges | page-local filters, duplicate settings rails, global utility clutter |
| Top bar           | notifications, account, help, global search/action affordances             | workspace-specific navigation repeated from the sidebar              |
| Page header       | title, scope, freshness, one primary action                                | a second full navigation system                                      |
| Local tabs        | views inside one destination, e.g. overview/growth/content                 | unrelated destinations or deep route changes hidden in a modal       |
| Main surface      | the current work and its decision signals                                  | decorative hero furniture before useful data                         |
| Mobile More sheet | secondary destinations and safe overflow                                   | hiding the current task or primary action                            |

Recommended workspace grouping:

- Overview: workspace Command Center.
- Plan: planning list, board, calendar, reviews, design queue.
- Understand: Trend Radar, social analytics, and connected channels.
- Produce: library/media and the brand kit.
- Manage: team, activity, settings.

This is a labeling and hierarchy refinement of the existing navigation model,
not permission changes. Routes remain deep-linkable and role-aware.

## 4. Staged execution plan

### M0 — Design contract and shell guardrails

Deliverables:

- `design-system.md` as the durable token and shell contract.
- This plan linked from `AGENTS.md` and the production-readiness tracker.
- A small shell/navigation decision record that names sidebar, top bar, page
  header, tabs, and mobile responsibilities.
- A visual QA checklist for both themes, EN/AR, RTL, and five target widths.

Exit evidence: docs reviewed; no route or permission behavior changed; the
existing shell test suite remains green.

### M1 — Theme foundation and shell polish

Implement after the theme preference decision is locked:

- map the existing semantic tokens to light and dark values in `globals.css`;
- add a three-state user preference: System, Light, Dark, with System as the
  default and a no-flash server/client bootstrap;
- persist the preference through the existing account/settings ownership model;
- use `next-themes` only if its hydration and cookie behavior fit the existing
  server-resolved locale shell; otherwise use a small first-party attribute
  switcher;
- add the control to Account, not the primary top bar, while keeping a compact
  theme shortcut available in the user menu if the shell needs it;
- audit cards, charts, dialogs, logos, image outlines, focus rings, disabled
  states, and native controls in both themes.

Exit evidence: no hydration flash, persisted preference, system fallback,
contrast checks, Arabic/RTL checks, reduced-motion checks, and visual captures
at 375/768/1024/1280/1440px.

### M2 — Command Center v1 (first major feature)

Build on the existing social analytics read model, with a planning-oriented
workspace overview rather than a Meedro account clone:

1. workspace/account scope and last-sync/freshness status;
2. KPI strip: followers, reach/views, engagement/interactions, publishing
   coverage/readiness, and attention count where data exists;
3. growth trend with period comparison;
4. top content/outliers with source, metric context, and “Create draft” or
   “Add to research” handoff;
5. connected-channel performance comparison now; post-level performance
   distribution against the selected workspace/account baseline after the
   provider sync stores video-level observations;
6. planning signals: best-performing format/pillar/channel and time window only
   when sample size is sufficient;
7. “View analytics” and “Open planning” deep links, plus accessible tables;
8. honest empty, partial, stale, provider-error, and not-connected states.

Planning recommendations use a minimum sample of three observations per timing
slot or duration band. Smaller bands remain visible as context, but they are
not presented as recommendations. This is deliberately more conservative than
the reference product because LaraTik recommendations must be safe to carry
into a real planning decision.

The current implementation also provides a manager-only `Refresh data` action
that sequentially reuses the existing channel test pipeline and reports partial
completion. This keeps freshness actionable without creating a second provider
sync path or granting refresh authority to planners/reviewers.

The first version should aggregate existing social metric rows and planning
rows. It should not add provider-specific chart calculations to page JSX or
store duplicated KPI snapshots. New calculations belong in typed server-side
modules with focused tests.

Exit evidence: unit tests for every calculation, authenticated EN/AR browser
coverage, axe checks, visual review, provider-stale/error states, and a manual
decision review showing that each signal has a next action.

### M3 — Meta data readiness and safe validation

The existing setup already supports read-only Meta analytics. The only global
runtime prerequisites are documented in `docs/operations/environment.md`:

- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `SOCIAL_SYNC_ENABLED` (default off)

The Meta app ID, app secret, Login for Business configuration ID, and pinned
Graph API version are configured per agency at
`/app/agency-settings/social/providers`; the secret is sealed at rest. Do not
reintroduce global provider credentials in `.env`.

The exact owner-facing setup and UAT worksheet is
[`docs/operations/META_COMMAND_CENTER_SETUP.md`](../operations/META_COMMAND_CENTER_SETUP.md).
It records the inspected candidate apps, read-only scope set, callback shape,
sanitized evidence requirements, and stop gates.

Validation sequence:

1. verify Meta app configuration and Facebook Login for Business settings;
2. verify the approved scopes currently requested by the provider, especially
   Page discovery and Instagram professional-account insights;
3. verify redirect URLs and deployment origin without exposing secrets;
4. connect a test Page/Instagram professional account through the existing
   `/app/w/[slug]/channels` flow;
5. run the existing analytics probe and one controlled sync;
6. verify freshness, partial metrics, permission errors, retry/backoff, and
   audit records;
7. only then tune Command Center aggregation and visuals.

The agency provider screen now makes this sequence visible as a compact
readiness path: configured app, credential test, connected profiles, then the
read-only analytics probe. It does not treat configuration or connection alone
as proof that Command Center data is healthy; the probe remains an explicit
operator step and missing/unsupported/low-sample observations stay visible.

### Food Game pilot selection — 2026-10-01

Food Game is the controlled LaraTik pilot for the provider-backed review.
Meta Business Suite confirms the owned Facebook Page is linked to Instagram
`@__foodgame`, and Planner already has both profiles connected in
`/app/w/food-game`. The first production analytics read shows honest partial
behavior: Instagram is healthy, Facebook is provider-limited with
`metric_unavailable`, and publishing is disabled. This is sufficient to
review freshness, KPI cards, partial/error states, and Command Center
handoffs before generalizing to other workspaces; unavailable metrics remain
visible rather than being coerced to zero.

### Meta post-insight probe matrix — 2026-09-30

The adapter currently pins `v25.0` by default and requests the existing
read-only scopes in `src/lib/social/providers/meta.ts`. The internal,
read-only Instagram capability check is now attached to the existing admin
analytics probe; it tests one recent owned media item and does not broaden
OAuth scopes or write durable post observations.

| Surface                   | Probe                                                                     | Required evidence                                                                               | Product use                                        |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Instagram media           | `/{ig-media-id}/insights` for owned feed media/reels                      | response shape, supported metrics by `media_product_type`, request ID, and stable error mapping | top content, outliers, engagement and length bands |
| Instagram media inventory | `/{ig-user-id}/media` with timestamp, permalink, type, and video metadata | pagination and retention window                                                                 | observation candidates                             |
| Facebook Page post        | `/{post-id}/insights` for a Page-owned post/video                         | Page token, `ANALYZE` task, permission result, and metric availability on the pinned version    | Facebook top content and video performance         |
| Version compatibility     | same safe probes on the configured version and the next supported version | no deprecated metric dependency; explicit `metric_unavailable` fallback                         | safe Graph-version upgrade decision                |

The current implementation covers the Instagram media inventory and media
insights rows above. It also collects up to 10 Facebook Page feed pointers with
aggregate reactions/comments/shares when the existing `pages_read_user_content`
scope permits it. It returns sanitized per-metric statuses for `views`,
`reach`, `saved`, `shares`, and `total_interactions`, with request IDs and
provider error codes retained only in the capability response. Facebook
post-level reach/views insights remain nullable until the pinned Graph version
and the connected Page prove those metrics are available. The agency-admin
probe now tests one Page post against the v25 replacement metrics
`post_media_view` and `post_total_media_view_unique` with `lifetime` semantics;
this is capability evidence only and does not yet promote either metric into
normal Facebook observation sync or Command Center ranking.

Meta’s current reference documents media-level Instagram insights and Page
post insights, but metric availability is media-type/version dependent. The
Facebook reference also marks several legacy impression metrics deprecated
above Graph API v25. The implementation must therefore normalize supported
metrics into a provider-neutral observation contract and keep unsupported
metrics nullable; it must never treat a single unsupported metric as a failed
account sync.

Probe exit criteria: one successful Instagram media response plus one
Facebook result or a durable, classified permission/unsupported-metric result;
sanitized evidence stored in the existing capability/readiness record; no
tokens or raw provider bodies written to logs, screenshots, or chat. Only then
should an additive observation migration and Command Center post cards be
started.

No live publishing, permission expansion, token copying, or destructive account
changes belong in this milestone. A Facebook Developer account check is
read-only until the exact app and test account are confirmed.

### Read-only external checkpoint — 2026-09-30

The connected Meta Developer account was inspected without changing settings
or reading credentials. The live Social Tracker app has no required action
items and reported healthy rate-limit usage. An existing Facebook Login for
Business configuration named `laratik-planner-prod` already lists the Page
discovery and Instagram insights permissions needed by the read-only analytics
path. Its settings include the production callback and two legacy workspace
callbacks, with Client OAuth, Web OAuth, HTTPS enforcement, and Strict Mode
enabled.

This proves configuration exists, not that a planner workspace can complete a
fresh connection or sync. The next safe check is therefore one controlled test
Page/Instagram connection through LaraTik, followed by the existing probe and a
single sync tick. Keep `META_PUBLISHING_ENABLED=false`; do not expand scopes or
copy tokens into chat, source, or screenshots.

### Planner runtime checkpoint — 2026-09-30

The authenticated `DR Reem Reda` workspace was inspected read-only through the
production Planner UI. Channels already lists a connected Instagram account
and Facebook Page, each synced about 11 hours ago. Social Analytics reports
`1/2 healthy`, `1 degraded`, and `0 stalled`; the degraded account currently
returns `metric_unavailable`, so the Command Center must preserve partial-data
and provider-error states rather than imply complete coverage.

The existing analytics surface already provides CSV export, freshness
diagnostics, 7/30/90-day windows, Followers/Reach/Views/Interactions metrics,
absolute/growth comparison, and an accessible ranking table. The observed
workspace snapshot showed 2,468 current followers and +824 (+50.1%) over seven
days across two selected channels. This is the foundation for Command Center
v1; post-level insights are now being added as a bounded, explicitly partial
slice rather than inferred from account totals.

A read-only Meta Business Suite checkpoint later the same day was useful for
field mapping only. The authenticated surface was Just Halal, not LaraTik, and
showed period-aware Views, Follows, visits, content interactions, 3-second
views, watch time, recent content, and weekly-plan progress. The inspected
production Planner workspace rendered `Workspace unavailable`; a fresh `/app`
check also showed no active agency/workspace. This is not LaraTik UAT and no
external Meta state was changed. Do not connect that asset; first select or
provision an active LaraTik agency/workspace, then repeat the probe only with
the canonical LaraTik app and an owned test Page/Instagram profile.

The authenticated Meta Developer account was also inspected read-only. The
live `Social Tracker` app belongs to the Just Halal business, while the LaraTik
business currently exposes two in-development Ads Manager apps. No app,
permission, callback, or credential was changed. Before production UAT, the
owner must select the canonical LaraTik app and enter its app ID, secret, Login
for Business configuration ID, and callback URL in the agency provider screen;
the app should not be pointed at the unrelated live Social Tracker app. Both
LaraTik Ads Manager apps currently show no Login for Business configuration;
the app explicitly associated with LaraTik GmbH is the preferred candidate for
owner-approved setup, followed by a read-only probe and controlled connection.

### Post-level data floor — first bounded slice implemented 2026-09-30

The schema now has three useful primitives:

- `social_profile_daily_metric` stores one normalized row per channel/day
  (followers, reach, views, interactions, freshness, and provider metadata);
- `publication_record` stores a planner-owned Meta post ID, permalink, media
  type, publish time, and link/reconciliation status.
- `social_post_observation` stores provider observations keyed by channel,
  provider object, and observation date, with nullable metrics and sanitized
  request/version metadata.

The first slice is deliberately bounded: the Meta snapshot expands the latest
10 Instagram media objects, queries the read-only `views`, `reach`, `saved`,
`shares`, and `total_interactions` insights that the setup probe proves, and
stores basic likes/comments plus provider-supplied video duration when present.
Unsupported metrics remain nullable and do not fail the account snapshot. For
Facebook Pages it stores up to 10 metadata-only feed observations with aggregate engagement
counts when the existing read scope allows them; post bodies are never stored.
The Command Center ranks
the stored rows into top content and 3x outlier cards, then derives timezone-
aware best-time and duration-band signals with sample-size and nullable-metric
context. Retention is the same 25-month window as account metrics, and the
additive migrations are forward-only with no backfill or destructive rollback.

Migration `0059_wet_boomer` adds the first research-to-brief bridge: each top
observed post can open Quick Create, where the source is re-resolved inside the
workspace, its metrics and permalink are shown, and the resulting draft keeps a
durable `content_research_link`. This is a provenance handoff, not an automatic
copy or publish action.

Migration `0060_parallel_wallop` adds the first saved-research shelf. Planners
can bookmark a workspace-authorized observed post from Command Center, revisit
it at `/research`, and create a brief from the saved evidence. The bookmark is
only a pointer to the observation; provider content is not copied.

Migration `0066_last_robin_chapel` adds the smallest useful Meedro-style
`Save to Project` layer: managers and planners can create a private or
workspace-visible research collection and assign a saved bookmark or teardown
to it. Items keep their existing provenance and provider-content boundary. v1
allows one active collection per saved item; a join table is the planned upgrade
if multi-project reuse becomes a real workflow.

Migration `0061_blue_hammerhead` plus the compatibility follow-up
`0062_zippy_karma` add a workspace-scoped research watchlist registry. Managers
and planners can store an account handle, profile URL, platform, and optional
display name; reviewers can read it. The row exposes `manual`, `available`,
`unsupported`, and `error` provider states. The current `manual` state is
deliberate: no competitor scraping or inferred metrics are allowed. A future
provider adapter can populate freshness and snapshots without changing the
planning handoff contract.

Open follow-up: add Facebook post-level insights, historical pagination,
competitor watchlist snapshots, and video teardown only after controlled
capability evidence. The current partial view is not complete Meedro parity.

### M4 — Research enrichment from Meedro

Prioritize the loops that create planner value:

- competitor account watchlists with freshness and workspace scope;
- saved research items and projects/collections;
- structured video teardown: hook, format, promise, pacing, CTA, evidence,
  and uncertainty;
- one-click research item → LaraTik brief/draft with human review;
- hook/script templates connected to existing format payloads;
- MCP read-only research tools and small, auditable workflow recipes.

Defer or skip Meedro packaging features: credits, affiliate prompts,
tutorial marketing, and stock B-roll until usage proves they matter.

#### M4.2 — Named research collections

The Research shelf now supports named collections with explicit `me` or
`workspace` visibility. Collection membership is only a pointer to an existing
bookmark or validated teardown; it never stores provider media or raw source
notes. The API re-checks workspace access, role, collection visibility, and
item ownership before assignment. The one-collection-per-item ceiling is
intentional until users demonstrate a need for multi-collection reuse.

The same research shelf is now available to read-only automations through
`laratik_planner_list_research`; it follows the web shelf's visibility rules
and keeps all four item arrays stable for callers.

#### M4.1 — Structured teardown contract

The teardown is not allowed to infer a video's hook, pacing, scenes, or CTA
from account metrics or a permalink alone. It needs one of these explicit
evidence inputs:

1. an authorized provider media payload with the required transcript/media
   metadata;
2. a user-uploaded or planner-owned media asset; or
3. planner-entered transcript/notes supplied as the analysis source.

The reviewable result is a typed draft with `hook`, `promise`, `format`,
`beats`, `pacing`, `callToAction`, `evidence`, and `uncertainty`. Metrics and
source provenance stay separate from creative interpretation. Missing source
evidence produces an honest unavailable state; it must not be filled with
model guesses.

The result is preview-only. A planner may selectively apply fields into the
existing `formatPayload` editor or save the analysis as research, but the
request never overwrites a draft, changes workflow status, or publishes. The
first implementation should reuse the existing AI governance, capability
allowlist, translation contract, and human Insert/Replace flow rather than
introducing a second AI client or a new `content_item` column.

The first shipped slice is deliberately smaller: workspace managers and
planners can submit authorized transcript/planner notes to a preview-only
teardown route, then explicitly save the validated structured result as a
research artifact. Migration `0064_plain_crusher_hogan` stores no raw notes or
provider bodies. Provider media and planner-owned asset ingestion stay gated
until a controlled source path is proven; the saved-artifact handoff now has a
verified blank-field apply journey on the content detail Brief tab.

Exit evidence: provider or user-source authorization, schema/parser tests,
fixture-backed AI response handling, an EN/AR preview/apply browser journey,
axe checks in both themes, and an audit record that preserves source and
uncertainty without storing raw provider bodies or secrets. The current
notes-only apply slice has unit/catalog 65/65 and five-project browser 10/10
evidence; provider-media authorization and broader locale/role evidence remain.

The Research shelf has responsive captures at 360px, 768px, and 1440px, and
the all-browser blank-input journey passes. The next visual gate is the
bilingual saved-artifact/apply journey once controlled owned-media input is
available.

### M5 — Visual parity and release hardening

- refresh the relevant current Stitch surfaces only when the visual contract
  changes;
- run bilingual, responsive, accessibility, loading/empty/error, role, and
  theme verification at the exact clean commit;
- update implementation progress, production-readiness evidence, API/MCP docs,
  and affected catalogs together;
- measure chart rendering, query latency, and layout shift before adding more
  visual effects.

## 5. Facebook/Meta setup checklist

The repository already has the integration seams; the missing work is proving
the external configuration and data quality, not inventing a new connector.

| Area         | Current source                            | Plan action                                               |
| ------------ | ----------------------------------------- | --------------------------------------------------------- |
| OAuth        | `/api/social/meta/{connect,callback}`     | verify redirect and Login for Business config             |
| Provider     | `src/lib/social/providers/meta.ts`        | verify scopes, Graph version, metric fallbacks            |
| Credentials  | agency DEK/KEK service                    | verify enable/disable/rotation evidence; never log tokens |
| Sync         | `/api/cron/social-metrics`                | run controlled test tick and inspect health/status        |
| Read model   | `querySocialAnalytics` and metrics tables | reuse for Command Center aggregation                      |
| UI           | Channels + Social Analytics               | add setup/freshness and planning handoffs                 |
| Release gate | external-service UAT + production tracker | preserve independent-review evidence                      |

## 6. Decisions and deferred questions

Recommended defaults:

- Theme preference: System / Light / Dark, persisted per user, System default
  (current implementation default; user override remains possible).
- Visual direction: calm dense operations UI; Meedro hierarchy, LaraTik brand.
- Analytics: extend existing read model; no second store.
- Social provider: Meta read-only first; TikTok remains compatible but not a
  prerequisite for Command Center v1.
- Navigation: keep persistent sidebar + global top bar; make their ownership
  clearer instead of adding another rail.
- AI: recommendations remain preview/insert actions; never write status or
  publish automatically.
- External validation: read-only first, no secrets in chat or source.

Open product decisions to resolve before M1/M2 implementation:

1. ~~Confirm the three-state theme preference or choose Light/Dark only.~~
   Resolved: System / Light / Dark, persisted per user, with System default.
2. ~~Choose the first Command Center scope: one workspace aggregate or one
   selected connected account with workspace roll-up beneath it.~~ Resolved:
   workspace aggregate with connected-channel comparison and explicit scope.
3. ~~Define the minimum sample size for “best time” and “best format” signals.~~
   Resolved: require three observations per timing slot or duration band; keep
   smaller groups visible but label them as insufficient for a reliable signal.
4. ~~Confirm whether Facebook validation should use the existing Just Halal test
   account or a separate sandbox account.~~ Resolved: use a separate
   LaraTik-owned disposable/test Page and linked Instagram professional profile;
   the Just Halal asset is out of scope.

## 7. Definition of done for the refactor

The work is not complete when the page merely resembles Meedro. It is complete
when the current implementation proves:

- navigation responsibilities are clear and stable on desktop/tablet/mobile;
- light and dark themes are both intentional, accessible, and user-selectable;
- Command Center numbers are sourced from the existing authorized data model;
- every signal exposes scope, freshness, evidence, and a next planning action;
- Meta setup and sync are verified without exposing credentials or enabling
  live publishing;
- English/Arabic, LTR/RTL, keyboard, axe, loading, empty, error, stale, and
  role-based states are evidenced at the exact clean commit;
- production-readiness tracker, agent guidance, API/MCP docs, and tests agree.

## Evidence references

- [Meedro feature audit](../audits/MEEDRO_FEATURE_AUDIT_2026-09-30.md)
- [Current Stitch sync](../visual-parity/CURRENT_SYNC.md)
- [Social analytics environment](../operations/environment.md)
- [Meta readiness ADR](../decisions/0010-meta-publishing-readiness.md)
- [Social analytics route](<../../src/app/(app)/app/w/[slug]/analytics/social/page.tsx>)
- [Design system record](../../design-system.md)
