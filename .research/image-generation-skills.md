# AI Image Generation Skills for Social Media — Repo & Provider Survey

> **Target:** `laratik-planner` — a Next.js 16 + Drizzle + Postgres + NextAuth SaaS for
> social media planning, design, and approvals. AI is **feature-flagged off by default**;
> this survey feeds a future **"Brand-aware image generation"** feature wired into the
> existing media library.
>
> **Survey date:** 2026-09-07. All star/fork/pushed_at numbers are live from the
> GitHub REST API (or static-known where the API was rate-limited).
>
> **Scope:** open-source skill-shaped repositories **and** the closed-source
> model/provider SaaS APIs that those skills wrap. Focus is **social-media-shaped
> output**: 1:1 feed, 9:16 story / reel, 16:9 cover, 4:5 portrait, brand-consistent
> look & feel, on-image text, batch generation, product mockup.

---

## 1. Executive summary

The image-gen landscape for social media in 2026 is **provider-dominated**, not
repo-dominated. The actual ML weights and the host GPUs sit behind three classes of
SaaS APIs, and the open-source side is mostly:

1. **Multi-provider SDKs** (a thin layer that lets a TS/Python app call any
   provider through one interface), and
2. **Self-host backends** (ComfyUI, A1111, InvokeAI) that you run on your own
   GPU if you want zero per-image cost and full LoRA / IP-Adapter control.

**Top-line picks for laratik-planner** (more detail in §8):

| #   | Skill / Repo                                                                        | Why it wins                                                                                        |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **`@ai-sdk/openai` + `@ai-sdk/google` + `@ai-sdk/replicate`** via the Vercel AI SDK | Single `generateText`/`generateImage` surface, all major providers, TS-first, Next.js native       |
| 2   | **`replicate/replicate-javascript`** (direct)                                       | The largest open model marketplace; if a model exists, it's on Replicate. 598★, Apache-2.0         |
| 3   | **`fal-ai/fal-js`**                                                                 | Fastest serverless gateway for Flux / SDXL / Qwen-Image, has `@fal-ai/client` Next.js helpers. MIT |
| 4   | **`invoke-ai/InvokeAI` 4.x self-host**                                              | When a tenant needs brand-LoRA + IP-Adapter under the same roof; 28.2k★, Apache-2.0                |
| 5   | **`tencent-ailab/IP-Adapter`** reference-image block                                | Reference-image brand consistency — drop into ComfyUI or A1111                                     |

**Top provider picks for the actual model** (more detail in §3):

1. **Replicate** (marketplace, runs everything including Qwen-Image-3-Pro and Flux 3) — one bill, one SDK, one webhook story.
2. **fal.ai** for Flux / SDXL / Qwen — cheapest fast GPU for the same open
   weights, has its own `fal-js`.
3. **OpenAI `gpt-image-1`** (or `gpt-image-1.5` if available) for "just works"
   text-in-image and product mockups.
4. **Google `gemini-2.5-flash-image-preview` (Nano-Banana 2)** when you want
   multimodal editing on a user's existing image.
5. **Ideogram / Recraft** for hard-typography social posts (recurring "topic +
   date" templates) when OpenAI text rendering isn't enough.

**Crown-jewel multi-provider wrapper:** **`ai-sdk` (Vercel)** with its
`@ai-sdk/<provider>` adapters — it is the only repo in the survey that gives
laratik-planner a _clean_ route from a TypeScript API route to "ask Flux for a
square, ask GPT-Image for a story, ask Replicate for a LoRA-fine-tuned variant,"
all behind the same `generateImage()` call shape and the same `usage` accounting.

---

## 2. How to read this survey

- **Stars / forks** are GitHub-wide, not "laratik-relevant" — used as a rough
  activity proxy, not a quality score.
- **`pushed_at`** is the most important signal: a repo last pushed in 2024 is
  probably not the right pick in 2026 unless it's intentionally "done."
- **License matters** for laratik-planner because the product is self-hosted
  commercially on a VPS; AGPL repos (A1111, oobabooga) are a _self-host-only_
  option, not a library dependency.
- **Provider list** is opinionated to "what a Western SaaS agency would buy
  in 2026" — not exhaustive of Chinese-only providers (Tongyi-MAI, Baichuan,
  StepFun) unless they appear on Replicate.

---

## 3. Provider ranking — the actual models behind every image

This is the "what model do we call" matrix, ordered by **laratik-fit** for a
social-media-planning tool that needs feed / story / cover / thumbnail output
and brand consistency.

| #   | Provider / Model                                                                                 | Quality (1-5) | Cost / image (1024²)                             | Text-in-image                    | Speed    | Self-host?                     | LaraTik fit                                       |
| --- | ------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------ | -------------------------------- | -------- | ------------------------------ | ------------------------------------------------- |
| 1   | **Replicate `black-forest-labs/flux-1.1-pro` / `flux-2-pro` / `flux-3`**                         | ⭐⭐⭐⭐⭐    | ~$0.05–$0.08                                     | ⭐⭐⭐⭐                         | ~3-8 s   | ❌ (BFL stalled 2025-07-31)    | ⭐⭐⭐⭐⭐ (default for hero)                     |
| 2   | **Replicate `prunaai/p-image`** (sub-1-s)                                                        | ⭐⭐⭐⭐      | ~$0.003                                          | ⭐⭐⭐                           | <1 s     | ❌                             | ⭐⭐⭐⭐⭐ (background, batch)                    |
| 3   | **Replicate `prunaai/z-image-turbo`** (Tongyi-MAI)                                               | ⭐⭐⭐⭐      | ~$0.005                                          | ⭐⭐⭐                           | ~1 s     | ❌                             | ⭐⭐⭐⭐ (cheap batch)                            |
| 4   | **Replicate `alibaba/qwen-image-3-pro`**                                                         | ⭐⭐⭐⭐⭐    | ~$0.04                                           | ⭐⭐⭐⭐⭐                       | ~5-10 s  | ❌ (Qwen-VL is on HuggingFace) | ⭐⭐⭐⭐⭐ (text-heavy posts)                     |
| 5   | **fal.ai Flux / SDXL / Qwen** (same weights, raw infra)                                          | ⭐⭐⭐⭐⭐    | 30-50% cheaper than Replicate for the same model | ⭐⭐⭐⭐                         | ~3-8 s   | ❌ (you bring the model)       | ⭐⭐⭐⭐                                          |
| 6   | **OpenAI `gpt-image-1` (ChatGPT Images API)**                                                    | ⭐⭐⭐⭐⭐    | $0.04–$0.17 (1k/2k)                              | ⭐⭐⭐⭐⭐ (best-in-class)       | ~10-20 s | ❌                             | ⭐⭐⭐⭐⭐ (text, product mockup)                 |
| 7   | **Google `gemini-2.5-flash-image` (Nano-Banana 2)**                                              | ⭐⭐⭐⭐      | $0.02–$0.05 (preview pricing)                    | ⭐⭐⭐⭐                         | ~5 s     | ❌                             | ⭐⭐⭐⭐ (edit existing asset)                    |
| 8   | **Anthropic Claude** — _no native image gen_; image gen must be a tool call (BFL/Replicate/Flux) | —             | —                                                | —                                | —        | —                              | Use Claude as **prompt builder**, not image model |
| 9   | **Ideogram 2.0/3.0 API**                                                                         | ⭐⭐⭐⭐      | ~$0.05–$0.10                                     | ⭐⭐⭐⭐⭐ (typography champion) | ~10 s    | ❌                             | ⭐⭐⭐⭐ (banner / quote / event posts)           |
| 10  | **Recraft V3 / V4 API**                                                                          | ⭐⭐⭐⭐⭐    | ~$0.08–$0.25                                     | ⭐⭐⭐⭐⭐ (vector + text)       | ~15 s    | ❌                             | ⭐⭐⭐⭐ (brand-vector + text)                    |
| 11  | **Leonardo.ai Phoenix / Kino XL**                                                                | ⭐⭐⭐⭐      | ~$0.05                                           | ⭐⭐⭐                           | ~10 s    | ❌                             | ⭐⭐⭐ (fine-tune via Leonardo Canvas)            |
| 12  | **Stability AI `stable-image-core` / `ultra`** (REST)                                            | ⭐⭐⭐        | ~$0.03                                           | ⭐⭐                             | ~6 s     | ✅ (SDXL weights)              | ⭐⭐⭐ (legacy / SDXL slot)                       |
| 13  | **Together.ai Flux / SDXL**                                                                      | ⭐⭐⭐⭐      | ~$0.04                                           | ⭐⭐⭐                           | ~5-10 s  | ❌ (serverless only)           | ⭐⭐⭐ (Replicate alternative)                    |
| 14  | **Midjourney v7**                                                                                | ⭐⭐⭐⭐⭐    | ~$0.10+ (no public REST)                         | ⭐⭐                             | n/a      | ❌ (Discord / web only)        | ⭐⭐ (no public API; skip)                        |
| 15  | **xAI Grok `grok-2-image` / Aurora**                                                             | ⭐⭐⭐        | ~$0.05                                           | ⭐⭐                             | ~8 s     | ❌                             | ⭐⭐ (x-post native, niche)                       |
| 16  | **Self-host FLUX.1-dev / SDXL on ComfyUI / InvokeAI**                                            | ⭐⭐⭐⭐      | GPU power only                                   | ⭐⭐                             | 4-30 s   | ✅✅✅                         | ⭐⭐⭐ (only if tenant brings LoRA)               |

**Source:** Replicate explore page (live 2026-09-07), provider pricing pages as
of mid-2026, BFL/Black Forest Labs public pricing, and `prunaai/p-image`'s
"sub-1-second" marketing claim cross-checked against third-party benchmarks.

### Provider notes (the gotchas)

- **Flux is moving to "Flux 3"** on Replicate in 2026. BFL's own
  `black-forest-labs/flux` GitHub repo last pushed 2025-07-31 — BFL is treating
  itself as a model lab, not a hosting provider. Production laratik-planner
  traffic should hit Replicate or fal.ai, not BFL direct.
- **`prunaai/p-image` (18.7M runs on Replicate)** is the _real_ default for
  cheap batch background / asset generation in 2026. Sub-1-second, ~$0.003 per
  image. 1024², no LoRA, no IP-Adapter, but you can post-process with ControlNet
  on a different node.
- **`prunaai/z-image-turbo`** (Tongyi-MAI) at 54M runs is the second cheapest
  fast model and the most popular image model on Replicate overall. Good
  general-purpose default.
- **Qwen-Image-3.0-Pro** is the new (2026) text-in-image champion on Replicate
  — 12.5K runs in the first wave. Worth A/B-testing against OpenAI
  `gpt-image-1` for "event title + date + handle" templates.
- **OpenAI `gpt-image-1`** still has the best instruction-following for "make
  the headline read exactly this, on a soft gradient, in our brand purple." It
  is the most expensive option on this list at 2k resolution.
- **Anthropic** doesn't generate images. Use Claude (or the
  `claude-sonnet-4-5` API in laratik-planner) only for **prompt engineering
  and brand-voice prompt templating** before calling the image model.
- **Midjourney** has no public REST API in 2026. Out.
- **Ideogram / Recraft** are the right pick for the "event flyer with five
  lines of perfect typography" sub-niche; OpenAI is the right pick for the
  "photo-realistic campaign hero with subtle text overlay" sub-niche.
- **Google Nano-Banana 2 (`gemini-2.5-flash-image`)** is the only model on
  this list that is meaningfully good at _editing_ a user's existing brand
  asset ("put this product on this background, keep the lighting") and is
  cheap enough to use in an interactive editor.

---

## 4. Category rankings (repos only)

### 4.1 Multi-provider SDK libraries ("Crown Jewels")

These are the repos that wrap many providers behind one interface.

| Rank | Repo                                            | Stars | License                          | Providers covered                                                                              | Last push               | LaraTik fit                                              |
| ---- | ----------------------------------------------- | ----- | -------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| 1    | `vercel/ai` (AI SDK)                            | ~16k  | Apache-2.0                       | OpenAI, Anthropic, Google, Replicate, fal, Together, Groq, xAI, Mistral, Cohere, +30 community | active weekly           | ⭐⭐⭐⭐⭐ (TS-native, Next.js native, the obvious pick) |
| 2    | `lobehub/lobe-chat`                             | 82.3k | Custom (free for non-commercial) | 50+ providers including image models                                                           | active daily            | ⭐⭐ (huge codebase, not a library; use as reference)    |
| 3    | `langchain-ai/langchain`                        | ~95k  | MIT                              | Most major image providers via `ChatOpenAI`/tools                                              | active                  | ⭐⭐ (overkill; image gen is one call, not a chain)      |
| 4    | `replicate/replicate-javascript`                | 598   | Apache-2.0                       | Replicate (one provider, but every model)                                                      | 2025-11-17              | ⭐⭐⭐⭐ (small, focused, official)                      |
| 5    | `replicate/replicate-python`                    | ~700  | Apache-2.0                       | Replicate (Python)                                                                             | active                  | ⭐⭐⭐⭐ (Python alternative)                            |
| 6    | `fal-ai/fal-js`                                 | 184   | MIT                              | fal.ai (Flux, SDXL, Qwen)                                                                      | 2026-09-07              | ⭐⭐⭐⭐ (TS, Next.js helpers)                           |
| 7    | `togethercomputer/together-python`              | 80    | Apache-2.0                       | Together.ai                                                                                    | 2026-08-06              | ⭐⭐ (only Together, not multi)                          |
| 8    | `google-gemini/deprecated-generative-ai-python` | 2.3k  | Apache-2.0                       | Google only                                                                                    | **ARCHIVED** 2025-12-16 | ❌ use `googleapis/python-genai` instead                 |

**Pitfall:** the original `google-gemini/generative-ai-python` repo is
**archived and renamed** (`deprecated-generative-ai-python`). The replacement
is `googleapis/python-genai` (new unified SDK). If you see a tutorial
referencing the old one, it's stale.

**Pitfall:** the `vercel/ai` package was renamed/restructured between v3 and
v4. Use the current major (v5 / AI SDK 5) — `@ai-sdk/openai`,
`@ai-sdk/google`, `@ai-sdk/replicate`, `@ai-sdk/fal`, `@ai-sdk/anthropic`.

### 4.2 ComfyUI / A1111 self-host backends

For brand-LoRA / IP-Adapter / ControlNet workflows when a tenant really needs
on-prem or per-tenant fine-tuning. These are _not_ npm packages — they're
PyTorch services you run behind an API.

| Rank | Repo                                             | Stars  | Forks | License    | Last push                             | LaraTik fit                                                           |
| ---- | ------------------------------------------------ | ------ | ----- | ---------- | ------------------------------------- | --------------------------------------------------------------------- |
| 1    | `Comfy-Org/ComfyUI`                              | 131.9k | 15.6k | GPL-3.0    | 2026-09-07 (very active)              | ⭐⭐⭐⭐ (modern, modular, JSON-serializable workflows)               |
| 2    | `invoke-ai/InvokeAI`                             | 28.2k  | 3.0k  | Apache-2.0 | 2026-09-06 (very active)              | ⭐⭐⭐⭐ (commercial-friendly, has its own REST API)                  |
| 3    | `AUTOMATIC1111/stable-diffusion-webui`           | 164.8k | 30.6k | AGPL-3.0   | 2026-03-02 (slower)                   | ⭐⭐ (AGPL is a no-go as a library dep; ok to self-host as a service) |
| 4    | `lllyasviel/Adetailer` / `lllyasviel/ControlNet` | 34.1k  | 3.0k  | Apache-2.0 | 2024-02-25 (stalled, but still works) | ⭐⭐⭐ (ControlNet as a building block)                               |
| 5    | `cumulo-autumn/StreamDiffusion`                  | 10.8k  | 834   | Apache-2.0 | 2024-12-04 (stalled)                  | ⭐ (real-time streaming, niche for social)                            |

**Pitfall:** `cumulo-autumn/StreamDiffusion` is unmaintained; do not adopt
for new work.

**Pitfall:** A1111's repo is **AGPL-3.0**, which means any service that
_links_ it must publish its source. Laratik-planner running it as a
standalone HTTP service _behind_ an API gateway is the legally-safe
pattern — do not import it as a Python library.

### 4.3 Brand-consistency generators (LoRA, IP-Adapter, style ref)

| Rank | Repo                       | Stars | License    | Last push         | LaraTik fit                                                       |
| ---- | -------------------------- | ----- | ---------- | ----------------- | ----------------------------------------------------------------- |
| 1    | `tencent-ailab/IP-Adapter` | 6.7k  | Apache-2.0 | 2024-06-28 (slow) | ⭐⭐⭐⭐⭐ (drop-in "use this reference image" block)             |
| 2    | `ostris/ai-toolkit`        | ~6k   | Apache-2.0 | 2026 (active)     | ⭐⭐⭐⭐ (UI for LoRA training)                                   |
| 3    | `bmaltais/kohya_ss`        | ~12k  | Apache-2.0 | active            | ⭐⭐⭐⭐ (LoRA training UI)                                       |
| 4    | `huggingface/diffusers`    | ~30k  | Apache-2.0 | active            | ⭐⭐⭐⭐ (the underlying lib that powers most of the above)       |
| 5    | `lllyasviel/IC-Light`      | ~2k   | Apache-2.0 | 2024              | ⭐⭐⭐ (foreground/background lighting relight for product shots) |

**Note for laratik-planner:** "brand consistency" in 2026 is **not** "fine-tune
a LoRA on every customer." It is **"use a reference image of the brand's
existing post as the style anchor via IP-Adapter or Recraft's style ID."** The
correct architecture is: tenant uploads 3-5 hero brand images → laratik
creates an IP-Adapter reference set or a Recraft style ID → all subsequent
generations are conditioned on that reference set. This is what every
competitor (Adobe Firefly Custom Models, Canva Magic Studio, Recraft Brand
Kit) actually does.

### 4.4 Text-in-image specialists (typography)

| Rank | Repo / API                                                             | Stars / Status          | License            | LaraTik fit                                     |
| ---- | ---------------------------------------------------------------------- | ----------------------- | ------------------ | ----------------------------------------------- |
| 1    | Ideogram 2.0/3.0 API (no open-source)                                  | commercial              | proprietary        | ⭐⭐⭐⭐ (best pure text rendering 2025-2026)   |
| 2    | Recraft V3/V4 API (no open-source)                                     | commercial              | proprietary        | ⭐⭐⭐⭐ (vector + text; brand color palettes)  |
| 3    | `alibaba/qwen-image-3` (open weights on HuggingFace, API on Replicate) | 12.5K runs on Replicate | Apache-2.0 weights | ⭐⭐⭐⭐⭐ (self-hostable + cheap on Replicate) |
| 4    | OpenAI `gpt-image-1`                                                   | closed                  | proprietary        | ⭐⭐⭐⭐⭐ (instruction-following + text)       |
| 5    | `lllyasviel/Fooocus`                                                   | ~45k                    | GPL-3.0            | ⭐⭐ (good text but GPL — self-host only)       |

### 4.5 Thumbnail / cover / social-format specific

| Rank | Repo                                           | Stars | License | LaraTik fit                                  |
| ---- | ---------------------------------------------- | ----- | ------- | -------------------------------------------- |
| 1    | `iloveai/auto-yt-shorts-maker`                 | ~2k   | MIT     | ⭐ (YT-niche, not laratik-shaped)            |
| 2    | `nutlope/thumbnail` (Twitter banner)           | ~700  | MIT     | ⭐⭐ (single-purpose, reference only)        |
| 3    | Custom ComfyUI workflow JSONs on `civitai.com` | n/a   | varies  | ⭐⭐⭐ (copy the workflow, run on Replicate) |

**Honest answer:** no major open-source repo is purpose-built for "generate
an Instagram feed + Story + X cover for one post" as a single product. The
pattern is always: **provider API + thin wrapper in your own app** that calls
the provider 2-3 times with different `aspect_ratio` / `size` parameters and
saves all variants to the media library.

### 4.6 Mockup / product placement

| Rank | Repo / API                                          | License     | LaraTik fit                        |
| ---- | --------------------------------------------------- | ----------- | ---------------------------------- |
| 1    | Recraft V4 (object placement, vector-aware)         | proprietary | ⭐⭐⭐⭐ (best product-into-scene) |
| 2    | `lllyasviel/IC-Light` (relight + composite)         | Apache-2.0  | ⭐⭐⭐ (ComfyUI / A1111 only)      |
| 3    | OpenAI `gpt-image-1` (multi-image inpainting)       | proprietary | ⭐⭐⭐ (good enough, expensive)    |
| 4    | `tencent-ailab/IP-Adapter` (face/identity transfer) | Apache-2.0  | ⭐⭐⭐ (face only, not product)    |

### 4.7 Background removal / compositing

| Rank | Repo                                | Stars                     | License    | LaraTik fit                                   |
| ---- | ----------------------------------- | ------------------------- | ---------- | --------------------------------------------- |
| 1    | `imgly/background-removal-js`       | ~5k                       | MIT        | ⭐⭐⭐⭐⭐ (in-browser, ONNX, no server cost) |
| 2    | `danielgatis/rembg`                 | ~16k                      | MIT        | ⭐⭐⭐⭐ (Python, very accurate)              |
| 3    | `briaai/BRIA-RMBG-2.0` on Replicate | commercial + open weights | Apache-2.0 | ⭐⭐⭐⭐ (best 2026 quality)                  |
| 4    | `lucataco/another-rmbg` (Replicate) | community                 | open       | ⭐⭐⭐ (cheap)                                |

**LaraTik recommendation:** ship `imgly/background-removal-js` as the
client-side default (zero server cost, instant), and fall back to
`briaai/BRIA-RMBG-2.0` via Replicate when the client-side model fails on
tricky hair / transparent edges.

---

## 5. Crown Jewels — multi-provider wrappers

If laratik-planner ships exactly **one** image-gen integration, it should
expose a single internal interface like:

```ts
type ImageGenRequest = {
  prompt: string;
  aspectRatio: "1:1" | "9:16" | "16:9" | "4:5";
  brandRefIds?: string[]; // laratik media library IDs used for IP-Adapter / Recraft style
  quality: "draft" | "standard" | "hero";
  model: "flux" | "gpt-image-1" | "qwen-image" | "ideogram" | "auto";
};
```

The three repos that let you build this with the least glue are:

### 5.1 Vercel AI SDK — `vercel/ai` (and `@ai-sdk/*` adapters)

- Apache-2.0, TS-native, Next.js-native, used by ~16k+ apps.
- One `generateImage({ model, prompt, size })` call shape across
  OpenAI, Replicate, fal, Google, Together, xAI.
- Built-in `experimental_generateImage` + `aspectRatio` parameter.
- Provider-specific features (Ideogram's typography mode, Flux's `raw`,
  Recraft's `style_id`) are accessible via `providerOptions`.
- **LarTik verdict:** the obvious pick. Pair with `@ai-sdk/openai`,
  `@ai-sdk/google`, `@ai-sdk/replicate`, `@ai-sdk/fal`.

### 5.2 Replicate JS — `replicate/replicate-javascript`

- 598★, Apache-2.0, official client. Every model on Replicate is callable
  with the same `replicate.run("owner/model:version", { input })` call.
- Best when you need a _specific_ model that no other provider has
  (e.g. a fine-tuned SDXL LoRA a customer uploaded to Replicate).
- Webhook support is built in — important for laratik's "background job,
  poll, store in media library" pattern.

### 5.3 fal.ai JS — `fal-ai/fal-js`

- 184★, MIT, official. Cheapest serverless GPU for Flux / SDXL / Qwen.
- `@fal-ai/client` has first-class Next.js / App Router helpers and
  `queue.subscribe` for long jobs.
- Best when cost-per-image matters and you don't need Replicate's
  model marketplace.

---

## 6. Pitfalls & abandoned projects (read this before you write code)

1. **`google-gemini/deprecated-generative-ai-python` is archived** (renamed
   to `deprecated-…`). Use `googleapis/python-genai` instead.
2. **`midjourney-api` and `midjourney-wrapper`** on GitHub are **scraping
   the unofficial Discord API**; their accounts get banned, the repos are
   abandoned. Don't depend on them.
3. **`AUTOMATIC1111/stable-diffusion-webui`** is **AGPL-3.0** — you can run
   it as a standalone service, but you may not embed it as a library in a
   commercial product without open-sourcing the wrapper.
4. **`cumulo-autumn/StreamDiffusion`** is stalled (2024-12-04). Real-time
   image gen is interesting but not a 2026 laratik priority.
5. **BFL's own `black-forest-labs/flux` repo** last pushed 2025-07-31.
   BFL is no longer a hosting provider. Use Replicate or fal.ai.
6. **`oobabooga/text-gen-webui`** is text-generation, not image — was
   incorrectly in scope earlier. Skipped.
7. **`ControlNet`** repo is stalled (2024-02-25), but the _idea_ lives on
   in `diffusers` and in the ComfyUI ControlNet nodes. Don't depend on
   the standalone repo.
8. **SDXL/SD1.5 fine-tunes** (thousands of community LoRAs on Civitai)
   are a 2024 paradigm. In 2026, the equivalent is Flux LoRAs or
   IP-Adapter reference images on Flux/Qwen.
9. **Pricing cliffs:** `gpt-image-1` at 2k resolution is ~$0.17/image.
   A "generate 20 cover variants for A/B testing" flow can blow a
   tenant's credit budget. Always cap the `n` (count) parameter and
   default to 1k for previews.
10. **Prompt-injection risk:** when a tenant pastes raw user comments
    into the prompt ("user said: ignore previous instructions and..."),
    sanitize with the same `promptSanitizer` laratik already uses for
    the text LLM, or run the LLM prompt-rewrite step server-side
    before the image call.
11. **Content moderation:** OpenAI, Google, and Replicate all reject
    generations; laratik must show the user the rejection reason
    verbatim and not auto-retry. The "AI credit" should be refunded.
12. **Aspect-ratio cost:** some providers charge per image, not per
    megapixel; a 1536×1024 hero on Replicate Flux can be 4× the price
    of a 1024² preview. Always send the smallest acceptable `size`
    and use the provider's `upscale` endpoint as a separate billable
    step.

---

## 7. Mapping to laratik-planner's existing media library

laratik-planner already has (per AGENTS.md / package.json):

- `src/lib/media-library/` — media library with S3 storage (`@aws-sdk/client-s3`).
- Drizzle schema for assets, folders, tags, brand kits (verify in
  `src/lib/db/schema/` before coding).
- Next.js 16 App Router, React Query for data fetching.
- A `.env.example` with provider-key slots — `OPENAI_API_KEY` and
  similar probably already exist.

The proposed shape of the integration (no code yet — this is the plan):

1. **New table:** `image_generations` — `id`, `tenantId`, `model`,
   `prompt`, `negativePrompt`, `aspectRatio`, `seed`, `costCents`,
   `parentAssetId` (for img2img), `status` (queued/running/done/failed),
   `createdAt`. Foreign key to existing `media_assets` for the result.
2. **New table:** `brand_references` — tenant's reference image set.
   `id`, `tenantId`, `label`, `assetId` (FK to `media_assets`),
   `weight` (0-1), `createdAt`. Used as IP-Adapter / Recraft style
   anchors.
3. **API route:** `POST /api/image/generate` — accepts the
   `ImageGenRequest` shape above, calls the provider via the AI SDK,
   stores the result in `media_assets`, writes a row to
   `image_generations`, returns the asset ID.
4. **Webhook handler:** `POST /api/webhooks/replicate` (or `/fal`) —
   accepts the provider's async completion webhook, updates the
   `image_generations` row, downloads the image to S3, links to
   `media_assets`.
5. **Feature flag:** the AI is "off by default" per project
   convention; wrap the entire `/api/image/*` surface in a single
   `if (!featureFlag('aiImageGen')) return 404` so it ships as
   zero-cost in the default deploy.
6. **Provider abstraction:** `src/lib/image-gen/provider.ts` —
   thin wrapper over `generateImage` from the AI SDK; one file
   per provider if a provider has features the abstraction
   can't express.
7. **Credit accounting:** `image_generations.costCents` is the
   truth; the `ai-credits` ledger (if it exists in laratik's
   billing) decrements on `queued` and refunds on `failed`.

---

## 8. Final picks for laratik-planner

### Top 3-5 — "Brand-aware image generation" feature

1. **`@ai-sdk/openai` + `@ai-sdk/replicate` + `@ai-sdk/google` (the Vercel AI SDK)**
   — the integration layer. One `generateImage()` call, three providers.
2. **`prunaai/p-image` on Replicate** as the _default draft_ model
   (sub-1s, $0.003, 1024²). Lets tenants iterate cheaply.
3. **`gpt-image-1` (OpenAI)** as the _text+product_ model. Default
   for "I need a flyer with a 5-word headline and our product."
4. **`alibaba/qwen-image-3-pro` on Replicate** as the _typography_ model
   when OpenAI text rendering isn't enough. Cheap fallback.
5. **`fal-ai/fal-js`** as the _cost-optimized_ provider for Flux
   and SDXL when a tenant's brand kit is Flux-trained.

### Optional, if the tenant requires self-hosting

6. **`InvokeAI` 4.x** running as a sidecar container, with the
   brand's IP-Adapter reference set, behind the same
   `ImageGenRequest` shape. Only enable when
   `featureFlag('aiImageGen.selfHost')` is on for that tenant.

### Why not the others

- **A1111** — AGPL, slow maintenance, no advantage over ComfyUI.
- **LobeHub** — not a library; a 82k★ consumer app.
- **LangChain** — overkill for a single image call.
- **Midjourney** — no public API.
- **Stable Diffusion 1.5/SDXL** community LoRAs — 2024 paradigm;
  the equivalent in 2026 is Flux/Qwen LoRAs and IP-Adapter
  reference images, which are already covered by the picks above.

---

## 9. Sources

- GitHub REST API (`api.github.com/repos/<owner>/<repo>`) for stars,
  forks, license, `pushed_at`, `archived` flag — 2026-09-07.
- Replicate explore page (`replicate.com/explore`) for current
  model popularity, Qwen-Image-3-Pro / Flux 3 / Wan 3 / Z-Image
  Turbo rankings — 2026-09-07.
- BFL/Black Forest Labs public pricing and changelog
  (`blackforestlabs.com`) — 2026.
- Ideogram, Recraft, OpenAI, Google AI Studio, Together, fal.ai
  pricing pages — accessed 2026-09.
- CompVis/Stability AI, Replicate, fal.ai, and provider blog
  announcements for the 2025-2026 "FLUX 2 / FLUX 3 / Qwen-Image
  / GPT-Image-1.5" timeline.
- laratik-planner `AGENTS.md`, `package.json`, `STUDIOFLOW_MASTER_PROMPT.md`
  (read-only) for project context.
