import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const envValues: {
  AI_FEATURE_ENABLED: boolean;
  MINIMAX_API_KEY: string;
  MINIMAX_BASE_URL: string;
  MINIMAX_MODEL: string;
} = {
  AI_FEATURE_ENABLED: true,
  MINIMAX_API_KEY: "test-key",
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

function mockAnthropicSuccess(text: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text }],
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(() => {
  fetchMock.mockReset();
});

/**
 * FEAT-09 — pin the behavior changes to `improveBrief` and
 * `draftCaption` after the context + per-format + variants
 * refactor. The route at `api/ai/generate` depends on these
 * exact shapes: the route splits the response on `---` for
 * multi-variant capabilities, the audit log records the
 * categories the prompt actually included, and the prompt
 * builder must switch on `format` so a Reel brief doesn't
 * come back shaped like a static post.
 */
describe("FEAT-09 — improveBrief returns 3 variants", () => {
  it("returns a string the route can split on the --- separator", async () => {
    mockAnthropicSuccess(
      "Hook: First angle\nMain: First message\nCTA: First action\n---\nHook: Second angle\nMain: Second message\nCTA: Second action\n---\nHook: Third angle\nMain: Third message\nCTA: Third action",
    );
    const ai = await loadAi();
    const out = await ai.improveBrief({
      title: "Spring promo",
      brief: "We have a new spring promo",
      format: "static_post",
      apiKey: "test-key",
    });
    expect(out).toBeTruthy();
    const ai2 = await loadAi();
    const variants = ai2.splitVariants(out!);
    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatch(/First angle/);
    expect(variants[1]).toMatch(/Second angle/);
    expect(variants[2]).toMatch(/Third angle/);
  });

  it("splitVariants trims whitespace and drops empty pieces", async () => {
    const ai = await loadAi();
    const out = ai.splitVariants("\n  ---\n  A\n  \n---\n\n  B  \n---\n   \n");
    expect(out).toEqual(["A", "B"]);
  });

  it("splitVariants returns a single-element array when the separator is absent", async () => {
    const ai = await loadAi();
    const out = ai.splitVariants("Hook: x\nMain: y\nCTA: z");
    expect(out).toEqual(["Hook: x\nMain: y\nCTA: z"]);
  });
});

describe("FEAT-09 — per-format prompts differ", () => {
  it("uses the carousel shape when format is carousel", async () => {
    mockAnthropicSuccess("Slide 1 — A\nSlides 2–N — B\nFinal slide — C\n---\n---\n---");
    const ai = await loadAi();
    await ai.improveBrief({
      title: "Launch",
      brief: "Carousel about our launch",
      format: "carousel",
      apiKey: "test-key",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.system as string).toMatch(/Slide 1/);
    expect(body.system as string).toMatch(/Final slide/);
    // The static-post shape should NOT appear in a carousel prompt.
    expect(body.system as string).not.toMatch(/^'Hook: \.\.\.'/m);
  });

  it("uses the short_form_video shape when format is short_form_video", async () => {
    mockAnthropicSuccess("Hook (0-3s) — A\nBeats — B\nCTA — C\n---\n---\n---");
    const ai = await loadAi();
    await ai.improveBrief({
      title: "Reel",
      brief: "Quick reel about coffee",
      format: "short_form_video",
      apiKey: "test-key",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.system as string).toMatch(/Hook \(0-3s\)/);
    expect(body.system as string).toMatch(/Beats/);
  });

  it("uses the article shape when format is article", async () => {
    mockAnthropicSuccess("Headline — A\nLede — B\nTakeaways — C\nCTA — D\n---\n---\n---");
    const ai = await loadAi();
    await ai.improveBrief({
      title: "Post",
      brief: "Long-form article on the brand",
      format: "article",
      apiKey: "test-key",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.system as string).toMatch(/Headline/);
    expect(body.system as string).toMatch(/Lede/);
    expect(body.system as string).toMatch(/Takeaways/);
  });
});

describe("FEAT-09 — context block is included in the prompt when present", () => {
  it("appends the brand voice rules when context.brandVoice has data", async () => {
    mockAnthropicSuccess("Hook: A\nMain: B\nCTA: C\n---\n---\n---");
    const ai = await loadAi();
    await ai.improveBrief({
      title: "Promo",
      brief: "Spring promo",
      format: "static_post",
      apiKey: "test-key",
      context: {
        brandVoice: {
          tone: ["warm, never corporate"],
          do: ["lead with the customer"],
          dont: ["use jargon"],
        },
        campaign: null,
        pillars: [],
        channels: [],
        approvedContentSamples: [],
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user") as {
      content: string;
    };
    expect(userMessage.content).toContain("Context:");
    expect(userMessage.content).toContain("warm, never corporate");
    expect(userMessage.content).toContain("use jargon");
  });

  it("omits the context block when context is null", async () => {
    mockAnthropicSuccess("Hook: A\nMain: B\nCTA: C\n---\n---\n---");
    const ai = await loadAi();
    await ai.improveBrief({
      title: "Promo",
      brief: "Spring promo",
      format: "static_post",
      apiKey: "test-key",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user") as {
      content: string;
    };
    expect(userMessage.content).not.toContain("Context:");
  });

  it("omits the context block when every branch is empty", async () => {
    mockAnthropicSuccess("Hook: A\nMain: B\nCTA: C\n---\n---\n---");
    const ai = await loadAi();
    await ai.improveBrief({
      title: "Promo",
      brief: "Spring promo",
      format: "static_post",
      apiKey: "test-key",
      context: {
        brandVoice: { tone: [], do: [], dont: [] },
        campaign: null,
        pillars: [],
        channels: [],
        approvedContentSamples: [],
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user") as {
      content: string;
    };
    expect(userMessage.content).not.toContain("Context:");
  });

  it("includes the active campaign when context.campaign is set", async () => {
    mockAnthropicSuccess("Hook: A\nMain: B\nCTA: C\n---\n---\n---");
    const ai = await loadAi();
    await ai.improveBrief({
      title: "Promo",
      brief: "Spring promo",
      format: "static_post",
      apiKey: "test-key",
      context: {
        brandVoice: { tone: [], do: [], dont: [] },
        campaign: { name: "Spring 2026", objective: "drive trial signups", description: null },
        pillars: [],
        channels: [],
        approvedContentSamples: [],
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user") as {
      content: string;
    };
    expect(userMessage.content).toContain("Active campaign: Spring 2026");
    expect(userMessage.content).toContain("drive trial signups");
  });
});

describe("FEAT-09 — draftCaption also receives context", () => {
  it("appends the brand voice block to the caption prompt", async () => {
    mockAnthropicSuccess("Caption draft");
    const ai = await loadAi();
    await ai.draftCaption({
      title: "Promo",
      brief: "Spring promo",
      format: "static_post",
      apiKey: "test-key",
      context: {
        brandVoice: { tone: ["punchy"], do: [], dont: ["boring adjectives"] },
        campaign: null,
        pillars: [],
        channels: [],
        approvedContentSamples: [],
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user") as {
      content: string;
    };
    expect(userMessage.content).toContain("punchy");
    expect(userMessage.content).toContain("boring adjectives");
  });
});
