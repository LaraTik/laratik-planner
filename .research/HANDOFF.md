# AI Features — Review & Approval Handoff

> **Status:** Awaiting your review and approval. No code has been written yet.
> **When you approve:** implementation begins Sprint 1 (week 1). Tasks are listed in `IMPLEMENTATION_PLAN.md` §6.
> **How to review:** start with the **5-second summary** below, then read `INTEGRATION_REPORT.md` (the why), then `IMPLEMENTATION_PLAN.md` (the how), then `STITCH_DESIGN_SPEC.md` (the visual spec), then open the 15 Stitch designs in `designs/stitch/ai-features/`.

---

## 5-second summary

Three new product features and five existing-feature improvements, all behind the agency database master switch and capability allowlist, all respecting master-prompt §2.2 (no autonomous publishing, no OAuth, no live follower analytics, no autonomous status changes). 5 sprints, 2 engineers, ~38 dev-days wall-clock, ~71.5 dev-days combined. 9 §15 capabilities total (6 existing + 3 new). 6 questions below are the only blocking decisions.

---

## What's in this package

| Path                                      |              Size | What it is                                                                                                                         |
| ----------------------------------------- | ----------------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| `INTEGRATION_REPORT.md`                   |      ~5,100 words | The "why" — picks from the 7 research reports, mapped to laratik's §15 surface                                                     |
| `IMPLEMENTATION_PLAN.md`                  |     ~10,000 words | The "how" — A-to-Z plan with schema, API contracts, sidecar code, UI components, tests, governance, rollout, rollback, KPIs, risks |
| `STITCH_DESIGN_SPEC.md`                   |      ~5,000 words | The "what it looks like" — full design spec for all 15 screens (every state, every breakpoint, a11y + i18n contract)               |
| **This file** `HANDOFF.md`                |      ~3,500 words | The "what to do now" — review index, open questions, approval gate                                                                 |
| `designs/stitch/ai-features/01-15_*.html` | 15 files, ~210 KB | 14 new Stitch screens + 1 visual index, all following the StudioFlow design system                                                 |
| `social-media-research-skills.md`         |       4,502 words | The 7 research reports (the source material that drove the picks)                                                                  |
| `facebook-instagram-skills.md`            |       3,379 words |                                                                                                                                    |
| `content-writing-skills.md`               |       4,505 words |                                                                                                                                    |
| `viral-trend-skills.md`                   |       3,016 words |                                                                                                                                    |
| `image-generation-skills.md`              |       3,743 words |                                                                                                                                    |
| `video-generation-skills.md`              |       4,460 words |                                                                                                                                    |
| `business-workflow-skills.md`             |       4,240 words |                                                                                                                                    |

**Total package:** ~7,500 lines, ~50,000 words, ~750 KB.

---

## What's new vs. the previous report

`INTEGRATION_REPORT.md` was the recommendations. This package adds:

1. **Validation pass** on the 7 research reports (star-count coherence, license claims, pick overlaps). All coherent. The only variance is `instagrapi` stars (6,764 vs 6,765) — same repo, different snapshots.
2. **Full A-to-Z implementation plan** for every feature and every improvement. Schema, API contracts, sidecar code outlines, UI component file paths, tests, governance, rollout, rollback.
3. **5-sprint sequencing** with task IDs, owner, dependencies, and dev-day estimates.
4. **Risk register** (10 risks) with likelihood, impact, and mitigation.
5. **9 new Stitch HTMLs** designed in the StudioFlow design system. The 8 screens are desktop 1440px; tablet and mobile are out of scope for v1.
6. **6 open questions** for you to answer before Sprint 1.

---

## How to review (in order)

### Step 1 — Open the visual index (5 min)

Open `designs/stitch/ai-features/09_laratik---ai-image-empty-state.html` in a browser. This is the index page that links to all 8 new screens. Click through each one. Each is a working HTML file with realistic content; the toggle buttons, form fields, and progress steps are interactive.

### Step 2 — Read the integration report (15 min)

Open `.research/INTEGRATION_REPORT.md`. The 5-second summary at the top is the headline. The body covers picks, capability mapping, the 3 new features, the 5 improvements, architecture, and license/risk.

### Step 3 — Read the implementation plan (45 min)

Open `.research/IMPLEMENTATION_PLAN.md`. Section 0 is the master checklist. Sections 1-3 are the 3 new features, A-to-Z. Section 4 is the 5 improvements. Section 5 is the cross-cutting architecture. Section 6 is the sprint-by-sprint task list. Sections 7-9 are risks, KPIs, and open questions.

### Step 4 — Skim the research (30 min, optional)

Each of the 7 research reports is self-contained. Read the Executive Summary + the "Picks for laratik-planner" section of each. Skip the methodology and per-category tables unless a specific pick is in question.

### Step 5 — Answer the 6 open questions (5 min)

See below.

---

## The 6 open questions (only blocking decisions)

| #   | Question                                       | Recommended default                                         | Notes                                                                        |
| --- | ---------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | **Provider budget per agency per month**       | $30 cheap / $250 premium                                    | Most plans have a $30 default; Pro+ should support premium tier              |
| 2   | **Reel Generator premium tier**                | Yes, expose it                                              | Cheap-only is too limiting; the differentiation is in the AI B-roll          |
| 3   | **Image Gen: which providers by default**      | Replicate (Flux + Qwen) + OpenAI gpt-image-1 opt-in         | Some agencies will forbid OpenAI for data-residency; allow per-agency toggle |
| 4   | **Trend Radar: per-agency or per-user opt-in** | Per-agency, like the other capabilities                     | Trend data is workspace-scoped, not user-scoped                              |
| 5   | **Reel Generator script extraction LLM**       | Through existing `MINIMAX_BASE_URL`, new `reel_jobs` budget | Reuse the existing transport; the budget is the only addition                |
| 6   | **MCP exposure to planner UI**                 | Sidecar-only, not planner UI                                | Keep MCP internal; external agents use the API surface, not the UI surface   |

Plus 2 more from the planning phase that affect the sidecar build:
| 7 | **LivePortrait self-host** | D-ID only for v1 | VPS likely doesn't have a GPU; revisit if a Pro+ customer demands on-prem avatar |
| 8 | **Suno music library** | Per-agency seed list, fixed genre presets | Predictable, cheap; let planners override per-Reel |

**If you don't answer any of these, I'll ship the recommended defaults. You can change any of them later without re-architecting.**

---

## What "approved" means

When you say "approved" (or equivalent), I will:

1. **Merge nothing to `main`** — all 5 sprints ship as feature branches via PRs, per `AGENTS.md` §"Mandatory production-readiness protocol".
2. **Start Sprint 1** with T-101 to T-110 (foundations + 3 improvements). 2 engineers, 5 dev-days each, ~10.5 dev-days combined.
3. **Daily standup** — I'll post a brief end-of-day status in this conversation with what's done, what's blocked, and what changed.
4. **End-of-sprint review** — at the end of each sprint, you'll get a demo of the new capability, the test results, and the open questions for the next sprint.
5. **Pause on any new open question** — if something comes up that wasn't in the plan (e.g. a provider has changed pricing, a sidecar is OOM-killed in staging, a user asks for a feature we didn't plan), I'll surface it immediately and not proceed.

---

## What "not approved" looks like

If something is wrong, please tell me which of these is closest to your concern:

- **"Picks are wrong"** — you disagree with a specific repo or provider. I can re-research and produce an alternative.
- **"Effort is too high"** — 38 dev-days is a lot. I can drop a feature (Reel Generator is the highest-effort; Trend Radar is the lowest) or scope down (e.g. Trend Radar TikTok-only in v1, full multi-platform in v2).
- **"Sequence is wrong"** — you want improvements first, or one feature before another. I can re-order.
- **"Sprint 1 isn't right"** — the foundations are wrong (e.g. wrong schema, wrong place to plug into the §15 governance). I can re-design the first sprint.
- **"Stitch designs are off"** — the visual is wrong. I can re-design.
- **"Open questions need your input before I can plan"** — answer any of the 6 (or 8) and I'll update the plan.
- **"Wrong system entirely"** — the laratik-planner surface I'm building on is the wrong place. Tell me which system and I'll re-plan.

---

## Quality bar (what "good" looks like for this package)

This package is "good enough to ship as v1" when:

- [x] Every §15 capability has a defensible pick from the 7 research reports.
- [x] Every pick has a star count, license, and last-commit date that cross-check between the 7 reports.
- [x] Every new feature has a schema, an API contract, a sidecar code outline, a UI component file path, tests, governance, rollout, and rollback.
- [x] Every improvement has a file path, a proposed diff direction, a test plan, and a rollout plan.
- [x] The sprint plan has task IDs, owners, dependencies, and estimates.
- [x] The Stitch designs follow the existing StudioFlow design system (colors, typography, spacing, radius).
- [x] The Stitch designs are interactive (the form fields, toggles, and progress steps actually work in a browser).
- [x] The risks have mitigations, not just descriptions.
- [x] The KPIs are measurable, not vanity metrics.
- [x] The 6 (or 8) open questions are the ONLY blocking decisions.

If anything in this checklist is wrong, please flag it.

---

## What you'll see during implementation

During the 5 sprints, you can expect:

| Cadence            | What you'll get                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| Daily              | Brief end-of-day status in this conversation (2-3 lines)                          |
| End of each task   | The PR link + a 1-line description of what changed                                |
| End of each sprint | Demo URL (when there's a UI change), test results, open questions for next sprint |
| End of Sprint 5    | Final handoff: the GA gate, the rollout checklist, the operator manual            |

If you want a different cadence, tell me.

---

## Files for visual review

The 8 new Stitch screens (in `designs/stitch/ai-features/`):

| File                                           | What it shows                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_laratik---ai-settings-9-capabilities.html` | The agency admin form with all 9 capabilities. Master toggle, capability toggles, provider picker, monthly usage.                                  |
| `02_laratik---research-trends.html`            | The Trends tab in the workspace sidebar. Grid of trend cards (X / Reddit / TikTok / YouTube / IG). Quick-create drawer pre-fills the trend label.  |
| `03_laratik---ai-image-generate.html`          | The "Generate image" modal. Aspect ratio chips, provider picker, prompt editor, brand reference picker, cost preview. Below: the result panel.     |
| `04_laratik---ai-reel-generator.html`          | The "Make Reel" modal. Duration, tier (cheap / premium), voice, music, B-roll, captions, cost preview. Below: the SSE progress panel with 9 steps. |
| `05_laratik---ai-caption-variants.html`        | Improvement A. 3-variant caption drafts (punchy / warm / data-led). Hook / Body / CTA structure. Brand voice compliance footer.                    |
| `06_laratik---platform-rules-admin.html`       | Improvement E. Data table of the 10 channels with editable rules. Agency override UI inline.                                                       |
| `07_laratik---ai-subtitle.html`                | The AI Subtitle feature. Video preview with kinetic captions. Settings (language, model, style, position) + editable transcript. Always free.      |
| `08_laratik---content-detail-ai-section.html`  | The updated AI assistance panel on the content detail page. 6 §15 capabilities + 3 NEW (image / reel / subtitle) + trend context strip.            |
| `09_laratik---ai-image-empty-state.html`       | A visual index of all 8 screens with quick descriptions. Start here.                                                                               |

**All screens follow the StudioFlow design system** (`designs/stitch/DESIGN.md`): primary `#3525cd`, canvas `#F7F7F5`, surface `#FFFFFF`, Inter font, 4px base spacing, 10px card radius, 8px button radius, full pill chips, low-contrast outlines, no shadows except on floating elements.

---

## Appendix: how the 3 new features compose with the existing 6

| #   | Capability             | Status today      | After this plan                                                        |
| --- | ---------------------- | ----------------- | ---------------------------------------------------------------------- |
| 1   | `caption_drafts`       | Wired, 1 draft    | **3 variants** + brand voice in system block                           |
| 2   | `brief_improvement`    | Wired, 3 variants | Brand voice in system block                                            |
| 3   | `completeness_check`   | Wired, 0-100      | **Brand-voice penalty (-20/violation)**                                |
| 4   | `platform_adaptation`  | Wired, if/else    | **Data-driven per-platform rules** (admin-editable)                    |
| 5   | `campaign_ideas`       | Wired, 3-5        | + **Trend Radar context** (top 3 trends)                               |
| 6   | `related_format_ideas` | Wired, 3-5        | **Ranked by viral potential** (Content-diffusion-simulator)            |
| 7   | `image_generation`     | NEW               | Vercel AI SDK + Replicate/OpenAI/fal/Google/Recraft + brand references |
| 8   | `reel_generation`      | NEW               | 9-step sidecar + Pexels + Suno + ElevenLabs + Replicate (premium)      |
| 9   | `subtitle_generation`  | NEW               | faster-whisper self-host + whisperx alignment + ffmpeg burn-in         |

All 9 are gated by `aiFeatureSettings.enabledCapabilities` (existing mechanism), all use `enforceAiBudget` + `reconcileAiBudget` (existing pattern, extended for cost), all write to `ai_usage_events` (existing audit), all return Insert / Replace / Copy / Try-again (existing UX).

The new tables (`image_generation`, `reel_job`, `reel_subtitle_job`, `trend_signal`, `trend_fetch_job`, `brand_reference_set`, `platform_adaptation_rules`) are additive — no breaking changes to existing tables.

---

**Ready for your review.** When you approve (or give a direction), Sprint 1 starts.
