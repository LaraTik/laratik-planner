import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  runAgentToolConversation,
  type AgentProviderResponse,
  type AgentToolProvider,
} from "@/lib/ai/tool-orchestrator";

function response(input: Partial<AgentProviderResponse>): AgentProviderResponse {
  return {
    content: [{ type: "text", text: "done" }],
    stopReason: "end_turn",
    inputTokens: 3,
    outputTokens: 2,
    model: "test-model",
    ...input,
  };
}

function provider(responses: AgentProviderResponse[]) {
  const complete = vi.fn<AgentToolProvider["complete"]>().mockImplementation(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected_provider_call");
    return next;
  });
  return { complete } satisfies AgentToolProvider;
}

const echoTool = {
  name: "plan_get_summary",
  description: "Read the selected plan summary and its evidence reference.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  input: z.object({}).strict(),
  execute: vi.fn(async () => ({ count: 4, evidenceId: "plan-1" })),
};

describe("bounded AI tool orchestration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes only a registered, schema-valid tool and preserves usage across rounds", async () => {
    const toolProvider = provider([
      response({
        content: [{ type: "tool_use", id: "call-1", name: echoTool.name, input: {} }],
        stopReason: "tool_use",
        inputTokens: 5,
        outputTokens: 2,
      }),
      response({ content: [{ type: "text", text: "The plan has four items." }], inputTokens: 7 }),
    ]);
    const activity = vi.fn();

    const result = await runAgentToolConversation({
      provider: toolProvider,
      system: "Follow Planner policy.",
      userMessage: "Summarize the plan.",
      tools: [echoTool],
      onActivity: activity,
    });

    expect(result).toMatchObject({
      content: "The plan has four items.",
      inputTokens: 12,
      outputTokens: 4,
      toolNames: [echoTool.name],
      evidenceIds: ["plan-1"],
      rounds: 2,
    });
    expect(echoTool.execute).toHaveBeenCalledTimes(1);
    expect(toolProvider.complete).toHaveBeenCalledTimes(2);
    expect(toolProvider.complete.mock.calls[1]?.[0].messages.at(-1)).toMatchObject({
      role: "user",
      content: [
        expect.objectContaining({
          type: "tool_result",
          tool_use_id: "call-1",
          content: '{"count":4,"evidenceId":"plan-1"}',
        }),
      ],
    });
    expect(activity.mock.calls.map(([event]) => event.status)).toEqual(["started", "completed"]);
  });

  it("returns a recoverable error for unknown tools without executing arbitrary names", async () => {
    const toolProvider = provider([
      response({
        content: [{ type: "tool_use", id: "call-unknown", name: "database_query", input: {} }],
        stopReason: "tool_use",
      }),
      response({ content: [{ type: "text", text: "I could not access that data." }] }),
    ]);

    const result = await runAgentToolConversation({
      provider: toolProvider,
      system: "Follow policy.",
      userMessage: "Inspect my workspace.",
      tools: [echoTool],
    });

    expect(result.toolNames).toEqual([]);
    expect(echoTool.execute).not.toHaveBeenCalled();
    expect(toolProvider.complete.mock.calls[1]?.[0].messages.at(-1)).toMatchObject({
      content: [
        expect.objectContaining({
          is_error: true,
          content: expect.stringContaining("unknown_tool"),
        }),
      ],
    });
  });

  it("does not invoke a tool when its arguments fail the server schema", async () => {
    const tool = {
      ...echoTool,
      input: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict(),
      inputSchema: { type: "object", required: ["month"] },
    };
    const toolProvider = provider([
      response({
        content: [
          { type: "tool_use", id: "call-invalid", name: tool.name, input: { month: "Nov" } },
        ],
        stopReason: "tool_use",
      }),
      response({ content: [{ type: "text", text: "Please choose a month in YYYY-MM format." }] }),
    ]);

    await runAgentToolConversation({
      provider: toolProvider,
      system: "Follow policy.",
      userMessage: "Review November.",
      tools: [tool],
    });

    expect(tool.execute).not.toHaveBeenCalled();
    expect(toolProvider.complete.mock.calls[1]?.[0].messages.at(-1)).toMatchObject({
      content: [
        expect.objectContaining({
          is_error: true,
          content: expect.stringContaining("invalid_arguments"),
        }),
      ],
    });
  });

  it("stops at the configured round and call limits", async () => {
    const roundProvider = provider([
      response({
        content: [{ type: "tool_use", id: "call-1", name: echoTool.name, input: {} }],
        stopReason: "tool_use",
      }),
      response({
        content: [{ type: "tool_use", id: "call-2", name: echoTool.name, input: {} }],
        stopReason: "tool_use",
      }),
    ]);
    await expect(
      runAgentToolConversation({
        provider: roundProvider,
        system: "policy",
        userMessage: "read",
        tools: [echoTool],
        maxToolRounds: 1,
      }),
    ).rejects.toThrow("agent_tool_round_limit");

    const callProvider = provider([
      response({
        content: [
          { type: "tool_use", id: "call-1", name: echoTool.name, input: {} },
          { type: "tool_use", id: "call-2", name: echoTool.name, input: {} },
        ],
        stopReason: "tool_use",
      }),
    ]);
    await expect(
      runAgentToolConversation({
        provider: callProvider,
        system: "policy",
        userMessage: "read",
        tools: [echoTool],
        maxToolCalls: 1,
      }),
    ).rejects.toThrow("agent_tool_call_limit");
  });

  it("bounds serialized tool output before returning it to the provider", async () => {
    const largeTool = {
      ...echoTool,
      maxOutputCharacters: 10,
      execute: vi.fn(async () => "x".repeat(40)),
    };
    const toolProvider = provider([
      response({
        content: [{ type: "tool_use", id: "call-1", name: largeTool.name, input: {} }],
        stopReason: "tool_use",
      }),
      response({ content: [{ type: "text", text: "The result was too large to load." }] }),
    ]);
    await runAgentToolConversation({
      provider: toolProvider,
      system: "policy",
      userMessage: "read",
      tools: [largeTool],
    });
    expect(toolProvider.complete.mock.calls[1]?.[0].messages.at(-1)).toMatchObject({
      content: [
        expect.objectContaining({
          is_error: true,
          content: expect.stringContaining("result_too_large"),
        }),
      ],
    });
  });
});
