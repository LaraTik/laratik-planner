# Meedro Viral Finder — live investigation and LaraTik implementation report

**Date:** 2026-10-02  
**Source:** authenticated Meedro account, `https://app.meedro.com/viral-finder`  
**Capture mode:** read-only UI investigation; no account was added or removed, no watchlist was changed, no watchlist refresh was requested, and no `Get Insights` action was run.  
**Observed balance:** the live Meedro header displayed `687 Credits` during this capture. The original request mentioned 723 credits; this report treats the live UI value as an observation, not as a billing reconciliation.

## 1. Executive decision

Viral Finder is a competitor-research loop, not merely a video gallery:

1. Discover accounts from a handle or a natural-language description.
2. Register accounts in one or more watchlists.
3. Refresh the tracked account inventory automatically.
4. Rank posts by an outlier/viral score, engagement, reach, or recency.
5. Filter the inventory to a useful research question.
6. Open the source post or spend an entitled analysis credit for deeper insight.
7. Turn the observed pattern into a brief, script, or planned post.

The correct LaraTik version is a workspace-scoped **Research Watchlists → Observed Posts → Reviewed Teardown → Create Brief** flow. LaraTik already contains most of the durable research shelf needed for this. The implementation should extend that existing path with provider-backed account discovery and bounded snapshots only after the relevant provider capability is approved and tested.

Do not reproduce Meedro by scraping public pages from the browser. Do not copy competitor media into Planner storage. Do not invent missing metrics. Store source links, normalized observations, freshness, completeness, and human-reviewed research conclusions.

## 2. What was observed in the live product

### 2.1 Page identity and primary promise

- Page title: `Viral Finder`.
- Tagline: `Track Your Competitors and Find Their Winning Videos.`
- Sidebar entry: `Viral Finder 578`.
- Header credit indicator during capture: `687 Credits`.
- The page is organized as a research grid with a persistent watchlist and auto-update rail.

### 2.2 Main toolbar

The main results view exposes these controls:

| Control                   | Observed behavior or label                                                      |
| ------------------------- | ------------------------------------------------------------------------------- |
| Account selector          | `All Accounts`; opens account/watchlist scope selection                         |
| Platform/content selector | Initially `All platforms · All Videos 577`; menu separates Instagram and TikTok |
| Sort                      | `Outliers`, `ER %`, `Views`, `Likes`, `Comments`, `Latest`                      |
| Filter                    | Opens the full filter panel described below                                     |
| Trial content             | Toggle button `Trial Reels`                                                     |
| Batch mode                | Toggle button `Selection`                                                       |
| Paging                    | `Load More Videos`                                                              |
| Discovery                 | `Find Accounts`                                                                 |
| Refresh                   | `Update Watchlist`                                                              |

The page initially showed an outlier-ranked feed. The current account data was Instagram-heavy; the TikTok branch displayed `0` videos in the platform menu.

### 2.3 Platform and content menu

The observed menu contained:

- `All platforms · All Videos 577`
- `INSTAGRAM`
  - `Instagram · All Reels 578`
  - `Instagram · Public Reels 577`
  - `Instagram · Trial Reels · 1`
- `TIKTOK`
  - `TikTok · TikTok Videos · 0`

The difference between 577 public reels and 578 all reels is consistent with the single trial reel shown elsewhere in the interface. Treat this as an observed account state, not a universal Meedro rule.

### 2.4 Account scope and tracked inventory

Opening `All Accounts` exposed a `Manage Accounts` list with these observed entries:

| Display name                         | Platform  | Handle              | Public count | Trial count |
| ------------------------------------ | --------- | ------------------- | -----------: | ----------: |
| In-N-Out Burger®                     | Instagram | `@innout`           |          120 |           0 |
| Five Guys                            | Instagram | `@fiveguys`         |          120 |           0 |
| Shake Shack                          | Instagram | `@shakeshack`       |          121 |           0 |
| McDonald‘s Deutschland               | Instagram | `@mcdonaldsde`      |          120 |           0 |
| Food Game                            | Instagram | `@__foodgame`       |           39 |           0 |
| Gustavo Duarte • Insta para Empresas | Instagram | `@gustavoduartemkt` |           57 |           1 |

The public counts sum to 577 and the trial counts sum to 1. The page therefore exposes account-level inventory counts before the user inspects the feed.

The right rail showed:

- `My Watchlist (1/3)`
- `Default Watchlist`
- `6 / 10 Accounts`
- `+ 2` with the label `New videos from this week's auto-update`
- A disabled switch in the watchlist summary
- `Show channel usernames`

Interpretation: the captured Meedro account had one selected/default watchlist out of a three-watchlist allowance, six tracked accounts out of ten in that watchlist, and two newly surfaced videos from the weekly refresh. The avatar stack shows only a compact preview; the account manager confirmed all six accounts.

### 2.5 Weekly auto-update

The right rail displayed:

- Heading: `WEEKLY AUTO-UPDATE`
- Status: `ON`
- `Last update Sunday 27/9/2026`
- `Next update Sunday 4/10/2026`
- `Credits Included in your plan`
- `Meedro AI agents refresh your tracked accounts every Sunday, at no cost to you.`

This is a useful product pattern: recurring account refresh is separated from optional per-video intelligence. LaraTik should use the same separation. A scheduled observation sync should not silently consume a paid AI-analysis budget.

### 2.6 Account discovery

`Find Accounts` opens a discovery surface with:

- Search field: `Describe your content, or find an Account by handle`.
- Disabled `Search` button until text is entered.
- `Add New Account` button.
- A result list described as `showing 0-130 of 150 items` in the captured state.
- Every result includes an avatar, display name, platform icon, handle, follower count, post count, `Account Info`, and `Add`.

The initial suggestions included accounts such as MrBeast, TikTok, IShowSpeed, Zach King, Chris Bumstead, Jay Shetty, GaryVee, Mel Robbins, Alex Hormozi, Rawan, and several Arabic-name accounts. This indicates that discovery is not limited to the six already tracked food accounts.

A read-only search for `halal` returned:

- `Derya Akbayrak | Brand + Web Designer ✶`
- `@deryakba`
- `173.2K Followers · 494 Posts`

The result is not a relevant halal-grocery competitor, which is important: natural-language discovery is a semantic recommendation surface, not a guaranteed category classifier. LaraTik should show the query and discovery provenance and let a human approve an account before it enters a watchlist.

### 2.7 Account information drawer

`Account Info` showed an account detail panel with:

- Title: `Account Info`.
- Description: `Detailed information for @mrbeast.`
- Display name and handle.
- Platform.
- Followers.
- Following.
- Posts.
- Biography.
- `Open Profile` source link.
- Close action.

One discovered MrBeast result resolved to TikTok and showed `143M` followers, `355` following, `477` posts, biography text, and `tiktok.com/@mrbeast`. Other duplicate-looking discovery results showed different platform/account counts. Therefore the canonical identity must be `(platform, provider account id)` rather than handle alone.

### 2.8 Watchlist management

`Manage` opened `Manage Watchlists` with:

- `Create a new watchlist`.
- Field placeholder: `Create Your Watchlist`.
- `Your watchlists`.
- `1 of 3 used`.
- The `Default Watchlist` with avatar preview and the `+ 2` new-video marker.
- `Search usernames…`.
- Platform filter combo box defaulted to `All`.
- `Add Account`.
- `Select all` checkbox.
- Six draggable account rows.

Each account row exposed:

- Platform icon.
- Avatar.
- Display name.
- Handle.
- Current watchlist name.
- `Actions` menu.

The first account's action menu contained:

- `Account Info`
- `Move to`
- `Copy to`
- `Delete`

The presence of `Move to` and `Copy to` means Meedro treats the watchlist as a reusable classification system, not just a single list of competitors. The delete operation appeared as a menu action; no delete was selected.

### 2.9 Result-card data model

The result grid exposed a repeatable card structure:

- Account handle.
- Platform icon.
- Published date.
- Views.
- Likes.
- Comments.
- Engagement rate shown as `ER`.
- Outlier/viral multiplier shown as `x Viral`.
- Duration.
- Preview image or playable video.
- Source link, exposed as `Watch on Instagram` for many cards.
- `Video Link` button.
- `Get Insights` button.

Representative captured cards:

| Account             | Date         | Views | Likes | Comments |    ER | Viral | Duration |
| ------------------- | ------------ | ----: | ----: | -------: | ----: | ----: | -------: |
| `@mcdonaldsde`      | Apr 9, 2026  |  5.5M |   12K |      167 |  0.2% | 80.6x |     0:18 |
| `@mcdonaldsde`      | Jun 2, 2026  |  3.4M |  2.4K |       71 |  0.1% | 50.5x |     1:00 |
| `@__foodgame`       | Sep 8, 2026  |   22K |    58 |        4 |  0.3% | 44.7x |     0:15 |
| `@shakeshack`       | Mar 4, 2025  |  2.2M |   61K |      498 |  2.8% | 41.1x |     0:16 |
| `@gustavoduartemkt` | May 16, 2025 |  367K |  8.5K |       6K |  4.0% | 40.3x |     0:47 |
| `@mcdonaldsde`      | May 6, 2026  |    2M |  195K |      501 | 10.0% | 28.8x |     0:26 |
| `@fiveguys`         | Feb 17, 2026 |  312K |   14K |     8.3K |  7.1% | 12.8x |     0:14 |
| `@innout`           | Jul 22, 2025 |  805K |   49K |     3.1K |  6.5% |  8.1x |     3:07 |

Observed data-quality edge case:

- One `@mcdonaldsde` card showed `Likes -1`, while the same card showed 2.4M views, 161 comments, `ER 0.0%`, and `35.1x Viral`.

This is a warning for LaraTik: provider missing values must remain `null` or explicitly marked unavailable. `-1` must not be accepted as a real engagement count or used in an engagement calculation.

Some cards exposed a direct external link; others exposed `Play video` instead. The source-link field is therefore nullable and must be treated as provenance, not as guaranteed media access.

### 2.10 Filters

The full `Filter` panel contained:

**Quick Filters**

- `Medium Views (10K-100K)`
- `High Views: 100k+`
- `High engagement (3%+)`
- `Outlier score (1x+)`
- `Last 3 Months`
- `Last 6 Months`

**Published Date**

- Combo box default: `Anytime`.

**Additional filter**

- Checkbox: `Your Analyzed Videos & Scripts`.

**Ranges**

- Views: `MIN 0`, `MAX 10M`.
- Outlier Score: `MIN 0`, `MAX 100`.
- Engagement %: `MIN 0`, `MAX 100`.
- Likes: `MIN 0`, `MAX 5M`.
- Comments: `MIN 0`, `MAX 100K`.

**Actions**

- `Apply Filters`.
- `Reset Filters`.
- `Close`.

The panel supports both fast editorial questions and exact research thresholds. LaraTik should keep the quick presets small and useful, while allowing advanced range filters behind disclosure.

### 2.11 Sort and ranking

The visible sort choices were `Outliers`, `ER %`, `Views`, `Likes`, `Comments`, and `Latest`.

The UI exposes an `x Viral` multiplier and an `Outlier Score` range, but the formula and comparison baseline were not exposed in the interface. The report therefore treats the score as a provider-supplied or provider-defined metric, not as a formula LaraTik should copy by guesswork.

The examples also show why ranking must be contextual:

- A very high-view post can have low ER and still rank highly by outlier multiplier.
- A smaller account can show high ER and substantial comments with fewer views.
- A 3:07 post and a 0:05 post can both be “winning” for different creative reasons.

LaraTik should expose score provenance and allow users to compare both absolute performance and account-relative performance when the baseline is valid.

### 2.12 Trial Reels

The platform menu exposed one Instagram trial reel and a `What are Trial Reels?` explanation. The explanation said:

> Trial Reels are videos Instagram shows only to non-followers as a test before the creator posts them to their feed. View counts and engagement here reflect a small, exploratory audience useful for spotting concepts a creator is experimenting with.

The trial panel showed:

- Heading: `About Instagram Trial Reels`.
- Label: `You're viewing Instagram Trial Reels`.
- A `TRIAL REEL` card label.
- `Upgrade to see what your competitor is doing. Available in Pro and higher plans`.
- `Video Link`.
- `Get Insights`.

Observed implication for the current account:

- Trial inventory is visible as a count and an explanatory state.
- The actual competitor trial-reel content is paywalled behind Pro or higher.
- Trial metrics are exploratory and should not be mixed with ordinary feed performance without a visibility/type label.

### 2.13 Cards and actions not executed

The following actions were intentionally not executed:

- `Get Insights`: likely an entitlement/credit-consuming analysis path; exact output and cost remain unverified.
- `Update Watchlist`: could trigger a refresh or external provider work; not needed for a read-only audit.
- Add, move, copy, or delete account/watchlist actions.

The report must not claim an exact Meedro Insights response schema until one is run under an explicit user-approved credit budget.

## 3. Reconstructed user journey

### Discovery journey

1. Open Viral Finder.
2. Choose all accounts or one tracked account/watchlist.
3. Open Find Accounts.
4. Search by handle or describe a niche/content goal.
5. Inspect follower count, post count, platform, biography, and source profile.
6. Add the account only after human review.
7. Place it into a named watchlist.

### Research journey

1. Select platform and content type.
2. Start with Outliers to find account-relative winners.
3. Switch to ER, Views, Likes, Comments, or Latest depending on the question.
4. Apply a quick filter such as high engagement, high views, or last three months.
5. Use ranges to remove noise.
6. Inspect the card's date, duration, source account, metrics, and source link.
7. Open the source post when needed.
8. Save the observation or request a deeper analysis only when the user understands the entitlement/cost.
9. Convert the pattern into a brief, not a copy of the competitor's media.

### Weekly operating rhythm

- Monday: review newly surfaced posts from the automatic refresh.
- Tuesday: shortlist two or three patterns by outlier score and engagement.
- Wednesday: write a reviewed teardown for Just Halal or Dr Reem Reda.
- Thursday: create next week's drafts from the approved teardowns.
- Friday: review which hypotheses became posts and which were rejected.

## 4. Information worth extracting

### 4.1 Account-level fields

| Field                      | Required?                | Notes                                                                                       |
| -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Workspace/watchlist id     | Yes                      | Planner ownership boundary                                                                  |
| Platform                   | Yes                      | Instagram, Facebook, TikTok, YouTube as supported by Planner; provider availability differs |
| Provider account id        | Yes when provider-backed | Canonical identity; do not key by handle alone                                              |
| Handle                     | Yes                      | Normalize for comparison; display with `@`                                                  |
| Display name               | Nullable                 | Provider value at observation time                                                          |
| Source profile URL         | Yes when known           | Provenance link                                                                             |
| Followers/following/posts  | Nullable                 | Point-in-time account facts, never assumed current                                          |
| Biography                  | Nullable                 | Use for research context; provider policy and retention apply                               |
| Visibility/status          | Yes                      | Manual, available, unsupported, error, archived                                             |
| Last checked / observed at | Yes                      | Freshness display                                                                           |

### 4.2 Post-level fields

| Field                           | Required?                | Notes                                              |
| ------------------------------- | ------------------------ | -------------------------------------------------- |
| Provider post id                | Yes when provider-backed | Stable dedupe key with provider/account            |
| Permalink                       | Nullable but preferred   | Source-only link; must remain HTTPS                |
| Account reference               | Yes                      | Foreign key to provider account/watchlist identity |
| Published at                    | Nullable                 | Provider timezone/precision may differ             |
| Media type/product type         | Yes or explicit unknown  | Reel, video, carousel, image, unknown              |
| Duration seconds                | Nullable                 | Needed for creative pattern analysis               |
| Views                           | Nullable                 | Do not turn missing into zero                      |
| Likes                           | Nullable                 | Do not store `-1` as a real count                  |
| Comments                        | Nullable                 | Same rule                                          |
| Reach/interactions/saves/shares | Nullable                 | Only if officially returned and approved           |
| Visibility class                | Yes                      | Public, trial, owned, unknown                      |
| Source provider/API version     | Yes                      | Auditability and provider semantics                |
| Observed at                     | Yes                      | Freshness and repeated sampling                    |
| Completeness state              | Yes                      | Complete, partial, unavailable, errored            |

### 4.3 Derived/editorial fields

These belong in a validated research result or view model, not in raw provider data:

- Account-relative outlier score, only when its baseline is explainable.
- Engagement rate, with numerator/denominator and missing-field rules recorded.
- “Why this matters” editorial note written or approved by a planner.
- Hook pattern.
- Content angle.
- Offer/value proposition.
- Visual device.
- Pacing/duration pattern.
- CTA pattern.
- Audience/language hypothesis.
- Adaptation idea for Just Halal or Dr Reem Reda.
- Confidence and evidence links.

## 5. LaraTik Planner mapping

### 5.1 Existing reusable pieces

The current codebase already has:

- `research_watchlist_account` for workspace-scoped source account registrations.
- `research_collection` for named research projects.
- `research_bookmark` for saving a normalized observed post.
- `social_post_observation` for bounded provider post observations.
- `research_teardown` for validated structured research conclusions.
- `content_research_link` for linking a saved observation to a planner draft.
- `content_research_teardown_link` for linking a reviewed teardown to a draft.
- `laratik_planner_list_research` in the remote Planner MCP for read-only research retrieval.
- A research route and watchlist UI with explicit `manual`, `available`, `unsupported`, and `error` provider states.

This is enough to support the durable part of Viral Finder without adding a parallel “competitor content” database.

### 5.2 Current gaps relative to Meedro

The current Planner watchlist is intentionally a source registry, not a discovery/scraping service. It does not yet provide:

- Named watchlists with account membership.
- Account capacity or plan-based watchlist limits.
- Search-by-description account discovery.
- Provider-backed competitor account resolution.
- A competitor result grid with Outliers/ER/Views/Likes/Comments/Latest sorting.
- Quick filters and range filters for research observations.
- A provider-backed refresh scheduler for competitor accounts.
- A distinct trial-reel visibility state.
- A paid “Get Insights” entitlement and reservation flow.
- A one-click “Create brief from this observation” action from the competitor grid.

The first five are product-surface gaps. The provider-backed rows are capability and compliance gates, not just UI work.

### 5.3 Recommended data design

**Phase 1: extend existing watchlist identity**

- Keep `research_watchlist_account` as the account registry.
- Add named watchlist membership only when a real multi-list use case is required; avoid adding a second account table.
- If named lists are implemented, use a workspace-scoped `research_watchlist` plus a membership relation keyed by the provider account identity. Preserve the existing source registry as the canonical account record.
- Keep `providerStatus`, `lastCheckedAt`, and provider errors explicit.

**Phase 2: reuse normalized observations**

- Reuse `social_post_observation` where the provider and metric semantics match.
- Add only the minimum nullable fields needed for approved research observations, such as visibility class and a provider-supplied outlier score, if the provider contract supports them.
- Keep provider raw bodies, access tokens, and downloaded competitor media out of the research shelf.
- Use `sourceMetadata` only for bounded, non-secret provenance such as sample completeness or provider metric names.

**Phase 3: research view model**

Expose a normalized read model with:

```text
account: provider, providerAccountId, handle, displayName, profileUrl
post: providerPostId, permalink, publishedAt, mediaType, durationSeconds
metrics: views, likes, comments, engagementRate, outlierScore
state: visibility, completeness, observedAt, providerApiVersion
actions: openSource, save, createBrief, requestInsights
```

Do not persist a derived metric unless its formula, input fields, baseline, and provenance are known.

### 5.4 Provider boundary

The implementation must follow the existing Planner rules:

- No client-side scraping.
- No browser automation against competitor pages as a production data source.
- No inferred provider metrics.
- No publishing behavior in this feature.
- No provider credentials in client code, logs, screenshots, or MCP output.
- Provider setup is agency-scoped and read-only until external-service UAT is signed.
- Each provider observation must carry source account, period/freshness, sample size, and partial-data state.
- A provider connection alone is not evidence that competitor discovery or competitor post metrics are available.

Meta and TikTok availability must be confirmed against the exact official API permissions and account type. If a provider cannot legally or technically return competitor public-post inventory, the Planner should support manual source registration and planner-entered research links instead of pretending to offer parity.

### 5.5 Research-to-brief handoff

The useful LaraTik action is not “copy this video.” It is:

1. Save the source observation.
2. Add it to a collection.
3. Run or write a structured teardown.
4. Click `Create brief`.
5. Pre-fill title, format suggestion, short brief, source reference, and evidence links.
6. Keep the source relationship in research-link metadata.
7. Let the planner edit every generated field before the draft enters production.

For a Just Halal adaptation, a source observation could produce:

- Title: `Fast basket build for a weekend BBQ`.
- Format: short video or carousel.
- Brief: `Adapt the fast product-reveal structure for halal BBQ essentials, with local availability and app delivery as the final action.`
- Evidence: source permalink, observed metrics, account, date, and teardown.
- Arabic sidecar: reviewed native Arabic copy, not a machine-translated afterthought.

## 6. Just Halal applications

### 6.1 Proposed watchlists

Keep lists narrow enough to answer one marketing question:

1. `Halal Grocery Competitors`
2. `Food Delivery & Convenience`
3. `Arabic Food Creators`
4. `German/English Local Food Creators`
5. `Seasonal, Ramadan & Eid`
6. `Price, Value & Basket Builds`
7. `Family Meals & Quick Solutions`

Do not mix Dr Reem Reda psychology accounts into the grocery competitor list. Use a separate research collection or workspace context so the resulting patterns do not pollute Just Halal content decisions.

### 6.2 Signals to extract from winning posts

For supermarkets and delivery brands:

- Product reveal or “what arrived today”.
- Basket build under a price ceiling.
- One-meal shopping list.
- Before/after pantry restock.
- Delivery unboxing.
- “Available now” urgency.
- Store tour or aisle discovery.
- Halal trust proof and certification visibility.
- Freshness, provenance, and quality proof.
- Family convenience and time saved.
- Local-language hook.
- Clear app-download or order-now CTA.
- Comment questions that reveal demand or confusion.

For Arabic and bilingual creators:

- Arabic hook length and dialect.
- Whether the visual text is Arabic, English, or mixed.
- Use of culturally familiar meal moments.
- Ramadan, Eid, Friday, school, work, and family timing.
- Whether the CTA is direct, conversational, or community-led.
- Whether German location context is visible to the audience.

### 6.3 Research questions LaraTik should support

- Which competitor posts beat that account's normal baseline?
- Which products appear repeatedly in high-performing posts?
- Which hooks produce comments rather than passive views?
- Do price-led posts or convenience-led posts create stronger engagement?
- Which content structures work in Arabic versus English/German?
- Which posts naturally support app download or delivery conversion?
- Which seasonal patterns should be prepared four weeks ahead?
- Which competitor patterns are overused and should be avoided?

### 6.4 Example research-to-content outputs

**Pattern:** short product reveal with a fast basket build.  
**Just Halal adaptation:** “3 halal dinner ideas under €25” with items pulled from the app.  
**CTA:** “Save this list, then order the basket in the Just Halal app.”

**Pattern:** delivery unboxing with a visible time promise.  
**Just Halal adaptation:** “From phone tap to kitchen shelf” with real delivery timing, only if operationally accurate.  
**CTA:** “Try your first delivery in the app.”

**Pattern:** comment-led product answer.  
**Just Halal adaptation:** turn real customer questions into weekly “You asked, we found it” videos.  
**CTA:** “Comment the next item you want us to find.”

**Pattern:** seasonal meal preparation.  
**Just Halal adaptation:** Ramadan/Eid/Friday meal kits, with separate Arabic and English/German versions reviewed by a native editor.

## 7. Arabic, English, German, and RTL requirements

The research surface must be bilingual from its first implementation slice:

- Translate headings, filter labels, empty states, errors, plan/entitlement messages, and action labels through the central catalogs.
- Keep English and Arabic key shapes identical.
- Use `DirAwareInput`/`DirAwareTextarea` for search descriptions and editorial notes.
- Keep handles, URLs, provider ids, hashtags, and metric tokens in content-driven or explicit LTR direction.
- Format numbers with Western digits and the workspace timezone.
- Use `bdi` for handles and mixed-direction provider values.
- Review Arabic grocery language against the project glossary; direction switching is not sufficient.
- Do not machine-translate a competitor's caption and treat it as approved Arabic brand copy.
- Keep German as a future content locale unless it is formally enabled; store source references and notes without inventing catalog support.

## 8. Entitlements, credits, and safe analysis UX

Meedro demonstrates a useful separation:

- Watchlist/account refresh is included in the captured plan state.
- Trial Reel details are visible only at a higher plan tier.
- `Get Insights` is presented per card and was not executed in this audit.

LaraTik should model these as explicit capabilities:

### Free/read-only research

- View manually registered accounts.
- View approved provider observations.
- Filter and sort normalized metrics.
- Save a source link.
- Create a planner brief from existing evidence.

### Entitled AI analysis

- Show capability availability before running.
- Show expected cost/allowance and remaining budget if applicable.
- Require explicit user action.
- Reserve usage atomically before a paid call.
- Return a preview, not an automatic database write.
- Allow retry only after a clear failure/refund decision.
- Preserve the source observation and analysis provenance.

Never make a weekly refresh silently consume a paid AI-generation allowance. Never label a manual teardown as provider-generated insight.

## 9. Delivery roadmap

### P0 — make the current research shelf useful

- Improve the existing research page to show account/source status, freshness, and empty/error states.
- Add a research card/grid view for normalized observed posts.
- Add filters for platform, account, date, views, engagement, and completeness.
- Add `Save`, `Open source`, `Create teardown`, and `Create brief` handoffs.
- Add the missing provenance fields to the UI, not necessarily to storage if they already exist in the read model.
- Keep manual watchlist accounts fully supported.

### P1 — add named watchlists and approved provider snapshots

- Introduce named watchlist membership only after confirming it is needed beyond collections.
- Add an account discovery adapter with explicit provider capability states.
- Add bounded, scheduled provider observation sync.
- Add freshness, sample size, partial-data, and provider-version display.
- Add account-relative ranking only when the baseline is defined and tested.
- Add Trial Reel/experimental visibility as a nullable provider capability, not a universal field.

### P2 — controlled intelligence layer

- Add a reviewed structured teardown flow for provider observations.
- Add entitled AI analysis with cost reservation and audit trail.
- Add pattern comparison across watchlists and time periods.
- Add “Create four-week plan” as a planner handoff built from selected evidence.
- Add Arabic editorial review checkpoints for generated outputs.

### Explicitly defer

- Browser scraping.
- Automatic copying or downloading of competitor media.
- Automatic publishing.
- Unverified Trial Reel parity.
- A new analytics store separate from the authorized social read model.
- A new MCP write tool until the domain workflow is stable and documented.

## 10. Acceptance checklist

### Product behavior

- [ ] A planner can add a manual account with platform, handle, display name, and source URL.
- [ ] A planner can distinguish manual, available, unsupported, and error states.
- [ ] A planner can save an observed source without copying provider media.
- [ ] A planner can filter and sort observations with clear metric labels.
- [ ] Missing metrics render as unavailable, never as `-1` or invented zero.
- [ ] Every observed card shows source, account, published date, observed date, and freshness.
- [ ] A saved observation can create a reviewed teardown and then a draft.
- [ ] The draft retains a research provenance link.
- [ ] Paid/entitled analysis shows cost and confirmation before use.

### Provider and security

- [ ] Provider capability is tested against the exact account type and permission set.
- [ ] No browser scraping is used as a production source.
- [ ] Provider credentials remain server-side and encrypted.
- [ ] Raw provider bodies and tokens are excluded from UI/MCP results.
- [ ] Sync is bounded and retry-safe.
- [ ] Freshness and partial-data state are visible.
- [ ] Unsupported provider metrics remain nullable.

### Bilingual and accessibility

- [ ] English/LTR and Arabic/RTL use the same route and domain flow.
- [ ] Catalog parity passes.
- [ ] Search, filters, dialogs, cards, and drag alternatives are keyboard accessible.
- [ ] Handles, URLs, hashtags, and metrics render correctly in mixed direction.
- [ ] Empty, loading, error, permission, unsupported, and stale states are reviewed.
- [ ] Responsive evidence exists at the project-required widths.

## 11. Open questions before implementation

1. Which official provider can legally and technically return the account and competitor-post inventory we need?
2. Is the desired first release manual research plus approved source links, or is provider-backed discovery a hard launch requirement?
3. What is the exact outlier formula and comparison baseline we are willing to explain to users?
4. Should named watchlists be separate from the existing research collections, or is one account registry plus collections enough?
5. What is the retention policy for account biographies and provider snapshots?
6. Are Trial Reels or equivalent experimental posts available through an approved API, and can they be distinguished reliably?
7. Should AI analysis be charged per observation, per batch, or by agency capability budget?
8. Which roles may add accounts, refresh providers, save observations, run teardowns, and create briefs?
9. Should account discovery results be cached, and for how long, when the provider terms permit it?
10. Which Just Halal markets and languages should be first-class in the initial research templates?

## 12. Related LaraTik documents

- [Meedro feature audit](MEEDRO_FEATURE_AUDIT_2026-09-30.md)
- [Meedro workflow catalog](MEEDRO_WORKFLOW_CATALOG_2026-10-02.md)
- [Meedro MCP connection audit](MEEDRO_MCP_CONNECTION_2026-10-02.md)
- [Planner MCP contract](../api/mcp.md)
- [MCP maintenance contract](../operations/mcp-maintenance.md)
- [Current research route](<../../src/app/(app)/app/w/[slug]/research/page.tsx>)
- [Research schema](../../src/lib/db/schema/research.ts)
- [Social observation schema](../../src/lib/db/schema/social-analytics.ts)
- [Research watchlist API](../../src/app/api/research/watchlist/route.ts)

## Bottom line

Meedro's strongest idea is the research habit: a small, refreshed watchlist produces a ranked stream of useful examples, and every example can become a creative decision. LaraTik should adopt that habit while preserving its stronger boundaries—workspace ownership, provenance, human review, normalized observations, Arabic support, and no scraping or autonomous publishing.
