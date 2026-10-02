# Meedro feature audit → LaraTik Planner roadmap

Date: 2026-09-30  
Scope: authenticated Meedro web app, every visible top-level section, shared entry points, and the planner capability crosswalk.  
Evidence: live Chrome inspection of the authenticated account. Screenshots were captured inline during the audit for each section; the route list below is the reproducible evidence index.

## Executive decision

Do not clone Meedro. The useful product loop is:

> discover proven content → understand why it worked → turn the insight into a LaraTik brief → produce, approve, publish, and measure it.

LaraTik already owns the production half of that loop. The highest-value additions are the missing research-to-brief bridge: competitor/watchlist intelligence, reusable video teardowns, and direct conversion of research into a planner draft.

## Authenticated section re-check — 2026-09-30

The relogged-in Chrome session was re-checked read-only across every visible
Meedro destination. This pass confirms the following implementation boundaries:

| Surface                    | Current observed state                                                                            | LaraTik implication                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Viral Finder               | Watchlist shell with Find Accounts, Update Watchlist, Manage, and weekly auto-update messaging    | Keep the workspace-scoped watchlist registry; add provider snapshots only after UAT |
| Viral Library              | Search, Saved Videos, broad category chips, and an explicit loading state                         | Add provider-backed search/save later; do not import a giant catalog                |
| Content Ideas+             | Multi-source badges, keyword input, and an insufficient-credit disabled action                    | Reuse Trend Radar/source-to-brief; do not copy Meedro credit locks into planning    |
| Viral Vault                | Analyzed-video, hook/template, project, and unassigned tabs with filter/search and Analyze Videos | Use the versioned, source-authorized teardown contract before adding the UI         |
| My Projects                | Project selector and empty-state guidance                                                         | Defer a second generic project taxonomy                                             |
| Viral Scripts              | Topic → hook style → script style → CTA/duration/instructions flow                                | Map approved presets into the existing format-payload editor                        |
| MCP Connection / Workflows | Permission-first read-only explanation, connection CTA, search, and workflow discovery            | Borrow the onboarding/recipe UX; preserve LaraTik scopes and audit controls         |
| B-Roll Assets              | Type/category filters; search and downloads locked on the inspected plan                          | Keep this P2 and import only into the existing media library with provenance        |

No generation, analysis, download, upgrade, connector setup, or persistent
Meedro mutation was performed during this re-check. The current Command Center
capture remains the primary visual reference for KPI, trend, performance,
timing, and inventory hierarchy; the section re-check supplies the feature
boundaries for the staged roadmap.

## Priority roadmap

| Priority | Feature slice                                                          | Why it matters                                                                  | LaraTik status                                                                                                                                                                | Recommendation                                                                                                      |
| -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P0       | Competitor intelligence and watchlists                                 | Gives planners a repeatable source of proven ideas instead of ad-hoc browsing   | Partial: Trend Radar, social analytics, saved owned-post research, and a source-only workspace watchlist registry exist; provider snapshots do not                            | Add provider-backed account snapshots, filters, freshness, and “Create brief”                                       |
| P0       | Video teardown / hook and script extraction                            | Turns a winning video into reusable creative direction                          | Partial: notes/transcript-only structured teardown preview and saved artifact exist; provider media/owned asset ingestion does not                                            | Add authorized media sources; never auto-publish or overwrite content                                               |
| P0       | Research item → planner brief                                          | This is the conversion point that makes research operational                    | Observed posts and saved teardowns can open editable, provenance-linked drafts; linked teardowns can explicitly fill blank compatible fields without overwriting planner copy | Generalize the handoff for competitor items and richer format fields                                                |
| P1       | Hook and script template library                                       | Reusable patterns reduce repeated prompting and improve consistency             | Partial: format schemas and content templates exist; no research-derived hook/template library                                                                                | Store approved patterns as reusable content-planning references, not as new `content_item` columns                  |
| P1       | Performance command center                                             | Best time, length, outlier, and engagement views improve planning decisions     | Partial: `/analytics/social` has normalized metrics and comparison views                                                                                                      | Add planning-oriented insights on top of existing analytics data; keep provider truth and “no data” states explicit |
| P1       | Research projects / inspiration collections                            | Lets teams organize saved videos, hooks, and scripts around a campaign          | Partial: planning Library and media library exist, but not research collections                                                                                               | Add a small research collection model only after proving the P0 save-and-brief flow needs it                        |
| P1       | MCP workflow recipes                                                   | Meedro packages common research jobs into copyable, tool-aware workflows        | Partial: LaraTik MCP already has scoped tokens and planning tools                                                                                                             | Add planner-specific recipes and research tools to the existing MCP documentation and evaluation contract           |
| P2       | Stock B-roll search                                                    | Useful convenience, but LaraTik already has a stronger controlled media library | Covered in principle by `/app/media` and workspace media                                                                                                                      | Add only as a server-side provider/import adapter with rights and provenance; do not make it a core milestone       |
| P2       | AI video recreation / “Video Director”                                 | High cost, provider dependence, and legal/brand risks                           | Not present                                                                                                                                                                   | Defer until research-to-brief and production feedback loops prove demand                                            |
| Skip     | Credits, affiliate, tutorials, theme, and Meedro-specific monetization | Product packaging, not core planner value                                       | Not needed for v1 parity                                                                                                                                                      | Revisit only if LaraTik introduces metered AI plans                                                                 |

## Section-by-section findings

### 1. Home

Route: `https://app.meedro.com/`

The home surface is a six-card launchpad:

- Track competitors.
- Discover viral videos.
- Write winning scripts.
- Connect Claude/ChatGPT through MCP.
- Analyze multiple videos.
- Find viral content ideas.

The important design decision is not the cards themselves; it is the clear mental model. Meedro presents research, generation, and automation as one content machine. LaraTik should borrow that information architecture in a workspace overview, but the destination should be the existing planning workflow rather than another silo.

Planner crosswalk: workspace overview, planning list/calendar, Trend Radar, AI assistance, and MCP already cover most destinations. Missing is the research object that can travel between them.

Priority: P1 for the launchpad copy/IA; P0 for the underlying research-to-brief links.

### 2. Command Center

Route: `https://app.meedro.com/dashboard`

Observed capabilities:

- Account selector for connected Instagram/TikTok accounts.
- Manual refresh and freshness indicator.
- Tabs for Your Account, Growth, Top 5 Videos, Videos Performance, Best Time To Post, and Your Videos.
- KPI strip for followers, average views per video, average engagement, and viral hits.
- Follower-growth history.
- Top videos grouped by views, engagement, and comments.
- Video-level views/likes/comments, engagement rate, viral multiplier, duration, source link, Save to Project, Video Link, and Get Insights.
- Performance scatter/series view with viral/hot/above-average bands.
- Best day/hour and best video-length recommendations.
- Paginated video inventory with Recent, Most viewed, Outlier, and Engagement filters.
- Competitor acquisition radar and watchlist cards.

What is genuinely valuable for LaraTik is the planning interpretation: “what should we make next?” The account dashboard itself is not a reason to duplicate analytics already implemented in `src/app/(app)/app/w/[slug]/analytics/social` and `src/lib/social/analytics-dashboard.ts`.

Recommendation: add a compact “planning signals” layer over the current analytics model: outliers, best-performing formats, best time windows, and links to create a draft. Do not build a second analytics store.

Command Center visual reference captured in the live inspection:

- KPI strip + follower-growth chart: a compact account summary, current totals, change indicators, and a clearly labeled tracking window.
- Video-performance chart: one visual separates viral, hot, above-average, and on-pace content against the account average.
- Best-time heatmap + video-length bands: the chart turns historical performance into an actionable publishing recommendation, with sample size and median/average context.

These are useful patterns to bring into LaraTik because they answer a planner’s next decision, not just report historical numbers. Reuse the existing social analytics data and add a “Create draft” / “Apply to planning” action at the signal level. Keep the sample size, date range, freshness, and source account visible so recommendations are not presented as universal rules. The LaraTik Command Center now exposes an explicit 30/90-day window so its KPI trend and post recommendations share one period. The two Command Center screenshots were captured inline during this audit: the upper viewport shows the KPI strip and follower growth; the lower viewport shows performance, best time to post, and best video length.

For durable repository evidence, review the live Meedro captures alongside the
current LaraTik/Stitch targets:

- [`Workspace overview target`](../../designs/stitch-current/9821d2eb7b254f7bbfe47827e9ab53eb_workspace-overview-desktop.png)
- [`Social analytics target`](../../designs/stitch-current/e87426aa83a4456899e3242418efba33_analytics-trend-sources-desktop.png)
- [`Planning handoff target`](../../designs/stitch-current/b75a9ec57d5b4859ab318e2003f2bf65_board-calendar-desktop.png)

The live Meedro captures remain reference material from the authenticated
inspection session. A fresh authenticated re-check was completed later in the
same day and confirmed the Command Center sections below.

### Authenticated Command Center re-check — 2026-10-01

The relogged-in Command Center confirms a stronger interaction pattern than a
static analytics dashboard:

- the local section rail keeps Account, Growth, Top 5 Videos, Videos
  Performance, Best Time to Post, and Your Videos in one decision surface;
- the account header pairs connection state, post inventory, selected period,
  and an explicit refresh/freshness message;
- KPI cards show the current value, the change, the population behind the
  value, and a high-signal outlier count rather than decorative totals;
- top-content cards expose the source post, views/likes/comments, duration,
  outlier label, source link, save-to-project, video-link, and get-insights
  actions;
- the inventory view has Recent / Most viewed / Outlier / Engagement filters
  with pagination, while the lower market-scanning area links account
  discovery to a watchlist and back to the research finder.

The live re-check also produced three report captures, each retained as an
inline inspection artifact for this audit:

1. **KPI + follower growth:** the selected `@__foodgame` account shows 358
   followers, +24 tracked followers, 3.9k average views per video, 0.89%
   average engagement, 8 viral hits, and 19 videos; the growth chart labels 9
   saved snapshots from 20–30 September.
2. **Video inventory:** the paginated card grid exposes source thumbnails,
   views, likes, comments, engagement rate, duration, outlier labels, and
   `Get Insights` actions. This is the strongest visual pattern for a LaraTik
   “Observed content” shelf.
3. **Competitor radar:** the radar and six-item watchlist combine relative
   scale with direct account actions. It is useful as an information hierarchy
   reference, but the provider-backed account snapshot remains gated on
   authorized LaraTik UAT.

The KPI strip reports 358 followers while the latest saved growth snapshot is 357. That one-unit freshness mismatch is valuable evidence: LaraTik should
show the metric timestamp/source beside current totals and avoid implying that
all cards come from one atomic snapshot.

This is the clearest Meedro pattern to carry into LaraTik next: keep the
Command Center section rail, make every recommendation evidence-backed and
actionable, and let a saved observation hand off to Research or Quick Create.
LaraTik should retain the source URL, sample size, freshness, and uncertainty;
it should not copy provider media, scrape competitor accounts, or trigger
credit-consuming analysis automatically. The live screenshot was captured in
the authenticated Chrome inspection; the durable local references below are
the repository's reviewable Stitch and LaraTik captures.

The current LaraTik Command Center now makes that provenance visible in the KPI
strip: it shows the authorized read-model source, the latest metric date, and
the contributing-channel coverage separately from the overall sync freshness.
The focused Chromium light/dark and inventory journey passes 3/3, including
serious/critical axe checks, so this evidence rule is part of the implemented
surface rather than only a report recommendation.

Its Data health panel also renders one actionable row per connected account:
platform, status, and last-sync time are visible next to the aggregate health
counts, while provider error payloads remain behind the Analytics review link.
The overview now adds a compact source-only research watchlist summary with a
direct Research handoff; manual entries stay explicitly labeled until provider
snapshots are authorized and verified.
The changed workspace overview exact reference passes 1/1 and the responsive
matrix passes 3/3 without a snapshot refresh.

The authenticated re-check on 2026-09-30 refreshed that evidence. The selected
Instagram account showed 357 followers, +24 tracked followers, 3.9k average
views per video, 0.89% average engagement, 8 viral hits, and 19 videos. The
lower analytics viewport showed eight performance outliers, a recommended Tue
3pm UTC slot at 12.0k average views across two videos, and duration bands of
15–30 seconds (5.1k median views, 3.07x), 30–60 seconds (1.7k, 1.00x), and
under 15 seconds (1.3k, 0.80x). These values confirm that the heatmap and
length bands are decision-support components, not decorative charts: each has
sample size, comparison context, and a visible recommendation.

A separate read-only Meta Business Suite checkpoint confirmed additional
source fields worth supporting when the canonical LaraTik connection is ready:
period-aware Views, Follows, visits, content interactions, 3-second views,
watch time, recent content, and weekly-plan progress. The authenticated
surface was Just Halal rather than LaraTik, while the inspected production
Planner workspace showed `Workspace unavailable`; a fresh `/app` check also
showed no active agency/workspace. This evidence is a field map, not LaraTik
UAT. No Meta state was changed and the asset must not be connected.

Current LaraTik runtime cross-check (authenticated, read-only, 2026-09-30):
the `DR Reem Reda` workspace already has connected Instagram and Facebook
channels, both last synced about 11 hours ago. Social Analytics reports 1/2
healthy, 1 degraded, and 0 stalled, with a `metric_unavailable` provider error
on the degraded account. The existing surface already covers freshness,
7/30/90-day windows, Followers/Reach/Views/Interactions, absolute versus
growth comparison, CSV export, and an accessible ranking table. The observed
workspace snapshot was 2,468 current followers and +824 (+50.1%) over seven
days across two selected channels. This validates the M2 approach: enrich the
existing read model and expose honest partial/error states before adding
post-level Meedro signals.

Priority: P1.

Data boundary: the current Planner path can link a planner-owned Meta post ID,
permalink, media type, and publish time, and it can aggregate account/day
metrics. The first bounded observation slice now persists available Instagram
views, reach, saves, shares, total interactions, likes/comments, and
provider-supplied video duration for up to 10 recent media objects per sync.
Unsupported metrics remain nullable. This supports honest top-content/outlier,
timezone-aware best-time, and duration-band cards with sample-size context. It
now also accepts up to 10 Facebook Page feed pointers with aggregate
engagement counts when the existing read-only scope permits them. Facebook
post-level reach/views and historical pagination still require provider
capability evidence and must not be approximated from profile totals. The
agency-admin probe now checks one Page post with v25's
`post_media_view`/`post_total_media_view_unique` replacement metrics, but
controlled Page UAT is still required before these values enter normal sync or
ranking.
Top observed posts now expose a workspace-scoped “Create brief” handoff into
Quick Create; the source is shown before submission and the draft stores a
durable research link.

### LaraTik implementation captures

The current LaraTik shell and Research shelf are captured in the repository's
responsive evidence set:

- [Command Center / workspace overview](../../tests/e2e/visual-regression.spec.ts-snapshots/reference/canonical-9821d2eb7b254f7bbfe47827e9ab53eb-stitch.png)
- [Research shelf — mobile](../../tests/e2e/visual-regression.spec.ts-snapshots/responsive/app-w-acme-research-mobile-s.png)
- [Research shelf — wide](../../tests/e2e/visual-regression.spec.ts-snapshots/responsive/app-w-acme-research-wide.png)

These are implementation evidence, not copies of Meedro assets. The live
authenticated Meedro dashboard remains the reference for hierarchy and the
local captures are the reviewable LaraTik result.

### 3. Viral Finder

Route: `https://app.meedro.com/viral-finder`

Observed capabilities:

- Find accounts by handle or natural-language description.
- Suggested accounts with platform, follower count, and post count.
- Account info action and Add action.
- Watchlists with account capacity, named lists, and management controls.
- Weekly automatic refresh with last/next update and included-credit messaging.
- Feed filters for account, platform, video type, trial reels, outliers, engagement rate, views, likes, comments, and latest.
- Large result inventory with video source link, duration, performance metrics, viral multiplier, Video Link, and Get Insights.
- Load More Videos.

This is the strongest Meedro feature for LaraTik. It creates a durable research habit and has a direct handoff to a planned content item.

The complete live capture, account/watchlist investigation, extracted field model, and implementation roadmap are in [MEEDRO_VIRAL_FINDER_2026-10-02.md](MEEDRO_VIRAL_FINDER_2026-10-02.md).

Planner gap: LaraTik has Trend Radar source/board concepts and normalized social analytics, but no competitor watchlist, competitor-video snapshot, or source freshness model exposed to planners.

Recommended minimum slice:

1. Add a workspace-scoped research account/watchlist surface.
2. Store immutable provider snapshots, source URL, platform, observed date, and normalized metrics.
3. Support filter/sort and explicit save.
4. Add “Create brief” that pre-fills title, source reference, angle, and evidence links.
5. Keep refresh provider-specific and server-side; never scrape from the client.

Priority: P0.

### 4. Viral Library

Route: `https://app.meedro.com/viral-library`

Observed capabilities:

- Large searchable catalog advertised as 500,000+ short-form videos.
- Monthly update cadence.
- Viral Library and Saved Videos tabs.
- Search field and filter button.
- Many category chips: Trending, Content Marketing, AI & Tech, Faceless, Finance, Business, Relationships, Health Care, Automotive, Career, Crypto, Digital Marketing, Education, Entertainment, Fashion & Lifestyle, Fitness, Food, Investing, Real Estate, Marketing & Sales, Motivational, Product Reviews, Travel, Tutorials, Make Money Online, Animals, and Other.
- Cards show creator, source platform, date, views, likes, comments, engagement rate, multiplier label, duration, category, playback, and Get Insights.
- Load More Videos.

Planner crosswalk: this overlaps with Trend Radar, the planning Library, and the media library, but none is a large external inspiration catalog. The value is discovery and selection, not file storage.

Recommendation: do not import the full catalog. Start with provider-backed search plus saved research items. Reuse existing board/save/brief patterns and keep external media as a reference URL until a user explicitly imports an asset.

Priority: P1, after P0 watchlists.

### 5. Content Ideas+

Route: `https://app.meedro.com/content-ideas`

Observed capabilities:

- Industry/keyword input capped at 120 characters.
- Source positioning through Google, Quora, Reddit, X, and other source badges.
- AI generation action metered by credits; this account showed an insufficient-credit locked state.
- Tutorial entry point.

Planner crosswalk: LaraTik already has Trend Radar onboarding, source configuration, saved boards, and explicit “create brief” behavior. That is the safer foundation. Meedro’s useful lesson is to make the input-to-ideas action simple and visible, not to reproduce its credit lock.

Recommendation: add source-backed idea generation only where the source is configured and the result can be saved as a signal or brief. Keep AI output drafts-only and human-applied, consistent with `docs/design/AI_TREND_AND_DRAFTING_UX_AUDIT_2026-09-09.md`.

Priority: P1; the source-to-brief handoff remains P0.

### 6. Viral Vault

Route: `https://app.meedro.com/viral-vault`

Observed capabilities:

- Summary tabs for analyzed videos, viral hooks/script templates, in projects, and unassigned.
- Platform/video filters, sort by recent analysis, generic filter, search by caption/creator/topic, and selection mode.
- Analyze Videos entry point.
- Empty state explains that links or uploads can be analyzed.
- Project rail with project counts and project options.

The product idea is a research result that remains useful after the first analysis. LaraTik should model that as an auditable research artifact linked to a workspace and optional content item, not as an unstructured notes dump.

Recommendation: make the analysis result structured and reviewable. Candidate fields map naturally to existing `formatPayload`: hook, main message, CTA, scenes, captions, references, and translations. Preserve the source URL and the fact that the values came from AI analysis.

Priority: P0 for the analysis contract; P1 for Vault-style browsing.

### 7. My Projects

Route: `https://app.meedro.com/my-projects`

Observed capabilities:

- Named projects with description and capacity indicator.
- Project options menu.
- Tabs for Saved Videos, Viral Hooks/Script Templates, and Your Scripts.
- Search, sorting, filter, selection, and Export to Excel.
- Empty state focused on saving content into the project.

Planner crosswalk: LaraTik has workspace Library, campaigns/pillars/templates, media folders, and planning items. A second generic project container would add taxonomy debt.

Recommendation: postpone a Meedro-style project model. First allow a research item to attach to an existing campaign, pillar, board, or draft. Add a dedicated research collection only if users need cross-campaign inspiration sets.

Priority: P1, conditional on observed usage.

### 8. Viral Scripts

Route: `https://app.meedro.com/scripts`

Observed capabilities:

- Step 1: topic input capped at 100 characters and Research Topic.
- Step 2: hook style selection with Auto Generate, custom hook, agents, templates, and favorites.
- Hook agents observed: Outcome Gap, Call-Out, Storytime, Shock Value, Fear, Myth-Buster, Negative, Authority, and Curiosity Gap.
- Step 3: script-writing style selection with custom agent/script, agents, templates, and favorites.
- Script styles observed: Meedro Agent, Problem Solving, Myth Busting, Step-by-Step, Authentic, Comparison, Educational, and Storytelling.
- Call to Action selector, Duration selector, Extra Instructions capped at 500 characters, and Generate Now.
- Some custom actions were locked behind Upgrade Now.

Planner crosswalk: LaraTik already has format-specific schemas and per-field AI suggestions. This feature should become a controlled preset library feeding those fields, not a separate script product.

Recommendation: add a small approved hook/style preset registry, then let the existing format-payload editor apply a preset to a draft. Keep presets agency/workspace-scoped where they encode brand voice. Do not add hook/script columns to `content_item`.

Priority: P1.

### 9. B-Roll Assets

Route: `https://app.meedro.com/b-roll-assets`

Observed capabilities:

- Premium stock video/photo catalog.
- Search field, All/Videos/Images toggle, category chips, and Show More.
- Video cards with playback and locked Download.
- Image preview modal with category, full preview, and locked Download.
- Persistent upgrade banner: “Upgrade your plan to unlock this feature.”
- On the inspected plan, search was disabled and downloads were locked, but browsing and previews remained available.

Planner crosswalk: this is mostly already solved more safely by LaraTik’s agency/workspace media library. `docs/media-library.md` defines private storage, provenance, import validation, folder import, visibility, duplicate detection, and protected delivery use.

Recommendation: do not make a stock catalog a P0. If demand is confirmed, add a provider adapter that imports a selected asset into the existing Media Library with source, license, attribution, and provider metadata. Never store a remote stock URL as if it were a durable delivery asset.

Priority: P2.

### 10. MCP Connection

Route: `https://app.meedro.com/mcp-connection`

Observed capabilities:

- Clear permission statement: read account data, search viral library/content ideas, analyze trends/generate insights, with no editing/publishing/payment access.
- Connection tabs for Claude, ChatGPT, and Claude Code.
- Connection count and status.
- Copyable connector URL.
- Step-by-step Claude setup.
- External “Open Claude Connectors” and “Analyze your first video” links.
- Collapsible API-key section with revoke messaging.
- Prompt cards for Brand Voice, The Teardown, and The Batch Teardown.

Planner crosswalk: LaraTik already has a production MCP endpoint, scoped personal tokens, revocation, planning/brand-kit tools, and a maintenance/evaluation contract in `docs/api/mcp.md` and `docs/operations/mcp-maintenance.md`.

Recommendation: copy the permission-first onboarding and prompt-card UX, not Meedro’s token model. Add research read tools only with the smallest scope, keep write actions behind existing role/workflow checks, and update `docs/api/README.md`, `docs/api/mcp.md`, MCP evaluation, Account UI, and bilingual copy together.

The complete live MCP Connection capture, including Claude, ChatGPT, Claude Code,
API-key behavior, connection limits, and the proposed Claude/ChatGPT/MiniMax
Planner design, is in [MEEDRO_MCP_CONNECTION_2026-10-02.md](MEEDRO_MCP_CONNECTION_2026-10-02.md).

Priority: P1 after the research read model exists.

### 11. Workflows

Route: `https://app.meedro.com/workflows`

Observed capabilities:

- “Build your content machine” connection CTA.
- Recommended workflows from onboarding: Competitor Intelligence, Brand Voice, and The Teardown.
- Category filters: All, Start here, Understand content, Find ideas, Create content, and AI videos.
- Search workflows.
- Twelve visible workflow recipes: Brand Voice, The Teardown, The Batch Teardown, Steal Like an Artist, The Account X-Ray, Competitor Intelligence, Full Content Audit, The Gap Dashboard, The Trial Reel Finder, The Hook Machine, The Script Factory, and The Video Director.
- Workflow detail modal explains the tool chain, numbered steps, copyable prompt, and Use in Claude/Use in ChatGPT actions.

This is a strong UX pattern for LaraTik’s MCP and AI surfaces. The recipe should show purpose, required input, tool chain, data access, output, and whether the result creates a draft or only returns research.

The complete live catalog capture, including the exact visible titles, descriptions, hints, tool chains, prompts, and Planner preparation mapping for all 12 recipes, is in [Meedro workflow catalog → LaraTik Planner preparation](MEEDRO_WORKFLOW_CATALOG_2026-10-02.md).

Recommendation: add a small set of LaraTik recipes after the underlying tools exist: “Turn saved trend into brief,” “Teardown into format payload,” “Review planning risks,” and “Summarize workspace performance.” Keep actions explicit and reversible.

Priority: P1.

## Shared product patterns worth copying

| Meedro pattern                                         | Keep?               | LaraTik adaptation                                                                                            |
| ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Research / Content Studio / Automate navigation groups | Yes                 | Add a lightweight “Research” group only if P0 research surfaces ship; keep planning as the operational center |
| One obvious primary action per page                    | Yes                 | Use PageHeader action slots and existing quick-create patterns                                                |
| Empty states explain the next action                   | Yes                 | Already a LaraTik convention; preserve bilingual and role-aware states                                        |
| Structured filters and sort controls                   | Yes                 | Reuse existing table/filter primitives and URL-persisted state                                                |
| “Get Insights” beside each source item                 | Yes, with caution   | Make it an explicit AI draft action with capability/quota/error states                                        |
| Credit/upgrade locks                                   | Only for metered AI | Do not copy into normal planning or stored-media workflows                                                    |
| External deep links to Claude/ChatGPT                  | Yes                 | Preserve MCP permission/scope checks and never transmit private workspace data implicitly                     |
| Copyable workflow prompts                              | Yes                 | Pair every recipe with a stable MCP tool/evaluation contract                                                  |

## What LaraTik already covers

The following should not be rebuilt from Meedro screenshots:

- Planning list, calendar, monthly planning, batch add, content detail, publish package, and workflow/approval states: `src/app/(app)/app/w/[slug]/planning/` and related routes.
- Trend Radar and save-signal/create-brief loop: existing trend routes/services and `docs/design/AI_TREND_AND_DRAFTING_UX_AUDIT_2026-09-09.md`.
- Agency/workspace media catalog, imports, folders, sharing, validation, provenance, and delivery integration: `src/app/(app)/app/media`, `src/app/(app)/app/w/[slug]/media`, and `docs/media-library.md`.
- Social analytics, provider-aware metric availability, comparison views, and accessible tables: `src/app/(app)/app/w/[slug]/analytics/social/` and `src/lib/social/analytics-dashboard.ts`.
- AI governance, capability allowlists, quota reservations, drafts-only behavior, and field-level suggestions: `src/app/api/ai/generate/route.ts` and the AI/trend audit.
- Production MCP token, scope, authorization, documentation, and evaluation contract: `src/app/api/mcp/route.ts`, `src/app/(app)/app/account`, and `docs/api/mcp.md`.
- Brand kit, workspace settings, team roles, review queues, client review, and publishing readiness.

## Suggested implementation sequence

### M0 — research contract, no UI clone

- Define the smallest workspace-scoped research item shape: source URL, platform, creator/account, observed date, snapshot metrics, tags, source type, and provenance.
- Reuse existing Trend Radar save/board/brief patterns where possible.
- Keep generated teardown output in a structured JSON payload or research artifact; do not add duplicated columns to `content_item`.
- Decide the provider boundary and retention policy before adding any scraper/connector.

### M1 — competitor watchlist and saved research

- Add watchlist/account discovery and a read-only feed. The first source-only,
  role-gated workspace watchlist registry is now implemented; it stores the
  profile URL and explicit provider status without scraping or inventing metrics.
- Add provider-backed snapshots only after the provider capability is approved
  and proven for the requested account type.
- Add explicit save, filter, freshness, and provider-error states.
- Add “Create brief” into the existing planning flow. The first observed-post
  handoff is implemented; saved teardown results now also have an explicit
  `Create draft` handoff that seeds an editable brief and preserves a separate
  provenance link.
- Ship EN/AR, LTR/RTL, role gates, and evidence for all supported browser sizes.

### M2 — teardown to draft

- Add one governed AI capability for video analysis.
- Return hook, visual hook, overlay, message, CTA, structure, and reusable template fields.
- Show editable preview, provenance, confidence/unknowns, retry, and explicit insert/apply. The notes-only preview, save artifact, Create draft handoff, and blank-field format-specific apply are implemented; provider media remains gated.
- Link applied values to the source research item.

### M3 — approved pattern library

- Add hook/script/style presets using existing format schemas and brand controls.
- Let planners apply a preset in More details and keep the result editable.
- Add usage feedback only after real users use the presets; avoid premature personalization claims.

### M4 — performance feedback

- Add “why this matters for planning” insights to the existing analytics surface.
- Use existing normalized social metrics and show unsupported/no-data/provider-error states.
- Link recommendations to create/edit planning actions.

### M5 — MCP recipes

- Add read-only research tools and a small recipe catalog.
- Keep write recipes explicit, scoped, role-checked, and auditable.
- Update MCP docs, account copy, bilingual catalogs, tests, and evaluation cases in the same change.

### M6 — optional stock B-roll adapter

- Only if the P0/P1 loops show demand.
- Import into Media Library; retain provider/license/provenance metadata.
- Do not let external stock URLs bypass the stored-media delivery floor.

## Audit limits and follow-ups

- The account’s inspected plan locked Content Ideas generation, B-Roll search/download, and some custom Script actions; those behaviors are documented as observed locked states, not assumed implementation details for paid tiers.
- No paid upgrade, credit purchase, AI generation, external connector setup, download, or data mutation was performed.
- The audit did not click “Get Insights” or “Analyze” because those actions may consume credits or create persistent research records.
- The next useful validation is not another screenshot pass; it is a product decision on the M1 research item contract and the provider/platform scope.

## Food Game pilot evidence — 2026-10-01

Food Game is the approved pilot workspace for the next provider-backed review.
Read-only Meta Business Suite inspection confirmed the LaraTik GmbH-owned
`Food Game` Facebook Page and linked Instagram professional account
`@__foodgame`. Planner already shows both profiles connected and synced about
four hours ago. Social Analytics reports 496 combined followers (+11, +2.3%
over seven days), with Instagram healthy at 358 (+8) and Facebook at 138 (+3)
with `metric_unavailable` / provider-limited status. Publishing remains
disabled. This is the correct pilot evidence path; Just Halal remains excluded.
