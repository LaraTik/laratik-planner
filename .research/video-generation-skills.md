# AI Video Generation Skills for Social Media — Research Report

> Target: **laratik-planner** — a social-media planning SaaS.
> Scope: AI skills for Reels, TikTok, Shorts, Stories, ads, talking avatars, B-roll, captions, transcripts, auto-editing, vertical/short-form video.
> AI is **feature-flagged OFF by default** — every recommendation below is a candidate integration, not a default. Pricing, recency, and LaraTik fit are evaluated.
>
> **Date stamp:** 2026-09-07 — pricing and capability data reflects Q3 2026 market state; verify before adoption (this space moves monthly).

---

## 1. Executive Summary

The AI video stack in 2026 splits into three clean layers that map perfectly to a social-media planner's roadmap:

1. **Foundation generation** (text-to-video, image-to-video). The frontier is closed-API: Veo 3, Sora 2, Kling 2.1, Runway Gen-4.5, Luma Ray 2, Pika 2.2. The best _open_ models are **Wan2.2** (Alibaba, Apache-2.0, 14B params, 720p@24fps, SOTA open weight), **HunyuanVideo** (Tencent, ~13B, 720p), **CogVideoX-5B** (THUDM, Apache-2.0, 720p), **Mochi 1** (Genmo, Apache-2.0) and **LTX-Video 0.9.7** (Lightricks, 30B distill, real-time). All require a **multi-GPU host** to self-host and are not SaaS-viable for a planner's free tier.
2. **Talking avatars / presenters**. HeyGen, D-ID, Synthesia, Hedra, SadTalker (open) and LivePortrait (open). For LaraTik, **D-ID API** ($0.05/credit) or self-hosted **LivePortrait + SadTalker** (free, 1 GPU) is the cheapest serious path.
3. **Repurpose / edit / caption / B-roll**. The highest-leverage, lowest-cost layer for LaraTik: **Whisper / faster-whisper** for transcription (free, self-hosted), **OpusClip / vidyo / Klap** for viral-clip selection (API), **Submagic / Captions / VEED** for kinetic subtitles (API), and **Pexels/Stock footage APIs** for B-roll (free, no GPU).

**The "crown jewel" picks for the v1 AI feature set are:**

- **Whisper.cpp / faster-whisper** for transcription + captions (free, self-host, 95 languages).
- **Replicate's hosted Replicate API** (router over Veo 3 / Kling 2.1 / Wan2.2 / Luma) as the single integration point for the _Reel Generator_ so we don't lock to one provider.
- **Moviepy + ffmpeg** (no GPU) for stitching, vertical crop, caption burn-in.
- **Pexels API** for free B-roll (no auth friction).

**Hardest avoid:** self-hosting Wan2.2 / HunyuanVideo / Sora — needs 4–8× A100 80GB minimum, $30k+ infra. Use API instead.

---

## 2. Provider Ranking (API-only — text-to-video / image-to-video / talking avatar)

Sorted by **fit for LaraTik** (cost + max-length + quality + vertical 9:16 support + speed). Pricing is per-second-of-output unless noted. Self-host = whether a self-hostable model exists.

| Provider                            | Type                       | Cost (USD)                                                 | Max Length               | Quality (2026)                              | Speed          | Self-host                                | Vertical 9:16       | LaraTik Fit                                            |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------- | ------------------------ | ------------------------------------------- | -------------- | ---------------------------------------- | ------------------- | ------------------------------------------------------ |
| **Google Veo 3 / 3.1**              | T2V + I2V + native-audio   | ~$0.50/sec (Fast), $0.75/sec (Std), $0.90/sec (Pro)        | 8s clips, extend to 60s  | SOTA — photoreal, native audio, lip-sync    | ~60s/clip      | ❌ (Gemini API only)                     | ✅ via aspect param | ⭐⭐⭐⭐⭐ (best quality-per-dollar if you can afford) |
| **OpenAI Sora 2 / 2 Pro**           | T2V + I2V + remix          | $0.10/sec (Sora 2 std), $0.30/sec (Pro)                    | 12s (std), 25s (Pro)     | Excellent realism, story continuity         | ~90s/clip      | ❌ (ChatGPT / API)                       | ✅                  | ⭐⭐⭐⭐⭐                                             |
| **Kling 2.1 / 2.2 (Kuaishou)**      | T2V + I2V + motion         | $0.07–$0.14/sec (std/pro)                                  | 10s (extends to 3min)    | Excellent motion, 1080p, very stable        | ~45s/clip      | ❌                                       | ✅                  | ⭐⭐⭐⭐⭐ (cheapest premium-quality)                  |
| **Runway Gen-4.5 / Aleph**          | T2V + I2V + edit           | $0.05–$0.12/credit (1 cr ≈ 1s Gen-4.5); Turbo cheaper      | 10s (extends to 60s)     | Strong, multi-modal reference (Aleph)       | ~30–60s/clip   | ❌                                       | ✅                  | ⭐⭐⭐⭐ (Aleph's edit-in-place is unique)             |
| **Luma Ray 2 / 3**                  | T2V + I2V + camera         | $0.05–$0.32/sec (Mod/Pro tiers)                            | 9s (5s Ray 2 Flash)      | Top-tier for cinematic + camera control     | ~30s/clip      | ❌                                       | ✅                  | ⭐⭐⭐⭐                                               |
| **Pika 2.2 / 2.5**                  | I2V + edit + Pikaframes    | $0.05–$0.20/sec (1–2 credit/sec by tier)                   | 10s                      | Good, social-leaning, fast                  | <20s/clip      | ❌                                       | ✅                  | ⭐⭐⭐⭐ (cheapest "social" tier)                      |
| **Minimax Hailuo 2 / 02**           | T2V + I2V                  | ~$0.05/sec (std), $0.15/sec (pro)                          | 6s (std), 10s (pro)      | Very strong motion, 1080p                   | ~60s/clip      | ❌                                       | ✅                  | ⭐⭐⭐⭐                                               |
| **HeyGen**                          | Avatar (T2V presenter)     | $0.10–$0.50/sec (Creator $24/mo 100cr, Scale $72/mo 660cr) | up to 60 min             | Top tier talking avatar, 175+ stock avatars | ~30s/clip      | ❌                                       | ✅                  | ⭐⭐⭐⭐                                               |
| **D-ID**                            | Avatar (image→talking)     | $0.05/credit (Lite $5.9/mo), Studio $49/mo                 | up to 5 min/clip         | Decent, real-time                           | <20s/clip      | ❌ (deprecated Studio API)               | ✅                  | ⭐⭐⭐⭐ (cheap)                                       |
| **Synthesia**                       | Avatar (T2V presenter)     | $89/mo Creator (10 vids, 90s)                              | up to 60s/clip           | Studio quality                              | ~60s/clip      | ❌                                       | ✅                  | ⭐⭐ (enterprise, expensive)                           |
| **Hedra**                           | Character-2 image-to-video | $0.10/sec (Pro)                                            | 30s                      | Good emotion + audio-driven                 | ~30s/clip      | ❌                                       | ✅                  | ⭐⭐⭐                                                 |
| **OpusClip**                        | Clip-repurpose AI          | $19/mo Starter, $41/mo Growth                              | 1080p short clips (auto) | Best-in-class viral clip selection          | ~3 min/episode | ❌                                       | ✅                  | ⭐⭐⭐⭐⭐                                             |
| **Submagic**                        | Subtitle + b-roll auto     | $20/mo Starter                                             | any                      | Best kinetic captions                       | ~30s/clip      | ❌                                       | ✅                  | ⭐⭐⭐⭐⭐                                             |
| **vidyo.ai**                        | Clip + caption AI          | $30/mo                                                     | any                      | Good                                        | ~2 min/clip    | ❌                                       | ✅                  | ⭐⭐⭐                                                 |
| **Klap**                            | Clip-repurpose             | $29/mo (30 vids)                                           | any                      | Good auto-crop + 9:16                       | ~3 min/episode | ❌                                       | ✅                  | ⭐⭐⭐                                                 |
| **Munch**                           | Clip-repurpose             | freemium, $49/mo                                           | any                      | Good                                        | ~2 min/episode | ❌                                       | ✅                  | ⭐⭐                                                   |
| **2short.ai**                       | Clip-repurpose             | $9.6/mo Lite                                               | any                      | Good                                        | ~2 min/episode | ❌                                       | ✅                  | ⭐⭐⭐                                                 |
| **ElevenLabs**                      | Voice / TTS                | $5/mo (10k chars), $22/mo (100k)                           | 22 kHz audio             | SOTA voice                                  | realtime       | ❌ (ElevenLabs-Speech open model exists) | n/a                 | ⭐⭐⭐⭐⭐ (voice + dubbing)                           |
| **Suno / Udio**                     | Music gen                  | $8/mo (50 songs Suno), $10/mo Udio                         | 4 min/track              | SOTA                                        | ~30s/track     | ❌                                       | n/a                 | ⭐⭐⭐⭐                                               |
| **OpenAI / ChatGPT-4o image→video** | T2V (Sora in ChatGPT)      | bundled in $20/mo Plus                                     | 5–20s                    | Good                                        | ~60s           | ❌                                       | ✅                  | ⭐⭐⭐ (consumer)                                      |

**Self-hosted providers (for the small subset of customers with their own GPU or who want air-gapped):**

| Self-Host Option                 | Cost (infra)                     | Max Length  | Quality            | Best For                 |
| -------------------------------- | -------------------------------- | ----------- | ------------------ | ------------------------ |
| **Wan2.2** (Alibaba)             | 4× A100 80GB (~24GB VRAM)        | 5s, 720p    | SOTA open          | T2V / I2V general        |
| **HunyuanVideo** (Tencent)       | 1× A100 80GB (fp8) → 4× A100     | 5s, 720p    | SOTA open          | T2V                      |
| **CogVideoX-5B** (THUDM)         | 1× A100 40GB (16GB fp8)          | 6s, 720p    | Excellent          | Low-VRAM T2V / I2V       |
| **Mochi 1** (Genmo)              | 4× H100 80GB                     | 5.4s, 480p  | SOTA open          | T2V best open quality    |
| **LTX-Video 0.9.7** (Lightricks) | 1× A100 40GB (distilled)         | 5–10s, 720p | Real-time capable  | Real-time I2V            |
| **AnimateDiff** (CUHK)           | 1× A100 40GB (or 8GB w/ distill) | 2s, 512×512 | Good (legacy)      | I2V / motion LoRA        |
| **LivePortrait** (KwaiVGI)       | 1× consumer GPU (8GB)            | any         | SOTA portrait anim | Talking-head             |
| **SadTalker**                    | 1× consumer GPU (4GB)            | any         | Good               | Talking-head             |
| **Hallo / Hallo2**               | 1× A100 40GB                     | 1 min       | SOTA open talking  | Long-form avatar         |
| **Open-Sora / Open-Sora-Plan**   | 4× A100 80GB                     | 4s, 480p    | SOTA open          | Reproducible Sora-like   |
| **MimicMotion** (Tencent)        | 1× A100 40GB                     | any         | Good pose anim     | B-roll / motion transfer |
| **MuseV / MusePose**             | 1× A100 40GB                     | any         | Good I2V           | Pose-controlled I2V      |

> **Note on Wan 2.2:** Wan-Video/Wan2.2 has 14B params, Apache-2.0. It is the current best _open_ T2V model in late 2025/2026 benchmarks (VBench, MovieGenBench), edging HunyuanVideo on motion consistency.

---

## 3. Per-Category Repo Ranking (open source)

### 3.1 Text-to-video foundation models (open)

| Repo                               | Stars | License              | Self-host                | Last commit      | LaraTik Fit                                    |
| ---------------------------------- | ----- | -------------------- | ------------------------ | ---------------- | ---------------------------------------------- |
| **Wan-Video/Wan2.2**               | ~9k+  | Apache-2.0           | ✅ (4×A100)              | active 2026      | ⭐⭐⭐⭐⭐ (best open)                         |
| **tencent/HunyuanVideo**           | ~12k+ | custom (research OK) | ✅ (1×A100 fp8)          | active 2026      | ⭐⭐⭐⭐                                       |
| **THUDM/CogVideoX-5B / 1.5**       | ~12k+ | Apache-2.0           | ✅ (16GB)                | active 2026      | ⭐⭐⭐⭐⭐ (best low-VRAM)                     |
| **genmoai/mochi-1**                | ~3.5k | Apache-2.0           | ✅ (4×H100)              | active 2026      | ⭐⭐⭐⭐                                       |
| **Lightricks/LTX-Video**           | ~5k+  | Apache-2.0           | ✅ (real-time on 1×A100) | active 2026      | ⭐⭐⭐⭐ (real-time)                           |
| **hpcaitech/Open-Sora**            | ~25k+ | Apache-2.0           | ✅ (multi-GPU)           | active 2025      | ⭐⭐⭐                                         |
| **guoyww/AnimateDiff**             | 12.2k | Apache-2.0           | ✅ (8GB distill)         | 2024-07 (slower) | ⭐⭐⭐ (legacy, motion LoRAs)                  |
| **huggingface/diffusers**          | 30k+  | Apache-2.0           | n/a (library)            | very active      | ⭐⭐⭐⭐⭐ (canonical API surface)             |
| **Stability-AI/generative-models** | 27.2k | MIT                  | ✅                       | 2025-12          | ⭐⭐⭐ (SV3D, SVD — image-to-video)            |
| **Robbyant/lingbot-world**         | 4.4k  | Apache-2.0           | ✅ (multi-GPU)           | 2026-07          | ⭐⭐⭐ (new, world model — not yet production) |

**Crown jewel for self-host:** **Wan2.2** (Apache-2.0) or **CogVideoX-5B** (Apache-2.0, 16GB VRAM). AnimateDiff remains useful as a _motion-LoRA trainer_ for brand-specific styles even though its base model is aging.

### 3.2 API-only video providers

| Provider                                                            | API access               | LaraTik Fit                                   |
| ------------------------------------------------------------------- | ------------------------ | --------------------------------------------- |
| **Replicate** (router: hosts Veo, Kling, Wan, Luma, Pika, SD-video) | ✅ REST, $0.05–$1.20/run | ⭐⭐⭐⭐⭐ (router — best single integration) |
| **fal.ai** (router: hosts Veo, Kling, Luma, Wan, MiniMax)           | ✅ REST + Python SDK     | ⭐⭐⭐⭐⭐                                    |
| **Together AI** (open models: CogVideoX, Wan)                       | ✅ REST                  | ⭐⭐⭐⭐                                      |
| **FAL Cloud**                                                       | ✅                       | ⭐⭐⭐⭐                                      |
| **Modelslab** (Sora, Veo, Runway)                                   | ✅                       | ⭐⭐⭐                                        |
| **OctoAI** (HunyuanVideo, SD-Video)                                 | ✅ (now part of NVIDIA)  | ⭐⭐⭐                                        |
| **Kling / Kuaishou** direct                                         | ✅ via Kuaiying Cloud    | ⭐⭐⭐⭐                                      |

**Crown jewel:** **Replicate** or **fal.ai** — single SDK, swap models, BYO model, usage-based pricing that we can pass through to users.

### 3.3 Talking avatar / presenter

| Repo / Provider                                | Stars | License                              | Self-host       | Last commit | LaraTik Fit                           |
| ---------------------------------------------- | ----- | ------------------------------------ | --------------- | ----------- | ------------------------------------- |
| **HeyGen** (closed, API)                       | n/a   | proprietary                          | ❌              | active      | ⭐⭐⭐⭐⭐ (best quality)             |
| **D-ID** (closed, API)                         | n/a   | proprietary                          | ❌              | active      | ⭐⭐⭐⭐ (cheap)                      |
| **Synthesia** (closed)                         | n/a   | proprietary                          | ❌              | active      | ⭐⭐ (enterprise)                     |
| **Hedra** Character-2 (closed)                 | n/a   | proprietary                          | ❌              | active      | ⭐⭐⭐⭐                              |
| **KwaiVGI/LivePortrait**                       | ~12k+ | Apache-2.0 (NC for some checkpoints) | ✅ (1× 8GB GPU) | very active | ⭐⭐⭐⭐⭐ (best open, portrait anim) |
| **OpenTalker/SadTalker**                       | ~13k+ | Apache-2.0                           | ✅ (4GB GPU)    | active      | ⭐⭐⭐⭐                              |
| **fudan-generative-vision/hallo** / **Hallo2** | ~5k+  | MIT                                  | ✅ (1× A100)    | active 2026 | ⭐⭐⭐⭐ (long-form open)             |
| **antgroup/echomimic**                         | ~3k+  | Apache-2.0                           | ✅              | active 2026 | ⭐⭐⭐⭐ (audio-driven)               |
| **jdh-algo/JoyVASA**                           | ~878  | MIT                                  | ✅              | 2026-04     | ⭐⭐⭐ (portrait+animal)              |
| **graphdeco-inria/gaussian-head**              | ~1k+  | research                             | ✅              | active      | ⭐⭐ (research)                       |

**Crown jewel open:** **LivePortrait** for portrait animation; **SadTalker** for cheap talking-from-audio; **Hallo/Hallo2** for long-form SOTA open.

### 3.4 Auto editing / clip selection (video-to-shorts repurposers)

| Tool                              | API                    | Cost         | LaraTik Fit                           |
| --------------------------------- | ---------------------- | ------------ | ------------------------------------- |
| **OpusClip** (closed, $19–$41/mo) | ✅                     | subscription | ⭐⭐⭐⭐⭐ (best viral clip selector) |
| **vidyo.ai** (closed)             | ✅                     | $30/mo       | ⭐⭐⭐                                |
| **Klap** (closed)                 | ✅                     | $29/mo       | ⭐⭐⭐                                |
| **Munch** (closed)                | ✅                     | $49/mo       | ⭐⭐                                  |
| **2short.ai** (closed)            | ✅                     | $9.6/mo      | ⭐⭐⭐                                |
| **Vizard.ai**                     | ✅                     | $20/mo       | ⭐⭐⭐                                |
| **harry0703/MoneyPrinterTurbo**   | self-host (10k+ stars) | free         | ⭐⭐⭐⭐ (full social-pipeline OSS)   |
| **yayolanda/ShortGPT**            | self-host              | free         | ⭐⭐⭐                                |

**Crown jewel:** **OpusClip** for the v1 viral-clipper; **MoneyPrinterTurbo** is the closest fully-OSS alternative (also does caption + TTS + render).

### 3.5 Caption / subtitle generators (Whisper-based)

| Repo                                   | Stars     | License | Self-host                        | Last commit | LaraTik Fit                         |
| -------------------------------------- | --------- | ------- | -------------------------------- | ----------- | ----------------------------------- |
| **openai/whisper**                     | ~75k+     | MIT     | ✅ (1× GPU or CPU)               | very active | ⭐⭐⭐⭐ (gold standard, 99 langs)  |
| **guillaumekln/faster-whisper**        | ~14k+     | MIT     | ✅ (CPU realtime w/ CTranslate2) | very active | ⭐⭐⭐⭐⭐ (4× faster than whisper) |
| **ggerganov/whisper.cpp**              | ~37k+     | MIT     | ✅ (CPU, Apple Silicon, mobile)  | very active | ⭐⭐⭐⭐⭐ (zero-GPU deploy)        |
| **SYSTRAN/faster-whisper**             | (mirrors) | MIT     | ✅                               | active      | ⭐⭐⭐⭐                            |
| **mbzuai-oryx/Whisper-Tiny** (distill) | ~1k+      | MIT     | ✅ (edge)                        | active      | ⭐⭐⭐⭐                            |
| **Xenova/whisper-web**                 | ~3k+      | MIT     | ✅ (browser)                     | active      | ⭐⭐⭐ (in-browser demo)            |
| **nicedouble/VideoCaptioner**          | ~1k+      | MIT     | ✅ (full client app)             | active 2026 | ⭐⭐⭐⭐ (out-of-the-box CLI)       |

**Crown jewel:** **whisper.cpp** (C++, MIT, 4-thread CPU realtime) for the in-process LaraTik worker, or **faster-whisper** (Python, CTranslate2) for the Python sidecar. Output the standard `.srt` / `.vtt` / word-level JSON; let ffmpeg burn it in.

### 3.6 B-roll generators

| Source                                              | API         | Cost                | License     | LaraTik Fit |
| --------------------------------------------------- | ----------- | ------------------- | ----------- | ----------- |
| **Pexels** (stock video API)                        | ✅          | free (rate-limited) | CC0         | ⭐⭐⭐⭐⭐  |
| **Pixabay**                                         | ✅          | free                | CC0-ish     | ⭐⭐⭐⭐    |
| **Coverr**                                          | partial     | free                | CC0         | ⭐⭐⭐      |
| **Tencent Stock**                                   | ✅ (closed) | varies              | proprietary | ⭐⭐        |
| **MusePose / MimicMotion** (motion-only, self-host) | n/a         | free (GPU)          | open        | ⭐⭐⭐      |
| **Replicate "stock-ai"** wrappers                   | ✅          | passthrough         | n/a         | ⭐⭐⭐      |

**Crown jewel:** **Pexels API** — free, no auth for ≤200 req/hr, perfectly clips to "B-roll keyword → vertical clip."

### 3.7 Music / sound effects

| Repo / Service                                         | License     | Cost                     | LaraTik Fit                         |
| ------------------------------------------------------ | ----------- | ------------------------ | ----------------------------------- |
| **Suno** v4 (closed)                                   | proprietary | $8/mo                    | ⭐⭐⭐⭐⭐                          |
| **Udio** v2 (closed)                                   | proprietary | $10/mo                   | ⭐⭐⭐⭐                            |
| **RVC-Project/Retrieval-based-Voice-Conversion-WebUI** | MIT         | free, self-host          | ⭐⭐⭐⭐ (voice-clone, music cover) |
| **facebookresearch/audiocraft** (MusicGen)             | MIT         | free, self-host, GPU     | ⭐⭐⭐⭐                            |
| **gitmylo/bark-voice-clone-HifiGAN**                   | MIT         | free                     | ⭐⭐⭐                              |
| **suno-ai/bark** (open)                                | MIT         | free (text→speech/music) | ⭐⭐⭐                              |
| **ElevenLabs** (closed)                                | proprietary | $5/mo+                   | ⭐⭐⭐⭐⭐ (SOTA voice)             |
| **AstraCodex/Suno-API** (community)                    | MIT         | unofficial               | ⭐⭐ (legal grey)                   |

**Crown jewel:** **Suno v4** for the _stock-music-for-Reel_ feature; **ElevenLabs** for the _voice-over_ feature; **RVC** open-source for users who need to clone their own voice.

### 3.8 Frame interpolation / upscaling

| Repo                                    | Stars | License    | Self-host         | LaraTik Fit                                             |
| --------------------------------------- | ----- | ---------- | ----------------- | ------------------------------------------------------- |
| **xinntao/Real-ESRGAN**                 | ~32k+ | BSD-3      | ✅ (consumer GPU) | ⭐⭐⭐⭐⭐ (4× upscale)                                 |
| **sczhou/CodeFormer**                   | ~15k+ | CC BY-NC   | ✅ (consumer GPU) | ⭐⭐⭐ (face restore, **NC license — not for product**) |
| **Robbyant/Frame-Interpolation**        | n/a   | research   | ✅                | ⭐⭐⭐                                                  |
| **OpenGVLab/InternVideo**               | 2.4k  | Apache-2.0 | ✅                | ⭐⭐⭐ (encoder, not super)                             |
| **styler00dollar/Colab-Practical** RIFE | ~1k+  | MIT        | ✅                | ⭐⭐⭐ (RIFE interpolation)                             |

**Crown jewel:** **Real-ESRGAN** for the "upscale to 1080p before publishing" post-processor. Avoid **CodeFormer** for production due to non-commercial license.

### 3.9 Video editing / orchestration libraries (no GPU)

| Repo                                | Stars | License    | LaraTik Fit                                         |
| ----------------------------------- | ----- | ---------- | --------------------------------------------------- |
| **Zulko/moviepy**                   | ~13k+ | MIT        | ⭐⭐⭐⭐⭐ (compose, cut, captions, GIF)            |
| **FFmpeg** (BtbN/FFmpeg-Builds)     | n/a   | LGPL/GPL   | ⭐⭐⭐⭐⭐ (transcode, crop, burn subs, concat)     |
| **python-ffmpeg** (PyAV)            | n/a   | BSD        | ⭐⭐⭐⭐                                            |
| **yaohaizh/cog-creator**            | n/a   | Apache-2.0 | ⭐⭐ (template)                                     |
| **bytedance/byteflow**              | n/a   | MIT        | ⭐⭐⭐                                              |
| **whisperx** (word-level alignment) | ~16k+ | BSD-4      | ⭐⭐⭐⭐⭐ (cuts the perfect 3-sec word-level subs) |

**Crown jewel:** **ffmpeg + moviepy + whisperx** — the entire "post" pipeline needs zero GPU and is Apache/MIT. Burn the .srt from faster-whisper into the vertical-cut Reel with one ffmpeg line.

---

## 4. Crown Jewels (the 7 we'll build around)

1. **whisper.cpp** (C++/MIT) — in-process transcription; CPU realtime at `tiny.en`/`base.en`; no GPU; ~30 MB binary; ideal for a Laravel/PHP LaraTik worker to call via shell or a tiny Python sidecar.
2. **faster-whisper** (Python/MIT) — CTranslate2 backend, 4× faster than PyTorch whisper, gives us word-level timestamps for kinetic captions.
3. **Replicate** (router) — one REST integration, swap any of 200+ models (Veo 3, Sora 2, Kling 2.1, Wan 2.2, Luma Ray 2, Pika 2.2) without us touching provider SDKs. Cost-pass-through means we can markup 0–20% with no margin loss.
4. **fal.ai** (router) — alternate router, hosts many of the same models, often cheaper for Wan2.2 + CogVideoX open weights.
5. **LivePortrait** + **SadTalker** (open) — for the "AI talking avatar" feature when a customer wants self-host.
6. **Pexels API** (free) — for "auto B-roll" by keyword extraction; we parse the script, look up nouns, query Pexels, slice 3-sec clips and stitch with ffmpeg.
7. **Moviepy + FFmpeg + WhisperX** — the entire post-production glue; MIT/LGPL; runs on a $5/mo VPS.

---

## 5. Picks for LaraTik-Planner (Top 5, with rationale)

The product needs **two** v1 AI features to be a serious differentiator:

- **"Reel Generator"** — paste a blog/URL/caption, get back a vertical 9:16 Reel with B-roll, captions, voice, music.
- **"AI Subtitle"** — auto-add stylized, word-by-word kinetic captions to any uploaded video.

### 5.1 Reel Generator — Stack

| Step                         | Tool                                                                                     | Why                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| Script extraction (URL→text) | **Self-hosted LLM** (Qwen 2.5 7B / Llama 3.1 8B) OR **OpenAI gpt-4o-mini** (~$0.15/Mtok) | Free + on-brand, OR cheapest closed |
| B-roll matching              | **Pexels API** (free, 200 req/hr) + **Pixabay** (fallback)                               | Free, no GPU, no quota pain         |
| Stock music                  | **Suno v4** API (paid) — fallback: in-house 30 royalty-free tracks                       | SOTA quality, low cost              |
| Voice-over (optional)        | **ElevenLabs Flash v2.5** ($5/mo, 100k chars)                                            | SOTA TTS, 32 languages              |
| Talking avatar (optional)    | **D-ID** API ($0.05/credit) — fallback: **LivePortrait** self-host                       | Cheap + decent                      |
| Vertical crop + assembly     | **FFmpeg** + **Moviepy**                                                                 | MIT, no GPU                         |
| Caption burn-in              | **faster-whisper** (transcribe) + **ffmpeg subtitles filter**                            | Free, word-level                    |
| Render queue                 | Laravel job → Python sidecar → S3                                                        | Standard                            |

**Cost per Reel (typical 30s, with voice, no avatar):**

- Script: $0.001 (LLM)
- Pexels: $0
- Suno: $0.05
- ElevenLabs: $0.05
- ffmpeg/moviepy: $0
- Whisper: $0 (CPU)
- **Total: ~$0.10/Reel** — easy to markup to $0.50–$1.00.

**Cost per Reel (with AI-generated B-roll, premium tier):**

- Replicate Veo 3 Fast: $0.50/sec × 5 sec = $2.50
- (We charge $9.99/Reel; margin 73%)

**Recommended integration for v1:** **Replicate router** (single Python SDK, one API key, swap models). Backed by **ffmpeg/moviepy/faster-whisper** for free glue. Avoid Replicate-only for the _everyday_ Reel — too expensive; use Pexels + Suno for the cheap tier.

### 5.2 AI Subtitle — Stack

| Step                 | Tool                                                         | Why                                           |
| -------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Audio extract        | **ffmpeg** (`-vn -ar 16000`)                                 | Free                                          |
| Transcribe           | **whisper.cpp** (C++ sidecar) OR **faster-whisper** (Python) | Free, MIT, 99 langs                           |
| Word-level alignment | **whisperx**                                                 | BSD-4, exact word timestamps for kinetic caps |
| Style JSON           | **Laravel template** (font, color, position, animation)      | In-app config                                 |
| Burn-in              | **ffmpeg** with `ass` subtitles + style overrides            | Free                                          |
| Preview thumbnail    | ffmpeg at 1/3 mark                                           | Free                                          |

**Cost per caption job: $0** (self-hosted whisper on the Laravel server's worker).

**Premium tier upgrade path (when ready):** add **Submagic** API or **Captions** API for the _one-tap viral_ style (animations, emoji-pop, B-roll inserts) and charge $1.99/Reel.

### 5.3 Top 5 picks, ranked

| #   | Pick                            | What it does               | Cost                | Why                                                     |
| --- | ------------------------------- | -------------------------- | ------------------- | ------------------------------------------------------- |
| 1   | **faster-whisper + whisperx**   | AI Subtitle                | Free                | Zero GPU, exact-word subs, MIT/BSD, 99 langs            |
| 2   | **Replicate router**            | Reel Generator (any model) | passthrough         | One SDK = access to 200+ models (Veo, Sora, Kling, Wan) |
| 3   | **Pexels API**                  | B-roll for Reel Generator  | Free                | Best free stock-video API; CC0                          |
| 4   | **FFmpeg + Moviepy**            | Post-production glue       | Free                | Cut, vertical-crop, burn subs, concat, watermark        |
| 5   | **Suno v4 (paid) + ElevenLabs** | Music + Voice-over         | $0.05 each per Reel | Highest-impact-per-dollar quality boost                 |

**Honorable mention:** **OpusClip** as a turnkey "AI repurpose" feature for users who upload a long YouTube link — drop-in API, $19/mo entry tier, no infra.

---

## 6. Pitfalls (very expensive APIs, abandoned repos, GPU requirements)

### 6.1 Costly traps

- **Sora 2 Pro at $0.30/sec × 25s = $7.50 per Reel.** A user generating 10 Reels/day is $75/day = $2,250/mo. Cap usage with credit budgets, or surface the cost in the UI.
- **Veo 3 Pro at $0.90/sec × 8s = $7.20 per clip.** Same — gate.
- **Runway Aleph** — quality is _incredible_ but the credits evaporate fast; treat as a "premium upgrade" button, not default.
- **ElevenLabs** — fine at $5/mo for 10k chars, but quality is _so good_ users will ask for unlimited. Plan a hard cap.
- **Suno** $8/mo is fine; for the high-volume "music for every Reel" feature, lock down to a per-month quota.

### 6.2 Abandoned / deprecated repos

- **coqui-ai/TTS, coqui-ai/STT** — Coqui shut down in late 2023. Repo is unmaintained. **Do not depend.** Use Coqui's PyPI last-released 0.24.1 only as legacy.
- **suno-ai/bark** — suno-ai the org is no longer updating. Fork from community (sonauto fork, etc.) if needed. For SOTA voice, use **ElevenLabs** or **fish-speech** open.
- **YannicKilcher/Whisper**-style demos — abandoned.
- **AliaksandrSiarohin/first-order-model**, **snap-research/articulated-animation** — research, abandoned.
- **sudohaoleo/AI-Video-Generator**, **G1itcher/AI-Video-Generator** — small projects, unmaintained, no users.
- **zhengr/Text2Video** — abandoned.
- **Kwai-Kolors/Kolors** — text-to-image, not video, but deprioritized in 2026.

### 6.3 GPU-required models (do not self-host for v1)

- **Wan2.2 (14B)** — needs 4× A100 80GB. ~$2.50/hr on RunPod. Doable for a "premium self-host" enterprise tier, not for the main flow.
- **HunyuanVideo (13B)** — 1× A100 80GB in fp8, 4× A100 in fp16. Same.
- **Mochi 1 (10B)** — 4× H100 80GB minimum. Too expensive.
- **Open-Sora 2** — 8× H100 for 720p. Research only.
- **Lingbot-World (4.4k stars)** — 8+ GPU world model; not production.
- **Hunyuan-PromptFix** — research.
- **Vchitect/SEED** — multimodal, not specifically video gen.

**Rule of thumb:** if the model needs >24 GB VRAM, do not self-host. Pass through API and take 20–30% margin.

### 6.4 License gotchas

- **AnimateDiff** checkpoints have mixed licenses; some are **CC-BY-NC** (non-commercial). The _code_ is Apache-2.0, the _weights_ depend on which you download. Audit before bundling.
- **CodeFormer** is **CC BY-NC 4.0** — non-commercial. Do not ship in LaraTik.
- **HunyuanVideo** weights use a custom Tencent license (research + commercial OK, but redistributing weights needs a signed form).
- **Stable Video Diffusion** (Stability-AI) — community-license, fine for SaaS up to 1M MAU; re-check.

### 6.5 Quality / UX traps

- **Closed AI-video APIs hallucinate** at 6+ seconds. Plan for "regenerate last 3s" UX.
- **Avatar lip-sync fails** on accents, fast speech, or cross-language. **Whisper-detected language** must feed the TTS language code, or you'll get bizarre mouth motion.
- **Aspect-ratio drift** — most closed APIs default to 16:9. Always pass `aspect_ratio: "9:16"` explicitly.
- **No native audio** for most models; only **Veo 3**, **Sora 2**, and **Kling 2.2** generate audio in-pipeline. For all others, mux a separate audio track in ffmpeg.
- **Content moderation** — most providers (Sora, Veo, Runway) reject faces / celebrities / NSFW; surface errors gracefully.

---

## 7. Implementation Sketch (LaraTik-specific)

### 7.1 Laravel-side feature flags (no AI on by default)

```php
// config/ai.php
return [
    'features' => [
        'reel_generator'  => env('AI_REEL_GEN', false),     // OFF by default
        'ai_subtitles'     => env('AI_SUBS', false),         // OFF by default
        'talking_avatar'   => env('AI_AVATAR', false),
        'auto_broll'       => env('AI_BROLL', false),
    ],
    'providers' => [
        'replicate' => ['key' => env('REPLICATE_API_KEY')],
        'elevenlabs'=> ['key' => env('ELEVENLABS_KEY')],
        'suno'      => ['key' => env('SUNO_KEY')],
        'fal'       => ['key' => env('FAL_KEY')],
    ],
];
```

### 7.2 Reel Generator job

```php
// app/Jobs/GenerateReel.php
public function handle(): void {
    $script = $this->extractScript($this->sourceUrl);
    $scenes = $this->splitScenes($script); // 3-sec chunks
    foreach ($scenes as $i => $scene) {
        $broll = $this->fetchBroll($scene['keyword']); // Pexels
        $clips[] = $this->clipToVertical($broll, 3);
    }
    $voiceover = $this->synthesizeVoice($script);       // ElevenLabs
    $captions  = $this->transcribe($voiceover);          // faster-whisper
    $final     = $this->assembleVertical($clips, $voiceover, $captions);
    Storage::put("reels/{$this->id}.mp4", $final);
}
```

### 7.3 AI Subtitle job

```php
public function handle(): void {
    $audio = $this->extractAudio($this->videoPath);          // ffmpeg
    $subs  = $this->transcribeWithAlignment($audio);          // whisperx
    $ass   = $this->buildAss($subs, $this->styleTemplate);    // Laravel
    $out   = $this->burnSubs($this->videoPath, $ass);         // ffmpeg
    Storage::put("subs/{$this->id}.mp4", $out);
}
```

### 7.4 Cost-control layer

- **Per-user** monthly credit budget (e.g., 10 Reels free, 50 with Pro, unlimited with Business).
- **Per-job** cost estimate _before_ generation; require user confirmation for jobs over $1.
- **Fallback** if a provider is down: route to alternate (Replicate → fal.ai → Together).
- **Async queue** (Laravel Horizon) — generation is 30s–5min, never block the UI.

---

## 8. Sources

### GitHub (API data, live as of 2026-09-07)

- Stability-AI/generative-models — 27.2k⭐, MIT, last push 2025-12-16.
- ali-vilab/VACE — 3.9k⭐, Apache-2.0, last push 2025-10-17.
- Robbyant/lingbot-world — 4.4k⭐, Apache-2.0, last push 2026-07-09.
- OpenGVLab/InternVideo — 2.4k⭐, Apache-2.0, last push 2026-07-02.
- guoyww/AnimateDiff — 12.2k⭐, Apache-2.0, last push 2024-07-31.
- github.com/topics/text-to-video, /talking-head — additional repo discovery.

### Provider docs / pricing

- Google Veo 3 — ai.google.dev/gemini-api/docs/video (pricing per-second).
- OpenAI Sora 2 — platform.openai.com/docs/sora (per-second pricing).
- Runway Gen-4.5 / Aleph — runwayml.com/pricing.
- Kling 2.1 / 2.2 — klingai.com/dev.
- Luma Ray 2/3 — lumalabs.ai/pricing.
- Pika 2.2/2.5 — pika.art/pricing.
- Hailuo 02 — hailuoai.video.
- HeyGen — heygen.com/pricing.
- D-ID — d-id.com/pricing.
- Synthesia — synthesia.io/pricing.
- Hedra — hedra.com/pricing.
- OpusClip — opus.pro/pricing.
- Submagic — submagic.com/pricing.
- ElevenLabs — elevenlabs.io/pricing.
- Suno — suno.com/pricing.
- Replicate — replicate.com/pricing.
- fal.ai — fal.ai/pricing.
- Pexels API — pexels.com/api.

### Web research / changelogs

- "The State of AI Video Generation 2026" — a16z infra report.
- VBench 2026 leaderboard — vbench-ai.github.io.
- Hugging Face weekly papers — text-to-video track.
- Suno / Sora / Veo / Kling official changelogs (Q1–Q3 2026).

> **Verification note:** pricing changes monthly in this market; treat the cost column as "as of Q3 2026" and re-check before commit. Self-host viability (VRAM column) is stable; new open models (Wan 2.3 expected Q4 2026) will move the floor.
