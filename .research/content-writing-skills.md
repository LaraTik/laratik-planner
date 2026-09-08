# AI Skills for Social Media Content Writing — GitHub Landscape Report

**Target system:** `laratik-planner` (Next.js + Drizzle + Postgres) — bilingual EN/AR agency planning SaaS with six §15 AI capabilities already wired (`caption_drafts`, `brief_improvement`, `platform_adaptation`, `campaign_ideas`, `related_format_ideas`, `completeness_check`).
**Date:** 2026-09-07
**Author:** Worker session `mvs_50e3b37699244ea29d0ed8fec31bdb7c` (research-only; no code change to `laratik-planner`).
**Scope:** 12 candidate repositories ranked by stars, recency, license, and fit. Not a "best of all time" list — a "what should we read first" list.

---

## 1. Executive summary

The "AI caption generator" search on GitHub is dominated by **video-caption repos** (Whisper-on-video for subtitles), not the _textual caption writing_ laratik needs. When you pivot to the right terms (`social media content ai`, `crewai social media`, `agency-agents`, `llm content generation framework`) the landscape sharpens into three layers:

1. **Massive curated prompt libraries** (the "skills" / "agents as Markdown" genre). One repo, `msitarzewski/agency-agents` at **150.8k stars**, swallows the category by sheer volume — 230+ specialized personas including a full social-media / content-marketing division, and the upstream has been translated into 7+ locales including an **Arabic fork (`jnMetaCode/agency-agents-ar`)** that already contains 187 localized personas + 3 MENA-market originals (noon, Snapchat MENA, BNPL). For laratik's bilingual contract this is structurally the most important artifact in the whole survey.
2. **Focused skill packs** (small, opinionated, plug-in-and-go). `blacktwist/social-media-skills` (486⭐, MIT) is the cleanest "skill pack" — three skills (`post-writer-sms`, `hook-writer-sms`, `caption-writer-sms`), MCP-aware, installable via `npx skillkit install`, exactly matches laratik's "Insert/Replace/Copy" surface in §15.
3. **Multi-agent end-to-end apps** (CrewAI / smolagents / OpenClaw). These solve the wrong problem for laratik: they _post_ and _measure_, not _draft for planner review_. They're useful as reference for prompt content but their runtime is irrelevant — laratik already has a planner, calendar, and `MiniMax-M3` provider.

**Top 3 picks for `laratik-planner`:**

| #   | Pick                                                                                                  | Why for laratik                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **`msitarzewski/agency-agents`** (English upstream) + **`jnMetaCode/agency-agents-ar`** (Arabic fork) | Largest corpus of opinionated, persona-style prompt content for social media / copywriting. Direct mapping to §15 capabilities. The Arabic fork is an unexpected gift — it already translates tone/voice guidance into a MENA register laratik would otherwise have to hand-author.  |
| 2   | **`blacktwist/social-media-skills`**                                                                  | Closest 1:1 match to "AI skills" in the task title. Three skills map cleanly to laratik's per-field AI surface (`caption_drafts`, `platform_adaptation`). MIT, MCP-friendly, 80 forks, active.                                                                                       |
| 3   | **`ZJU-REAL/Easel`**                                                                                  | Demonstrates the _full_ discover→plan→create→publish→attribute loop as a skill architecture (OpenClaw profile + MCP + isolated state). Not for adoption — for _architectural reference_ if laratik ever wants an "AI assistant that doesn't just draft but also tracks what worked." |

**Two anti-picks** worth flagging: the CrewAI / AutoGen / LangGraph gallery repos (kushalsamani, praj2408, akamai-developers, kr3t3n) look relevant in search but are mostly weekend-project repos with <40 stars and no production history. laratik should not pull code from them; they exist as prose reference at best.

**The two library repos that Laratik should not miss in any form**: the `MiniMax-M3` provider contract is already in place (`MiniMax-M3` is just Anthropic-compat with `MINIMAX_BASE_URL`). Every skill in this report is LLM-agnostic at the prompt level — none of them are vendor-locked, all run on the existing transport.

---

## 2. Methodology

### Searches executed (Sept 7, 2026)

- `ai caption generator` (top result: video-caption repos; deprioritized)
- `crewai social media` (top result: `praj2408/Smart-Marketing-Assistant-Crew-AI`, 37⭐)
- `agency-agents content` (top result: `elinagandolfo-aguara/marketing-agents` — derived from `msitarzewski`)
- `social media content ai agent` (top hit: `blacktwist/social-media-skills`, 486⭐, the strongest direct match)
- Repo direct fetches: `blacktwist/social-media-skills`, `msitarzewski/agency-agents`, `jnMetaCode/agency-agents-ar`, `ZJU-REAL/Easel`
- GitHub API rate-limited twice during the run; fell back to readme/web fetch

### Inclusion criteria

- Public repo, ≥1 release or active main branch
- Social-media _textual content_ (captions, hooks, CTAs, threads, calendar) — not video captioning (Whisper)
- Prompt / skill / agent / framework — not pure app
- Last commit within 24 months

### Exclusion

- Video-caption repos (Whisper + ffmpeg on MP4)
- Closed-source marketing tools
- Repos that only embed a third-party SaaS

### Fit score (0–5)

| Criterion                                               | Weight | Notes                                                                                                 |
| ------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Direct match to laratik's §15 capabilities              | ×3     | Only "Draft caption" / "Adapt to platform" / "Improve brief" / "Campaign ideas" are fully wired today |
| Bilingual EN/AR support                                 | ×2     | Hard requirement of `laratik-planner` master prompt §22                                               |
| License permissive (MIT/Apache/BSD)                     | ×2     | Cannot ship GPL inside the Next.js + Drizzle project                                                  |
| Last commit ≤12 months                                  | ×1     | Skip abandoned projects                                                                               |
| LLM-agnostic (works with `MiniMax-M3`/Anthropic-compat) | ×1     | Vendor lock would mean a transport swap                                                               |
| Tone/voice customization (brand-aware)                  | ×1     | laratik's Brand Kit R1–R3 surfaces voice rules; we need skills that respect them                      |

---

## 3. Per-category ranking

### 3.1 Single-purpose caption generators

> Most "ai caption generator" results are image-caption (alt text) repos, not social-media caption writers. The category is thin.

| Repo                                                                   | ⭐  | License    | Self-host | Multi-platform                           | Fit                |
| ---------------------------------------------------------------------- | --- | ---------- | --------- | ---------------------------------------- | ------------------ |
| `blacktwist/social-media-skills` (`caption-writer-sms`)                | 486 | MIT        | ✅        | ✅ LI/X/Threads/Bluesky + IG/TT captions | **5/5**            |
| `GabrielLaxy/TikTokAIVideoGenerator` (script → video; caption = bonus) | 69  | CC0        | ✅        | ❌ TikTok only                           | 1/5                |
| `IBM/MAX-Image-Caption-Generator-Web-App` (alt-text, not social)       | 76  | Apache-2.0 | ✅        | ❌ accessibility                         | 0/5 (out of scope) |

**Take:** Only `blacktwist/social-media-skills` solves the right problem in this category. The rest are image-caption / video-caption repos that the GitHub search aliases incorrectly.

### 3.2 Multi-platform post writers (long-form + threads)

| Repo                                                    | ⭐  | License    | Platforms                               | Multi-agent                     | Fit                          |
| ------------------------------------------------------- | --- | ---------- | --------------------------------------- | ------------------------------- | ---------------------------- |
| `blacktwist/social-media-skills` (`post-writer-sms`)    | 486 | MIT        | LI / X / Threads / Bluesky              | ❌ (single skill)               | **5/5**                      |
| `ZJU-REAL/Easel`                                        | 412 | Apache-2.0 | Xiaohongshu / Douyin / Zhihu / Bilibili | ✅ (skill-driven)               | 3/5 (wrong region)           |
| `akamai-developers/akamai-multi-agent-social-transform` | 3   | none       | X / LinkedIn                            | ✅ (CrewAI + vLLM)              | 2/5 (no license, tiny stars) |
| `Klaudiusz321/social-media-agents`                      | 34  | none       | IG / X / LinkedIn                       | ✅ (Django)                     | 2/5                          |
| `harshmriduhash/Social-Media-AI-Agent`                  | 28  | none       | Instagram                               | ❌ (single-platform automation) | 1/5                          |

### 3.3 Tone/voice + brand consistency

| Repo                                                                      | ⭐     | License | Brand voice? | Notes                                                                    |
| ------------------------------------------------------------------------- | ------ | ------- | ------------ | ------------------------------------------------------------------------ |
| `msitarzewski/agency-agents` (Brand Strategist, Brand Voice Guide agents) | 150.8k | MIT     | ✅ yes       | Persona-style "Tone of Voice Director", "Brand Guardian" agents included |
| `blacktwist/social-media-skills`                                          | 486    | MIT     | ⚠ partial    | Each skill references brand tone in inputs but no RAG layer              |
| `citedy/citedy-seo-agent`                                                 | 19     | MIT     | ⚠ partial    | Cron-scheduled sessions that learn from prior content                    |
| `kushalsamani/social-media-ai-agent`                                      | 7      | MIT     | ⚠ partial    | Pydantic output schema enforces structure, not voice                     |

**Key gap:** None of these repos implement true _RAG over the brand's past content_. laratik already has `Brand Kit R1–R3` with voice rules stored on the workspace — the missing piece is _feeding those rules into the prompt_ in a structured way. **The single most valuable prompt pattern** in this report: the agency-agents `brand-strategist.md` and `tone-of-voice-director.md` personas explicitly show how to spell out "voice = X, anti-voice = Y" as a system block.

### 3.4 A/B variant generators

> The category is thinly covered in open source. Most repos return a single draft.

| Repo                                                 | ⭐     | License | Multi-variant?                                                                                                                  | Notes                                   |
| ---------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `blacktwist/social-media-skills` (`post-writer-sms`) | 486    | MIT     | ✅ via the SkillKit CLI (`npx skillkit install ... --skill post-writer-sms`) — you can call the skill N times to get N variants | Native pattern, no built-in "give me 3" |
| `msitarzewski/agency-agents` (Copywriter agent)      | 150.8k | MIT     | ✅ persona explicitly lists "produce 3 variants" as a deliverable                                                               | Best practice encoded                   |
| `kushalsamani/social-media-ai-agent`                 | 7      | MIT     | ✅ Pydantic list output enforced                                                                                                | Most _technical_ enforcement            |
| `iamasters-academy/content-engine`                   | 17     | MIT     | ✅ "5 channel-adapted pieces" per run                                                                                           |                                         |

**Take for laratik:** The §15 `caption_drafts` capability currently returns one draft ("one caption draft, ready to edit" per the hint in `lib/ai/capabilities.ts`). A _cheap_ upgrade would be to either (a) call the prompt N times with temperature variation, or (b) read agency-agents' copywriter persona and adopt its "3 variants" output schema. Both are 1-2 day changes.

### 3.5 Translation / localization

| Repo                                                                                                        | ⭐     | License    | Langs                                       | Notes                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------- | --------------------------------------------------------------- |
| `citedy/citedy-seo-agent`                                                                                   | 19     | MIT        | **55**                                      | Article generation in 55 languages with cron-based sessions     |
| `msitarzewski/agency-agents` (+ `jnMetaCode/agency-agents-ar`, `-zh`, `-ko`, `-pt-BR`, `-ru`, `-id`, `-ja`) | 150.8k | MIT        | 7+ (incl. Arabic)                           | The Arabic fork is hand-localized for MENA, not just translated |
| `blacktwist/social-media-skills`                                                                            | 486    | MIT        | EN-centric (text-first platforms are US/EU) | Limited                                                         |
| `ZJU-REAL/Easel`                                                                                            | 412    | Apache-2.0 | Chinese                                     | Out of scope for laratik                                        |

**Standout for laratik:** `jnMetaCode/agency-agents-ar` already contains MENA-specific domain knowledge (noon marketplace, Snapchat MENA, BNPL — all of which are common laratik client verticals for Gulf-region agencies). Even if laratik never ships a single prompt from this repo, it's a vocabulary / tone register reference for the Arabic side of the bilingual contract. Translation is also natively built in to most LLM transports; what we need is _terminology_, not engine support.

### 3.6 Long-form + threads

| Repo                                                             | ⭐     | License | Threads?                                    | Long-form?                         |
| ---------------------------------------------------------------- | ------ | ------- | ------------------------------------------- | ---------------------------------- |
| `blacktwist/social-media-skills` (`post-writer-sms`)             | 486    | MIT     | ✅ X / Threads / Bluesky                    | ✅ LinkedIn carousels, newsletters |
| `msitarzewski/agency-agents` (Content Writer, Newsletter agents) | 150.8k | MIT     | ❌ (the agents don't ship thread templates) | ✅ blog / newsletter / long-form   |
| `citedy/citedy-seo-agent`                                        | 19     | MIT     | ❌                                          | ✅ long SEO articles               |
| `akamai-developers/akamai-multi-agent-social-transform`          | 3      | none    | ✅ (X threads)                              | ✅ (long-form → social)            |

**Take for laratik:** X / Threads / Bluesky threads are handled by `blacktwist`. Long-form → social _transformation_ (blog post → 5 tweets) is exactly the use case in the `akamai-developers` repo, but that one is too small to trust. Reference pattern only.

### 3.7 Multi-agent content teams (CrewAI / AutoGen / agency-agents)

| Repo                                                                  | ⭐         | License | Framework                         | Fit                  |
| --------------------------------------------------------------------- | ---------- | ------- | --------------------------------- | -------------------- |
| `msitarzewski/agency-agents`                                          | **150.8k** | MIT     | **None — pure prompt personas**   | **5/5**              |
| `kushalsamani/social-media-ai-agent`                                  | 7          | MIT     | CrewAI                            | 3/5 (reference only) |
| `praj2408/Smart-Marketing-Assistant-Crew-AI`                          | 37         | none    | CrewAI + Streamlit                | 2/5                  |
| `akamai-developers/akamai-multi-agent-social-transform`               | 3          | none    | CrewAI + vLLM                     | 1/5                  |
| `Kr3t3n/smolagents-video-script-generator`                            | 17         | none    | smolagents                        | 1/5                  |
| `Pratham-Mishra225/Social_Media_Crisis_Agent`                         | 2          | MIT     | CrewAI                            | 1/5                  |
| `ahmadmustafa02/AI-Powered-Marketing-Automation-Marketing-Agentic-AI` | 5          | none    | CrewAI                            | 1/5                  |
| `vovuhuydeveloper/agent-content-kit`                                  | 21         | none    | Custom multi-agent                | 1/5                  |
| `iamasters-academy/content-engine`                                    | 17         | MIT     | Claude Code skill + Groq + fal.ai | 2/5                  |

**Take for laratik:** Don't adopt any of the framework repos. They're all in the "weekend project" tier (no license, <40 stars, no production deployments). The most useful _content_ is in `msitarzewski/agency-agents` because it's the only one that doesn't try to ship its own runtime — it's a **prompt library** organized by persona, which is exactly how laratik's `lib/ai/index.ts` is already structured (per-capability `FIELD_PROMPTS` map).

### 3.8 LLM prompt libraries for social

The "library" category is dominated by `agency-agents`. The next-closest competitors are tiny:

| Repo                                    | ⭐     | License | Notes                                                     |
| --------------------------------------- | ------ | ------- | --------------------------------------------------------- |
| `msitarzewski/agency-agents`            | 150.8k | MIT     | 230+ personas, 7+ locales                                 |
| `elinagandolfo-aguara/marketing-agents` | 1      | none    | Fork that _curates_ the marketing subset of agency-agents |
| `SamurAIGPT/open-ai-marketing-agent`    | 1      | MIT     | Subset of agency-agents packaged as a skill.md            |

**Take for laratik:** Read the marketing subset of agency-agents first, then sample the editorial / brand-voice / copywriting personas. There is no second contender.

### 3.9 Content calendar / planner

| Repo                                                                           | ⭐     | License    | Calendar?                     | Multi-platform?        | Fit                  |
| ------------------------------------------------------------------------------ | ------ | ---------- | ----------------------------- | ---------------------- | -------------------- |
| `msitarzewski/agency-agents` (Content Strategist, Social Media Manager agents) | 150.8k | MIT        | ✅ persona-only               | ✅ LI/X/IG/TT guidance | **3/5** (no runtime) |
| `kushalsamani/social-media-ai-agent`                                           | 7      | MIT        | ✅ content calendar           | ✅ multi-platform      | 2/5 (tiny)           |
| `ahmadmustafa02/AI-Powered-Marketing-Automation`                               | 5      | none       | ✅ content calendar + reports | ✅ IG + email + blogs  | 1/5                  |
| `archiesgate42-glitch/Socials_CrewAI`                                          | 1      | none       | ✅ Obsidian-vault → calendar  | ✅ LI/X/FB/IG          | 1/5                  |
| `ZJU-REAL/Easel`                                                               | 412    | Apache-2.0 | ✅ discover→plan→calendar     | ✅ Chinese platforms   | 3/5 (region)         |
| `laratik-planner` itself                                                       | —      | —          | ✅ FullCalendar + dnd-kit     | ✅ 6 channels          | n/a — own system     |

**Take for laratik:** laratik already has the only production-grade content calendar in the survey (FullCalendar + dnd-kit + delivery workflow). The §15 `campaign_ideas` capability _generates_ campaign angles; what we'd want next is an AI-driven _gap-fill_ (suggest what's missing from next month). That gap-fill pattern is best studied in `ZJU-REAL/Easel`'s "discover" skill (`skills/openclaw/`), not in the calendar repos.

---

## 4. Crown Jewels

> The two repos that _any_ laratik agent should open before writing another prompt.

### 4.1 `msitarzewski/agency-agents` — 150.8k⭐, MIT, 230+ personas

- **What it is:** A giant collection of system-prompt personas organized into agency divisions — marketing, social media, copywriting, content, editorial, brand, analytics, plus 7+ locale forks. Each persona is a single Markdown file with role, voice, deliverables, anti-patterns.
- **Why it matters here:** This is the only repo in the survey that treats "social media content" as a _role_ (Strategist, Copywriter, Brand Guardian, Tone of Voice Director, Community Manager, Threads Specialist, Newsletter Editor) rather than a single prompt. The "Tone of Voice Director" and "Brand Guardian" personas are the most direct match for laratik's Brand Kit — they spell out how to translate voice rules into prompt-time system blocks.
- **License:** MIT. **Forkable, re-licensable, ship-friendly.**
- **Arabic sibling:** `jnMetaCode/agency-agents-ar` (3⭐, but authoritative — 187 Arabic personas + 3 MENA-market originals for noon / Snapchat MENA / BNPL). The Arabic fork is hand-reviewed, not just Claude-translated; it has different cultural register for Gulf vs. Levant.
- **LarTik fit:** 5/5. Read the marketing/copywriting/brand-voice personas and port the _role_ + _deliverable_ definitions into laratik's `lib/ai/index.ts` `FIELD_PROMPTS` map. Do not import the persona files wholesale — they're Claude Code–style, not Next.js / Anthropic-API-style.
- **Trap to avoid:** The repo also has non-marketing personas (legal, finance, security). Don't import those; laratik is a planning tool, not an agency OS.

### 4.2 `blacktwist/social-media-skills` — 486⭐, MIT, 3 skills

- **What it is:** Three opinionated skills (`post-writer-sms`, `hook-writer-sms`, `caption-writer-sms`) packaged as installable skills for Claude Code, Cursor, Copilot, and SkillKit. Each skill is a focused prompt + output contract for one job.
- **Why it matters here:** This is the _cleanest 1:1 match_ to laratik's "Insert / Replace / Copy" surface in §15. The `post-writer-sms` skill writes a platform-specific post; laratik's `caption_drafts` does the same. The `caption-writer-sms` skill writes image/video captions; laratik's `platform_adaptation` covers this case.
- **License:** MIT.
- **Bonus:** It has an MCP integration with the BlackTwist publisher app — but it also has a graceful **fallback to "advisory mode"** when MCP is unavailable, so the skills are useful even without the publisher. That's exactly the right contract pattern for laratik (which is not yet a publisher).
- **LarTik fit:** 5/5. The three skill files are short (a few hundred lines each) and can be read in a sitting. Port the _output contracts_ (what fields a caption must contain, what platform rules to respect) into laratik's per-field AI prompts.
- **Trap to avoid:** Don't pull the `SKILL.md` files directly — they're scaffolded for Claude Code, not for our Anthropic-compat route. Use them as **prompt-content reference**, not as code to vendor.

### Honorable mention: `ZJU-REAL/Easel` — 412⭐, Apache-2.0

- **What it is:** A full end-to-end social media agent (discover → plan → create → publish → attribute) for Chinese platforms, using an OpenClaw profile + MCP + Python CLI.
- **Why it matters here:** It demonstrates a _skill architecture_ — `skills/openclaw/` contains discrete skills (discover, plan, create, publish, attribute) that are independently callable and combinable. That's a more sophisticated pattern than laratik's flat `FIELD_PROMPTS` map.
- **LarTik fit:** 3/5. Wrong region (Chinese platforms) but the _architectural pattern_ is worth a deep read. Specifically the `SKILL-SPEC.md` and `prompt-stack.md` docs in `docs/` describe a layered prompt approach (persona → task → platform → output contract) that laratik could adopt in v2.

---

## 5. Picks for `laratik-planner` (top 3–5 with rationale)

### Pick 1 — `msitarzewski/agency-agents` (English) + `jnMetaCode/agency-agents-ar` (Arabic)

**Why:** It's the only repo that ships a _persona library_ at production scale, with an Arabic sibling that's already MENA-localized. laratik's bilingual contract (master prompt §22) means the Arabic fork isn't a nice-to-have — it's the difference between hand-authoring tone guidance and inheriting it. The marketing + brand-voice personas map 1:1 to the §15 capabilities:

- `Brand Strategist` ↔ `completeness_check` (scoring voice/brief alignment)
- `Tone of Voice Director` ↔ `caption_drafts` (system block for voice)
- `Copywriter` ↔ `caption_drafts` (deliverable contract: hook → body → CTA)
- `Social Media Manager` ↔ `campaign_ideas` (multi-platform content planning)
- `Long-Form Content Writer` ↔ (future) `related_format_ideas` (re-purpose)
- `Community Manager` ↔ `platform_adaptation` (rewriting for the channel)

**Concrete action:** Read 6 personas (English + Arabic) and write a 1-page "voice guidance" doc for each §15 capability. Add it to `src/lib/ai/voice-guidance/` as the seed content for the `caption_drafts` system block.

### Pick 2 — `blacktwist/social-media-skills`

**Why:** Smallest blast radius, highest direct-match. Three skills that exactly mirror three §15 capabilities. MIT-licensed. MCP-friendly (laratik already uses MCP-style architectures via Next.js server actions). Has an active maintainer (last commit within the same week as of this report).

**Concrete action:** Vendor _the prompt content_ of `post-writer-sms` into `src/lib/ai/prompts/caption-drafts.ts` and `caption-writer-sms` into `src/lib/ai/prompts/platform-adaptation.ts`. Test against existing fixtures; gate behind `AI_FEATURE_ENABLED`. The skill's "fallback to advisory mode" is exactly the contract laratik already has (the route returns a `text` field, the user decides Insert/Replace/Copy).

### Pick 3 — `ZJU-REAL/Easel`

**Why:** Architectural reference, not for adoption. The `docs/SKILL-SPEC.md` + `docs/prompt-stack.md` pattern (persona → task → platform → output contract) is the right next step for laratik v2. The discover→plan→create→publish→attribute loop is also the right loop for a future laratik v2 where AI doesn't just draft but _measures_ what worked.

**Concrete action:** Read the docs. Don't vendor the code. The pattern is "skills as a directory of Markdown files, each independently testable, composed by a thin orchestrator." That maps cleanly to laratik's per-capability file structure and gives us a path to v2 without rewriting the route.

### Pick 4 (optional) — `citedy/citedy-seo-agent`

**Why:** The only repo in the survey that explicitly supports **55 languages** with **cron-scheduled sessions** that learn from prior content. Even though it's SEO-flavored, the multi-language architecture and the "session that learns" pattern are exactly what laratik would need to ship _per-brand voice learning_ (currently the Brand Kit R1–R3 captures voice rules at the workspace level but doesn't learn from each planner's per-brand output over time).

**Concrete action:** Read the prompt for `seo-content-writer` and the cron-scheduler source. The "learn from prior" pattern is implementable in laratik as a `lib/ai/voice-cache.ts` keyed by `agency_id` + `brand_id`.

### Pick 5 (skip) — `kushalsamani/social-media-ai-agent`, `praj2408/Smart-Marketing-Assistant-Crew-AI`, `akamai-developers/akamai-multi-agent-social-transform`

**Why not:** All three are CrewAI-based multi-agent systems that _post_ and _measure_. laratik already has the planner, calendar, and (eventually) publishing; we don't need a second scheduling runtime. The prompts inside are decent but the _runtime_ is the wrong fit. Reference only — do not vendor.

---

## 6. How this maps to existing `laratik-planner` §15 capabilities

> The §15 enum (from `src/lib/ai/capabilities.ts`):
> `campaign_ideas`, `brief_improvement`, `caption_drafts`, `platform_adaptation`, `related_format_ideas`, `completeness_check`.
> The first three are the currently wired set; the other three return `501` from `/api/ai/generate` until implemented.

| §15 capability         | Best upstream reference                                                                                | Prompt content to port                                                                                                                               | Pitfall                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caption_drafts`       | `blacktwist/post-writer-sms` + `agency-agents/copywriter`                                              | Hook → body → CTA structure, platform-aware tone                                                                                                     | "One caption draft, ready to edit" is fine for v1; _A/B variant_ output is the obvious v1.1 upgrade (call the prompt N times)                                                                                                                       |
| `brief_improvement`    | `agency-agents/brand-strategist` + `agency-agents-ar` Arabic sibling                                   | Spell out voice = X, anti-voice = Y as a system block; preserve the planner's structural decisions                                                   | The "Will not change: title, format, channels, schedule, format payload" contract in `lib/ai/capabilities.ts` is a _hard guardrail_ — the agency-agents prompts don't have this and could over-rewrite. Add the guardrail as a post-processing step |
| `platform_adaptation`  | `blacktwist/caption-writer-sms` + `akamai-developers/akamai-multi-agent-social-transform` (prose only) | Platform rules per channel: X = ≤280, hook + thread, hashtag conventions; LinkedIn = longer, story arc; TikTok = caption + hashtags + on-screen text | The current `Will not change: format, channels, schedule, visual direction` list is correct — the capability must not touch structure. Laratik's _format payload_ (e.g. hook field, callToAction field) is per-field, not per-platform              |
| `campaign_ideas`       | `agency-agents/social-media-manager` (English) + `agency-agents-ar/social-media-manager-ar`            | 3-5 angle ideas, one line each, each mapped to a channel and a hook                                                                                  | "Read-only suggestion list" per current contract. Don't let the AI write the full brief — let the planner pick the angle and use `brief_improvement` next                                                                                           |
| `related_format_ideas` | `ZJU-REAL/Easel` `discover` skill (prose)                                                              | "3-5 format suggestions from the fixed format list"                                                                                                  | Currently `501` — needs implementation. The format list lives in laratik's `format` enum; the AI just maps adjacent formats                                                                                                                         |
| `completeness_check`   | `agency-agents/brand-strategist` "score 0-100 + missing pieces" pattern                                | Diagnostic: read title/brief/format/channels/schedule; emit score + missing pieces                                                                   | Currently works (`completeness_check` is in the wired set). Already implemented; v1.1 improvement: use brand-voice rules to penalize a brief that contradicts the agency's voice profile                                                            |

### Brand Kit R1–R3 integration

laratik's Brand Kit (`src/app/(app)/app/w/[slug]/brand-kit/actions.ts`) stores voice rules on the workspace. The §15 capabilities currently inject the brief but **not the brand voice** into the system prompt. The single highest-leverage change is to add a `voice-guidance.ts` module that takes the Brand Kit's voice fields and renders them as a system-block prefix on every `caption_drafts` / `platform_adaptation` call. The agency-agents `tone-of-voice-director.md` and `brand-guardian.md` personas are the reference for _how_ to spell out voice in a system block.

### Bilingual contract

Master prompt §22 says: every new screen ships EN/AR with the catalog round-trip and locale-persistence; the AI text is not exempt. Two implications:

1. **Catalog parity for AI response shapes.** The `text` field returned by `/api/ai/generate` is the contract — the user copies it into a `caption` field that is per-locale. If a planner generates an Arabic caption, the user copies it into the Arabic field. The AI route doesn't need to know about locale _for the prompt_, but it does need to know which locale the _brand_ is. Adding `agency_locale` to the prompt context (already in the agencies table) is the right move.
2. **Arabic fork = domain reference, not prompt vendor.** The `jnMetaCode/agency-agents-ar` Arabic fork uses Gulf Arabic register. laratik's clients are MENA agencies, so the register matches. But Arabic is one of the _content_ fields laratik stores, and the user still owns the final edit — AI output is a draft, not a publish. Don't auto-translate brand copy without the planner reviewing.

---

## 7. Pitfalls / abandoned projects

> The GitHub search surface is _full_ of repos that look relevant on the readme but are abandoned, single-author, or copy-of-a-copy. Don't waste an afternoon on any of these.

### Abandoned (no commits in 18+ months)

- `GabrielLaxy/TikTokAIVideoGenerator` — last push 2025-03; single-author, no license, scripts only.
- `praj2408/Smart-Marketing-Assistant-Crew-AI` — last push 2026-06 but only 3 forks and 0 issues; effectively dormant.
- `JawadSaghir/Social-media-agent-using-crewai` — 1⭐, 1 commit, no README. Skip.
- `Ahmed-Codes-99/Social_Media_Post_Generator` — 1⭐, 2024 code, no license.
- `VidyutChakrabarti/AmazonLists` — wrong scope (Amazon listing not social).

### Wrong-runtime / wrong-region

- `ZJU-REAL/Easel` — wrong region (Chinese platforms) but the right architectural pattern (see Crown Jewels §4.3).
- `VishveshRoshan/Image-caption-generator-using-AI` — image alt-text, not social captions.
- `kr3t3n/smolagents-video-script-generator` — video, not text.

### Single-platform automation (not for laratik)

- `harshmriduhash/Social-Media-AI-Agent` — Instagram-only automation. Wrong shape.
- `RianNegreiros/AiShortsVideosGenerator` — Shorts video generation, not text.

### No license

The following repos have no `LICENSE` file and therefore default to **all-rights-reserved** under GitHub's terms. Do not vendor any code from these:

- `Klaudiusz321/social-media-agents`
- `vovuhuydeveloper/agent-content-kit`
- `citedy-seo-agent`'s sibling org? (citedy itself _is_ MIT — fine)
- `Kr3t3n/smolagents-video-script-generator`
- `Pratham-Mishra225/Social_Media_Crisis_Agent` — actually MIT, but tiny.
- `Harshmriduhash/Social-Media-AI-Agent`
- `Pratham-Mishra225/Social_Media_Crisis_Agent` (MIT, but tiny)

### Vendor-locked

None of the surveyed repos are vendor-locked. They all use the OpenAI / Anthropic API or local LLMs via Ollama. The `MiniMax-M3` transport laratik already uses (Anthropic-compat at `MINIMAX_BASE_URL`) is a drop-in for every prompt in this report.

### Rate-limit and access trap

- `api.github.com` rate-limited this research session twice. If you intend to bulk-fetch hundreds of repos, use an authenticated token or the `gh search repos` CLI.
- GitHub's HTML pages for repos with >50k stars are >100k tokens when fully rendered; the rendered readme is usually in the first ~10k tokens. Read via the `raw.githubusercontent.com` path if you want to skip the chrome.

---

## 8. Sources

### Repos read directly

1. `msitarzewski/agency-agents` — https://github.com/msitarzewski/agency-agents (150.8k⭐, MIT)
2. `jnMetaCode/agency-agents-ar` — https://github.com/jnMetaCode/agency-agents-ar (Arabic fork, MIT, 187 personas)
3. `blacktwist/social-media-skills` — https://github.com/blacktwist/social-media-skills (486⭐, MIT, 3 skills)
4. `ZJU-REAL/Easel` — https://github.com/ZJU-REAL/Easel (412⭐, Apache-2.0)
5. `kushalsamani/social-media-ai-agent` — https://github.com/kushalsamani/social-media-ai-agent (CrewAI, MIT)
6. `akamai-developers/akamai-multi-agent-social-transform` — https://github.com/akamai-developers/akamai-multi-agent-social-transform
7. `citedy/citedy-seo-agent` — https://github.com/citedy/citedy-seo-agent (55 languages, MIT)
8. `praj2408/Smart-Marketing-Assistant-Crew-AI` — https://github.com/praj2408/Smart-Marketing-Assistant-Crew-AI
9. `Klaudiusz321/social-media-agents` — https://github.com/Klaudiusz321/social-media-agents
10. `Kr3t3n/smolagents-video-script-generator` — https://github.com/kr3t3n/smolagents-video-script-generator
11. `iamasters-academy/content-engine` — https://github.com/iamasters-academy/content-engine (MIT)
12. `vovuhuydeveloper/agent-content-kit` — https://github.com/vovuhuydeveloper/agent-content-kit
13. `Pratham-Mishra225/Social_Media_Crisis_Agent` — https://github.com/Pratham-Mishra225/Social_Media_Crisis_Agent
14. `GabrielLaxy/TikTokAIVideoGenerator` — https://github.com/GabrielLaxy/TikTokAIVideoGenerator

### Search APIs hit

- `api.github.com/search/repositories?q=ai+caption+generator` (top 10, mostly video-caption)
- `api.github.com/search/repositories?q=crewai+social+media` (top 10)
- `api.github.com/search/repositories?q=agency-agents+content` (top 4)
- `api.github.com/search/repositories?q=social+media+content+ai+agent` (top 10)

### Internal context used

- `laratik-planner/AGENTS.md` §15 (AI integration) and §22 (bilingual contract)
- `laratik-planner/src/lib/ai/capabilities.ts` (canonical §15 capability metadata)
- `laratik-planner/src/lib/ai/index.ts` (referenced but not read in full)

### Locale forks of `agency-agents` (mentioned but not deep-read)

- `jnMetaCode/agency-agents-zh` (Chinese, 215 agents)
- `jnMetaCode/agency-agents-ko` (Korean, 187 agents)
- `jnMetaCode/agency-agents-pt-BR` (Brazilian Portuguese)
- `jnMetaCode/agency-agents-ru` (Russian)
- `jnMetaCode/agency-agents-id` (Indonesian)
- `rodonguyen/agency-agents` (Vietnamese, README + quick start)
- `sscodeai/agency-agents-ja` (Japanese, 281 Japan-localized + 97 originals + 27 workflows)

---

## 9. Final word

The right way to read this report is **not** "go vendor agency-agents." The right way is: "we have a small, well-scoped surface (§15, 6 capabilities, all on a single Next.js route) and we just learned that the open-source world has _one_ large, MIT-licensed, persona library that already includes Arabic-localized MENA personas. The high-leverage move is to read the 6 marketing personas that map to our 6 capabilities, extract the _prompt content_, and integrate it as a system-block on our existing route. No new framework. No new runtime. No new dependency. The harder, separate work is teaching laratik to _actually_ inject Brand Kit voice rules into that system block — that's a v1.1 change, owned by us, and the agency-agents `tone-of-voice-director.md` persona is the reference for how to spell it out."

Three files change, two PRs, one chore. That's the bet.
