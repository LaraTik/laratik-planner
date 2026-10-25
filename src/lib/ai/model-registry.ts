/**
 * Capabilities supported by Planner's configured MiniMax Anthropic-compatible
 * integration. This describes adapter compatibility, not subscription-key
 * eligibility or production account approval; those remain external UAT.
 */
export type AiModelId = "MiniMax-M3" | "MiniMax-M3.1-Flash";
export type AiReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AiModelDefinition = {
  providerId: "minimax";
  modelId: AiModelId;
  displayName: string;
  available: true;
  inputModalities: readonly ["text"];
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  reasoningEfforts: readonly AiReasoningEffort[];
  /**
   * Effort the server applies when the caller does not choose one.
   *
   * Reasoning-capable models spend part of the output budget on hidden
   * thinking before they emit an answer. Without a cap, a structured
   * response can consume the entire budget on thinking and return no
   * answer at all. `"low"` keeps the thinking overhead small while still
   * leaving room for the answer. `null` means the model has no reasoning
   * dimension to cap.
   */
  recommendedReasoningEffort: AiReasoningEffort | null;
  maxContextTokens: number | null;
  maxOutputTokens: number | null;
  suitableFor: readonly ("chat" | "planning" | "complex_analysis")[];
};

export const AI_MODEL_REGISTRY: readonly AiModelDefinition[] = [
  {
    providerId: "minimax",
    modelId: "MiniMax-M3",
    displayName: "MiniMax M3",
    available: true,
    inputModalities: ["text"],
    streaming: true,
    toolCalling: false,
    structuredOutput: false,
    reasoningEfforts: [],
    recommendedReasoningEffort: null,
    maxContextTokens: null,
    maxOutputTokens: null,
    suitableFor: ["chat", "planning"],
  },
  {
    providerId: "minimax",
    modelId: "MiniMax-M3.1-Flash",
    displayName: "MiniMax M3.1 Flash",
    available: true,
    inputModalities: ["text"],
    streaming: true,
    toolCalling: true,
    structuredOutput: false,
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    recommendedReasoningEffort: "low",
    maxContextTokens: null,
    maxOutputTokens: null,
    suitableFor: ["chat", "planning", "complex_analysis"],
  },
];

export function getAiModelDefinition(modelId: string | null | undefined) {
  return AI_MODEL_REGISTRY.find((model) => model.modelId === modelId) ?? null;
}

export function supportsAiReasoningEffort(
  modelId: string | null | undefined,
  effort: string | undefined,
): effort is AiReasoningEffort {
  if (!effort) return true;
  return Boolean(
    getAiModelDefinition(modelId)?.reasoningEfforts.includes(effort as AiReasoningEffort),
  );
}
