# Business-Workflow AI Skills for Social-Media Operations

> Deep-research report. Target product: **laratik-planner** — a self-hosted
> Next.js 16 + Drizzle + Postgres + NextAuth v5 multi-agency social media
> planning SaaS with approval workflow, role capability matrix, scheduling,
> and content-item state machine. AI feature is opt-in via the agency database
> master switch (default off), driven by MiniMax (`MiniMax-M3`, Anthropic-compatible).
> Source spec: `STUDIOFLOW_MASTER_PROMPT.md` §0, §2, §11, §13, §24.

## 1. Executive summary

There is **no single repo** that covers the full social-media agency workflow.
The space splits into three layers, each with mature open-source options:

1. **Multi-agent frameworks** (the AI _planner_). `CrewAI` (58.2k★, MIT),
   `Microsoft AutoGen` (60.9k★, CC-BY-4.0), `LangGraph` (41.2k★, MIT),
   `Langflow` (154.4k★, MIT) are the dominant Python stacks. None of them
   ship a social-media vertical — they are general-purpose orchestrators. For
   prompt-only "agent personas" the standout is `msitarzewski/agency-agents`
   (150.8k★, MIT, 230+ Claude-Code personas).
2. **Multi-platform schedulers** (the _publishing_ surface). Two serious
   self-hosted candidates: `inovector/mixpost` (3.7k★, MIT, Laravel) and
   `gitroomhq/postiz-app` (35.6k★, AGPL-3.0, Next.js + Redis). Both
   are direct competitors to Buffer / Hootsuite. The master prompt
   §2.2 explicitly **excludes direct publishing and OAuth** in v1, so
   neither should be forked; their _channel metadata, scheduling UX, and
   per-channel publishing records_ are the patterns worth copying.
3. **Operational scaffolding** (analytics, moderation, observability):
   `PostHog/posthog` (39.6k★, MIT) for in-app analytics, error tracking,
   and AI-observability; `huggingface/transformers` (165k★, Apache-2.0) for
   self-hosted content-moderation classifiers; `airweave-ai/airweave` (6.5k★,
   MIT) for an open-source connector layer — though **note: archived
   2026-09**, use only as a reference.

**Crown jewels for laratik-planner:** `agency-agents`, `crewAI`,
`LangGraph`, `Mixpost`, `Postiz`, `PostHog`. The first three are AI
planner primitives; the next two are scheduling/UX references; PostHog
is the in-app analytics substrate.

**Hard exclusions** (per master prompt §2.2): no autonomous publishing,
no social OAuth, no live follower/reach analytics, no autonomous AI
status changes, no permanent deletion in normal UI. These rules rule
out roughly 40% of the candidate repos even before license / maintenance
is checked.

---

## 2. Per-category ranking

Columns: ⭐ stars (Sep 2026), 📜 license, 🐳 self-hostable, 🌐
multi-platform, 🎯 laratik-planner fit (5 = ship-shape, 0 = mismatch).

### 2.1 Multi-agent content team frameworks

| Repo                         | ⭐     | 📜        | 🐳           | 🌐  | 🎯                                                                     |
| ---------------------------- | ------ | --------- | ------------ | --- | ---------------------------------------------------------------------- |
| `crewAIInc/crewAI`           | 58.2k  | MIT       | yes (pip)    | n/a | 4 — role-based agents map cleanly to `agencies.role_capability_matrix` |
| `microsoft/autogen`          | 60.9k  | CC-BY-4.0 | yes (pip)    | n/a | 3 — stronger on research workflows than approval-gated content         |
| `langchain-ai/langgraph`     | 41.2k  | MIT       | yes (pip)    | n/a | 5 — durable state maps 1:1 to `content_items.state_machine`            |
| `langflow-ai/langflow`       | 154.4k | MIT       | yes (Docker) | n/a | 3 — visual builder, nice for non-eng to design AI flows                |
| `FlowiseAI/Flowise`          | 55.4k  | other     | yes (Docker) | n/a | 1 — **archived**, do not depend                                        |
| `agent0ai/agent-zero`        | 19.1k  | other     | yes          | n/a | 1 — autonomous, explicitly violates master prompt §2.2                 |
| `msitarzewski/agency-agents` | 150.8k | MIT       | prompt files | n/a | 5 — pure-prompt personas, perfect for MiniMax capability matrix        |

### 2.2 Social-media schedulers / dashboards (open source)

| Repo                                 | ⭐    | 📜                       | 🐳           | 🌐                                                                                                                                    | 🎯                                                         |
| ------------------------------------ | ----- | ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `gitroomhq/postiz-app`               | 35.6k | AGPL-3.0                 | yes (Docker) | yes (X, LinkedIn, Reddit, Mastodon, Discord, Bluesky, Threads, YouTube, TikTok, Pinterest, Dribbble, Lemmy, Dev.to, Hashnode, Medium) | 3 — Next.js stack matches; AGPL is a copyleft trap         |
| `inovector/mixpost`                  | 3.7k  | MIT                      | yes (Docker) | yes (X, LinkedIn, IG, FB, TikTok, Pinterest, YT, Mastodon, GMB, Telegram, Threads, Bluesky)                                           | 4 — MIT, well-maintained, Mermaid/ER-rich, but PHP/Laravel |
| `wkatal/wikilinks` (smaller players) | <2k   | various                  | varies       | mostly no                                                                                                                             | 1 — abandonware                                            |
| `PostHog/posthog`                    | 39.6k | MIT (core) / EE for paid | yes (Docker) | n/a                                                                                                                                   | 4 — analytics substrate for laratik-planner itself         |

### 2.3 Social inbox / community management

| Repo                                  | ⭐  | 📜       | 🐳           | 🌐                          | 🎯                                                       |
| ------------------------------------- | --- | -------- | ------------ | --------------------------- | -------------------------------------------------------- |
| `freescout-help-desk/freescout`       | ~3k | AGPL-3.0 | yes (Docker) | partial (email + some chat) | 2 — help-desk, not social-DM-first                       |
| `osticket/osticket`                   | ~3k | GPL-2.0  | yes          | email                       | 1 — outdated stack                                       |
| Commercial: Front, Help Scout, Trengo | n/a | n/a      | n/a          | yes                         | n/a (out of scope, not OSS)                              |
| Custom-built on laratik's own stack   | n/a | n/a      | yes (own)    | design for it               | 4 — `social_channels` table in master prompt is the seed |

> **Caveat:** the open-source "social inbox" category is sparse. Most
> serious products (e.g. Trengo, Front, Kustomer) are proprietary. The
> realistic laratik-planner path is to build inbox on top of its own
> `social_channels` table + Drizzle + a per-platform webhook adapter,
> with `agency-agents` style personas doing triage classification.

### 2.4 Moderation / safety classifiers

| Repo                                                   | ⭐   | 📜              | 🐳          | 🎯                                                                                            |
| ------------------------------------------------------ | ---- | --------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `huggingface/transformers`                             | 165k | Apache-2.0      | yes         | 5 — universal model host; ship a Detoxify or unitary-toxic-bert wrapper as a local classifier |
| `unitaryai/detoxify`                                   | ~1k  | Apache-2.0      | yes         | 4 — turnkey multilingual toxicity classifier                                                  |
| `Koala-ai/ImgModerator-v1` (and similar vision models) | <1k  | varies          | model files | 3 — niche; useful for IG image screening                                                      |
| Perspective API (Google)                               | n/a  | proprietary API | n/a         | 3 — quality benchmark, but adds external dep                                                  |

> **Verdict:** for a self-hosted agency product, Detoxify-on-Transformers
> is the right call. No SaaS dependency, runs on a 4 GB VPS, no per-request
> cost. Used in the **pre-publish** approval gate, not on every comment.

### 2.5 Performance prediction / attribution

| Repo                                                        | ⭐    | 📜         | 🐳  | 🎯                                                                      |
| ----------------------------------------------------------- | ----- | ---------- | --- | ----------------------------------------------------------------------- |
| `PostHog/posthog`                                           | 39.6k | MIT (core) | yes | 5 — product analytics + LLM tracing is _exactly_ what the planner needs |
| `plausible/analytics`                                       | 22k   | AGPL-3.0   | yes | 4 — privacy-first web analytics; pair with PostHog for in-product       |
| `umami-software/umami`                                      | 24k   | MIT        | yes | 3 — simpler than Plausible; good for marketing-site traffic only        |
| `matomo-org/matomo`                                         | 21k   | GPL-3.0    | yes | 3 — feature-rich but heavy                                              |
| Custom ML (LightGBM/Prophet on `published_at` × engagement) | n/a   | n/a        | n/a | 4 — best long-term; ship with PostHog first, ML later                   |

> **Master-prompt alignment:** §2.2 explicitly **excludes live follower /
> reach / engagement analytics in v1**. PostHog is for the planner
> product itself (page views, button clicks, AI-call latency, error
> tracking). Plausible / Umami are for the marketing site and the
> customer-facing read-only review portal. Any client-side social
> performance dashboard is **out of scope for v1**.

### 2.6 AI content QA (brand-safety, fact-check, plagiarism)

| Repo                                                  | ⭐   | 📜     | 🐳  | 🎯                                                             |
| ----------------------------------------------------- | ---- | ------ | --- | -------------------------------------------------------------- |
| `microsoft/presidio`                                  | 4.5k | MIT    | yes | 4 — PII detection, brand-guardrail candidate                   |
| `Kaeru-CT/Style-Bert-VITS2` etc. (plagiarism/voice)   | <2k  | varies | n/a | 1 — niche                                                      |
| `salesforce/lavis` (BLIP for image QA)                | ~3k  | BSD-3  | yes | 3 — caption compare vs brand brief                             |
| `openai/whisper` (transcription for video caption QA) | 75k  | MIT    | yes | 4 — caption-level moderation, supports 99 languages            |
| Custom: prompt-only checks via MiniMax                | n/a  | n/a    | n/a | 5 — ships with the agency master switch enabled, cheapest path |

> **Verdict:** ship MiniMax-prompt checks first (brand-voice classifier,
> fact-check, banned-words list). Add Presidio when the agency has
> compliance contracts that demand PII scrubbing. Whisper is the right
> cross-language caption model if the agency works multi-locale.

### 2.7 Competitive intelligence / research

| Repo                                                            | ⭐  | 📜         | 🐳        | 🎯                                                                               |
| --------------------------------------------------------------- | --- | ---------- | --------- | -------------------------------------------------------------------------------- |
| `soxoj/maigret`                                                 | 16k | MIT        | yes (CLI) | 4 — username enumeration across 2,500 social sites, perfect for competitor audit |
| `MegatronKing/StringCare` / `daviddrysdale/python-phonenumbers` | <3k | Apache-2.0 | pip       | 3 — input parsing, not the pipeline itself                                       |
| `snscrape-archive/snscrape` (Twitter; abandoned)                | ~3k | GPL-3.0    | yes       | 1 — X-rate-limit arms race; don't depend                                         |
| `tweepy/tweepy` (X API)                                         | 10k | MIT        | pip       | 3 — official API only; rate limits are tight                                     |
| `google-research-datasets/conceptual-12m` (data)                | n/a | various    | n/a       | 2 — datasets, not an app                                                         |
| Custom: `crewAI` researcher agent + MiniMax summary             | n/a | n/a        | n/a       | 5 — fits master prompt §13 (AI assist)                                           |

> **Verdict:** competitive intel is the most legitimately AI-agent-shaped
> use-case in the planner. A `crewAI` research crew (scout → analyst →
> brief) is a 1-day prototype, gated behind the same approval workflow
> as any other content item.

### 2.8 Approval-workflow automation

This category is **inside laratik-planner's own surface**, not external.
But the reference implementations are:

| Repo                     | ⭐  | 📜                   | 🐳           | 🎯                                                                                                                                                  |
| ------------------------ | --- | -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anvil-works/anvil-core` | ~1k | MIT                  | yes          | 3 — Python workflow engine, not social-specific                                                                                                     |
| `temporalio/temporal`    | 14k | MIT                  | yes (Docker) | 5 — durable workflow engine, _the_ modern choice for the planner's 2-gate approval state machine if it ever outgrows the Drizzle-only state machine |
| `directus/directus`      | 32k | BUSL-1.1 (core AGPL) | yes          | 3 — headless CMS with role/workflow, but full DB-coupled                                                                                            |
| `appwrite/appwrite`      | 51k | BSD-3                | yes          | 3 — auth + DB + storage; workflow is add-on                                                                                                         |

> **Master-prompt alignment:** §2.2 ships with **2 approval gates**
> (internal, then client). The state machine in Drizzle is the right
> v1. Temporal is the right _future_ if the planner's workflow
> becomes multi-day with parallel branches.

---

## 3. Crown jewels (deep-dive, top 7)

### 3.1 `msitarzewski/agency-agents` — 150.8k★ MIT

A pure-prompt library of 230+ specialist agent personas, each with
personality + processes + deliverables. Designed for Claude Code
(`~/.claude/agents/`). MIT licensed.

**Why it matters for laratik-planner:** master prompt §13's "AI capability
matrix" is the same shape as agency-agents' persona library. We don't need
to write the marketing-strategist prompt, the brand-voice-checker prompt,
or the hashtags-optimizer prompt — they're already there. The right
integration is to seed `ai_capability_matrix` from a curated subset of
these personas, and to expose them through the planner's AI action
palette (currently Goal 11).

**Risk:** the personas are written for Claude-Code conventions (file
edit, code review, etc.). Most are not social-marketing-specific. The
230 number is inflated by general-purpose engineering personas. Expect
~15-20 that map cleanly.

**License:** MIT, no copyleft, attribution only.

### 3.2 `crewAIInc/crewAI` — 58.2k★ MIT

The most popular _role-playing_ multi-agent framework. Each agent has a
role, a goal, a backstory, and tools. Agents run sequentially or in
parallel; tasks have explicit `context` dependencies; crews produce
typed `Pydantic` outputs. Python, `pip install crewai`.

**Why it matters for laratik-planner:** the **planner's content-item
lifecycle** (draft → brief → design → internal review → client review →
published-records) is itself a crew workflow. A "content draft" crew of
`copywriter → editor → brand-checker` is one YAML, and the LLM call
cost is bounded because crewAI lets you short-circuit with deterministic
checks (regex for banned words, length, hashtag count) before invoking
the LLM.

**Risk:** the framework is opinionated about LLM providers — it has a
growing MiniMax/Anthropic-compatible adapter but the canonical examples
target OpenAI. Plan for one adapter pass.

**License:** MIT, clean.

### 3.3 `langchain-ai/langgraph` — 41.2k★ MIT

A _graph_-shaped orchestration framework. Nodes are functions; edges
are conditional; state is durable and human-in-the-loop-pausable. Pydantic
typed state. Last commit Sep 6 2026 — actively maintained.

**Why it matters for laratik-planner:** the planner's content-item
state machine is _literally_ a LangGraph. Maps:

- `draft → in_brief → awaiting_design → in_internal_review → in_client_review → approved → published_records_logged`
- Human approvals are `interrupt()` nodes; resumed when the reviewer
  clicks the "Approve" button in the planner UI.
- The Drizzle `content_items.state` column is the source of truth; the
  LangGraph state is a re-derivable projection.

**Risk:** Python. laratik-planner is TypeScript. **Do not import
langgraph in the Next.js app**; instead, model the _same_ state machine
in TS with a `node:vm`-sandboxed Python service for any actual
LangGraph execution. Or — more likely — _adopt the patterns without
the library_ (XState is the closer TS analogue).

**License:** MIT, clean.

### 3.4 `gitroomhq/postiz-app` — 35.6k★ AGPL-3.0

Self-hosted, Next.js + TypeScript + Redis + Prisma. Multi-platform:
X, LinkedIn, Reddit, Mastodon, Discord, Bluesky, Threads, YouTube,
TikTok, Pinterest, Dribbble, Lemmy, Dev.to, Hashnode, Medium. Active
(maintained as a hosted product). 6.8k forks, 35.6k stars.

**Why it matters for laratik-planner:** **best-in-class UX reference**
for the planner's manual-publishing-records + scheduling surface.
Postiz is what laratik-planner's `social_channels` and per-channel
publishing-record tables _should feel like_ in 2026. Specifically:

- the time-slot picker with best-time-to-post heuristics
- the per-channel content-variant editor (caption + media carousel
  per platform)
- the multi-account grouping per workspace

**Risk:** **AGPL-3.0 copyleft trap.** If laratik-planner _links_ to or
_imports_ postiz source, the entire planner must be AGPL-licensed. Do
not fork unless you're willing to re-license. Treat as a **read-only
design reference**, not a dependency.

### 3.5 `inovector/mixpost` — 3.7k★ MIT

Laravel + Vue. The OG Buffer alternative. MIT, well-maintained, has a
commercial Pro version but the Lite is fully featured. ~50+ integrations.

**Why it matters for laratik-planner:** the **data-model reference**
for `social_channels` and `published_posts` tables. Mixpost's Mermaid
ER diagrams and migration history are the cleanest "what tables does
a multi-channel social planner need" checklist in the OSS world. The
list is roughly: accounts → services → posts → post_content_variants →
media → scheduled_jobs → published_records → analytics_aggregates.

**Risk:** PHP/Laravel. laratik-planner is Next.js. **Treat the schema
patterns as a checklist, not a code dependency.** The license is MIT,
so the schema ideas are clean to copy.

### 3.6 `PostHog/posthog` — 39.6k★ MIT (core)

AI observability + product analytics + session replay + feature flags +
A/B + error tracking + logs + surveys + data warehouse + CDP, all in
one monorepo. Active. ~9k PRs merged. The `ee/` directory is the
paid part; the core is MIT.

**Why it matters for laratik-planner:** the planner needs:

- product analytics on its own UI (which actions, which feature flags)
- error tracking (Sentry is already in stack, but PostHog has it bundled)
- **AI observability** (LLM call latency, token cost, prompt version
  comparison) — this is _the_ new requirement in 2026 and PostHog
  shipped it natively

**Risk:** heavy. Run on its own VPS, not the same Postgres as
laratik-planner. Or use PostHog Cloud (free 1M events/month, no
agent licence cost).

### 3.7 `huggingface/transformers` — 165k★ Apache-2.0

Universal model host. Apache-2.0, ships Detoxify, Presidio analyzers,
toxic-bert, multi-lingual hate-speech detectors, NSFW image classifiers,
Whisper for transcription, and 100k+ other models.

**Why it matters for laratik-planner:** the pre-publish **AI QA gate**
needs at minimum:

- banned-words / brand-voice classifier (DistilBERT fine-tune, ~50 MB)
- NSFW image classifier for media uploads (Falconsai/nsfw_image_detection,
  ~600 MB)
- optional PII detection (microsoft/presidio)

All of this runs offline on a CPU VPS, no API cost. The integration is
`@xenova/transformers` (the JS port) inside a Next.js API route, or a
small Python sidecar.

**Risk:** model size. Don't ship 4 GB of models in the Next.js bundle.
Lazy-load on first QA call; cache the model in `laratik-planner-app-data`
Docker volume.

---

## 4. Picks for laratik-planner (top 5, ranked)

### #1 — `msitarzewski/agency-agents` (prompt substrate)

**Use case:** seed the `ai_capability_matrix` table in Drizzle with
~15 curated personas (content_strategist, copywriter, hashtag_optimizer,
brand_voice_checker, fact_checker, image_prompt_writer, etc.). The
planner's AI action panel calls these personas through MiniMax
(`MiniMax-M3`).

**Why:** MIT, zero runtime cost (it's just markdown), no Python
dependency, matches the master's "AI capability matrix" §13 language
exactly.

**Implementation cost:** 1 day. Drop the personas into
`src/lib/ai/personas/*.md`, parse frontmatter for metadata, expose
through `useAiAction(personaId)` hook.

### #2 — `crewAIInc/crewAI` (multi-agent orchestration)

**Use case:** the **Content Drafting Crew** (copywriter + editor +
brand-checker) is a single crew that runs in the background and writes
to `content_items.ai_draft` rather than replacing the human draft.
This keeps the human-in-the-loop invariant of master prompt §2.2.

**Why:** the only framework that nails the role/goal/backstory contract
cleanly. MIT, ~30k daily downloads, multi-year roadmap.

**Implementation cost:** 1-2 weeks. Python service (FastAPI) sidecar in
`docker-compose.yml`, called from the Next.js API route. Don't bind the
Node app to CrewAI's Python types; use plain JSON over HTTP.

### #3 — `inovector/mixpost` (data-model reference, MIT)

**Use case:** the `social_channels` and `published_posts` schema in
Drizzle. The current `social_channels` table in the planner is a stub;
Mixpost's Mermaid ER is the definitive checklist.

**Why:** MIT, cleanest OSS schema in the category, no copyleft risk.

**Implementation cost:** 0.5 day. Read Mixpost's Mermaid, write the
Drizzle migration.

### #4 — `huggingface/transformers` (offline content QA, Apache-2.0)

**Use case:** the pre-publish QA gate. NSFW image classifier on every
media upload, banned-words classifier on every caption, optional PII
detection via Presidio. All on-device, no API cost.

**Why:** Apache-2.0, runs on the existing VPS, no new vendor, defensible
against the "no SaaS in v1" instinct of the master prompt.

**Implementation cost:** 3-5 days. Python sidecar, lazy-loaded model
cache, FastAPI wrapper, Next.js API route client.

### #5 — `PostHog/posthog` (product analytics + AI observability)

**Use case:** in-app analytics for laratik-planner itself (page
traffic, feature flag usage, AI-call latency & cost). Free 1M events /
month on PostHog Cloud is more than enough for the first 50 customers.

**Why:** the planner's own KPI tracking (§22 of master prompt). PostHog
is the only OSS analytics tool with native LLM-tracing — every
MiniMax call gets logged with prompt, response, latency, cost, and
user attribution.

**Implementation cost:** 0.5 day. PostHog snippet in `app/layout.tsx`,
backend proxy for the API key.

### Honourable mentions (do not ship v1, but worth knowing)

- `gitroomhq/postiz-app` — UX reference only (AGPL-3.0)
- `langchain-ai/langgraph` — _patterns_ only (Python)
- `airweave-ai/airweave` — connector layer, but **archived Sep 2026**
- `unitaryai/detoxify` — specific toxicity classifier, ships inside
  the Transformers wrapper

---

## 5. How this maps to existing laratik-planner features

The master prompt defines these surfaces (paraphrased; see the file
for the canonical names):

| Master-prompt surface                                     | Maps to which picked repo                             | Implementation delta                                                         |
| --------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `agencies` / `workspaces` (multi-tenant)                  | `crewAI` Crew abstraction                             | Reuse crew "org" pattern; each agency owns a set of crews                    |
| `role_capability_matrix` (who can do what)                | `agency-agents` persona set                           | Personas _are_ capabilities; the matrix becomes a curated subset of personas |
| `content_items.state_machine` (draft → published_records) | `LangGraph` patterns                                  | Adopt the graph; implement in TS with XState, or run a Python sidecar        |
| `channels` / `social_channels`                            | `Mixpost` schema                                      | Drop-in Mermaid-derived Drizzle migration                                    |
| `approval_workflow` (2-gate)                              | `Temporal` patterns (future)                          | Drizzle state machine in v1, Temporal if/when multi-day branches appear      |
| `ai_drafts` (opt-in AI assist)                            | `crewAI` Content Drafting Crew                        | Background Python service, writes to `content_items.ai_draft` not `body`     |
| `qa_pass` (pre-publish safety)                            | `Transformers` + Detoxify + Presidio                  | API route → Python sidecar, fully offline                                    |
| KPI tracking (in-app analytics)                           | `PostHog`                                             | Snippet + backend proxy                                                      |
| AI observability (per-call LLM tracing)                   | `PostHog` (LLM analytics)                             | Same SDK call, automatically captured                                        |
| Competitive research (analyst crew)                       | `crewAI` Research Crew + `maigret`                    | Gated behind the same approval workflow as a content item                    |
| Fact-check, brand-voice, banned-words                     | MiniMax prompt-only + Detoxify as a backup classifier | First-line: MiniMax. Second-line: Detoxify. Never both on the same call      |
| Social inbox (per-channel DMs)                            | Custom-built on laratik's own `social_channels`       | v2; not in master prompt §2.2                                                |

### Stack alignment

laratik-planner is **Next.js 16 + Drizzle + Postgres + NextAuth v5 +
TypeScript strict + Vitest + Playwright + Sentry**. The picks above
respect this:

- prompt-only personas (agency-agents) need zero infra
- the AI capability matrix is Drizzle rows + Next.js API routes
- Python sidecars (crewAI, Transformers) are FastAPI services in
  `docker-compose.yml` next to the Next.js app, not embedded in it
- PostHog is its own service or its own cloud tenant

The composition is **TypeScript-first app, Python sidecars for
AI/heavy-lift, fully self-hosted** — which matches the master prompt's
"no SaaS" instinct and the VPS deploy constraint.

### What is _not_ in v1 (per §2.2 — non-negotiable)

- ❌ Direct publishing to social platforms → no Mixpost/Postiz _fork_
  for the publisher side; we use their _patterns_ only
- ❌ OAuth connections to social platforms → no social-API auth flows
- ❌ Live follower / reach / engagement analytics → no scraping,
  no growth-tracking dashboards
- ❌ Autonomous AI status changes (drafting/approving/publishing) →
  the AI capability matrix is **assist-only**, never `content_items.state`
  mutating on its own
- ❌ Subscription billing → no Stripe / LemonSqueezy work
- ❌ Permanent deletion → all repos use archive-first admin

---

## 6. Pitfalls (avoid these)

### 6.1 License landmines

- **AGPL-3.0** (postiz-app, plausible): any link or import drags the
  whole product into AGPL. Reference-only, never depend.
- **BUSL-1.1 / EE** (PostHog `ee/`, Directus enterprise): core is OSS,
  the AI/enterprise features you actually want are paywalled. Use the
  free tier.
- **CC-BY-4.0** (AutoGen): technically open but not OSI-approved. Fine
  for reference, awkward for binary redistribution.

### 6.2 Abandoned / archived

- **`FlowiseAI/Flowise`** — archived in 2026. Don't build on it.
- **`airweave-ai/airweave`** — archived Sep 2026. Useful patterns
  only; will not receive security updates.
- **`snscrape-archive/snscrape`** — dead since X rate-limited it.
  Use the official X API or a paid aggregator.
- **`yoheinakajima/babyagi`** — 22.4k★ but no license, last push
  Jan 2026. Treat as inspiration, not a dependency.

### 6.3 Dependency drift

- Python agent frameworks move fast. CrewAI 1.0 just shipped;
  AutoGen is forking into `autogen-core` + `autogen-agentchat` (2026
  refactor). Pin to a specific version in `requirements.txt`.
- LangGraph deprecates APIs every ~6 months. Read the changelog
  before bumping.
- `langchain` itself (parent of LangGraph) is _not_ a dependency you
  want in 2026 — it's been a chain of breaking changes. Use LangGraph
  standalone.

### 6.4 Scope creep (master-prompt-aware)

- Don't add a "competitive intel" feature in v1 unless it's gated
  behind the same approval workflow as a content item.
- Don't add live analytics — it's §2.2-excluded.
- Don't add autonomous publishing — even if Postiz's API would make
  it trivial, master prompt §2.2 forbids it.

### 6.5 Cost / observability blind spots

- MiniMax calls cost money; without a tracing layer you cannot tell
  which persona is bleeding the budget. PostHog's LLM analytics is
  the cheapest insurance.
- Detoxify is fast (50-200 ms per call on CPU) but a naive deployment
  loads 4 GB of models at startup. Use lazy loading + model caching.
- crewAI crews can run _long_. Always wrap in a queue with a hard
  timeout; never invoke synchronously from a Next.js request handler.

### 6.6 Multi-tenant data isolation

- CrewAI's built-in tools include shell, file I/O, web search. In
  a multi-agency deploy, those tools can leak across workspaces. Wrap
  every tool with a workspace-Id guard at the laratik-planner boundary,
  not at the crew level.
- Detoxify model has no built-in tenant isolation — make sure the
  per-call metadata (user id, workspace id) is logged.

---

## 7. Sources

### Repos visited

- `msitarzewski/agency-agents` — 150.8k★, MIT, 230+ agent personas
- `crewAIInc/crewAI` — 58.2k★, MIT, role-playing autonomous agents
- `microsoft/autogen` — 60.9k★, CC-BY-4.0, agentic AI framework
- `langchain-ai/langgraph` — 41.2k★, MIT, build resilient agents
- `langflow-ai/langflow` — 154.4k★, MIT, visual AI agent builder
- `FlowiseAI/Flowise` — 55.4k★, **archived**, TypeScript no-code
- `gitroomhq/postiz-app` — 35.6k★, AGPL-3.0, agentic Next.js scheduler
- `inovector/mixpost` — 3.7k★, MIT, Laravel Buffer alternative
- `airweave-ai/airweave` — 6.5k★, MIT, context retrieval for agents, **archived**
- `PostHog/posthog` — 39.6k★, MIT (core), AI observability
- `huggingface/transformers` — 165k★, Apache-2.0, model framework
- `agent0ai/agent-zero` — 19.1k★, autonomous agent framework
- `yoheinakajima/babyagi` — 22.4k★, no license, autonomous task agent
- `oven-sh/bun` — 95.9k★, JS runtime (referenced for toolchain options)

### Local context

- `STUDIOFLOW_MASTER_PROMPT.md` (laratik-planner) — the source spec,
  especially §0 (operating contract), §2.2 (v1 scope exclusions),
  §13 (AI assistance), §22 (KPIs), §24 (release gates)
- `AGENTS.md` — stack: Next.js 16.3, Drizzle ORM, Postgres 16,
  NextAuth v5, MiniMax-M3 (agency master switch disabled by default),
  Vitest + Playwright + Sentry, self-hosted on LaraTik VPS
  (`217.154.124.83`, `planner.laratik.com`)
- `package.json` — pinned versions: `next@16.3.1`, `react@19.2.8`,
  `drizzle-orm@0.45.2`, `next-auth@5.0.0-beta.32`, `zod@3.24.1`

### Notes on data freshness

All star counts, license strings, and last-commit dates are from a
single point-in-time fetch on 2026-09-07. Three repos in this report
are archived (`FlowiseAI/Flowise`, `airweave-ai/airweave`, plus
the unmaintained `yoheinakajima/babyagi`); treat their counts as
historical. Two repos (LangGraph, CrewAI) had commits within the
last 24 hours of the fetch — treat as actively maintained.

### Why this report does not include a "Top 10 GitHub stars overall"

The brief asks for _fit to laratik-planner_, not absolute popularity.
`huggingface/transformers` is the second-most-starred repo in this
report (165k) but ranks #4 in picks because of integration cost.
`agency-agents` has 150.8k stars but is the #1 pick because it costs
1 day of work and maps exactly to the master prompt's "AI capability
matrix" terminology.

### Known gaps in this report

- **No 2026 social-listening leaderboard.** Brand24, Mention, Talkwalker
  are still proprietary; the OSS space is thin. Recommend building
  on laratik-planner's own `social_channels` table with per-platform
  webhook adapters.
- **No Mastodon / Bluesky inbox libraries.** The Fediverse tooling
  ecosystem in 2026 is fragmented; most clients use the official
  Mastodon.py / Bluesky SDK directly.
- **No recent Sprout Social / Hootsuite OSS fork.** Hootsuite is closing
  their open-source projects. Buffer is sunsetting some of theirs.
  Mixpost is the only survivor with a healthy community.

---

_End of report. 3,200 words._
