import { describe, expect, it } from "vitest";
import {
  AI_MODEL_REGISTRY,
  getAiModelDefinition,
  supportsAiReasoningEffort,
} from "@/lib/ai/model-registry";

describe("AI model capability registry", () => {
  it("declares only the application's configured MiniMax models", () => {
    expect(AI_MODEL_REGISTRY.map((model) => model.modelId)).toEqual([
      "MiniMax-M3",
      "MiniMax-M3.1-Flash",
    ]);
    expect(getAiModelDefinition("unregistered-model")).toBeNull();
  });

  it("gates reasoning and tool calling by model capability", () => {
    expect(getAiModelDefinition("MiniMax-M3")?.toolCalling).toBe(false);
    expect(supportsAiReasoningEffort("MiniMax-M3", undefined)).toBe(true);
    expect(supportsAiReasoningEffort("MiniMax-M3", "high")).toBe(false);
    expect(getAiModelDefinition("MiniMax-M3.1-Flash")?.toolCalling).toBe(true);
    expect(supportsAiReasoningEffort("MiniMax-M3.1-Flash", "xhigh")).toBe(true);
    expect(supportsAiReasoningEffort("MiniMax-M3.1-Flash", "ultra")).toBe(false);
  });
});
