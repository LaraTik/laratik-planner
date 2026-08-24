import "server-only";
import { serverEnv } from "@/lib/validation/env";
import { loadManagedAiSecret, hasManagedAiSecret } from "./provider-secret";

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
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
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
 * Tighten a brief into a Hook → Main message → CTA structure.
 * Returns a multi-line rewrite the user can copy into the brief
 * field. Same "draft only — no DB write" rule as the rest of the
 * AI surface.
 */
export async function improveBrief(input: {
  title: string;
  brief: string;
  format: string;
  audience?: string | undefined;
  apiKey?: string | undefined;
  onUsage?: (result: ChatResult) => void;
  maxTokens?: number | undefined;
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
  const result = await chat({
    temperature: 0.6,
    maxTokens: input.maxTokens ?? 600,
    apiKey: input.apiKey,
    messages: [
      {
        role: "system",
        content:
          "You are a senior social media strategist. Rewrite the brief into three clear lines: " +
          "'Hook: ...' (one sentence that earns the scroll-stop), 'Main message: ...' (the single thing the audience should remember), " +
          "'CTA: ...' (the next action you want them to take). Use plain text — no markdown, no preamble, no labels other than the three line prefixes. " +
          "If the brief is empty, return a placeholder line for each so the user can fill them in.",
      },
      {
        role: "user",
        content: [
          `Title: ${input.title}`,
          `Format: ${input.format}`,
          input.audience ? `Audience: ${input.audience}` : null,
          `Brief: ${input.brief || "(empty)"}`,
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
}): Promise<string | null> {
  if (!isAiEnabled() && !input.apiKey) return null;
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
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  if (result) input.onUsage?.(result);
  return result?.content ?? null;
}
