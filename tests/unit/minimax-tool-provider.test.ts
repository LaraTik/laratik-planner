import { afterEach, describe, expect, it, vi } from "vitest";
import { createMiniMaxToolProvider } from "@/lib/ai/minimax-tool-provider";

describe("MiniMax tool provider adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps the Anthropic-compatible tool response into the provider-neutral contract", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        content: [
          { type: "thinking", thinking: "private reasoning" },
          { type: "text", text: "I will inspect the plan." },
          { type: "tool_use", id: "toolu_1", name: "plan_get_summary", input: {} },
        ],
        stop_reason: "tool_use",
        model: "MiniMax-M3.1-Flash",
        usage: { input_tokens: 42, output_tokens: 12 },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const provider = createMiniMaxToolProvider({
      apiKey: "test-key",
      model: "MiniMax-M3.1-Flash",
      baseUrl: "https://minimax.example",
      reasoningEffort: "high",
    });

    const result = await provider.complete({
      system: "Use tools only when required.",
      messages: [{ role: "user", content: "Summarize this month's plan." }],
      tools: [
        {
          name: "plan_get_summary",
          description: "Read the selected month's plan summary.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    });

    expect(result).toEqual({
      content: [
        { type: "text", text: "I will inspect the plan." },
        { type: "tool_use", id: "toolu_1", name: "plan_get_summary", input: {} },
      ],
      stopReason: "tool_use",
      inputTokens: 42,
      outputTokens: 12,
      model: "MiniMax-M3.1-Flash",
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://minimax.example/v1/messages");
    expect(new Headers(init.headers).get("x-api-key")).toBe("test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "MiniMax-M3.1-Flash",
      output_config: { effort: "high" },
      messages: [{ role: "user", content: "Summarize this month's plan." }],
      tools: [{ name: "plan_get_summary", input_schema: { type: "object" } }],
    });
    expect(JSON.stringify(result)).not.toContain("private reasoning");
  });

  it("uses a stable generic failure for provider errors and rejects malformed output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("secret response text", { status: 403 })),
    );
    const provider = createMiniMaxToolProvider({
      apiKey: "test-key",
      model: "MiniMax-M3.1-Flash",
      baseUrl: "https://minimax.example",
    });
    await expect(provider.complete({ system: "policy", messages: [], tools: [] })).rejects.toThrow(
      "minimax_tool_request_failed_403",
    );
    await expect(
      provider.complete({ system: "policy", messages: [], tools: [] }),
    ).rejects.not.toThrow("secret response text");
  });
});
