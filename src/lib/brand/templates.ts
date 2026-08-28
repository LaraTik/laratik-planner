/**
 * Brand Kit templates (Phase 8 / Phase 9) — curated, on-brand
 * content the planner can pick to seed a workspace's brand kit.
 *
 * Why a static file (not the DB): the templates are platform
 * content, not workspace content. Every workspace sees the same
 * curated list; an agency's brand voice is a workspace-level
 * concern that the templates help bootstrap but never replace.
 *
 * Sections covered (mirrors the brand-kit sub-navigation):
 *   - voice          — tone, do, don't rule sets
 *   - pillars        — content pillar seeds
 *   - colors         — starter palettes (primary + secondary + accent + neutrals)
 *   - typography     — starter font pairs
 *   - publishing     — starter publishing rules
 *
 * The `id` field on every template is a stable string the URL
 * can use for deep links and the audit log can use to attribute
 * a "added by template" event. The `addMany` flag tells the UI
 * whether a single click adds one entry (most templates) or
 * many (palettes add 5 colors; font pairs add 2-3 fonts).
 *
 * Adding a new template is a 3-line change here. The page at
 * /app/w/[slug]/brand-kit/templates renders the list and the
 * "Add to brand kit" button calls the matching per-section
 * create action with the template's payload.
 */

export type VoiceRuleTemplate = {
  id: string;
  ruleType: "tone" | "do" | "dont";
  content: string;
  /** Optional short blurb shown in the template card preview. */
  blurb?: string;
};

export type PillarTemplate = {
  id: string;
  name: string;
  description: string;
  /** Optional chip color (the form's #rrggbb picker). */
  color?: string;
  blurb?: string;
};

export type ColorTemplate = {
  id: string;
  name: string;
  blurb: string;
  /** A palette is 4-6 colors; each is a (role, name, hex) tuple. */
  swatches: ReadonlyArray<{
    role: "primary" | "secondary" | "accent" | "neutral";
    name: string;
    hex: string;
  }>;
};

export type TypographyTemplate = {
  id: string;
  name: string;
  blurb: string;
  /** A pair is 1-2 fonts; the first is always the headline. */
  faces: ReadonlyArray<{
    family: string;
    weight: number;
    role: "headline" | "body" | "accent" | "mono";
  }>;
};

export type PublishingTemplate = {
  id: string;
  ruleType: "alt_text" | "hashtag" | "compliance" | "channel" | "general";
  title: string;
  content: string;
  blurb?: string;
};

// ─── Voice templates ─────────────────────────────────────────────────────
//
// 8 tone rules, 12 do rules, 12 don't rules. Curated from the
// StudioFlow brand voice research notes (master prompt §11.x).

const tone: VoiceRuleTemplate[] = [
  {
    id: "voice-tone-warm-direct",
    ruleType: "tone",
    content: "Warm, direct, never patronising.",
    blurb: "Pair a friendly hand with a clear eye.",
  },
  {
    id: "voice-tone-confident-not-salesy",
    ruleType: "tone",
    content: "Confident, never salesy.",
    blurb: "The product is good; let it speak.",
  },
  {
    id: "voice-tone-helpful-expert",
    ruleType: "tone",
    content: "Helpful expert, not a guru.",
    blurb: "Translate jargon; don't invent it.",
  },
  {
    id: "voice-tone-honest",
    ruleType: "tone",
    content: "Honest, even when it's uncomfortable.",
    blurb: "Skip the 'in today's world' filler.",
  },
  {
    id: "voice-tone-friendly-peer",
    ruleType: "tone",
    content: "Friendly peer, not a brand voice.",
    blurb: "Write like a colleague, not a billboard.",
  },
  {
    id: "voice-tone-precise-not-flowery",
    ruleType: "tone",
    content: "Precise, not flowery.",
    blurb: "One specific number beats three adjectives.",
  },
  {
    id: "voice-tone-curious",
    ruleType: "tone",
    content: "Curious, not lecturing.",
    blurb: "Ask before you tell.",
  },
  {
    id: "voice-tone-brief",
    ruleType: "tone",
    content: "Brief. Earn the next sentence.",
    blurb: "Stop when the thought is complete.",
  },
];

const doRules: VoiceRuleTemplate[] = [
  {
    id: "voice-do-lead-with-customer",
    ruleType: "do",
    content: "Lead with the customer's outcome, not the feature.",
  },
  {
    id: "voice-do-specific-numbers",
    ruleType: "do",
    content: "Use specific numbers; avoid 'fast', 'easy', 'powerful'.",
  },
  {
    id: "voice-do-cite-real-story",
    ruleType: "do",
    content: "Cite a real customer story when the claim is bold.",
  },
  {
    id: "voice-do-question-hook",
    ruleType: "do",
    content: "Open with a question that earns the scroll-stop.",
  },
  {
    id: "voice-do-simple-words",
    ruleType: "do",
    content: "Use simple words; avoid jargon and acronyms.",
  },
  {
    id: "voice-do-one-person",
    ruleType: "do",
    content: "Speak to one person, not a crowd.",
  },
  {
    id: "voice-do-one-takeaway",
    ruleType: "do",
    content: "Give one clear takeaway, not five.",
  },
  {
    id: "voice-do-second-person",
    ruleType: "do",
    content: "Use 'you' more than 'they'.",
  },
  {
    id: "voice-do-cta-clear",
    ruleType: "do",
    content: "CTAs name the next concrete action.",
  },
  {
    id: "voice-do-show-source",
    ruleType: "do",
    content: "Show a source for any non-obvious data claim.",
  },
  {
    id: "voice-do-first-line-earn-see-more",
    ruleType: "do",
    content: "Front-load the first 125 characters (the 'see more' cutoff).",
  },
  {
    id: "voice-do-name-the-platform",
    ruleType: "do",
    content: "When reposting, name the platform's voice (X vs LinkedIn vs TikTok).",
  },
];

const dontRules: VoiceRuleTemplate[] = [
  {
    id: "voice-dont-jargon",
    ruleType: "dont",
    content: "Avoid corporate jargon: synergy, leverage, paradigm, disrupt.",
  },
  {
    id: "voice-dont-filler-openers",
    ruleType: "dont",
    content: "Don't open with 'In today's fast-paced world…' or 'Ever wondered why…'",
  },
  {
    id: "voice-dont-exclamation-spam",
    ruleType: "dont",
    content: "Don't use exclamation marks unless genuinely excited.",
  },
  {
    id: "voice-dont-long-blocks",
    ruleType: "dont",
    content: "Don't write more than 2 sentences without a break.",
  },
  {
    id: "voice-dont-filler-just",
    ruleType: "dont",
    content: "Don't use 'just' as a filler ('just wanted to share…').",
  },
  {
    id: "voice-dont-name-competitors",
    ruleType: "dont",
    content: "Don't reference competitors by name.",
  },
  {
    id: "voice-dont-empty-claims",
    ruleType: "dont",
    content: "Don't promise specific results without proof.",
  },
  {
    id: "voice-dont-emoji-as-emphasis",
    ruleType: "dont",
    content: "Don't use emoji as the only emphasis.",
  },
  {
    id: "voice-dont-blame-the-user",
    ruleType: "dont",
    content: "Don't blame the user ('you may not have noticed…').",
  },
  {
    id: "voice-dont-hedge-on-data",
    ruleType: "dont",
    content: "Don't hedge data claims ('studies suggest', 'many say').",
  },
  {
    id: "voice-dont-click-bait",
    ruleType: "dont",
    content: "Don't use clickbait that the post doesn't pay off.",
  },
  {
    id: "voice-dont-stack-adjectives",
    ruleType: "dont",
    content: "Don't stack adjectives ('innovative, disruptive, bleeding-edge').",
  },
];

// ─── Pillar templates ─────────────────────────────────────────────────────

const pillars: PillarTemplate[] = [
  {
    id: "pillar-template-education",
    name: "Education",
    description: "Teach the user something useful — how-tos, frameworks, myth-busters.",
    color: "#3B82F6",
    blurb: "The trust-building pillar. Most agencies lead with 1-2 of these per week.",
  },
  {
    id: "pillar-template-product",
    name: "Product",
    description: "Feature highlights, updates, and how to get the most out of the tool.",
    color: "#6366F1",
    blurb: "Direct value framing. Pair every update with the customer outcome it unlocks.",
  },
  {
    id: "pillar-template-customer-stories",
    name: "Customer stories",
    description: "Real users, real outcomes — testimonials, case studies, before/after.",
    color: "#10B981",
    blurb: "Social proof pillar. One specific number per story beats five adjectives.",
  },
  {
    id: "pillar-template-behind-the-scenes",
    name: "Behind the scenes",
    description: "Team, process, culture — the human side of the brand.",
    color: "#F59E0B",
    blurb: "Builds parasocial trust. Low-stakes to produce; high-stakes to write well.",
  },
  {
    id: "pillar-template-industry-pov",
    name: "Industry POV",
    description: "Trends, commentary, predictions — the brand's point of view.",
    color: "#EF4444",
    blurb: "The thought-leadership pillar. Pick a stance and defend it with evidence.",
  },
  {
    id: "pillar-template-community",
    name: "Community",
    description: "UGC, replies, social proof, member spotlights.",
    color: "#EC4899",
    blurb: "Turns the audience into participants. High engagement, low production cost.",
  },
  {
    id: "pillar-template-promotion",
    name: "Promotion",
    description: "Offers, launches, deals — direct-response copy.",
    color: "#F97316",
    blurb: "Cap at 1-2 per week so the brand doesn't feel salesy.",
  },
];

// ─── Color palettes ───────────────────────────────────────────────────────

const colorPalettes: ColorTemplate[] = [
  {
    id: "palette-tech-startup",
    name: "Tech startup",
    blurb: "Indigo + sky + slate, emerald accent. Trustworthy, modern, slightly playful.",
    swatches: [
      { role: "primary", name: "Indigo 600", hex: "#4F46E5" },
      { role: "secondary", name: "Sky 500", hex: "#0EA5E9" },
      { role: "accent", name: "Emerald 500", hex: "#10B981" },
      { role: "neutral", name: "Slate 700", hex: "#334155" },
      { role: "neutral", name: "Slate 100", hex: "#F1F5F9" },
    ],
  },
  {
    id: "palette-wellness",
    name: "Wellness brand",
    blurb: "Sage + cream + sand + terracotta. Calm, earthy, premium.",
    swatches: [
      { role: "primary", name: "Sage 600", hex: "#5B7553" },
      { role: "secondary", name: "Sand 400", hex: "#D4B896" },
      { role: "accent", name: "Terracotta 500", hex: "#C76A4A" },
      { role: "neutral", name: "Charcoal 800", hex: "#2D2A26" },
      { role: "neutral", name: "Cream 50", hex: "#FAF6EE" },
    ],
  },
  {
    id: "palette-bold-consumer",
    name: "Bold consumer",
    blurb: "Coral + magenta + lemon + navy. High energy, brand-led, retail-friendly.",
    swatches: [
      { role: "primary", name: "Coral 500", hex: "#FF6B5B" },
      { role: "secondary", name: "Magenta 500", hex: "#D63384" },
      { role: "accent", name: "Lemon 400", hex: "#FFD43B" },
      { role: "neutral", name: "Navy 800", hex: "#1E2A4A" },
      { role: "neutral", name: "Cream 50", hex: "#FAF6EE" },
    ],
  },
  {
    id: "palette-editorial",
    name: "Editorial",
    blurb: "Ink + cream + rust + forest. Long-form, magazine-y, considered.",
    swatches: [
      { role: "primary", name: "Ink 900", hex: "#1A1815" },
      { role: "secondary", name: "Rust 600", hex: "#A24E2A" },
      { role: "accent", name: "Forest 700", hex: "#2D4A2B" },
      { role: "neutral", name: "Cream 50", hex: "#F5F1E8" },
      { role: "neutral", name: "Bone 200", hex: "#E8E2D2" },
    ],
  },
  {
    id: "palette-fintech",
    name: "Fintech",
    blurb: "Emerald + navy + slate. Trustworthy, precise, modern.",
    swatches: [
      { role: "primary", name: "Emerald 600", hex: "#059669" },
      { role: "secondary", name: "Navy 700", hex: "#1E3A8A" },
      { role: "accent", name: "Lemon 500", hex: "#F59E0B" },
      { role: "neutral", name: "Slate 800", hex: "#1E293B" },
      { role: "neutral", name: "Slate 100", hex: "#F1F5F9" },
    ],
  },
];

// ─── Typography pairs ─────────────────────────────────────────────────────

const typographyPairs: TypographyTemplate[] = [
  {
    id: "type-editorial",
    name: "Editorial",
    blurb: "Playfair Display + Source Sans 3. Magazine feel; long-form friendly.",
    faces: [
      { family: "Playfair Display", weight: 700, role: "headline" },
      { family: "Source Sans 3", weight: 400, role: "body" },
    ],
  },
  {
    id: "type-tech-ui",
    name: "Tech UI",
    blurb: "Inter as both headline and body. The most-used UI face on the web.",
    faces: [
      { family: "Inter", weight: 700, role: "headline" },
      { family: "Inter", weight: 400, role: "body" },
    ],
  },
  {
    id: "type-bold-poster",
    name: "Bold poster",
    blurb: "Raleway + Inter. High-contrast hero, calm body. Good for launches.",
    faces: [
      { family: "Raleway", weight: 800, role: "headline" },
      { family: "Inter", weight: 400, role: "body" },
    ],
  },
  {
    id: "type-long-form",
    name: "Long-form",
    blurb: "Merriweather + Inter. Readable serif, calm sans body. For articles.",
    faces: [
      { family: "Merriweather", weight: 700, role: "headline" },
      { family: "Inter", weight: 400, role: "body" },
    ],
  },
  {
    id: "type-code-heavy",
    name: "Code-heavy",
    blurb: "IBM Plex Sans + Fira Sans. Slightly technical, dev-tool friendly.",
    faces: [
      { family: "IBM Plex Sans", weight: 600, role: "headline" },
      { family: "Inter", weight: 400, role: "body" },
      { family: "Fira Sans", weight: 400, role: "mono" },
    ],
  },
];

// ─── Publishing rules ─────────────────────────────────────────────────────

const publishingRuleTemplates: PublishingTemplate[] = [
  {
    id: "publishing-alt-text",
    ruleType: "alt_text",
    title: "Alt text describes meaning, not just appearance",
    content:
      "Write alt text that conveys the image's information ('a customer opens the new dashboard') rather than its appearance ('a screenshot of a dashboard'). Decorative images use empty alt text.",
  },
  {
    id: "publishing-hashtag-density",
    ruleType: "hashtag",
    title: "3-5 hashtags, never more than 10",
    content:
      "Use 3-5 hashtags on Instagram and LinkedIn; 1-2 on X / TikTok. More than 10 hashtags dilutes the message and looks spammy. Put hashtags in the first comment when the platform supports it.",
  },
  {
    id: "publishing-cite-source",
    ruleType: "compliance",
    title: "Cite a source for every data claim",
    content:
      "Any number, percentage, or 'X% of users…' claim must link to a primary source in the post body or the first comment. Round numbers down (3.7% → 'almost 4%') when the exact figure is not material.",
  },
  {
    id: "publishing-cta-concrete",
    ruleType: "general",
    title: "CTAs name the next concrete action",
    content:
      "Use 'Tap to start your free trial', not 'Learn more'. Every CTA answers: what does the user do next, and what do they get?",
  },
  {
    id: "publishing-channel-length",
    ruleType: "channel",
    title: "Match caption length to the platform",
    content:
      "X / Twitter: under 280 characters. LinkedIn: 150-300 words with line breaks. Instagram: front-load the first 125 characters. TikTok: caption is a tag, not a script — keep it under 80 characters.",
  },
];

// ─── Exports ──────────────────────────────────────────────────────────────

export const voiceTemplates: readonly VoiceRuleTemplate[] = [...tone, ...doRules, ...dontRules];

export const pillarTemplates: readonly PillarTemplate[] = pillars;

export const colorTemplates: readonly ColorTemplate[] = colorPalettes;

export const typographyTemplates: readonly TypographyTemplate[] = typographyPairs;

export const publishingTemplates: readonly PublishingTemplate[] = publishingRuleTemplates;

/** All template categories, in the order the UI should display them. */
export const templateSections = [
  { id: "voice", label: "Voice", blurb: "Tone, do, and don't rule seeds." },
  { id: "pillars", label: "Pillars", blurb: "Content pillar seeds to bootstrap the taxonomy." },
  {
    id: "colors",
    label: "Color palettes",
    blurb: "Five-color starter palettes with role assignments.",
  },
  { id: "typography", label: "Typography pairs", blurb: "Headline + body face pairings." },
  { id: "publishing", label: "Publishing rules", blurb: "Editorial guardrails for the team." },
] as const;
