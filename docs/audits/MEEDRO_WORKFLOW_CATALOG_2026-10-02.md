# Meedro workflow catalog → LaraTik Planner preparation

Date: 2026-10-02

Source: authenticated Meedro web app, `https://app.meedro.com/workflows`

Status: live catalog capture for product preparation

## Purpose

This report records the complete visible Meedro workflow catalog in a planner-ready form. The Meedro text below is transcribed from the workflow cards and detail modals, including titles, descriptions, input hints, output hints, tool chains, and prompts. Planner preparation notes are separated from the source capture so the original workflow contract remains easy to compare.

The catalog contained 12 visible workflow recipes on 2026-10-02. The page also showed category filters, search, and three onboarding recommendations: Competitor Intelligence, Brand Voice, and The Teardown.

## Catalog index

|   # | Category           | Workflow                | Short description                                                    |
| --: | ------------------ | ----------------------- | -------------------------------------------------------------------- |
|   1 | Start here         | Brand Voice             | How do I talk, and how does my AI agent learn to sound like me?      |
|   2 | Understand content | The Teardown            | Why did this video go viral?                                         |
|   3 | Understand content | The Batch Teardown      | What do 10 winning videos have in common?                            |
|   4 | Create content     | Steal Like an Artist    | Rebuild any viral Reel for my niche.                                 |
|   5 | Understand content | The Account X-Ray       | What's actually carrying this channel?                               |
|   6 | Find ideas         | Competitor Intelligence | Who is actually beating me, and what should I steal from them?       |
|   7 | Understand content | Full Content Audit      | What is actually working on my account, and what do I film next?     |
|   8 | Start here         | The Gap Dashboard       | Where do I actually stand against my competitors?                    |
|   9 | Find ideas         | The Trial Reel Finder   | Show me every trial Reel this account has.                           |
|  10 | Find ideas         | The Hook Machine        | Write and remix hooks against the ones already proven on my subject. |
|  11 | Create content     | The Script Factory      | Turn this week's winner into 3 scripts in my voice.                  |
|  12 | AI videos          | The Video Director      | Recreate any viral video with AI: no camera, no crew.                |

## Workflow source captures

Each entry keeps the same field order: category, title, short description, long description when shown, input requirement, output, tool chain, hints, and prompt. A field marked `Not displayed` was not visible in the live workflow detail modal.

### 1. Brand Voice

**Category:** Start here

**Title:** Brand Voice

**Short description:** How do I talk, and how does my AI agent learn to sound like me?

**Long description:** Builds your Brand Voice, the voice everything else writes in. It learns how you talk from your videos, or you answer a few questions about yourself. It shows you the result and saves it only after you approve. You can view, edit, and switch it on or off anytime.

**What we need from you:** A connected account, or a few answers about how you talk

**You will get:** Your saved brand voice

**Tools this workflow runs through:** Not displayed in the workflow modal

**Workflow hints:** Not displayed as numbered hints in the workflow modal

**Prompt:**

```text
Set up my Brand Voice in Meedro, the saved document that describes how I talk and what my style is, so you can write scripts and hooks that actually sound like me.

First ask me ONE thing: should you learn my style from one of my connected accounts (list them so I can pick, or I can say all of them), or would I rather answer a few questions about myself instead?

If I pick an account or all accounts, read my already-analyzed videos sorted by most recent, using the free account read. Do not run any paid video analysis on my videos. If I have unanalyzed videos, skip them and work only with what is already analyzed. Extract my real style from that evidence: my tone of voice, energy and pacing, the language and dialect I actually speak, phrases I repeat, how I hook people, how I structure my videos, and how I ask people to act.

If I have no account or prefer questions, ask me a few questions at a time about: my niche and audience, how I want to sound, how casual or formal I am, my humor, my pacing, phrases I love, words and vibes I hate, creators whose style I admire, the language or dialect I speak in, and how I like to end a video.

Then write my Brand Voice as one clear document: who I am and my niche, tone of voice, language and dialect, pacing and energy, signature phrases, hooks, structure, CTA style, my dos and my don'ts. Make it specific to me, no generic filler.

Show me the full text and revise it with me. Save it to my Meedro account using the Brand Voice save function only after I explicitly say yes in this conversation, never automatically. Do not save it as a script. After saving, remind me I can view it, edit it, and turn its use on or off anytime on the Meedro AI Agent page or right here in chat.
```

**Planner preparation:**

- Store an agency or workspace brand voice as a reviewed, versioned brand-kit artifact
- Accept evidence from analyzed workspace content or a guided questionnaire
- Require explicit approval before activation or persistence
- Support English and Arabic voice guidance without silently machine-translating user content
- Expose status, edit, version history, and on/off controls to authorized roles

**Planner guardrails:** Preserve approval-before-save, avoid a hidden global voice, and keep the voice artifact separate from a content item or script

### 2. The Teardown

**Category:** Understand content

**Title:** The Teardown

**Short description:** Why did this video go viral?

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
analyze_video
viral_vault
```

**Workflow hints:**

> Paste any Reel or TikTok link: yours, a competitor's, a stranger's. One sentence is all it takes.

> Decode literally everything: topic, hook, views and comments, verbal hook, visual hook, text-overlay hooks, full script, script template, story beats, CTA, and more.

> Keep it the full analysis files itself into your Vault.

**Prompt:**

```text
Analyze this video with Meedro: [paste link]
```

**Planner preparation:**

- Create a read-only research record for a permitted public source or a user-supplied link
- Normalize the result into hook, transcript, visual direction, beat structure, CTA, evidence, and source metadata
- Save the result to Research or a workspace watchlist, then offer an explicit “Create brief” handoff
- Map structured findings to `content_item.format_payload` rather than adding duplicate content columns

**Planner guardrails:** Keep provider support read-only, record source and freshness, do not infer unavailable metrics, and require a clear user action before creating a brief

### 3. The Batch Teardown

**Category:** Understand content

**Title:** The Batch Teardown

**Short description:** What do 10 winning videos have in common?

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
analyze_video x10
viral_vault
```

**Workflow hints:**

> Paste up to 10 links in a single message.

> Analyze every one: hook, transcript, structure, audience and CTA.

> Search the whole batch in your Vault by anything said in any video.

**Prompt:**

```text
Analyze these videos with Meedro: [paste up to 10 links]. Then ask the user what do you want to do with this data.
```

**Planner preparation:**

- Support bounded batch research with a hard maximum and partial-result reporting
- Produce cross-video patterns with evidence links back to each source object
- Save a reusable research collection and offer actions such as create brief, save pattern, or dismiss
- Keep batch analysis separate from provider analytics storage and avoid duplicate observations

**Planner guardrails:** Enforce the batch ceiling, preserve per-source provenance, make follow-up intent explicit, and never treat a pattern as proof without sample size and freshness

### 4. Steal Like an Artist

**Category:** Create content

**Title:** Steal Like an Artist

**Short description:** Rebuild any viral Reel for my niche.

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
analyze_video
script
```

**Workflow hints:**

> Paste the Reel that made you stop scrolling.

> Decode the hook word for word, the transcript, the beat structure and CTA.

> Rebuild the same pattern as an original script for your topic, in your voice.

**Prompt:**

```text
Analyze this Reel: [paste link]. Give me the hook, transcript and structure, then rebuild the same structure as an original script for my niche.
```

**Planner preparation:**

- Treat the source as inspiration and create an original draft brief or script
- Keep source reference, adaptation rationale, target niche, voice selection, hook, beats, CTA, and Arabic or English variants
- Save the result as a draft content item with structured `format_payload`
- Route the draft through existing review and approval states

**Planner guardrails:** Preserve attribution and source links, prevent near-copying, flag copyrighted or private source material, and keep generated copy in draft status until reviewed

### 5. The Account X-Ray

**Category:** Understand content

**Title:** The Account X-Ray

**Short description:** What's actually carrying this channel?

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
analyze_profile
creator_videos
visual report
```

**Workflow hints:**

> Point at any public account: a rival, an idol, or yourself. It tells you how many videos it found and will analyze before it starts.

> Rank every video against that account's own median, not raw views.

> Report a visual breakdown of what's carrying the channel: topics, hooks, formats, lengths.

**Prompt:**

```text
Analyze @handle's account with Meedro. First tell me how many videos from the last 90 days you found and will analyze, then rank them by outlier score and build me a visual report of what is carrying their channel: the topics, hooks, formats and lengths behind their winners versus the rest.
```

**Planner preparation:**

- Add a scoped account-level research job that reports the sample before analysis
- Use account-relative baselines such as median and outlier score instead of raw follower counts alone
- Present topic, hook, format, length, and posting-time patterns with sample sizes and source links
- Store the result as an expiring research snapshot, not as an authoritative analytics rewrite

**Planner guardrails:** Only analyze permitted public or connected-account data, disclose sample size and date window, keep unsupported metrics nullable, and do not scrape or infer missing provider fields

### 6. Competitor Intelligence

**Category:** Find ideas

**Title:** Competitor Intelligence

**Short description:** Who is actually beating me, and what should I steal from them?

**Long description:** Six tabs from your tracked competitors' real data. Ranks by reach per 1,000 followers so account sizes compare fairly, decodes what is working in your niche right now, shows what failed for them, reads their trial reels, and ends on six videos for you to shoot with the source and opening line for each.

**What we need from you:** A watchlist with at least 3 competitors

**You will get:** Competitor insights and six videos to shoot

**Tools this workflow runs through:** Not displayed in the workflow modal

**Workflow hints:** Not displayed as numbered hints in the workflow modal

**Prompt:**

```text
Analyze my competitors and build me a competitor analysis dashboard using the competitor-analysis skill. I want to know who is beating me, what they are doing, where my opening is, and which videos I should shoot next.

Before building, show me a readiness check in chat. Ask only the questions that need answering, in one message, and wait before doing anything else.

If I have fewer than 3 competitors tracked, find real candidates with their follower counts for me to pick from before adding anyone.

If anything needs credits, show me exactly what it costs and my current balance before spending anything. Wait for my answer.

Once ready, build it as one HTML file with a fixed dark left rail and tabs in this exact order:

1. The Field: ranks every competitor by how much of their audience they actually reach per post, not by follower count. My account sits above the ranked list as the baseline. Includes a reach efficiency chart and a full comparison table with every stat. Closes with a short plain block on what to do with this.

2. How They Go Viral: groups their best videos by opening move, not topic, with a chart showing which moves work best. Flags any video where engagement looks bought. Shows an interactive timeline of every breakout in the last 6 months where hovering shows the hook and clicking opens the video. Closes with a short plain block.

3. Flops: their videos that underperformed their own normal, not mine, and the pattern connecting them. Closes with a short plain block.

4. Trial Pipeline: what they are testing before publishing. Opens with a plain explanation of what trial reels are. Skipped entirely and tabs renumber if nobody is running trials. Closes with a short plain block.

5. The Gap: up to 3 real openings nobody in this field has taken, each backed by numbers from both sides.

6. The Steal List: 5 or 6 formats ranked by how well they transfer to me, each with the real source, the opening line, and a version adapted to my niche and voice. Ends on the one card to shoot first and why.

HTML layout: fixed dark left rail with numbered tab buttons matching the active tab count, wide content page on the right, dark cover banner with H1 stating the single most important finding. Use the design tokens and fonts defined in the skill. Rival card grid uses explicit column counts, never auto-fill. All charts are inline SVG. Timeline dots are interactive. Four info buttons for: outlier score, reach per 1,000 followers, trial reels, and bought reach. Zero em dashes anywhere. No italics anywhere. Every link is real. My handle never appears inside a competitor list.

Never mention credits or tool names on the report page. Use only videos from the last 6 months. Rank everything by median.
```

**Planner preparation:**

- Reuse LaraTik's existing agency/workspace research scope and connected-channel read model
- Represent a competitor set as a named, reviewable research watchlist with owner, date window, source account, and freshness
- Implement comparison tabs as a research dashboard with median, sample size, reach definition, and partial-data state visible
- End with six source-linked content briefs, not generic ideas

**Planner guardrails:** Do not copy Meedro's credit gate or HTML-only output requirement; require explicit readiness, preserve role and agency scope, avoid public-account scraping unless a supported provider contract exists, and never publish automatically

### 7. Full Content Audit

**Category:** Understand content

**Title:** Full Content Audit

**Short description:** What is actually working on my account, and what do I film next?

**Long description:** Eight tabs built from your own analyzed videos: your honest numbers, your best formats ranked, a do-more and stop-doing list, the one growth stage to fix next, and ready-to-film scripts in your voice.

**What we need from you:** A connected account with analyzed videos

**You will get:** A practical action plan for your account

**Tools this workflow runs through:** Not displayed in the workflow modal

**Workflow hints:** Not displayed as numbered hints in the workflow modal

**Prompt:**

```text
Build my full Meedro content audit using the meedro-content-audit skill. This is a complete audit of my account combining my performance, content pillars, brand clarity, playbook, growth plan, strategy, weekly diagnostic, and scripts into one report.

If I have more than one account connected, ask me which one to run this on before pulling anything.

Before building, tell me how many of my analyzed videos you found. If I have fewer than 8, tell me and ask if I want to continue.

This report is free. If any section requires a paid read to complete, tell me the cost and my balance before spending anything. Wait for my answer.

Give me the complete report as one HTML file with eight tabs in this order:

1. Performance: my honest numbers showing median next to average. My top videos by outlier score with links, a trend chart showing whether I am growing or declining, my best video length, my best day to post, and my hook formats ranked by performance. Starts with a plain summary written after everything else is computed.

2. Content Pillars: groups my videos into 4 to 7 topics ranked by which pays off best, with every video listed as proof. Then a split showing how much of my content reaches new people versus deepens my existing audience. Then 2 to 3 topics competitors are winning with right now that I have not tried, from the last 6 months only.

3. Brand Clarity: scores my brand on how appealing and authentic it feels, how cinematic and consistent it looks, and whether I am mostly teaching or connecting through story. Each score has a plain verdict and an info button explaining what the framework means.

4. Playbook: at least 5 things to do more of and 5 things to stop doing, each backed by a real video I can click.

5. Growth Plan: maps every one of my videos into the stages of my customer journey, shows which stage performs best, and names the one stage to focus on next. Then 5 specific video ideas each tied to a real proof point.

6. Strategy: a one-screen view of my strengths, weaknesses, openings, and risks backed by real numbers. Followed by a ranked fix list starting with the fastest high-impact change.

7. Weekly Diagnostic: checks my videos across what the viewer sees, what I say in the opening line, and whether the audio is clean. Then a hook layering check, a fluff diagnostic naming specific lines to cut, and a short checklist for my next shoot. Each framework has an info button with a plain explanation.

8. Scripts and Calendar: 2 to 3 ready-to-film scripts built from my real winning formats, each with the source video linked and every beat labeled. Then a 5 day posting plan explaining what each post does and why it sits on that day.

HTML layout: fixed dark left rail with numbered tab buttons, wide content page on the right, dark cover banner, one tab panel visible at a time. Use the design tokens and fonts defined in the skill. All charts are inline SVG. Trend chart dots are interactive: hover shows the topic and stats, click opens the video. Checklist boxes are drawn CSS squares. Zero em dashes anywhere in the file.

If a section does not have enough data, say so plainly. Rank everything by median. Only save anything to my account after I say yes.
```

**Planner preparation:**

- Build the report from the authorized social analytics read model and stored research observations
- Make the report a workspace-scoped decision surface with visible period, sample, freshness, and incomplete-data state
- Link recommendations to real source posts and offer “Create brief” rather than writing directly to production
- Generate scripts as drafts using brand voice and format payload structures, with Arabic and English sidecars where needed

**Planner guardrails:** Do not invent audio, visual, or provider metrics that the read model does not expose; do not silently classify customer journey stages without a declared framework; keep AI outputs draft-only

### 8. The Gap Dashboard

**Category:** Start here

**Title:** The Gap Dashboard

**Short description:** Where do I actually stand against my competitors?

**Long description:** The audit a strategist would charge four figures for. It benchmarks your account against your competitors across every little detail: topics, verbal and visual hooks, power words, script structure, video format, posting times. It ships the answer as a dynamic HTML dashboard, not a paragraph.

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
command_center
analyze_profile
analyze_video
html_dashboard
```

**Workflow hints:**

> Scope your handle in, or one to two competitors if you're not connected. Top performers pulled from the last 60 days; it confirms the plan with you before running.

> Analyze every video on every detail: verbal hook, visual hook, power words, script structure, format, topic, posting time.

> Dashboard a dynamic HTML dashboard you can explore: what they have, what you're missing, and exactly what to post next.

**Prompt:**

```text
Analyze my account against my competitors for the last 30 days. My handle is [@your_handle] - if my account is not connected to the Command Center, ask me for 1-2 competitor handles to run against instead. Pull each account's top-performing videos from the last 60 days, tell me exactly how many videos you will analyze, and wait for my approval. Then build me a dynamic, interactive HTML dashboard comparing us on: topics, verbal hooks, visual hooks, power words, script structure, video format and posting time
```

**Planner preparation:**

- Reuse Command Center scope and existing analytics rather than creating a second account store
- Make the time window, comparison set, metric definitions, sample size, and approval checkpoint explicit
- Use a dashboard with accessible tables as the durable representation; charts are supplemental
- Convert a selected gap into a saved research signal or content brief

**Planner guardrails:** Preserve the prompt's approval checkpoint, reconcile the different 30-day and 60-day windows explicitly, keep personal handles out of competitor lists where required, and never infer unsupported provider metrics

### 9. The Trial Reel Finder

**Category:** Find ideas

**Title:** The Trial Reel Finder

**Short description:** Show me every trial Reel this account has.

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
analyze_profile
add_to_watchlist
trial_reels
```

**Workflow hints:**

> Analyze the account you want to learn from.

> Track it gets added to your watchlist automatically.

> See all of their trial Reels, and just say yes when it asks if you want one analyzed.

**Prompt:**

```text
Analyze @handle with Meedro, add them to my watchlist, then show me all of their trial Reels. Ask me if I want any of them analyzed.
```

**Planner preparation:**

- Add a provider capability only where trial-reel data is available and contractually supported
- Keep watchlist creation explicit and workspace-scoped
- Show trial items as research candidates and ask before consuming deeper analysis or creating a brief
- Record that the source is a trial format and preserve its date and account

**Planner guardrails:** Treat trial metadata as provider-specific, keep the feature optional when unsupported, do not expose private trial data without authorization, and never auto-analyze or publish

### 10. The Hook Machine

**Category:** Find ideas

**Title:** The Hook Machine

**Short description:** Write and remix hooks against the ones already proven on my subject.

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
viral_hook_library
remix
rank
```

**Workflow hints:**

> Mine the top 20 proven hooks on your subject, view counts attached.

> Remix the winning patterns into 10 new hooks written for your audience.

> Rank them by which you should film first.

**Prompt:**

```text
Find the top 20 proven hooks about my subject. Write 10 new hooks for my next videos by remixing the patterns that already work, and rank them by which one I should film first.
```

**Planner preparation:**

- Provide a research-backed hook shortlist with source evidence, date window, language, and audience context
- Generate 10 draft hooks with a clear originality/adaptation note and rank rationale
- Support English and Arabic hook variants while keeping field direction content-driven
- Offer insertion into a draft brief or format payload, not direct publishing

**Planner guardrails:** Use approved research only, show sample size and source dates, avoid copying distinctive lines verbatim, and keep medical or psychological claims reviewed when hooks touch health topics

### 11. The Script Factory

**Category:** Create content

**Title:** The Script Factory

**Short description:** Turn this week's winner into 3 scripts in my voice.

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
watchlist_videos
analyze_video
brand_voice
save_script
```

**Workflow hints:**

> Pull your watchlist ranked by outlier score: the machine picks the week's real winner.

> Decode the hook, beat structure, pacing and CTA behind the views.

> Deliver three original scripts in your voice, saved to your project.

**Prompt:**

```text
Take the highest-outlier Reel from my watchlist this week, analyze it, and write 3 scripts on my topic using that structure in my brand voice. Save them to my project.
```

**Planner preparation:**

- Select a source post from a workspace watchlist using the approved outlier model
- Pass source evidence and active brand voice into a draft-only generation request
- Save three drafts to the existing project/content-item model with source references and structured fields
- Allow Arabic-first, English, or bilingual output without collapsing translations into one field

**Planner guardrails:** Do not save or publish without an explicit user action, preserve source attribution, keep content editable, and route all drafts through normal review permissions

### 12. The Video Director

**Category:** AI videos

**Title:** The Video Director

**Short description:** Recreate any viral video with AI: no camera, no crew.

**Long description:** Not displayed in the workflow modal

**What we need from you:** Not displayed in the workflow modal

**You will get:** Not displayed in the workflow modal

**Tools this workflow runs through:**

```text
analyze_video
video_director
higgsfield
```

**Workflow hints:**

> Decode the original: hook, beats, shot-by-shot pacing, why it held attention.

> Direct Video Director turns the analysis into a Higgsfield generation brief.

> Render your version with AI. No filming day required.

**Prompt:**

```text
Analyze this video using Meedro: [paste link]. Then use the analyzed data and the Meedro Video Director to recreate it with Higgsfield using my avatar with Seedance 2.5: same hook, structure and pacing, but for my topic and my brand.
```

**Planner preparation:**

- Treat AI-video generation as a later, provider-specific production integration
- Save the analysis and generation brief as separate records so the source and generated direction remain auditable
- Keep avatar, likeness, voice, and external provider permissions explicit
- Route generated media through the existing Media Library, rights checks, delivery versions, and approval gates

**Planner guardrails:** Do not add this to the first workflow milestone, do not assume Higgsfield or Seedance access, require likeness and rights consent, and never bypass creative approval or publishing readiness

## Cross-workflow product patterns

### 1. Readiness before execution

Several prompts require the assistant to count available videos, identify missing accounts or competitors, show a cost or balance when relevant, and wait for approval. Planner should make this a reusable readiness contract rather than reimplementing it inside each recipe.

### 2. Research is evidence, not a final post

The strongest workflow pattern is: gather bounded evidence, explain the pattern, then offer a separate action. LaraTik should keep research objects and draft content items distinct while making the handoff one click away.

### 3. Relative performance is more useful than raw reach

Meedro repeatedly uses median, outlier score, or reach normalized by audience size. Planner should show the definition, period, sample size, and source account beside every derived signal.

### 4. Prompts are product contracts

Every recipe combines required input, tool sequence, expected output, approval behavior, and presentation. If LaraTik adds workflow recipes, each recipe should have a stable MCP tool/evaluation contract and bilingual catalog copy.

### 5. The report is not the workflow engine

Meedro often requests one HTML report with tabs and interactive charts. LaraTik should use accessible server-rendered tables and existing planner surfaces as the durable source of truth, with charts as supporting views. Do not make a generated HTML file the only place where evidence exists.

## Planner implementation map

| Capability              | Meedro source pattern                                        | LaraTik preparation                                                             |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Brand voice             | Evidence or questionnaire, preview, explicit save            | Versioned brand-kit artifact, approval, on/off state, EN/AR support             |
| Single-video teardown   | Analyze one link, explain hooks and structure, save to Vault | Research object with provenance, structured findings, create-brief handoff      |
| Batch teardown          | Analyze up to 10 links and search the batch                  | Bounded batch research, evidence-linked patterns, partial-result state          |
| Account analysis        | Relative ranking, sample declaration, visual report          | Scoped research snapshot, median/outlier signals, no provider metric invention  |
| Competitor intelligence | Watchlist, normalized reach, flops, trials, steal list       | Agency/workspace watchlist, provider-aware read model, source-linked briefs     |
| Full content audit      | Eight decision tabs and ready-to-film scripts                | Command Center/Analytics/Research/Planning handoff with draft-only AI           |
| Gap dashboard           | Account-versus-competitor comparison                         | Research dashboard plus saved signals, explicit time-window reconciliation      |
| Trial Reel finder       | Analyze, add to watchlist, list trial items                  | Optional provider capability, explicit analysis consent                         |
| Hook machine            | Proven hooks, remix, rank                                    | Evidence-backed hook suggestions, originality note, bilingual drafts            |
| Script factory          | Watchlist winner, analyze, voice, save three scripts         | Draft content items with source, format payload, brand voice and review         |
| Video director          | Analyze, create generation brief, render                     | Later integration after rights, provider, Media Library, and approval contracts |

## Recommended build order for LaraTik Planner

1. Recipe data model and bilingual catalog with required input, source scope, tools, output, approval, and cost behavior
2. Readiness checkpoint reused by all recipes
3. Single-video teardown and batch teardown against the existing research read model
4. Hook Machine and Script Factory as draft-only research-to-content handoffs
5. Account X-Ray, Gap Dashboard, and Competitor Intelligence after comparison metrics are evidenced
6. Full Content Audit as a composed Command Center report, not a second analytics store
7. Brand Voice integration with the existing Brand Kit and AI governance
8. Trial Reel support only when provider permissions and fields are verified
9. Video Director only after external media, likeness, rights, and approval gates are explicitly implemented

## Scope exclusions

- Meedro credit balances, upgrade prompts, affiliate links, and plan locks
- Meedro visual branding and dark HTML report layout as an implementation dependency
- Automatic publishing or silent database writes from a prompt
- A second competitor analytics store or inferred provider metrics
- Unreviewed medical or psychological claims for Dr. Reem Reda content

## Verification record

- Live page inspected: `https://app.meedro.com/workflows`
- Visible workflow count: 12
- Categories observed: Start here, Understand content, Find ideas, Create content, AI videos
- Onboarding recommendations observed: Competitor Intelligence, Brand Voice, The Teardown
- Exact prompts captured from the workflow detail modals; long prompts were copied through the modal's Copy action and verified in a text editor
- No Meedro workflow was executed during this catalog pass, so the 687-credit balance was not changed by this inventory

## Related planner documents

- [Meedro feature audit and LaraTik roadmap](MEEDRO_FEATURE_AUDIT_2026-09-30.md)
- [Meedro-informed refactor plan](../implementation/MEEDRO_REFACTOR_PLAN.md)
- [MCP maintenance](../operations/mcp-maintenance.md)
- [MCP API contract](../api/mcp.md)
