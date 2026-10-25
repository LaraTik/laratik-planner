import "server-only";
import { serverEnv } from "@/lib/validation/env";
import type {
  AgentContentBlock,
  AgentProviderResponse,
  AgentToolDescriptor,
  AgentToolProvider,
} from "./tool-orchestrator";

type MiniMaxToolProviderOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max";
};

/** Server-only adapter for MiniMax's Anthropic-compatible tool-use endpoint. */
export function createMiniMaxToolProvider(options: MiniMaxToolProviderOptions): AgentToolProvider {
  return {
    async complete({ system, messages, tools, signal }): Promise<AgentProviderResponse> {
      const url = `${(options.baseUrl ?? serverEnv.MINIMAX_BASE_URL).replace(/\/$/, "")}/v1/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens ?? 1_200,
          ...(options.model === "MiniMax-M3.1-Flash" && options.reasoningEffort
            ? { output_config: { effort: options.reasoningEffort } }
            : {}),
          system,
          messages,
          tools: tools.map(toMiniMaxTool),
        }),
        ...(signal ? { signal } : {}),
      });
      // The provider body is deliberately not included: it can echo the
      // request, and this error is surfaced to callers. The status is
      // enough to tell a rejected request from an outage.
      if (!response.ok) throw new Error(`minimax_tool_request_failed_${response.status}`);
      const raw: unknown = await response.json().catch(() => null);
      return parseMiniMaxResponse(raw, options.model);
    },
  };
}

function toMiniMaxTool(tool: AgentToolDescriptor) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

function parseMiniMaxResponse(raw: unknown, requestedModel: string): AgentProviderResponse {
  if (!raw || typeof raw !== "object") throw new Error("minimax_tool_response_invalid");
  const response = raw as {
    content?: unknown;
    model?: unknown;
    stop_reason?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
  if (!Array.isArray(response.content)) throw new Error("minimax_tool_response_invalid");
  const content: AgentContentBlock[] = [];
  for (const block of response.content) {
    if (!block || typeof block !== "object") continue;
    const value = block as Record<string, unknown>;
    if (value.type === "text" && typeof value.text === "string") {
      content.push({ type: "text", text: value.text });
    } else if (
      value.type === "tool_use" &&
      typeof value.id === "string" &&
      typeof value.name === "string"
    ) {
      content.push({
        type: "tool_use",
        id: value.id,
        name: value.name,
        input: value.input,
      });
    }
  }
  const stopReason =
    response.stop_reason === "tool_use"
      ? "tool_use"
      : response.stop_reason === "max_tokens"
        ? "max_tokens"
        : response.stop_reason === "end_turn"
          ? "end_turn"
          : "other";
  return {
    content,
    stopReason,
    inputTokens: numericUsage(response.usage?.input_tokens),
    outputTokens: numericUsage(response.usage?.output_tokens),
    model: typeof response.model === "string" ? response.model : requestedModel,
  };
}

function numericUsage(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
