import { z } from "zod";

export type AgentToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type AgentContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type AgentMessage = {
  role: "user" | "assistant";
  content: string | AgentContentBlock[];
};

export type AgentToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AgentProviderResponse = {
  content: AgentContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
};

export type AgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  input: z.ZodType;
  maxOutputCharacters?: number;
  execute(input: unknown): Promise<unknown>;
};

export type AgentToolProvider = {
  complete(input: {
    system: string;
    messages: AgentMessage[];
    tools: AgentToolDescriptor[];
    signal?: AbortSignal;
  }): Promise<AgentProviderResponse>;
};

export type AgentToolActivity = (activity: {
  name: string;
  status: "started" | "completed" | "failed";
}) => void;

export type AgentToolConversationResult = {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
  toolNames: string[];
  evidenceIds: string[];
  rounds: number;
};

const DEFAULT_MAX_TOOL_ROUNDS = 3;
const DEFAULT_MAX_TOOL_CALLS = 8;
const DEFAULT_MAX_TOOL_OUTPUT_CHARACTERS = 12_000;

/**
 * Run a bounded, provider-neutral tool conversation. The provider only sees
 * the allowlisted tool descriptors passed by the calling feature. Every input
 * is validated again before execution and every result is size-limited before
 * being returned to the model.
 */
export async function runAgentToolConversation(input: {
  provider: AgentToolProvider;
  system: string;
  userMessage: string;
  tools: readonly AgentTool[];
  signal?: AbortSignal;
  onActivity?: AgentToolActivity;
  maxToolRounds?: number;
  maxToolCalls?: number;
}): Promise<AgentToolConversationResult> {
  const maxToolRounds = input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const maxToolCalls = input.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const registry = new Map(input.tools.map((tool) => [tool.name, tool]));
  if (registry.size !== input.tools.length) throw new Error("duplicate_agent_tool_name");
  const descriptors = input.tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
  const messages: AgentMessage[] = [{ role: "user", content: input.userMessage }];
  let inputTokens = 0;
  let outputTokens = 0;
  let hasInputUsage = false;
  let hasOutputUsage = false;
  let model = "";
  let callCount = 0;
  const usedTools: string[] = [];
  const evidenceIds = new Set<string>();

  for (let round = 0; round <= maxToolRounds; round += 1) {
    if (input.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    const response = await input.provider.complete({
      system: input.system,
      messages,
      tools: descriptors,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    model = response.model;
    if (response.inputTokens !== null) {
      inputTokens += response.inputTokens;
      hasInputUsage = true;
    }
    if (response.outputTokens !== null) {
      outputTokens += response.outputTokens;
      hasOutputUsage = true;
    }

    const toolCalls = response.content.filter(
      (block): block is Extract<AgentContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
    );
    if (toolCalls.length === 0) {
      const content = response.content
        .filter(
          (block): block is Extract<AgentContentBlock, { type: "text" }> => block.type === "text",
        )
        .map((block) => block.text)
        .join("")
        .trim();
      if (!content) throw new Error("empty_agent_response");
      return {
        content,
        inputTokens: hasInputUsage ? inputTokens : null,
        outputTokens: hasOutputUsage ? outputTokens : null,
        model,
        toolNames: usedTools,
        evidenceIds: [...evidenceIds],
        rounds: round + 1,
      };
    }

    messages.push({ role: "assistant", content: response.content });
    if (round === maxToolRounds) throw new Error("agent_tool_round_limit");
    const results: AgentContentBlock[] = [];
    for (const call of toolCalls) {
      callCount += 1;
      if (callCount > maxToolCalls) throw new Error("agent_tool_call_limit");
      const tool = registry.get(call.name);
      input.onActivity?.({ name: call.name, status: "started" });
      if (!tool) {
        input.onActivity?.({ name: call.name, status: "failed" });
        results.push(toolError(call.id, "unknown_tool", "Choose a tool from the available list."));
        continue;
      }
      try {
        const parsedInput = tool.input.parse(call.input);
        const result = await tool.execute(parsedInput);
        const serialized = JSON.stringify(result);
        const maximum = tool.maxOutputCharacters ?? DEFAULT_MAX_TOOL_OUTPUT_CHARACTERS;
        if (!serialized) throw new Error("tool_result_not_serializable");
        if (serialized.length > maximum) {
          results.push(
            toolError(call.id, "result_too_large", "Request a narrower result with smaller scope."),
          );
          input.onActivity?.({ name: call.name, status: "failed" });
          continue;
        }
        for (const id of collectEvidenceIds(result)) evidenceIds.add(id);
        results.push({ type: "tool_result", tool_use_id: call.id, content: serialized });
        usedTools.push(call.name);
        input.onActivity?.({ name: call.name, status: "completed" });
      } catch (error) {
        input.onActivity?.({ name: call.name, status: "failed" });
        const invalidInput = error instanceof z.ZodError;
        results.push(
          toolError(
            call.id,
            invalidInput ? "invalid_arguments" : "tool_failed",
            invalidInput
              ? "Arguments did not match the tool schema. Retry with valid arguments."
              : "The requested data could not be loaded. Continue without it or ask the user to retry.",
          ),
        );
      }
    }
    messages.push({ role: "user", content: results });
  }

  throw new Error("agent_tool_round_limit");
}

function collectEvidenceIds(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectEvidenceIds(item, depth + 1));
  const record = value as Record<string, unknown>;
  const own = [record.evidenceId, ...(Array.isArray(record.evidenceIds) ? record.evidenceIds : [])]
    .filter((item): item is string => typeof item === "string" && item.length <= 200)
    .slice(0, 50);
  return [
    ...own,
    ...Object.values(record).flatMap((item) => collectEvidenceIds(item, depth + 1)),
  ].slice(0, 100);
}

function toolError(id: string, code: string, message: string): AgentContentBlock {
  return {
    type: "tool_result",
    tool_use_id: id,
    is_error: true,
    content: JSON.stringify({ error: { code, message } }),
  };
}
