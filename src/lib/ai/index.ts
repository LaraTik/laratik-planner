import "server-only";
import { serverEnv } from "@/lib/validation/env";
import { loadManagedAiSecret, hasManagedAiSecret } from "./provider-secret";
import type { AiContext } from "./context";
export type { AiContext, AiContextSelection } from "./context";

// Re-export the M3.3 governance surface so callers can import
// from a single entry point. The governance module is the
// authoritative gate for the AI budget and capability
// intersection; the AI client below is the actual provider
// transport.
export {
  resolveEnabledCapabilities,
  loadEnabledCapabilities,
  enforceAiBudget,
  reconcileAiBudget,
  getUserDailyBudgetSnapshot,
  AiBudgetReservationSchema,
} from "./governance";
export type { AiBudgetReservation } from "./governance";

/**
 * MiniMax AI client (Goal 11 — master prompt §15).
 *
 * Per master prompt §15: "The AI settings UI displays enabled state, model,
 * last successful test, and a masked suffix only if explicitly stored safely.
 * Prefer an environment-managed key and display 'Configured by environment.'"
 *
 * This module:
 *  - Resolves the active API key per agency (M3.4): a managed
 *    secret from the database takes priority; the env key is the
 *    fallback. `getActiveApiKey(agencyId)` is the single source
 *    of truth for which key a request uses.
 *  - Uses the OpenAI-compat API at MINIMAX_BASE_URL (defaults to Anthropic-compat)
 *  - Logs every call to ai_usage_events for billing/audit
 *  - Never auto-publishes, never changes status — only drafts text the user
 *    reviews (master prompt §0.13 "AI never bypasses human control")
 */

export const isAiEnabled = (): boolean =>
  serverEnv.AI_FEATURE_ENABLED && !!serverEnv.MINIMAX_API_KEY;

const MODEL = serverEnv.MINIMAX_MODEL;

/**
 * Literal marker the model is told to insert between
 * `improveBrief` variants. The client parses on this exact
 * string (whitespace-trimmed). Three dashes alone on a line is
 * unlikely to appear in a real brief or rewrite, so the parse
 * is safe in practice; we still defensive-trim each side and
 * drop empty pieces.
 */
export const VARIANT_SEPARATOR = "---";

/**
 * Split a model response into N variants. Returns a single-
 * element array when the separator is absent (the model didn't
 * follow instructions, or the response is for a non-multi-
 * variant capability).
 */
export function splitVariants(text: string): string[] {
  return text
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Render the optional context the planner selected into a
 * prompt block. Returns an empty string when no branch has
 * data, so the builder can append unconditionally without
 * producing "Context: (none)" artifacts.
 */
function buildContextBlock(ctx: AiContext | null | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];
  const { brandVoice, brandVisuals, campaign, pillars, channels, approvedContentSamples } = ctx;

  if (brandVoice.tone.length || brandVoice.do.length || brandVoice.dont.length) {
    lines.push("Brand voice (apply these rules):");
    for (const t of brandVoice.tone) lines.push(`- tone: ${t}`);
    for (const d of brandVoice.do) lines.push(`- do: ${d}`);
    for (const d of brandVoice.dont) lines.push(`- don't: ${d}`);
  }

  // Phase 8 — visual brand context (colors, fonts, publishing rules).
  // Empty arrays are valid; the prompt builder skips empty sections
  // so a workspace with no colors still gets a clean prompt.
  if (brandVisuals) {
    if (brandVisuals.colors.length) {
      lines.push("Brand colors (use these when the caption references visual style):");
      for (const c of brandVisuals.colors) {
        const role = c.role ? ` [${c.role}]` : "";
        lines.push(`- ${c.name}${role}: ${c.hex}`);
      }
    }
    if (brandVisuals.fonts.length) {
      lines.push("Brand fonts (use these when the caption references typography):");
      for (const f of brandVisuals.fonts) {
        lines.push(`- ${f.name} (${f.family}, weight ${f.weight}, ${f.role})`);
      }
    }
    if (brandVisuals.publishingRules.length) {
      lines.push("Publishing rules (apply these to every draft):");
      for (const r of brandVisuals.publishingRules) {
        lines.push(`- [${r.ruleType}] ${r.title}: ${r.content}`);
      }
    }
  }

  if (campaign) {
    lines.push(`Active campaign: ${campaign.name}`);
    if (campaign.objective) lines.push(`Campaign objective: ${campaign.objective}`);
    if (campaign.description) lines.push(`Campaign description: ${campaign.description}`);
  }

  if (pillars.length) {
    lines.push("Content pillars (the brief should ladder up to one of these):");
    for (const p of pillars) {
      const desc = p.description ? ` — ${p.description}` : "";
      lines.push(`- ${p.name}${desc}`);
    }
  }

  if (channels.length) {
    const platforms = Array.from(new Set(channels.map((c) => c.platform))).join(", ");
    lines.push(`Targeting platforms: ${platforms}.`);
  }

  if (approvedContentSamples.length) {
    lines.push("Recently approved content (mirror this tone and density):");
    for (const s of approvedContentSamples) {
      const brief = s.brief ? ` — ${s.brief}` : "";
      lines.push(`- ${s.title}${brief}`);
    }
  }

  if (lines.length === 0) return "";
  return ["", "Context:", ...lines].join("\n");
}

/**
 * Per-format system prompts for `improveBrief`. The §15 spec
 * assumes a static-post shape (Hook → Main message → CTA) but
 * carousels, reels, and articles all want a different structure.
 * Picking the right shape per format is the difference between
 * a rewrite the planner can paste and a rewrite they have to
 * redo by hand.
 */
function buildImproveBriefSystemPrompt(format: string): string {
  const base =
    "You are a senior social media strategist. Output exactly 3 distinct rewrites of the brief. " +
    "Each rewrite is its own block. Separate the blocks with a line containing only '---' (three dashes). " +
    "Use plain text — no markdown, no preamble, no closing remarks, no labels other than the per-block lines. " +
    "Each variant should be plausibly different in tone or hook (e.g. one punchy, one warm, one data-led) so the planner can pick. " +
    "If the brief is empty, return a placeholder version of each block so the user can fill it in.";

  const byFormat: Record<string, string> = {
    static_post:
      "For each variant, produce exactly three lines, each on its own line, prefixed with the label: " +
      "'Hook: ...' (one sentence that earns the scroll-stop), 'Main message: ...' (the single thing the audience should remember), " +
      "'CTA: ...' (the next action you want them to take). " +
      "A static post is the canonical Hook/Main/CTA shape — keep each line under 120 characters.",
    story:
      "For each variant, produce exactly three lines, each on its own line, prefixed with the label: " +
      "'Frame 1: ...' (the opening shot or first-second visual), 'Reveal: ...' (the moment the brand or message lands), " +
      "'CTA: ...' (swipe-up / link-sticker / DM). " +
      "Stories are visual-first; the Reveal is the load-bearing line.",
    carousel:
      "For each variant, produce a short block in this exact shape (no extra lines): " +
      "'Slide 1 — <opening hook line>' on its own line, " +
      "'Slides 2–N — <one-sentence summary of the payload>' on its own line, " +
      "'Final slide — <CTA>' on its own line. " +
      "Carousels reward a strong slide 1; the body summary should be terse.",
    short_form_video:
      "For each variant, produce a short block in this exact shape (no extra lines): " +
      "'Hook (0-3s) — <spoken line or on-screen text that earns the watch>' on its own line, " +
      "'Beats — <2-4 visual beats, comma-separated>' on its own line, " +
      "'CTA — <spoken or on-screen close>' on its own line. " +
      "Short-form video lives or dies on the Hook; spend the most precision there.",
    long_form_video:
      "For each variant, produce a short block in this exact shape (no extra lines): " +
      "'Cold open — <first 15 seconds, the hook that earns the watch>' on its own line, " +
      "'Chapters — <3-5 chapter titles, comma-separated>' on its own line, " +
      "'CTA — <subscribe / watch-next / link-in-description>' on its own line.",
    live_content:
      "For each variant, produce a short block in this exact shape (no extra lines): " +
      "'Topic — <one-sentence framing of what this live is about>' on its own line, " +
      "'Talking points — <3-5 bullet points, comma-separated>' on its own line, " +
      "'CTA — <the action you want viewers to take during or after>' on its own line.",
    article:
      "For each variant, produce a short block in this exact shape (no extra lines): " +
      "'Headline — <the title that earns the click>' on its own line, " +
      "'Lede — <first paragraph that sets the stakes>' on its own line, " +
      "'Takeaways — <2-3 numbered points, comma-separated>' on its own line, " +
      "'CTA — <the next step you want the reader to take>' on its own line. " +
      "Articles compete on the headline and lede; keep takeaways concrete.",
    other:
      "For each variant, produce three short lines that a planner can paste into a brief: " +
      "'Hook: ...', 'Main message: ...', 'CTA: ...'. " +
      "When the format is 'other' the planner usually knows what they want — keep the lines tight and let them edit.",
  };

  const formatSpecific = byFormat[format] ?? byFormat.other;
  return `${base} ${formatSpecific}`;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface ChatOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /**
   * The API key to use. The route layer is expected to pass the
   * resolved key (managed secret or env). When omitted and
   * `isAiEnabled()` is false, the function returns `null` (the
   * AI feature is unavailable). The optional typing preserves
   * the pre-M3.4 call site behaviour for tests that exercise the
   * "AI disabled" path.
   */
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
}

export interface ChatResult {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
}

/**
 * Resolve the API key the AI client should use for a given
 * agency. Priority:
 *   1. The agency's managed secret (decrypted from the DB).
 *   2. The environment key (`serverEnv.MINIMAX_API_KEY`).
 *   3. `null` when neither is available — the route layer maps
 *      to 503 with the message "Set a managed secret at
 *      /app/agency-settings/ai or set MINIMAX_API_KEY in the
 *      environment."
 *
 * The function is async (the managed-secret path is a DB read +
 * decrypt) but the env-key path is sync. The return type is
 * `Promise<string | null>`.
 */
export async function getActiveApiKey(agencyId: string): Promise<string | null> {
  if (await hasManagedAiSecret(agencyId)) {
    const secret = await loadManagedAiSecret(agencyId);
    if (secret?.apiKey) return secret.apiKey;
  }
  return serverEnv.MINIMAX_API_KEY || null;
}

export async function chat(opts: ChatOptions): Promise<ChatResult | null> {
  if (!isAiEnabled() && !opts.apiKey) return null;
  if (!opts.apiKey) return null;

  const url = `${(opts.baseUrl ?? serverEnv.MINIMAX_BASE_URL).replace(/\/$/, "")}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      messages: opts.messages.filter((m) => m.role !== "system"),
      system: opts.messages.find((m) => m.role === "system")?.content,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax API error: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  return {
    content: text,
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null,
    model: MODEL,
  };
}

/**
 * Domain-specific prompt: generate a draft caption for a content item.
 * Returns null if AI is disabled. Caller must save the result; we never
 * write to the DB on the user's behalf.
 */
export async function draftCaption(input: {
  title: string;
  brief: string;
  format: string;
  platform?: string | undefined;
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
  context?: AiContext | null | undefined;
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
  const contextBlock = buildContextBlock(input.context);
  const result = await chat({
    temperature: 0.8,
    maxTokens: input.maxTokens ?? 600,
    apiKey: input.apiKey,
    messages: [
      {
        role: "system",
        content:
          "You are a senior social media strategist. Draft a caption that is concise, on-brand, and platform-appropriate. Return ONLY the caption text — no preamble, no quotes, no explanation. The user is a planner at a social-media agency; they will review and edit before publishing.",
      },
      {
        role: "user",
        content: [
          `Title: ${input.title}`,
          `Format: ${input.format}`,
          input.platform ? `Platform: ${input.platform}` : null,
          input.audience ? `Audience: ${input.audience}` : null,
          `Brief: ${input.brief || "(none)"}`,
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (result) input.onUsage?.(result);
  return result?.content ?? null;
}

/**
 * Tighten a brief into a format-specific structure. Returns a
 * single string that contains THREE variants separated by the
 * `VARIANT_SEPARATOR` marker. Callers that want a single draft
 * (e.g. the platform_adaptation flow) can use `splitVariants()`
 * and take the first element; the planner surface renders all
 * three side-by-side.
 *
 * Each variant is intentionally distinct in tone or hook so the
 * planner can pick instead of having to "Try again" until the
 * model produces something they like. The system prompt is
 * format-aware — a Reel brief is structured very differently
 * from a carousel brief, and a single static-post-shaped
 * template produces poor output for non-static formats.
 *
 * The "drafts only — never write to the DB" rule from §15 still
 * holds: this function returns text; saving is the caller's job.
 */
export async function improveBrief(input: {
  title: string;
  brief: string;
  format: string;
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
  context?: AiContext | null | undefined;
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
  const contextBlock = buildContextBlock(input.context);
  const result = await chat({
    temperature: 0.7,
    maxTokens: input.maxTokens ?? 900,
    apiKey: input.apiKey,
    messages: [
      {
        role: "system",
        content: buildImproveBriefSystemPrompt(input.format),
      },
      {
        role: "user",
        content: [
          `Title: ${input.title}`,
          `Format: ${input.format}`,
          input.audience ? `Audience: ${input.audience}` : null,
          `Brief: ${input.brief || "(empty)"}`,
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (result) input.onUsage?.(result);
  return result?.content ?? null;
}

/**
 * Score a brief on a 0-100 readiness scale and list the missing
 * pieces. The human-readable form is meant to be copied into the
 * "More details" disclosure on the content detail page so the planner
 * can see what to fix before creative handoff.
 */
export async function checkCompleteness(input: {
  title: string;
  brief: string;
  format: string;
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
  context?: AiContext | null | undefined;
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
  const contextBlock = buildContextBlock(input.context);
  const result = await chat({
    temperature: 0.3,
    maxTokens: input.maxTokens ?? 500,
    apiKey: input.apiKey,
    messages: [
      {
        role: "system",
        content:
          "You are a creative director reviewing a social-media brief. Return a two-line report: " +
          "'Score: NN' (0-100) and 'Missing: ...' (comma-separated list of the missing pieces from " +
          "Hook, Main message, CTA, Audience, Hashtags, References, Scenes, Captions). If the brief is complete, " +
          "write 'Score: 100' and 'Missing: none'. Plain text, no markdown, no preamble.",
      },
      {
        role: "user",
        content: [
          `Title: ${input.title}`,
          `Format: ${input.format}`,
          input.audience ? `Audience: ${input.audience}` : null,
          `Brief: ${input.brief || "(empty)"}`,
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (result) input.onUsage?.(result);
  return result?.content ?? null;
}

/**
 * FEAT-03 (GAP-FULL-REVIEW-2026-08-25) — three prompt builders that
 * close out the §15 capability set. Pre-fix, `/api/ai/generate`
 * returned 501 for `platform_adaptation`, `campaign_ideas`, and
 * `related_format_ideas`; the agency settings page advertised them
 * and they failed at runtime. These three new exports mirror the
 * shape of `draftCaption` / `improveBrief` / `checkCompleteness` so
 * the route's existing `switch` can wire them without changes
 * beyond removing the 501 early-return.
 */

/**
 * Adapt a draft caption to the conventions of a target social
 * platform (e.g. Twitter's character economy, LinkedIn's
 * first-line-as-hook norm, TikTok's 6-second spoken intro).
 */
export async function platformAdapt(input: {
  title: string;
  brief: string;
  format: string;
  sourceText: string;
  targetPlatform: string;
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
  context?: AiContext | null | undefined;
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
  const contextBlock = buildContextBlock(input.context);
  const result = await chat({
    temperature: 0.7,
    maxTokens: input.maxTokens ?? 600,
    apiKey: input.apiKey,
    messages: [
      {
        role: "system",
        content:
          "You are a senior social media strategist. Adapt the user's draft caption to the conventions of the target platform. " +
          "Preserve the underlying message; rewrite length, tone, hook placement, hashtag density, and CTA phrasing to fit the platform. " +
          "Return ONLY the adapted caption — no preamble, no quotes, no explanation. If the target is X / Twitter, " +
          "keep the rewrite under 280 characters and front-load the hook. If LinkedIn, lead with a one-line insight and use " +
          "short paragraphs. If TikTok / Reels, write for spoken delivery (short sentences, second-person). If Instagram, " +
          "front-load the first 125 characters (the 'see more' cutoff).",
      },
      {
        role: "user",
        content: [
          `Title: ${input.title}`,
          `Format: ${input.format}`,
          input.audience ? `Audience: ${input.audience}` : null,
          `Brief: ${input.brief || "(none)"}`,
          `Target platform: ${input.targetPlatform}`,
          `Source caption:\n${input.sourceText || "(empty)"}`,
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (result) input.onUsage?.(result);
  return result?.content ?? null;
}

/**
 * Generate a short list of campaign ideas (3-5) that align with a
 * workspace's current brief. Each idea is a single line: a name and
 * a one-sentence angle.
 */
export async function campaignIdeas(input: {
  title: string;
  brief: string;
  format: string;
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
  context?: AiContext | null | undefined;
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
  const contextBlock = buildContextBlock(input.context);
  const result = await chat({
    temperature: 0.8,
    maxTokens: input.maxTokens ?? 600,
    apiKey: input.apiKey,
    messages: [
      {
        role: "system",
        content:
          "You are a senior social media strategist. Generate 3-5 campaign ideas that ladder up to the planner's brief. " +
          "Each idea is exactly one line in the format: 'Name — <one-sentence angle>'. Ideas should be distinct in tone or hook, " +
          "and each should be plausibly executable by a single content team in a week. Return ONLY the bullet list, no preamble, " +
          "no markdown, no labels. Use a leading dash + space for each bullet.",
      },
      {
        role: "user",
        content: [
          `Title: ${input.title}`,
          `Format: ${input.format}`,
          input.audience ? `Audience: ${input.audience}` : null,
          `Brief: ${input.brief || "(none)"}`,
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (result) input.onUsage?.(result);
  return result?.content ?? null;
}

/**
 * Suggest formats that pair well with the planner's current brief —
 * the §15 "related format ideas" capability. Returns 3-5 suggestions,
 * each on its own line: 'Format — <why it pairs>'. Limited to the 8
 * content_format enum values so the UI can render the result as a
 * jump-off to a new content item.
 */
export async function relatedFormatIdeas(input: {
  title: string;
  brief: string;
  format: string;
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
  context?: AiContext | null | undefined;
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
  const contextBlock = buildContextBlock(input.context);
  const result = await chat({
    temperature: 0.7,
    maxTokens: input.maxTokens ?? 500,
    apiKey: input.apiKey,
    messages: [
      {
        role: "system",
        content:
          "You are a senior social media strategist. Given the planner's current format and brief, suggest 3-5 related formats " +
          "from this fixed list: static_post, carousel, story, short_form_video, long_form_video, live_content, article, other. " +
          "Each line: 'format — <one-sentence reason it pairs>'. Skip the planner's current format. Return ONLY the bullet list, " +
          "no preamble, no markdown, no labels. Use a leading dash + space for each bullet.",
      },
      {
        role: "user",
        content: [
          `Title: ${input.title}`,
          `Current format: ${input.format}`,
          input.audience ? `Audience: ${input.audience}` : null,
          `Brief: ${input.brief || "(none)"}`,
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (result) input.onUsage?.(result);
  return result?.content ?? null;
}

/**
 * Brand Kit (Phase 8) — suggest new voice rules to add to a
 * workspace's brand kit. The function takes the existing tone /
 * do / don't rules and asks the model for 2-3 *new* rules in the
 * requested bucket that are consistent with the existing voice
 * but do not duplicate it.
 *
 * Each suggestion is returned as a single line (no bullets, no
 * numbers, no preamble) so the UI can render the array as
 * clickable chips without parsing. Length is bounded to the same
 * 60 / 280 char ceiling as `BrandVoiceRuleCommandSchema` so a
 * suggestion is always submittable as-is.
 */
export async function suggestVoiceRules(input: {
  ruleType: "tone" | "do" | "dont";
  existingTone: string[];
  existingDo: string[];
  existingDont: string[];
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
  context?: AiContext | null | undefined;
}): Promise<string[]> {
  if (!isAiEnabled() && !input.apiKey) return [];
  const contextBlock = buildContextBlock(input.context);
  const maxChars = input.ruleType === "tone" ? 60 : 280;
  const bucket = input.ruleType === "tone" ? "tone" : input.ruleType === "do" ? "do" : "don't";
  const system = [
    `You are a senior brand strategist. Suggest 2-3 new ${bucket} rules for a brand voice guide.`,
    `Each rule is a single line, no bullet, no number, no preamble. Max ${maxChars} chars per line.`,
    "Rules must be consistent with the existing voice but must NOT duplicate any rule already in the list.",
    "Plain text. Return exactly 2-3 lines and nothing else.",
  ].join(" ");
  const result = await chat({
    temperature: 0.7,
    maxTokens: input.maxTokens ?? 300,
    apiKey: input.apiKey,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          `Suggest ${bucket} rules.`,
          input.audience ? `Audience: ${input.audience}` : null,
          "Existing tone rules:",
          input.existingTone.length
            ? input.existingTone.map((t) => `- ${t}`).join("\n")
            : "(none yet)",
          "Existing do rules:",
          input.existingDo.length ? input.existingDo.map((t) => `- ${t}`).join("\n") : "(none yet)",
          "Existing don't rules:",
          input.existingDont.length
            ? input.existingDont.map((t) => `- ${t}`).join("\n")
            : "(none yet)",
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (!result?.content) return [];
  input.onUsage?.(result);
  return result.content
    .split("\n")
    .map((s) => s.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((s) => s.length > 0 && s.length <= maxChars);
}
