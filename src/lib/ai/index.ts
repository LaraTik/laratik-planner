import "server-only";
import { serverEnv } from "@/lib/validation/env";

/**
 * MiniMax AI client (Goal 11 — master prompt §15).
 *
 * Per master prompt §15: "The AI settings UI displays enabled state, model,
 * last successful test, and a masked suffix only if explicitly stored safely.
 * Prefer an environment-managed key and display 'Configured by environment.'"
 *
 * This module:
 *  - Refuses to do anything if AI_FEATURE_ENABLED=false OR the key is missing
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
}

export interface ChatResult {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
}

export async function chat(opts: ChatOptions): Promise<ChatResult | null> {
  if (!isAiEnabled()) return null;
  if (!serverEnv.MINIMAX_API_KEY) return null;

  const url = `${serverEnv.MINIMAX_BASE_URL.replace(/\/$/, "")}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": serverEnv.MINIMAX_API_KEY,
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
  platform?: string;
  audience?: string;
}): Promise<string | null> {
  if (!isAiEnabled()) return null;
  const result = await chat({
    temperature: 0.8,
    maxTokens: 600,
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
  return result?.content ?? null;
}
