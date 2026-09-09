# Social-Media AI Skills — Integration Plan for `laratik-planner`

**Author:** Root session `mvs_ed91e16c12d84c75964bd38950bd22c0`
**Date:** 2026-09-07
**Companion reports (read in full before this one):**

- `.research/social-media-research-skills.md` — scraping / analytics / trends
- `.research/facebook-instagram-skills.md` — Meta-platform SDK + skills
- `.research/content-writing-skills.md` — captions / copy / brand voice
- `.research/viral-trend-skills.md` — viral / hooks / trend radar
- `.research/image-generation-skills.md` — image gen providers + wrappers
- `.research/video-generation-skills.md` — video / Reel / Subtitle
- `.research/business-workflow-skills.md` — agency / approval / analytics

All 7 reports were written by parallel Worker sessions on 2026-09-07 and
together cover ~190 KB / ~28,000 words. This document is the synthesis:
it picks the winners, maps them to `laratik-planner`'s current surface,
and gives a sequenced implementation plan with effort estimates.

---

## 1. The 5-second summary

1. **The two repos that matter most are `msitarzewski/agency-agents` (150.8k★, MIT) and the official Meta `facebook-nodejs-business-sdk` (616★).** Everything else is a wrapper, a complementary tool, or a vendor-locked option.
2. **laratik's existing §15 capability matrix is the right shape; the gap is in the prompts and the context, not the framework.** Most of the integration work is "port persona text, add brand voice, hook up the MCP/SDK plumbing."
3. **Three new product features are worth shipping in v1:** **Trend Radar** (real-time trend ingestion → campaign ideas), **Brand-aware Image Generation** (Replicate router + IP-Adapter), and **Reel Generator** (Pexels + Suno + ElevenLabs + faster-whisper via Replicate). Each is bounded, ships behind the agency database master switch and capability allow-list, and reuses the §15 governance (capability allow-list, daily + monthly budget, contract-style replace/insert).
4. **Two existing features get materially better with one small change each:** `caption_drafts` should produce 3 variants, not 1; `brief_improvement` should inject the Brand Kit voice rules into the system block.
5. **All recommendations respect master-prompt §2.2 (no autonomous publishing, no OAuth, no live follower analytics, no autonomous status changes).** Every AI feature is **read-by-default, draft-only, human-confirmed** — exactly the contract the route already enforces.

---

## 2. Cross-report picks — the only deps I'd commit

| #   | Repo                                                                                       |       Stars | License       | Why                                                                                                                |                                                    Effort |
| --- | ------------------------------------------------------------------------------------------ | ----------: | ------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------: |
| 1   | **`msitarzewski/agency-agents`** (EN) + **`jnMetaCode/agency-agents-ar`** (AR)             |  150.8k / 3 | MIT           | 230+ persona prompts; Arabic fork has 187 localized personas incl. MENA. Direct mapping to all 6 §15 capabilities. | 1 day (port 6 personas into `src/lib/ai/voice-guidance/`) |
| 2   | **`facebook/facebook-nodejs-business-sdk`**                                                |         616 | Meta Platform | Official, TS-native, only legal path to Facebook Pages + IG Business + Ads.                                        |           2–3 days (wire into `src/app/api/social/meta/`) |
| 3   | **`Vercel AI SDK`** (`vercel/ai` + `@ai-sdk/openai` / `@ai-sdk/replicate` / `@ai-sdk/fal`) |        ~16k | Apache-2.0    | One `generateImage()` call shape across providers; Next.js native.                                                 | 1 day (add `@ai-sdk/replicate` + write `lib/ai/image.ts`) |
| 4   | **`Panniantong/Agent-Reach`**                                                              |       78.6k | MIT           | Free MCP server for Twitter / Reddit / YouTube / GitHub / Bilibili / XHS. Drops into Trend Radar.                  |                      0.5 day (run as sidecar, expose MCP) |
| 5   | **`faster-whisper`** (Python, CTranslate2) + **`whisper.cpp`** (C++/CPU)                   | ~14k + ~37k | MIT / MIT     | Free, self-hosted, word-level transcription for the AI Subtitle + Reel Generator features.                         |                                 1 day (sidecar container) |

**Honorable mentions (sit on shelf until needed):**

- `blacktwist/social-media-skills` (486★, MIT) — 3 skills that map 1:1 to `caption_drafts` / `platform_adaptation` / `post-writer-sms`. Read the prompts; don't vendor the code.
- `drawrowfly/tiktok-scraper` (5.2k★, stale since 2023-05) — TikTok ingestion backbone. Use `tamnd/tiktok-cli` (Apache-2.0, active) in production.
- `kishan-arya/Content-diffusion-simulator` (6★, MIT, 2026-07) — viral-potential predictor. Wire in v2 of Trend Radar.
- `aaaronmiller/create-viral-content` (66★) — Claude Code skill for hooks. Lift the system prompt verbatim into `campaign_ideas`.
- `subzeroid/instagrapi` (6.8k★) — only realistic IG personal-account poster. **Run as Python sidecar, ban risk acknowledged.**
- `PostHog/posthog` (39.6k★, MIT core) — in-app analytics + LLM observability. Defer to when §15 budget reporting needs a UI.
- `inovector/mixpost` (3.7k★, MIT) — schema reference for `social_channels` and `published_posts` Drizzle tables. Read the Mermaid; copy the entity list.

**Skip entirely:**

- `gitroomhq/postiz-app` (35.6k★) — AGPL-3.0 copyleft trap. UX reference only.
- `twintproject/twint`, `JustAnotherArchivist/snscrape`, `pushshift/api` — archived, dead, killed by Reddit.
- `mgp25/Instagram-API` — DMCA'd by Facebook.
- `AUTOMATIC1111/stable-diffusion-webui` — AGPL-3.0; run as a standalone service, never as a library.
- `google-gemini/deprecated-generative-ai-python` — archived; use `googleapis/python-genai`.
- The `kushalsamani`, `praj2408`, `akamai-developers`, `Kr3t3n`, `Pratham-Mishra225` CrewAI/AutoGen gallery repos — all <40 stars, no production history, no license. Reference only.

---

## 3. Mapping to existing `laratik-planner` §15 capabilities

The §15 enum (from `src/lib/ai/capabilities.ts`):

| ID                     | Status today       | Gap                                                    | Source of truth to add                                                                      |
| ---------------------- | ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `caption_drafts`       | Wired, 1 draft     | No brand voice; no A/B variants                        | `agency-agents/copywriter` persona + Brand Kit voice block; call prompt N=3 times           |
| `brief_improvement`    | Wired, 3 variants  | No voice rules; no "anti-voice" guard                  | `agency-agents/tone-of-voice-director` + `brand-guardian`; add `Will not change` post-check |
| `platform_adaptation`  | Wired              | Platform rules are string-typed, not per-platform data | Port `blacktwist/caption-writer-sms` contract; add per-platform length/hashtag rule table   |
| `campaign_ideas`       | Wired, 3-5 ideas   | No trend signal; static prompts                        | Lift `aaaronmiller/create-viral-content` system prompt; inject Trend Radar output           |
| `related_format_ideas` | Wired, 3-5 formats | No scoring                                             | Wrap `kishan-arya/Content-diffusion-simulator` as a `/v1/score` route; rank the suggestions |
| `completeness_check`   | Wired, score 0-100 | Brand-voice penalty missing                            | `agency-agents/brand-strategist` persona; check brief vs. Brand Kit voice                   |

**Bilingual contract (§22) impact:** the `agency-agents-ar` Arabic fork gives us 187 MENA-localized personas. Add `agency_locale` to the `loadAiContext()` call so prompts switch automatically. Don't auto-translate brand copy — the user still owns the final edit.

**Brand Kit R1–R3 impact:** today the §15 capabilities inject `brandVoice` + `brandVisuals` + `campaign` + `pillars` + `channels` + `approvedContentSamples` (see `buildContextBlock` in `src/lib/ai/index.ts:74`). The single highest-leverage change is rendering the Brand Kit's voice rules as a system-block prefix on every §15 call. That is 30 lines of code and turns every existing capability brand-aware.

---

## 4. Three new product features — implementation plans + advantage

### Feature 1 — Trend Radar

**What:** a real-time trend feed on the planning calendar. Pulls trending hashtags, audio, and creators from the platforms the agency targets. Feeds `campaign_ideas` and `related_format_ideas` so the planner sees "this topic is hot right now" next to the brief.

**Architecture (one diagram, one route, one new table):**

```
Next.js 16 (App Router)
  /app/(app)/app/w/[slug]/research/trends ──── UI (server component)
                                                       │
                          /api/trends/feed?workspace=… │
                                                       ▼
                  Postgres ─────── new `trend_signals` table
                                                       ▲
   ┌───────────────────────────────────────────────────┴────────────────────┐
   │  Python sidecar: laratik-trends  (one service, N platforms)            │
   │  ┌──────────────────────────────────────────────────────────────────┐  │
   │  │  Agent-Reach MCP  (Twitter, Reddit, YouTube, Bilibili, XHS)      │  │
   │  │  +  tamnd/tiktok-cli  (TikTok)                                   │  │
   │  │  +  kawsarlog/social-media-apis  (IG, LinkedIn, Threads)         │  │
   │  │  scrape every 6h, dedupe, score, persist to trend_signals         │  │
   │  └──────────────────────────────────────────────────────────────────┘  │
   └────────────────────────────────────────────────────────────────────────┘
```

**Implementation plan (sequenced, bounded):**

1. **Schema** (0.5 d): new `trend_signals` table — `(id, platform, topic_type, label, score, raw_payload jsonb, fetched_at, workspace_id)`. RLS by `workspace_id` per §16. Index on `(workspace_id, platform, fetched_at desc)`.
2. **Python sidecar** (3 d): FastAPI service in `services/trends/`, runs Agent-Reach + tamnd/tiktok-cli on a 6h cron. Writes to Postgres via the existing `DATABASE_URL`. Health check at `/healthz`, metric at `/metrics` (Prometheus).
3. **API route** (1 d): `GET /api/trends/feed?workspace=…&platform=…&since=…`. Read-only, paginated, server-enforces `workspace_id` membership.
4. **UI** (1 d): a new "Trends" tab on the planning toolbar. Server component, polls the route every 5 min, shows top 20 by score per platform. Clicking a trend opens a quick-create drawer pre-filled with the trend label.
5. **Hook into §15** (0.5 d): extend `loadAiContext()` to fetch the last 24h of `trend_signals` for the active workspace and pass the top 3 as `recentTrends` in the context block. The `campaign_ideas` and `related_format_ideas` capabilities now reference the trends.
6. **Tests + governance** (1 d): contract test for the new `loadAiContext` field; e2e that the trends tab loads with a fixture DB; rate-limit the new API route the same way `enforceAiBudget` does (separate counter: `trend_feed_requests_per_day`).

**Total: ~7 dev days wall-clock. Total: ~12 dev-days with parallelisation if you split schema/Python/UI across 2 engineers.**

**Advantage:**

- **Differentiation:** Buffer / Hootsuite / Later do not ship real-time trends. Postiz does, behind their SaaS. None of the open-source schedulers do.
- **Compounds existing capability:** `campaign_ideas` and `related_format_ideas` (already wired, FEAT-03) immediately become trend-aware with one context field.
- **Self-hostable:** Agent-Reach is free + MIT. No SaaS lock-in.
- **Fail-safe:** if the sidecar is down, the planner still works — `loadAiContext` returns an empty `recentTrends` array and prompts degrade gracefully.
- **Master-prompt compliant:** §2.2 explicitly excludes "live follower/reach analytics" — trend signals are public data, not engagement data, so this is in scope.

**Risk:**

- TikTok scrapers break every 2-4 months on signature changes. The sidecar is isolated; the worst case is "no TikTok trends" surfaced in the UI.
- Agent-Reach depends on a single maintainer (Panniantong). Mitigation: pair with `twscrape` (X) and `praw` (Reddit) as a parallel fallback, not a swap.

---

### Feature 2 — Brand-aware Image Generation

**What:** from any `content_item`, click "Generate image" → a modal with: aspect ratio (1:1, 9:16, 16:9, 4:5), provider (auto / Flux / gpt-image-1 / Qwen-Image / Ideogram), prompt editor, optional "Use brand reference" toggle (picks 3 hero brand assets from the media library). On submit, the route calls the provider, waits for the result, saves the image to the existing media library as a draft asset, links it to the `content_item`, and shows Insert / Replace / Copy in the AI panel.

**Architecture:**

```
Next.js 16 (App Router)
  /app/(app)/app/w/[slug]/content/[id]/ai/image ──── UI (client component)
                                                              │
                          POST /api/ai/image/generate          │
                                                              ▼
   ┌──────────────────────────────────────────────────────────┐
   │  lib/ai/image.ts  (Vercel AI SDK `generateImage`)        │
   │  ┌────────────────────────────────────────────────────┐  │
   │  │  providers:  Replicate (default)  /  OpenAI  /     │  │
   │  │              fal.ai  /  Google  /  Recraft         │  │
   │  │  brand refs: 3 hero assets → IP-Adapter / Recraft  │  │
   │  │               style_id (computed once per agency)  │  │
   │  │  model pick:  "auto" →  heuristic by aspect/text    │  │
   │  │               "hero" → Flux 3                      │  │
   │  │               "text" → gpt-image-1 or Qwen-Image   │  │
   │  │               "edit" → Google Nano-Banana 2        │  │
   │  │               "typography" → Ideogram              │  │
   │  └────────────────────────────────────────────────────┘  │
   │  ┌────────────────────────────────────────────────────┐  │
   │  │  lib/ai/governance.ts (existing)                   │  │
   │  │  • new AI capability: "image_generation"           │  │
   │  │  • daily + monthly budget via enforceAiBudget      │  │
   │  │  • estimated vs. actual token reconciliation      │  │
   │  │  • usage event written to ai_usage_events         │  │
   │  └────────────────────────────────────────────────────┘  │
   │  ┌────────────────────────────────────────────────────┐  │
   │  │  media library (existing)                          │  │
   │  │  • save generated asset as a draft                 │  │
   │  │  • link to content_item via existing FK            │  │
   │  │  • brand_reference_set computed once, cached       │  │
   │  └────────────────────────────────────────────────────┘  │
   └──────────────────────────────────────────────────────────┘
```

**Implementation plan:**

1. **Schema** (0.5 d): new `image_generations` table — `(id, content_item_id, agency_id, provider, model, prompt, brand_ref_ids, aspect_ratio, status, asset_id, created_at)`. New `brand_reference_sets` table — `(id, agency_id, name, hero_asset_ids, provider_meta jsonb, created_at)`. RLS by `agency_id`.
2. **Capability registration** (0.5 d): add `"image_generation"` to `AI_CAPABILITIES` in `src/lib/ai/governance.ts:19-26` and the metadata in `src/lib/ai/capabilities.ts:104-174`. Add it to the `enabledCapabilities` allowlist for the relevant plan templates. Default to **off** in the agency admin form (gated behind the agency master switch).
3. **Provider abstraction** (1.5 d): `src/lib/ai/image.ts` exposing `generateImage(input)` using `vercel/ai`'s `generateImage`. Provider-agnostic interface; provider-specific options via `providerOptions`. Token estimation: input=prompt+brand-refs (estimate 1k tokens per call), output=provider-reported.
4. **API route** (1.5 d): `POST /api/ai/image/generate`. Auth + entitlement + budget (reuse `enforceAiBudget` with the new capability). Reuses `enforceAiBudget` + `reconcileAiBudget` from `src/lib/ai/governance.ts:256-394`. On success, downloads the result, uploads to S3 via existing `@aws-sdk/client-s3`, writes the `image_generations` row + `media_assets` row, returns the asset id. Streaming not supported for image (binary). On provider error, redact and return public error.
5. **UI** (2 d): new "Generate image" button on the content detail page (sits beside the existing §15 buttons). Client component, modal with form. Loading state with cancel. Result state with Insert / Replace / Copy / Try-again (mirrors the §15 pattern). Empty state when no Brand Kit exists.
6. **Brand reference** (1 d): when the agency admin sets up the Brand Kit, auto-pick the top 3 hero images by size, persist a `brand_reference_set` row. When generating, send the `brand_ref_ids` to IP-Adapter (Replicate) or to Recraft's `style_id`.
7. **Tests** (1.5 d): contract test for `generateImage()` with a fake provider; e2e "Generate image → Insert" with `TEST_DATABASE_URL=planner_test`; cost-cliff test that a `n=20` request is refused after 5.

**Total: ~8.5 dev days wall-clock.**

**Advantage:**

- **Differentiator:** Postiz and Mixpost do not ship AI image gen. Adobe Express / Canva do, but they are not planners.
- **Reuses existing infrastructure:** the media library, the S3 bucket, the §15 governance (capability allow-list, daily/monthly budget, usage events), the entitlement system, the rate limiter, the form-error contract.
- **Cost discipline:** every generation runs through `enforceAiBudget` → `reconcileAiBudget`, so the agency's monthly token / dollar budget is enforced server-side. A misconfigured user cannot blow the budget.
- **Provider-agnostic:** switching from Replicate to fal.ai to OpenAI to Google is one config change. The same call surface works for all five providers.
- **Brand-consistent by default:** the `brand_reference_set` table is computed once per agency. The user can override; the default is always brand-aware.
- **Master-prompt compliant:** §15 says "AI never changes status, submits, approves, assigns, publishes, or writes without explicit human action." The image is a draft asset; Insert/Replace is human-confirmed.

**Risk:**

- **Cost cliff:** `gpt-image-1` at 2k resolution is ~$0.17/image. The capability must default to 1k and require explicit user opt-in for 2k. Implement as a per-agency config: `image_max_resolution`.
- **Content moderation:** providers reject faces / celebrities / NSFW. Surface the rejection verbatim and refund the credit. Add a "AI credit refunded" line to the `ai_usage_events` row.
- **Prompt injection:** a tenant pasting raw user comments into the prompt can hijack it. The same `promptSanitizer` (already in use for the text LLM) should run before the image call.

---

### Feature 3 — Reel Generator

**What:** from a `content_item` (text brief, blog URL, or existing caption), click "Make Reel" → a modal with: duration (15s / 30s / 60s), aspect (9:16 default), voice (none / ElevenLabs TTS / upload my own), music (none / pick from Suno / upload my own), avatar (none / D-ID presenter / LivePortrait self-host). On submit, the route: extracts the script via LLM, matches B-roll via Pexels, generates voice + music, stitches with ffmpeg, transcribes back via faster-whisper, burns kinetic captions, returns a draft video linked to the `content_item`.

**Architecture:**

```
Next.js 16 (App Router)
  /app/(app)/app/w/[slug]/content/[id]/ai/reel ──── UI (client component)
                                                          │
                       POST /api/ai/reel/generate          │
                                                          ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Python sidecar: laratik-reels  (one service, N steps)  │
   │  ┌────────────────────────────────────────────────────┐  │
   │  │  Step 1: script    — MiniMax (existing transport)  │  │
   │  │  Step 2: B-roll    — Pexels API (free, 200/hr)      │  │
   │  │  Step 3: voice     — ElevenLabs API (~$0.05/Reel)   │  │
   │  │  Step 4: music     — Suno v4 (~$0.05/Reel)          │  │
   │  │  Step 5: avatar    — D-ID or LivePortrait (opt)     │  │
   │  │  Step 6: transcribe— faster-whisper (self-host)     │  │
   │  │  Step 7: stitch    — ffmpeg + moviepy (self-host)   │  │
   │  │  Step 8: captions  — whisperx (self-host)           │  │
   │  │  Step 9: render    — ffmpeg `subtitles=…:force_style│  │
   │  └────────────────────────────────────────────────────┘  │
   │  Result: vertical MP4, S3-stored, linked to content_item │
   └──────────────────────────────────────────────────────────┘
   ┌──────────────────────────────────────────────────────────┐
   │  Replicate router (optional premium tier)                │
   │  • Veo 3 / Kling 2.1 / Sora 2 / Wan 2.2 — AI B-roll     │
   │  • Toggled per-Reel by the planner ("Use AI B-roll")    │
   │  • Cost preview shown before submit                     │
   └──────────────────────────────────────────────────────────┘
```

**Implementation plan:**

1. **Schema** (0.5 d): new `reel_jobs` table — `(id, content_item_id, agency_id, status, script, broll_assets jsonb, voice_url, music_url, avatar_url, captions_url, output_asset_id, cost_estimate_cents, cost_actual_cents, created_at, completed_at)`. RLS by `agency_id`. New `reel_jobs.reel_generation_log` (jsonb) for the per-step result.
2. **Python sidecar** (5 d): FastAPI service in `services/reels/`. Steps 1–9 above. Streaming progress via Server-Sent Events. Errors are recoverable per-step (retry from step N). Local state machine — no external queue.
3. **API route** (1.5 d): `POST /api/ai/reel/generate` — kicks off the job, returns the job id. `GET /api/ai/reel/[id]` — polls status + step. Reuses the §15 governance for the LLM step (the script generation) but adds a new counter `reel_jobs_per_day` for the B-roll/stitch/voice budget.
4. **Provider budget** (1 d): new entitlement `reel_jobs_per_day` per user, `reel_jobs_per_month` per agency. Cost preview in the modal: "Estimated cost: $0.10 (cheap) / $2.50 (premium)". User must click "I accept the cost" for premium tier.
5. **UI** (2.5 d): new "Make Reel" button on the content detail page (only when format ∈ {`short_form_video`, `long_form_video`}). Modal with the option form, then a progress view (step 1/9, step 2/9, …) streamed from the SSE endpoint. Final view with preview, Insert / Replace / Try-again.
6. **AI Subtitle standalone** (1 d): same Python sidecar exposes `POST /v1/subtitles` that takes a video URL, runs faster-whisper + whisperx, returns an `.srt` + word-level JSON. The UI exposes this as a one-click "Add subtitles" on any video in the media library.
7. **Tests** (1.5 d): per-step unit tests with fixtures; e2e "Make Reel → Insert" with a 15s test video; budget-cliff test.

**Total: ~13 dev days wall-clock.**

**Advantage:**

- **Highest-impact per-dev-day of any feature on this list.** Reels are the dominant format on IG and TikTok in 2026. A planner that can turn a blog post into a Reel in 90 seconds is a step-change.
- **Cost-transparent:** the modal shows the user the cost _before_ they commit. Most Reels land in the $0.10 cheap tier (Pexels + Suno + ElevenLabs). Premium AI-B-roll Reels at $2.50+ are an explicit opt-in.
- **Fail-safe per step:** if Suno is down, the user gets a Reel without music. If ElevenLabs is down, no voice-over. The job is the worst case "Reel with no voice, no music" — never a 500.
- **Self-hostable core:** faster-whisper + whisperx + ffmpeg + moviepy + Pexels = no SaaS dependency for the cheap tier. The premium tier is pass-through with margin.
- **Master-prompt compliant:** the Reel is a draft asset; Insert/Replace is human-confirmed. No autonomous publishing.

**Risk:**

- **Closed APIs hallucinate at 6+ seconds.** Plan for "regenerate last 3s" UX.
- **Avatar lip-sync fails on accents / fast speech.** Whisper-detected language must feed the TTS language code, or you'll get bizarre mouth motion. Add a language-code assertion in the sidecar.
- **Aspect-ratio drift.** Most closed APIs default to 16:9. Always pass `aspect_ratio: "9:16"` explicitly in every provider call.
- **No native audio for most models** — only Veo 3, Sora 2, Kling 2.2 generate audio in-pipeline. For all others, mux a separate audio track in ffmpeg.
- **Content moderation rejections** — surface the provider's rejection verbatim, refund the credit, do not auto-retry.

---

## 5. Existing-feature improvements (1-day each)

### Improvement A — `caption_drafts` produces 3 variants, not 1

Today: `caption_drafts` calls `draftCaption()` (`src/lib/ai/index.ts:304-344`) once and returns one draft. The capability metadata (`src/lib/ai/capabilities.ts:131-142`) says "one caption draft, ready to edit."

**Change:** make the route call `draftCaption()` 3 times with `temperature: 0.7`/`0.9`/`1.1`, return the variants as a numbered list. The user picks one and uses Insert.

**Why it matters:** the §15 contract says "compare alternatives" (`STUDIOFLOW_MASTER_PROMPT.md:1580`). One variant doesn't compare. The agency-agents `copywriter` persona explicitly lists "produce 3 variants" as a deliverable.

**Effort:** 0.5 day. The route's existing `switch` already returns `text`; the response shape gains a `variants: string[]` field. The UI already renders 3 variants for `brief_improvement` (the `VARIANT_SEPARATOR` parsing in `splitVariants()`); reuse that.

### Improvement B — `brief_improvement` and `caption_drafts` inject the Brand Kit voice

Today: `buildContextBlock()` in `src/lib/ai/index.ts:74-140` already includes `brandVoice.tone[]`, `brandVoice.do[]`, `brandVoice.dont[]`. But it puts them in the **user message**, not the system block. The result: voice is treated as data, not as instruction.

**Change:** render the voice rules as a prefix to the **system message** in `buildImproveBriefSystemPrompt()` and `draftCaption()`'s system message. The Brand Kit's tone/do/dont become hard constraints. Add a `Will not change: brand_voice` contract line to the metadata.

**Why it matters:** the agency-agents `tone-of-voice-director.md` persona explicitly shows that voice rules belong in the system block. The current placement makes them dismissable.

**Effort:** 0.5 day. The `buildContextBlock` change is 5 lines; the route metadata gets a new field.

### Improvement C — `related_format_ideas` ranks suggestions by viral potential

Today: `related_format_ideas` returns 3-5 format suggestions from the fixed format list. No ranking.

**Change:** after the LLM returns the candidates, call a `/v1/score` route that wraps `kishan-arya/Content-diffusion-simulator` (MIT, 6★, 2026-07). Sort by `viral_potential_score` descending. Return the top 3.

**Why it matters:** the "viral potential" score is the differentiator no other planner has. It's the single most defensible feature on this list.

**Effort:** 1 day. Wrap the simulator behind a Python sidecar (`/v1/score` route, ~50 lines). Wire the LLM output through it before returning to the user.

### Improvement D — `completeness_check` penalizes brand-voice violations

Today: `completeness_check` returns a score 0-100 + missing pieces (Hook / Main message / CTA / Audience / Hashtags / References / Scenes / Captions). No brand-voice check.

**Change:** in the system prompt for `checkCompleteness()`, add: "If the brief contradicts the Brand Kit voice rules, deduct 20 points and add the violation to the 'Missing' list." This is a pure prompt change.

**Why it matters:** the gap between "complete" and "on-brand" is the gap the user actually cares about. A complete brief that violates voice is a worse deliverable than an incomplete one that doesn't.

**Effort:** 0.25 day.

### Improvement E — `platform_adaptation` reads per-platform rules from a data table

Today: `platformAdapt()` (`src/lib/ai/index.ts:468-...`) has a giant `if (target === "x") ... else if (target === "linkedin") ...` chain in the system prompt. New platforms require code changes.

**Change:** replace the chain with a DB lookup on a new `platform_adaptation_rules` table. The table has `(platform, max_length, hashtag_density, hook_rule, paragraph_style, link_rule)`. The system prompt renders the row as a parameter block. Adding a new platform is a SQL insert.

**Why it matters:** laratik already supports 10 platforms (`src/lib/channels/command.ts:4-15`); each one has implicit rules. Make them explicit, queryable, and editable in the admin UI.

**Effort:** 1 day.

---

## 6. Architecture recommendations

### 6.1 The "skill" delivery format

For internal AI capabilities, laratik already has the right shape: a capability enum + a `chat()` client + per-capability system-prompt builders + `enforceAiBudget`. **Don't introduce a new framework.** Every "skill" the reports cite (agency-agents, blacktwist, etc.) is a _prompt_, not a runtime. The work is to port the prompts.

For external "skills" (i.e. things the planner UI calls), use **MCP**. `jlowin/fastmcp` (27.5k★, Apache-2.0) is the cleanest Python framework; `modelcontextprotocol/typescript-sdk` (13.3k★) is the TS one. The Trend Radar sidecar (§4 Feature 1) is the first MCP server laratik should ship.

### 6.2 The Python sidecar pattern

Three new sidecars in `services/`:

- `services/trends/` — Trend Radar (§4 Feature 1)
- `services/reels/` — Reel Generator + AI Subtitle (§4 Feature 3)
- `services/qa/` — optional, for HuggingFace transformers content QA (the `huggingface/transformers` recommendation from the business-workflow report)

Each sidecar is a separate Docker service in `docker-compose.yml`, has its own health check, its own metrics endpoint, and is called from a Next.js API route over plain HTTP. No shared Python runtime, no shared queue, no shared DB schema outside the existing Drizzle tables.

### 6.3 The provider-budget pattern

Add to `src/lib/ai/governance.ts` the same `enforceAiBudget` pattern for the three new capability classes:

- `image_generation` — daily + monthly, token-equivalent
- `reel_jobs` — per-day, count-based (1 Reel = 1 unit)
- `trend_feed` — per-day, count-based (1 feed read = 1 unit)

Reuse `ai_usage_events` for the audit log. The agency's monthly cap is the same counter as today; the daily cap is per-user, like today.

### 6.4 The "no autonomous anything" pattern

Master-prompt §2.2 is the source of truth. Every new feature must:

- Return a draft, not a state change.
- Never modify a `content_item.state`, `content_assignment`, or `published_post` row on its own.
- Never call a publishing API.
- Never modify an `agency_entitlement` row.
- Surface "Insert / Replace / Copy / Try-again" in the UI, never "Save and publish."

This is already the §15 contract. Extend it to the three new capabilities. The "Will update / Will not change" contract per capability metadata is the user-facing version of the same rule.

---

## 7. Sequencing — 5 sprints, 2 engineers

| Sprint          | Theme                             | Stories                                                                         | Engineer A                                       | Engineer B                                               |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| **S1 (week 1)** | Foundations                       | Improvements A, B, D + agency-agents prompt port + brand reference set infra    | Schema, capability metadata, governance          | Port 6 personas into `voice-guidance/`, write unit tests |
| **S2 (week 2)** | Trend Radar (Feature 1)           | Schema, sidecar, API route, UI, context hook                                    | Python sidecar (`services/trends/`)              | UI + API route + context hook                            |
| **S3 (week 3)** | Brand-aware Image Gen (Feature 2) | Schema, capability, provider abstraction, API route, brand reference            | `lib/ai/image.ts` + API route                    | UI modal + Insert/Replace flow + tests                   |
| **S4 (week 4)** | Reel Generator (Feature 3)        | Schema, sidecar, API route, UI                                                  | Python sidecar (`services/reels/`) + AI Subtitle | UI modal + progress streaming + tests                    |
| **S5 (week 5)** | Polish + Improvements C, E        | Viral-potential ranker, platform-rules table, observability, PostHog LLM traces | Improvements C + E + PostHog wiring              | E2E tests + governance contract tests + docs             |

**Total wall-clock:** 5 weeks with 2 engineers, 8–10 weeks with 1 engineer.

**Total dev-days:** ~38 dev-days (combining both engineers).

**All features ship behind the agency database master switch — defaults to off.** No customer is forced onto the new features.

---

## 8. License / risk summary

| Repo                                            | License                | Risk                                                                                                 | Mitigation                                              |
| ----------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `msitarzewski/agency-agents`                    | MIT                    | None — but the personas are written for Claude-Code conventions, not Anthropic API.                  | Port prompt content; don't import files wholesale.      |
| `jnMetaCode/agency-agents-ar`                   | MIT                    | None — hand-localized Arabic, MENA register.                                                         | Use as vocabulary reference; don't auto-translate.      |
| `facebook/facebook-nodejs-business-sdk`         | Meta Platform License  | Permissive for building apps that interact with Meta products; forbids building a competing product. | Fine for laratik.                                       |
| `Vercel AI SDK`                                 | Apache-2.0             | None.                                                                                                | Add as direct dep.                                      |
| `Panniantong/Agent-Reach`                       | MIT                    | Single-maintainer bus factor.                                                                        | Pair with `twscrape` + `praw` as parallel fallback.     |
| `faster-whisper`                                | MIT                    | None.                                                                                                | Direct dep.                                             |
| `subzeroid/instagrapi`                          | Other (free use)       | Ban risk; Meta TOS.                                                                                  | Personal accounts only, behind a clear UI disclaimer.   |
| `inovector/mixpost`                             | MIT                    | None — schema reference only.                                                                        | Read Mermaid, copy the entity list, write Drizzle.      |
| `PostHog/posthog`                               | MIT (core) / EE (paid) | Heavy.                                                                                               | Use PostHog Cloud free tier (1M events/mo).             |
| `gitroomhq/postiz-app`                          | AGPL-3.0               | **Copyleft trap** — linking forces AGPL on laratik.                                                  | **Reference only; never depend.**                       |
| `AUTOMATIC1111/stable-diffusion-webui`          | AGPL-3.0               | **Copyleft trap** if linked.                                                                         | Run as a standalone HTTP service behind an API gateway. |
| `mgp25/Instagram-API`                           | n/a                    | **DMCA'd by Facebook.**                                                                              | Never use.                                              |
| `twint`, `snscrape`, `pushshift/api`            | various                | Archived, dead.                                                                                      | Never use.                                              |
| `google-gemini/deprecated-generative-ai-python` | Apache-2.0             | Archived; renamed to `deprecated-...`.                                                               | Use `googleapis/python-genai` instead.                  |
| `cumulo-autumn/StreamDiffusion`                 | Apache-2.0             | Stalled (2024-12-04).                                                                                | Don't depend.                                           |

**Universal rule:** any repo with no `LICENSE` file defaults to **all-rights-reserved** under GitHub's terms. Do not vendor code from no-license repos. The viral-trend report and the content-writing report each flag ~40% of the candidate repos as no-license.

---

## 9. What success looks like (KPIs, 90 days post-launch)

- **% of paid agencies that enable the new AI features** — target 40% (gated features, opt-in).
- **AI generations per active planner per week** — target ≥ 8 (a Reel + 3 captions + 2 image drafts + 2 trend-driven ideas).
- **AI generation cost per agency per month** — target ≤ $30 (cheap tier). The §15 budget caps this server-side.
- **Time from brief → first AI draft** — target ≤ 30 seconds (today, with the agency master switch on and a working draft, it's about 8s; with the new capabilities it's the same + 90s for a Reel).
- **% of AI drafts the planner edits before publishing** — target ≥ 70% (lower means AI is auto-accepted, which would mean the human-in-the-loop guardrail is broken).
- **% of agency plans that allow all 9 capabilities** (6 §15 + 3 new) — target 25% (most plans will gate Reels + Image Gen behind a higher tier).

The KPIs are not vanity metrics — they measure the contract: AI drafts, humans publish, budget enforced, scope respected.

---

## 10. Open questions for the user

1. **Provider budget per agency per month.** I assumed $30 cheap tier. What is the actual number per plan?
2. **Reel Generator premium tier.** $0.10 cheap / $2.50 premium is the market rate. Do you want to expose premium at all, or stay on cheap only?
3. **Brand-aware Image Gen: which providers are allowed by default?** My recommendation is Replicate (Flux + Qwen) as default + OpenAI gpt-image-1 as a per-agency opt-in. Some agencies will want to forbid OpenAI for data-residency reasons.
4. **Trend Radar: per-agency opt-in, or per-user opt-in?** The §15 governance is per-user daily, per-agency monthly — the same pattern should apply.
5. **Where does the LLM call for the script extraction in Reel Generator route through?** Through the existing `MINIMAX_BASE_URL` (the §15 transport), or a separate budget? My recommendation is the same transport, with `reel_jobs` added to the governance.
6. **MCP for planner UI?** The Trend Radar sidecar is MCP. Do you want to expose MCP to the planner UI itself (so external agents can call laratik capabilities), or keep MCP sidecar-only?

These are the only blocking questions. Everything else has a defensible default and can be shipped without further input.

---

## 11. Appendix — file manifest

| File                                          |       Words | Purpose                         |
| --------------------------------------------- | ----------: | ------------------------------- |
| `.research/social-media-research-skills.md`   |       4,502 | Scraping / analytics / trends   |
| `.research/facebook-instagram-skills.md`      |       3,379 | Meta-platform SDK + skills      |
| `.research/content-writing-skills.md`         |       4,505 | Captions / copy / brand voice   |
| `.research/viral-trend-skills.md`             |       3,016 | Viral / hooks / trend radar     |
| `.research/image-generation-skills.md`        |       3,743 | Image gen providers + wrappers  |
| `.research/video-generation-skills.md`        |       4,460 | Video / Reel / Subtitle         |
| `.research/business-workflow-skills.md`       |       4,240 | Agency / approval / analytics   |
| `.research/INTEGRATION_REPORT.md` (this file) |      ~6,000 | Synthesis + implementation plan |
| **Total**                                     | **~33,800** |                                 |

All numbers are point-in-time (2026-09-07, ~23:30 CEST). Re-verify before procurement decisions on the moderation / inbox / OSINT layers that the business-workflow report could not fully re-pull due to GitHub API rate-limits.
