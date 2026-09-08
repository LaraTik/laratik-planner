# Full Stitch Design Specification

> **Companion to** `IMPLEMENTATION_PLAN.md`. The plan is "what to build"; this file is "what it looks like, in detail, for every screen, every state, every breakpoint."
>
> **All 15 screens are working HTML files** in `designs/stitch/ai-features/`. Open any of them in a browser to see the rendered design. The HTML is the canonical artifact; this document is the reasoning behind it.
>
> **Date:** 2026-09-07
> **Status:** Ready for review.

---

## 0. How to use this document

1. **Open the visual index** `designs/stitch/ai-features/09_laratik---ai-image-empty-state.html` in a browser.
2. **Click through to all 15 screens** to see them rendered with realistic content.
3. **Read §1** for the design-system rules all 15 screens follow.
4. **Read §2–§8** for per-screen specs (layout, components, states, interactions, a11y, i18n).
5. **Read §9** for the component library (reusable building blocks).
6. **Read §10** for the responsive strategy (3 breakpoints × all screens).
7. **Read §11** for the a11y + i18n contract.
8. **Read §12** for the import recipe (Stitch MCP).

---

## 1. Design system rules (all 15 screens follow these)

Sourced from `designs/stitch/DESIGN.md` and verified against the existing 49 captured screens.

### 1.1 Color tokens

| Role           | Token                        |                   Hex | When to use                                                                                        |
| -------------- | ---------------------------- | --------------------: | -------------------------------------------------------------------------------------------------- |
| Brand          | `primary`                    |             `#3525cd` | The one visually dominant next action on every screen. Reserve for primary CTAs and active states. |
| Brand hover    | `primary-hover`              |             `#4338CA` | Button hover only.                                                                                 |
| Brand subtle   | `primary-subtle`             |             `#EEF2FF` | Active chip background, info notice background, current-route sidebar.                             |
| Canvas         | `canvas`                     |             `#F7F7F5` | Page background. Always under everything.                                                          |
| Surface        | `surface`                    |             `#FFFFFF` | Cards, modals, drawers, sheet contents.                                                            |
| Surface subtle | `surface-subtle`             |             `#F1F3F5` | Inner-grouped elements (chips in a chip group, the canvas-tab active state).                       |
| Border         | `border`                     |             `#DDE1E6` | 1px borders on cards, inputs, dividers. The primary separator.                                     |
| Text primary   | `on-surface`                 |             `#131c2b` | All body text.                                                                                     |
| Text secondary | `on-surface-variant`         |             `#464555` | Subtitles, helper text, table column headers.                                                      |
| Text muted     | `text-muted`                 |             `#7B8495` | Metadata, timestamps, link previews, secondary actions.                                            |
| Success        | `success` / `success-subtle` | `#15803D` / `#ECFDF3` | Success badge text + background.                                                                   |
| Warning        | `warning` / `warning-subtle` | `#B45309` / `#FFF7E6` | Warning badge, premium-tier price, budget-near-cap.                                                |
| Danger         | `danger` / `danger-subtle`   | `#B91C1C` / `#FEF2F2` | Error badge, error notice, delete action.                                                          |
| Info           | `info-subtle`                |             `#F0F9FF` | Info notice background.                                                                            |
| Focus ring     | `focus-ring`                 |             `#6366F1` | 2px ring with 2px offset on every focusable element.                                               |

**Never** use saturated colors for full card backgrounds. Status colors are for text + thin chips only.

### 1.2 Typography

Inter only. Scale:

| Token           | Size / Weight / Line | When                                                      |
| --------------- | -------------------- | --------------------------------------------------------- |
| `page-title`    | 28px / 600 / 36      | Page headers (Trends, AI usage, Make Reel modal)          |
| `section-title` | 20px / 600 / 28      | Card section headers (Brand voice rules)                  |
| `card-title`    | 16px / 600 / 24      | Modal titles, card titles                                 |
| `body`          | 14px / 400 / 21      | Body, captions, list items                                |
| `table-dense`   | 13px / 400 / 18      | Data tables, dense lists                                  |
| `label`         | 12px / 500 / 16      | Input labels, section eyebrows (uppercase, tracking-wide) |
| `button`        | 14px / 600 / 20      | Button text                                               |

Sentence case for all UI strings. No all-caps except for non-essential metadata labels (the 12px label token).

### 1.3 Spacing + shape

4px base. Cards: 10px radius. Inputs/buttons: 8px radius. Chips/badges: full pill. Side drawer: 480-560px. Modal: 480-640px. Sheet on mobile: full-width with drag handle.

### 1.4 Elevation

Low-contrast outlines + tonal layers, not heavy shadows. Shadows are reserved for floating elements (dropdowns, dialogs, drawers). Layered: canvas → surface → surface-subtle.

---

## 2. The 15 screens (file index)

| #      | File                                            | What                                      | Breakpoints    |
| ------ | ----------------------------------------------- | ----------------------------------------- | -------------- |
| 01     | `01_laratik---ai-settings-9-capabilities.html`  | Agency AI settings                        | Desktop 1440   |
| 02     | `02_laratik---research-trends.html`             | Trends tab + cards + QuickCreate drawer   | Desktop 1440   |
| 03     | `03_laratik---ai-image-generate.html`           | Generate image modal + result             | Desktop 1440   |
| 04     | `04_laratik---ai-reel-generator.html`           | Make Reel modal + 9-step progress         | Desktop 1440   |
| 05     | `05_laratik---ai-caption-variants.html`         | 3-variant caption drafts (Improvement A)  | Desktop 1440   |
| 06     | `06_laratik---platform-rules-admin.html`        | Platform rules data table (Improvement E) | Desktop 1440   |
| 07     | `07_laratik---ai-subtitle.html`                 | AI Subtitle (free, self-hosted)           | Desktop 1440   |
| 08     | `08_laratik---content-detail-ai-section.html`   | Updated AI assistance panel               | Desktop 1440   |
| 09     | `09_laratik---ai-image-empty-state.html`        | Visual index of all 15                    | Desktop 1440   |
| **10** | `10_laratik---research-trends-mobile.html`      | Trends (mobile)                           | **Mobile 390** |
| **11** | `11_laratik---states-empty-loading-error.html`  | 8 critical states (empty, loading, error) | Desktop 1440   |
| **12** | `12_laratik---ai-capability-disabled.html`      | Onboarding + disabled + permission        | Desktop 1440   |
| **13** | `13_laratik---ai-features-usage-dashboard.html` | AI usage dashboard                        | Desktop 1440   |
| **14** | `14_laratik---ai-image-reel-mobile.html`        | Image + Reel modals (mobile)              | **Mobile 390** |
| **15** | `15_laratik---design-system-ai.html`            | AI component library                      | Desktop 1440   |

**Total: 15 screens. 9 desktop + 2 mobile + 1 index + 1 dashboard + 1 states matrix + 1 component library.** Bold = added in the "full design" pass.

---

## 3. Per-screen spec: Trends (Feature 1)

**Files:** `02_…-research-trends.html` (desktop), `10_…-research-trends-mobile.html` (mobile)

### 3.1 Layout (desktop 1440px)

| Region                    | Width         | Padding | Content                                                                                                                                                                                                              |
| ------------------------- | ------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar (workspace-aware) | 248px         | 12px    | Vertical nav: Overview / Planning / **Trends** / Calendar / Reviews / Social Channels / Brand Kit / Team. Active item is `primary-subtle` background + `primary` text + filled icon. Sticky Create button at bottom. |
| Top bar                   | full          | 24px    | Breadcrumb (workspace name / Trends) + last-sync timestamp + "Sync now" button.                                                                                                                                      |
| Page header               | main          | 24px    | `page-title` "Trends" + subtitle "Last 24 hours, ranked by platform signal strength. Click any trend to start a content brief."                                                                                      |
| Filter bar                | main          | 16px    | Horizontal chip row: All (47) / X (12) / Reddit (9) / TikTok (14) / YouTube (6) / Instagram (4) / LinkedIn (2). Plus "Last 24 hours" select on the right.                                                            |
| Trends grid               | main          | 16px    | 3-column grid (desktop), 2-column (tablet 1024), 1-column (mobile). 16px gap.                                                                                                                                        |
| Quick-create drawer       | 480px overlay | 20px    | Slides in from right when "Use in brief" is clicked. Pre-fills the title, format, channels.                                                                                                                          |

### 3.2 Trend card (the building block)

A 5-row card. Used 47× on the desktop grid, 1-column on mobile.

| Row        | Content                                                       | Notes                                                                      |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Top        | Platform badge (icon + label) left, score badge (🔥 NN) right | Both 11-12px. Score badge uses `warning-subtle` + `warning` text.          |
| Middle     | Label (16px font-semibold)                                    | The trend itself: `#AIRevolution`, `Alex Hormozi`, `r/coffee — Latte art`. |
| Meta       | Topic type · post count in window                             | 11px text-muted                                                            |
| Source URL | Truncated to 1 line, hover = full URL                         | 12px text-muted. Pointer cursor, hover to primary.                         |
| Footer     | "Why this trend?" link + "Use in brief" CTA                   | 40px primary button. Sticky to the card.                                   |

### 3.3 Quick-create drawer (480px right slide-in)

Pre-fills:

- **Title** from the trend label.
- **Brief** from a template ("Hook on the {label} trend + your brand angle. CTA: link in bio for the full feature.").
- **Format** = `short_form_video` (default for trend-driven content).
- **Channels** = the platforms the trend came from.
- **Trend context** notice: a `info-subtle` strip showing the 1-3 attached trends; explains that `campaign_ideas` and `related_format_ideas` will use them.

The drawer's "Create" button hits the existing `quickCreate` action and closes. No new routes.

### 3.4 States

| State                | Visual                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default              | See §3.2                                                                                                                                                                                                         |
| Hover                | Card border becomes `primary`                                                                                                                                                                                    |
| Active (pressed)     | Card scales to 0.99 momentarily; "Use in brief" CTA shows a brief spinner                                                                                                                                        |
| Loading (syncing)    | 6 skeleton cards (1.5s shimmer loop). Page header shows a "Fetching from 6 platforms…" status with step counter.                                                                                                 |
| Empty (no trends)    | Centered illustration slot + headline "No trends yet" + helper "Trends appear within 10 minutes of your first sync." + Sync now button + "Configure trend sources" link.                                         |
| Error (sidecar down) | Top notice: "Trend Radar is temporarily unavailable. Recent content isn't being affected." Page renders empty; trend strip on content detail is empty. The §15 capabilities degrade gracefully (no error toast). |

### 3.5 Mobile (390px)

Stack the desktop layout:

- **Top app bar:** menu icon, "Trends" title, refresh icon.
- **Filter chips:** horizontally scrollable. Same 7 chips.
- **Trend cards:** 1-column, full-width. Same card structure, smaller (16px font instead of 16px label, etc.).
- **Quick-create drawer:** becomes a full-screen sheet (drag handle on top, scrollable, fixed bottom CTA).
- **Bottom nav:** 5 icons (Overview, Planning, Trends [active], Reviews, Team). 64px high + safe-area inset.

### 3.6 A11y

- All trend cards are `<button>` (clickable), not `<div onClick>`. Keyboard = Tab + Enter.
- Score badge has `aria-label="Viral score 87 out of 100"`.
- "Why this trend?" opens a tooltip (`aria-describedby`) explaining the score formula.
- Filter chips use `role="tablist"` + `role="tab"` + `aria-selected`.
- The "Use in brief" action fires a single keyboard shortcut: `Cmd+Enter` from anywhere on the trend list.

### 3.7 i18n

- All labels in `en.json` + `ar.json`. RTL test with `ar-EG` and `ar-AE`.
- Trend labels themselves are user-data; not translated by the UI.
- Source URL truncation logic respects the start of the URL in RTL (use `direction: rtl` on the `a` element when the URL starts with an Arabic domain).

---

## 4. Per-screen spec: Brand-aware Image Generation (Feature 2)

**Files:** `03_…-ai-image-generate.html` (desktop), `14_…-ai-image-reel-mobile.html` (mobile)

### 4.1 Layout (desktop, modal)

560px wide, centered, white background, canvas backdrop at 50% opacity. Header + body + footer.

| Section          | Component                                                            | Notes                                                                                                      |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Header           | Title "Generate image" + close X                                     | 64px tall, 24px padding.                                                                                   |
| Aspect ratio     | 4 horizontal chips, each showing a wireframe rect of the right shape | 1:1 (active default), 9:16, 16:9, 4:5. Active = `primary-subtle` bg + `primary` border + `primary` text.   |
| Provider         | 6 horizontal chips                                                   | Auto (default), Flux, GPT-Image, Qwen-Image, Ideogram, Recraft. "Auto" picks by aspect + prompt heuristic. |
| Quality          | 3 chips                                                              | Draft (1k), Standard (1k, default), Hero (2k). Hero triggers a `warning` cost preview color.               |
| Prompt           | Textarea 4 lines, monospace `text-[14px]`                            | Character counter (120/2000) at bottom-right. "Try:" chips below for one-click prompt variations.          |
| Brand references | 3 thumbnails in a row + "Use brand references" master toggle         | Toggling off replaces the 3 thumbs with a "No brand references" placeholder and a one-line cost saving.    |
| Footer           | Cost preview (left) + Cancel + Generate (right)                      | Cost preview: "Estimated cost: $0.04 (1k, Flux)". Hero = "$0.17" in `warning`.                             |

### 4.2 States

| State                     | Visual                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default                   | See §4.1                                                                                                                                                                                                              |
| Loading (generating)      | Modal stays open. "Generate" button disabled, replaced by a spinner + "Generating… (this can take up to 30 seconds)". Cancel button remains active. Provider latency text below the spinner updates every 5s.         |
| Success                   | The form is replaced by a result panel: the generated image (square 240px), Insert / Replace / Copy / Try-again buttons, metadata (provider, model, cost, duration) in 12px `text-muted`.                             |
| Error (provider rejected) | Result panel is replaced by an error notice. The provider's rejection text is shown verbatim. AI credit is refunded (info strip: "Your AI credit was refunded."). "Edit prompt" + "Try a different provider" actions. |
| Error (no Brand Kit)      | Pre-modal empty state (see `12_…-ai-capability-disabled.html`): centered illustration + "Set up your Brand Kit first" + "Open Brand Kit" CTA. The "Generate without brand references" link is the escape hatch.       |
| Budget exhausted          | Pre-modal notice: "Your agency hit its monthly AI cap. Resets on 2026-10-01, or upgrade your plan for more." + View usage / Upgrade plan buttons.                                                                     |

### 4.3 Result panel actions

| Action    | Behavior                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Insert    | Writes the asset to the `content_item` caption field. Closes the modal.                              |
| Replace   | Same as Insert, but replaces the current caption. Confirmation dialog if the caption is non-empty.   |
| Copy      | Copies the S3 signed URL to clipboard. Toast: "URL copied". Modal stays open.                        |
| Try again | Closes the result panel, returns to the form, re-runs the same request (refilled prompt + settings). |

### 4.4 Mobile (390px)

Becomes a full-screen bottom sheet with drag handle. Same 6 sections, collapsed vertically with full-width chips. Advanced sections (Brand refs) are inside a `<details>` accordion.

### 4.5 A11y

- The modal traps focus. Escape closes (with a confirmation if a generation is in-flight).
- The prompt textarea is `aria-describedby="prompt-counter"` to associate the counter.
- Cost preview is `aria-live="polite"` so screen readers announce when the cost changes.
- The result image has `alt={provider + model + aspectRatio + "generated for {contentItem title}"}`.
- Color is never the only signal: the "Hero" chip's warning state has both color AND an icon (`auto_awesome`).

### 4.6 i18n

- "Estimated cost" label: pluralized by cost (one provider uses "1 generation"; >1 uses "N generations"). The locale-aware `Intl.NumberFormat` is used for the number.
- Provider names: "Flux", "Qwen", "Recraft" stay as English brand names. The provider's "Use brand references" label is translated.

---

## 5. Per-screen spec: Make Reel + AI Subtitle (Feature 3)

**Files:** `04_…-ai-reel-generator.html` (desktop), `07_…-ai-subtitle.html` (desktop), `14_…-ai-image-reel-mobile.html` (mobile)

### 5.1 Make Reel modal (desktop, 640px)

| Section                    | Component                           | Notes                                                                                                       |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Duration                   | Segmented control (15s / 30s / 60s) | 30s default.                                                                                                |
| Tier                       | 2 large cards side-by-side          | Cheap ($0.10, Pexels+Suno+ElevenLabs) and Premium ($2.50+, Replicate router).                               |
| Voice                      | Radio group                         | None / ElevenLabs (8 voices, voice picker) / Upload my own.                                                 |
| Music                      | Radio group + genre chips           | None / Suno v4 / Upload. Genre chips when Suno is picked.                                                   |
| Avatar                     | Radio group                         | None / D-ID presenter / LivePortrait self-host. Hidden for non-video formats.                               |
| B-roll                     | Radio group                         | Pexels / Pixabay / Replicate AI (premium only).                                                             |
| Captions                   | Checkbox + style sub-options        | "Burn in kinetic captions" (default on). Position: Top / Center / Bottom.                                   |
| Cost preview               | Full-width block with breakdown     | "$0.10 (cheap) / $2.50 (premium)" + line items.                                                             |
| Cost-accept (premium only) | Checkbox                            | "I accept that this Reel will cost $2.50+ and consume the agency's AI budget." Required to enable Generate. |
| Footer                     | Cancel + Generate                   | Generate disabled until all required fields are valid.                                                      |

### 5.2 9-step progress panel (SSE-driven)

A sticky bottom card that appears when the job is `running`. Replaces the modal's footer area. Shows the 9 steps in order:

1. Script (LLM, MiniMax)
2. B-roll (Pexels/Pixabay/Replicate)
3. Voice (ElevenLabs or upload)
4. Music (Suno or upload)
5. Avatar (D-ID or LivePortrait)
6. Transcribe (faster-whisper)
7. Stitch (moviepy)
8. Align captions (whisperx)
9. Render (ffmpeg ass filter)

Each step is one of: `pending` (gray radio), `running` (blue spinner), `success` (green check), `error` (red X with tooltip). The running step has a live duration counter ("12.3s"). Each successful step shows its own duration.

The progress card has 3 actions: **Cancel job** (always), **Retry step N** (when a step fails), **Skip step** (when a step is optional — avatar, music, voice can all be skipped).

### 5.3 Result panel

Replaces the progress card. 9:16 video player (480px wide), Insert / Replace / Copy URL / Try again buttons. Below the player: provider + tier + cost metadata in 12px `text-muted`.

### 5.4 AI Subtitle (no modal, inline on the asset detail page)

**File:** `07_…-ai-subtitle.html`

The video asset is the trigger. Above the player, a button "Add subtitles". When clicked, replaces the asset detail with a 2-column layout: video preview (left, 9:16) + settings + transcript (right).

| Region          | Content                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Header          | Back button, asset name, metadata, owner.                                                                                              |
| Video preview   | 9:16 player with the kinetic captions burned in. Live updates as the whisper step finishes.                                            |
| Settings card   | Language (auto-detect default), model (tiny/base/large-v3), style (kinetic / subtitle), position (top/center/bottom). Self-host badge. |
| Transcript card | 12 cues, click to seek. "Edit transcript" opens a per-cue editor.                                                                      |
| Result actions  | Download SRT / VTT / MP4.                                                                                                              |

### 5.5 States (for both Reel and Subtitle)

Same as §4.2. The Reel sidecar has a unique state: a **step failure** (see `11_…-states-empty-loading-error.html`). The user can retry the failed step, skip it, or cancel the whole job.

### 5.6 Mobile (390px)

Both modals become bottom sheets. The 9-step progress becomes a sticky bottom toast (with step name + counter + Cancel). The video player scales to 270px wide.

### 5.7 A11y

- The progress panel uses `aria-live="polite"` + `role="status"` so screen readers announce each step transition.
- The video player has captions always-on (CC button is pressed by default).
- The cost-accept checkbox is required (`required` attribute) — not just visually required.
- Skip / Retry / Cancel buttons have `aria-keyshortcuts` ("R" for retry, "S" for skip, "Esc" for cancel).

### 5.8 i18n

- Step names are translated: "Script (LLM)" → "النص (النموذج اللغوي الكبير)".
- The progress counter uses the locale-aware duration format (`Intl.DurationFormat`).
- Genre chips (Acoustic / Lo-fi / Cinematic / Upbeat) get translated variants.

---

## 6. Per-screen spec: Existing-feature improvements (5 screens)

### 6.1 Improvement A — 3-variant caption drafts

**File:** `05_…-ai-caption-variants.html`

Replaces the single-draft caption panel. The route returns `variants: [string, string, string]`. The UI renders 3 tabs (Variant 1: punchy, Variant 2: warm, Variant 3: data-led) with the existing Insert / Replace / Copy / Try-again pattern. Each card shows Hook / Body / CTA structure with the matching label tag. A footer line shows the brand-voice rules respected and the temperature used (0.7 / 0.9 / 1.1).

Layout: 3 stacked cards, each ~200px tall. Mobile: stacked, each card 280px tall.

A11y: tabs use `role="tablist"` + `role="tab"` + `aria-selected`. The Hook/Body/CTA labels use `<dl>` / `<dt>` / `<dd>` semantics.

### 6.2 Improvement B — Brand voice in system block

Not a new screen. The change is in `src/lib/ai/index.ts`. The `renderVoiceGuidance(brandKit, locale)` function is new, called from `loadAiContext()`, passed to the LLM as a system-block prefix. The UI gains a small "Brand voice applied" line at the top of every AI panel (visible in `05_…-ai-caption-variants.html`, `08_…-content-detail-ai-section.html`).

### 6.3 Improvement C — Viral-potential ranker

Not a new screen. The change is that `related_format_ideas` returns ranked variants. The existing `related_format_ideas` card (visible in `08_…-content-detail-ai-section.html`) gains a small "scored" badge and a sort-by-score toggle.

### 6.4 Improvement D — Brand-voice penalty in `completeness_check`

Not a new screen. The existing `completeness_check` panel (visible in `08_…-content-detail-ai-section.html`) gains a "Voice violations: -20 each" line and lists the violated rules.

### 6.5 Improvement E — Platform rules data table

**File:** `06_…-platform-rules-admin.html`

A new admin screen at `/app/agency-settings/platform-rules`. Data table of the 10 channels (instagram, facebook, tiktok, linkedin, x, youtube, threads, pinterest, snapchat, other). Columns: Platform, Max length, Hashtag density, Hook rule, Paragraph style, Link rule, Override, Actions. The "Add override" action opens an inline edit drawer with the same fields. The override wins over the system default per agency.

---

## 7. Per-screen spec: Settings + dashboard + onboarding (3 screens)

### 7.1 AI settings (`01_…-ai-settings-9-capabilities.html`)

A new top-level section at `/app/agency-settings/ai`. The form is auto-rendered from `AI_CAPABILITY_METADATA` in `src/lib/ai/capabilities.ts`. New capabilities (`image_generation`, `reel_generation`, `subtitle_generation`, `trend_radar`) light up automatically.

Layout: 4 cards (Existing §15 / Image gen / Reel + Subtitle / Trend Radar), each with a master toggle, per-capability toggles, and per-capability configuration (provider picker, platform chips, etc.). The form has a sticky bottom save bar with the existing "Last saved 2 minutes ago" pattern.

### 7.2 AI usage dashboard (`13_…-ai-features-usage-dashboard.html`)

A new top-level section at `/app/agency-settings/ai/usage`. 4 KPI cards (This month, Resets in, Generations, Acceptance rate) + a per-capability data table + Top users (left) + Recent activity (right).

The acceptance rate KPI is the most important one — it measures the §15 "AI never bypasses human control" contract. Target ≥ 70%. Lower = the human-in-the-loop is broken.

The "Recent activity" stream is a filtered view of `ai_usage_events` with the most recent 50 events. Each event shows capability, user, timestamp, provider, cost, status.

### 7.3 Onboarding (`12_…-ai-capability-disabled.html`)

First-run 4-step onboarding triggered when the agency has `AI_FEATURE_ENABLED=true` but no capabilities configured. The 4 steps are: (1) Pick capabilities, (2) Configure providers, (3) Set up Brand Kit references, (4) Set monthly budget. Skippable.

After onboarding, the planner sees the same 4 "disabled / permission" states when:

- The agency has the master toggle off: see `12_…-ai-capability-disabled.html` (capability off).
- The user is a Reviewer (not Planner+): see the same file (read-only role).
- A provider key is missing: see the same file (provider not configured).

---

## 8. The state matrix (8 critical states)

**File:** `11_…-states-empty-loading-error.html`

| #   | State                                  | Trigger                                                              | Visual                                                                                     |
| --- | -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Trends empty                           | First sync hasn't happened yet                                       | Centered illustration + "No trends yet" + Sync now + Configure link                        |
| 2   | Trends loading                         | Sync in progress                                                     | Top progress strip "Fetching from 6 platforms…" + 4 skeleton cards                         |
| 3   | Generate Image — no Brand Kit          | Agency has 0 hero assets                                             | Centered illustration + "Set up your Brand Kit first" + Open Brand Kit                     |
| 4   | Generate Image — provider rejected     | Provider returns 4xx with `rejected`                                 | "Provider rejected this prompt" + verbatim reason + Edit prompt / Try a different provider |
| 5   | Make Reel — wrong format               | `content_item.format` is not `short_form_video` or `long_form_video` | "Reels are for video formats" + Change format button                                       |
| 6   | Make Reel — step failure (recoverable) | A sidecar step returns 5xx                                           | Step list with the failed step red + "Retry step N" / "Skip step" / "Cancel"               |
| 7   | AI Subtitle — processing               | Subtitle job is `running`                                            | 3-step progress (extract audio / transcribe / burn in) with progress bars                  |
| 8   | All AI — budget exhausted              | Agency monthly spend ≥ cap                                           | Centered warning + "View usage" / "Upgrade plan"                                           |

Each state has a corresponding code branch in the route (or sidecar) and a corresponding UI element. They are non-negotiable: a feature that ships without its 8 states is not done.

---

## 9. Component library (`15_…-design-system-ai.html`)

Reusable building blocks, all from the design tokens. The page renders every component, every state.

| Component | Variants                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------- |
| Button    | Primary, secondary, tertiary, danger, disabled, loading, compact primary, compact secondary, link |
| Toggle    | On, off, disabled                                                                                 |
| Badge     | Success, warning, error, info, pending, NEW, score (🔥), PRO                                      |
| Input     | Default, with helper, error, disabled                                                             |
| Progress  | Running (with spinner), success, failed                                                           |
| Notice    | Info, warning, error, success                                                                     |

Plus the **a11y + i18n contract** as a checklist:

- All interactive elements have a visible focus ring.
- All buttons have a visible label (icon + text, or aria-label).
- All status badges include an icon.
- Modals trap focus, close on Escape, return focus to the trigger.
- All form inputs have a persistent label.
- Color contrast meets WCAG 2.2 AA.
- Every new string ships in `en.json` + `ar.json`.
- Layouts use logical properties for RTL.
- Keyboard navigation is testable.
- Screen reader announcements use `aria-live="polite"` for async state.

---

## 10. Responsive strategy (3 breakpoints × 15 screens)

| Breakpoint  | Width       | What's different                                                                                                        |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Desktop** | 1280-1440px | Default. 3-column grid, full sidebar, full top bar.                                                                     |
| Tablet      | 768-1024px  | 2-column grid, collapsible sidebar, density toggle. Reel + Image modals: same desktop form factor (they fit at 1024px). |
| **Mobile**  | 390-414px   | 1-column grid, bottom navigation, drag-handle sheets, collapsible advanced sections, sticky-bottom progress toasts.     |

The 15 screens above include 2 explicit mobile variants (#10 Trends, #14 Image + Reel modals). The remaining 13 are designed at desktop 1440; their mobile/tablet variants follow the same patterns.

The plan commits to:

- All 3 new features ship with mobile (390px) variants.
- The 5 improvements ship at desktop only (the underlying components are existing).
- The 3 settings/onboarding/dashboard screens ship at desktop only.
- Tablet is auto-handled by the 12-column grid + the responsive Sidebar component (from `docs/visual-parity/PLAN.md` M2).

---

## 11. A11y + i18n contract

This is the same contract as the existing 49 Stitch screens, repeated for the AI surfaces:

1. **Focus ring** — 2px `focus-ring` with 2px offset on every focusable element. Never remove.
2. **Visible labels** — every button has a visible text label (icon-only is allowed only with `aria-label`).
3. **Status icons** — every status badge has an icon AND text (never color-only).
4. **Modals** — trap focus, close on Escape, return focus to the trigger.
5. **Form labels** — every input has a persistent label (not placeholder-only).
6. **Contrast** — WCAG 2.2 AA on every text/background pair.
7. **Bilingual** — every new string in `en.json` + `ar.json` per master-prompt §22.
8. **RTL** — logical properties (`margin-inline-start`, etc.). Tested with `ar-EG` and `ar-AE`.
9. **Keyboard** — every flow is testable with keyboard only.
10. **Screen reader** — async state changes use `aria-live="polite"`.

The §15 capability contract extends:

- "Will update / Will not change" is always visible in the AI panel header.
- Every Insert / Replace action requires explicit human click (no auto-anything).
- Provider rejections surface verbatim, not summarized.

---

## 12. Import recipe (Stitch MCP)

These HTMLs are stand-ins. To import them into the live Stitch project `5403097764334458790`:

1. **Open each HTML in a browser** at the 1440px viewport (the default Stitch canvas width).
2. **Screenshot the rendered page** at 2560×1440 (not the 512px thumbnail — Stitch's CDN serves thumbnails, not full-res).
3. **Use Stitch's "Upload design" → "Replace screen" flow** to attach the screenshot to the project. Stitch will detect the new screen as a variant of the existing StudioFlow design system.
4. **If Stitch auto-generates new token references**, copy them into `designs/stitch/DESIGN.md` and re-run the visual-regression harness (`tests/e2e/visual-regression.spec.ts`).
5. **Commit** the new HTML + screenshot to `designs/stitch/ai-features/` with the message: `chore(design): add AI features stitch designs`.

The full Stitch MCP recipe is in `docs/visual-parity/MCP.md`. Auth is the `X-Goog-Api-Key` header against `https://stitch.googleapis.com/mcp`. The key is a personal secret — never commit it.

---

## 13. File manifest

| File                                |        Lines |         Words | Purpose                                |
| ----------------------------------- | -----------: | ------------: | -------------------------------------- |
| `IMPLEMENTATION_PLAN.md`            |         1201 |       ~10,000 | The "how" (engineering plan)           |
| `STITCH_DESIGN_SPEC.md` (this file) |         ~700 |        ~5,000 | The "what it looks like" (design plan) |
| `INTEGRATION_REPORT.md`             |          436 |        ~5,100 | The "why" (picks)                      |
| `HANDOFF.md`                        |          191 |        ~3,500 | The review-and-approval gate           |
| 7 research reports                  |       ~3,000 |       ~28,000 | Source material                        |
| 15 Stitch HTMLs                     |       ~2,500 |             — | Working visual artifacts               |
| **Total package**                   | ~7,500 lines | ~50,000 words |                                        |
