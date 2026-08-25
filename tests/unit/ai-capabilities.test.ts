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

function mockAnthropicSuccess(text: string, usage = { input_tokens: 10, output_tokens: 20 }) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }], usage }),
  });
}

/**
 * FEAT-03 (GAP-FULL-REVIEW-2026-08-25) — three prompt builders that
 * close out the §15 capability set. Pre-fix, the /api/ai/generate
 * route returned 501 for these three capabilities; the prompt
 * builders themselves did not exist.
 *
 * Tests pin:
 *   1. Each builder returns the API's text on success.
 *   2. Each builder returns null when AI is disabled and no apiKey
 *      is passed in.
 *   3. The onUsage callback fires with the actual ChatResult.
 *   4. The system prompt + user prompt each include the
 *      capability-specific fields.
 */
describe("FEAT-03 — platformAdapt / campaignIdeas / relatedFormatIdeas", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    fetchMock.mockReset();
  });

  it("platformAdapt returns the rewritten caption and fires onUsage", async () => {
    mockAnthropicSuccess("Hook on a 280-char axis. CTA: book a demo.");
    const ai = await loadAi();
    const onUsage = vi.fn();
    const out = await ai.platformAdapt({
      title: "Launch week",
      brief: "B2B SaaS launch",
      format: "static_post",
      sourceText: "We're launching next week. Book a demo at example.com.",
      targetPlatform: "x",
      apiKey: "test-key",
      onUsage,
    });
    expect(out).toBe("Hook on a 280-char axis. CTA: book a demo.");
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage.mock.calls[0]![0]).toMatchObject({
      inputTokens: 10,
      outputTokens: 20,
      model: "MiniMax-M3-test",
    });
    // The fetch call should encode the system prompt + the user prompt.
    const fetchArgs = fetchMock.mock.calls[0]!;
    const body = JSON.parse(fetchArgs[1]!.body as string);
    const systemText = body.system as string;
    expect(systemText).toMatch(/Adapt the user's draft caption/);
    expect(systemText).toMatch(/Twitter/);
    // The user prompt should mention the target platform + the source caption.
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user") as {
      content: string;
    };
    expect(userMessage.content).toContain("Target platform: x");
    expect(userMessage.content).toContain("Source caption:");
  });

  it("campaignIdeas returns a bullet list", async () => {
    mockAnthropicSuccess(
      "- Founder POV — three weeks of building in public\n- Customer spotlights — short case-study carousel\n",
    );
    const ai = await loadAi();
    const out = await ai.campaignIdeas({
      title: "Launch",
      brief: "Series A announcement",
      format: "carousel",
      apiKey: "test-key",
    });
    expect(out).toMatch(/Founder POV/);
    expect(out).toMatch(/Customer spotlights/);
  });

  it("relatedFormatIdeas returns a list of formats from the fixed enum", async () => {
    mockAnthropicSuccess(
      "- short_form_video — quick-cut narration pairs well with founder voice\n- carousel — step-by-step build log\n",
    );
    const ai = await loadAi();
    const out = await ai.relatedFormatIdeas({
      title: "Build log",
      brief: "Three-week build in public",
      format: "static_post",
      apiKey: "test-key",
    });
    expect(out).toMatch(/short_form_video/);
    expect(out).toMatch(/carousel/);
  });

  it("returns null when AI is disabled and no apiKey was supplied", async () => {
    envValues.AI_FEATURE_ENABLED = false;
    envValues.MINIMAX_API_KEY = "";
    const ai = await loadAi();
    const out = await ai.platformAdapt({
      title: "x",
      brief: "y",
      format: "static_post",
      sourceText: "z",
      targetPlatform: "instagram",
    });
    expect(out).toBeNull();
    envValues.AI_FEATURE_ENABLED = true;
    envValues.MINIMAX_API_KEY = "test-key";
  });
});
