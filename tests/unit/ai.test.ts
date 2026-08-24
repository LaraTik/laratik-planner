import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const envValues: {
  AI_FEATURE_ENABLED: boolean;
  MINIMAX_API_KEY: string;
  MINIMAX_BASE_URL: string;
  MINIMAX_MODEL: string;
} = {
  AI_FEATURE_ENABLED: false,
  MINIMAX_API_KEY: "",
  MINIMAX_BASE_URL: "https://api.example.com",
  MINIMAX_MODEL: "MiniMax-M3-test",
};

vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy(
    {},
    {
      get: (_, key: string) => (envValues as Record<string, unknown>)[key],
    },
  ),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

async function loadAi() {
  return await import("@/lib/ai");
}

describe("isAiEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
    envValues.AI_FEATURE_ENABLED = false;
    envValues.MINIMAX_API_KEY = "";
  });

  it("returns false when the feature flag is off", async () => {
    const ai = await loadAi();
    envValues.AI_FEATURE_ENABLED = false;
    envValues.MINIMAX_API_KEY = "sk-1234";
    expect(ai.isAiEnabled()).toBe(false);
  });

  it("returns false when the API key is missing", async () => {
    const ai = await loadAi();
    envValues.AI_FEATURE_ENABLED = true;
    envValues.MINIMAX_API_KEY = "";
    expect(ai.isAiEnabled()).toBe(false);
  });

  it("returns true only when both flag and key are present", async () => {
    const ai = await loadAi();
    envValues.AI_FEATURE_ENABLED = true;
    envValues.MINIMAX_API_KEY = "sk-1234";
    expect(ai.isAiEnabled()).toBe(true);
  });
});

describe("chat", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    envValues.AI_FEATURE_ENABLED = true;
    envValues.MINIMAX_API_KEY = "sk-1234";
    envValues.MINIMAX_BASE_URL = "https://api.example.com/";
    envValues.MINIMAX_MODEL = "MiniMax-M3-test";
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("returns null without calling fetch when AI is disabled", async () => {
    envValues.AI_FEATURE_ENABLED = false;
    const ai = await loadAi();
    const result = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the configured base URL with the expected headers and body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "hello" }],
        usage: { input_tokens: 5, output_tokens: 2 },
      }),
    });
    const ai = await loadAi();
    await ai.chat({
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "say hi" },
      ],
      maxTokens: 200,
      temperature: 0.4,
      apiKey: "sk-1234",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-1234");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "MiniMax-M3-test",
      max_tokens: 200,
      temperature: 0.4,
      system: "be terse",
    });
    // system message should be removed from the messages array.
    expect(body.messages).toEqual([{ role: "user", content: "say hi" }]);
  });

  it("parses the response into a ChatResult with joined text + token counts", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: "text", text: "Part one. " },
          { type: "tool_use", text: "ignored" },
          { type: "text", text: "Part two." },
        ],
        usage: { input_tokens: 11, output_tokens: 22 },
      }),
    });
    const ai = await loadAi();
    const result = await ai.chat({
      messages: [{ role: "user", content: "go" }],
      apiKey: "sk-1234",
    });
    expect(result).toEqual({
      content: "Part one. Part two.",
      inputTokens: 11,
      outputTokens: 22,
      model: "MiniMax-M3-test",
    });
  });

  it("throws when the API responds non-2xx (no silent swallow)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "upstream broke",
    });
    const ai = await loadAi();
    await expect(
      ai.chat({ messages: [{ role: "user", content: "go" }], apiKey: "sk-1234" }),
    ).rejects.toThrow(/MiniMax API error: 500/);
  });

  it("defaults maxTokens to 1024 and temperature to 0.7 when not given", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [], usage: {} }),
    });
    const ai = await loadAi();
    await ai.chat({
      messages: [{ role: "user", content: "go" }],
      apiKey: "sk-1234",
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0.7);
  });
});

describe("draftCaption", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    envValues.AI_FEATURE_ENABLED = true;
    envValues.MINIMAX_API_KEY = "sk-1234";
  });

  it("returns null when AI is disabled", async () => {
    envValues.AI_FEATURE_ENABLED = false;
    const ai = await loadAi();
    const result = await ai.draftCaption({ title: "Drop teaser", brief: "", format: "reel" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds a system + user prompt and returns the joined text", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "Caption draft" }],
        usage: { input_tokens: 9, output_tokens: 4 },
      }),
    });
    const ai = await loadAi();
    const result = await ai.draftCaption({
      title: "Spring drop",
      brief: "Tease the launch",
      format: "reel",
      platform: "instagram",
      audience: "Gen Z creators",
      apiKey: "sk-1234",
    });
    expect(result).toBe("Caption draft");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.system).toMatch(/senior social media strategist/);
    const userMsg = body.messages[0];
    expect(userMsg.content).toContain("Title: Spring drop");
    expect(userMsg.content).toContain("Format: reel");
    expect(userMsg.content).toContain("Platform: instagram");
    expect(userMsg.content).toContain("Audience: Gen Z creators");
    expect(userMsg.content).toContain("Brief: Tease the launch");
  });

  it("honors the entitlement token ceiling and reports provider usage", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "Caption draft" }],
        usage: { input_tokens: 19, output_tokens: 7 },
      }),
    });
    const onUsage = vi.fn();
    const ai = await loadAi();
    await ai.draftCaption({
      title: "Launch",
      brief: "Announce it",
      format: "reel",
      maxTokens: 123,
      onUsage,
      apiKey: "sk-1234",
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(123);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 19, outputTokens: 7 }),
    );
  });

  it("substitutes '(none)' for an empty brief and omits platform/audience when missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "x" }] }),
    });
    const ai = await loadAi();
    await ai.draftCaption({ title: "x", brief: "", format: "static_post", apiKey: "sk-1234" });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const userMsg = body.messages[0];
    expect(userMsg.content).toContain("Brief: (none)");
    expect(userMsg.content).not.toContain("Platform:");
    expect(userMsg.content).not.toContain("Audience:");
  });
});

describe("improveBrief", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    envValues.AI_FEATURE_ENABLED = true;
    envValues.MINIMAX_API_KEY = "sk-1234";
  });

  it("returns null when AI is disabled", async () => {
    envValues.AI_FEATURE_ENABLED = false;
    const ai = await loadAi();
    const result = await ai.improveBrief({ title: "Drop", brief: "x", format: "reel" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the Hook/Main/CTA prompt and returns the joined text", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "Hook: ...\nMain message: ...\nCTA: ..." }],
        usage: { input_tokens: 9, output_tokens: 4 },
      }),
    });
    const ai = await loadAi();
    const result = await ai.improveBrief({
      title: "Spring drop",
      brief: "Tease the launch",
      format: "reel",
      audience: "Gen Z creators",
      apiKey: "sk-1234",
    });
    expect(result).toMatch(/Hook:[\s\S]*Main message:[\s\S]*CTA:/);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.system).toMatch(/Hook:[\s\S]*Main message:[\s\S]*CTA:/);
    const userMsg = body.messages[0];
    expect(userMsg.content).toContain("Title: Spring drop");
    expect(userMsg.content).toContain("Format: reel");
    expect(userMsg.content).toContain("Audience: Gen Z creators");
    expect(userMsg.content).toContain("Brief: Tease the launch");
  });

  it("substitutes '(empty)' for an empty brief and omits audience when missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "x" }] }),
    });
    const ai = await loadAi();
    await ai.improveBrief({
      title: "x",
      brief: "",
      format: "static_post",
      apiKey: "sk-1234",
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const userMsg = body.messages[0];
    expect(userMsg.content).toContain("Brief: (empty)");
    expect(userMsg.content).not.toContain("Audience:");
  });
});

describe("checkCompleteness", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    envValues.AI_FEATURE_ENABLED = true;
    envValues.MINIMAX_API_KEY = "sk-1234";
  });

  it("returns null when AI is disabled", async () => {
    envValues.AI_FEATURE_ENABLED = false;
    const ai = await loadAi();
    const result = await ai.checkCompleteness({ title: "Drop", brief: "x", format: "reel" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the Score/Missing prompt and returns the joined text", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "Score: 80\nMissing: Hook, CTA" }],
        usage: { input_tokens: 9, output_tokens: 4 },
      }),
    });
    const ai = await loadAi();
    const result = await ai.checkCompleteness({
      title: "Spring drop",
      brief: "Tease the launch",
      format: "reel",
      audience: "Gen Z creators",
      apiKey: "sk-1234",
    });
    expect(result).toMatch(/Score: 80[\s\S]*Missing:/);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.system).toMatch(/Score:[\s\S]*Missing:/);
    const userMsg = body.messages[0];
    expect(userMsg.content).toContain("Title: Spring drop");
    expect(userMsg.content).toContain("Format: reel");
    expect(userMsg.content).toContain("Audience: Gen Z creators");
    expect(userMsg.content).toContain("Brief: Tease the launch");
  });

  it("substitutes '(empty)' for an empty brief and omits audience when missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "x" }] }),
    });
    const ai = await loadAi();
    await ai.checkCompleteness({
      title: "x",
      brief: "",
      format: "static_post",
      apiKey: "sk-1234",
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const userMsg = body.messages[0];
    expect(userMsg.content).toContain("Brief: (empty)");
    expect(userMsg.content).not.toContain("Audience:");
  });
});
