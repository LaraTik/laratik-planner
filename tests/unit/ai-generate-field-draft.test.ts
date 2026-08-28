import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateFieldDraft, type FormatPayloadField } from "@/lib/ai/index";

/**
 * Unit tests for `generateFieldDraft` — the per-field
 * prompt builder used by the More details editor's
 * "Suggest with AI" button.
 *
 * The function calls `chat()` which uses `fetch` for the
 * provider transport. We replace the global `fetch`
 * with a stub via `vi.stubGlobal` so the test runs
 * offline; the stub is restored between tests.
 *
 * `serverEnv` is mocked via a Proxy so each property
 * read at call time sees the current value (test setup
 * can flip a value mid-test without re-importing the
 * module).
 */
vi.mock("server-only", () => ({}));

const envMock: Record<string, unknown> = vi.hoisted(() => ({}));
vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy(envMock, {
    get: (_t, key: string) => envMock[key],
  }),
}));

describe("ai/generateFieldDraft", () => {
  let originalFetch: typeof fetch;
  let fetchStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    envMock.AI_FEATURE_ENABLED = true;
    envMock.MINIMAX_API_KEY = "test-key";
    envMock.MINIMAX_BASE_URL = "https://api.example.com/anthropic";
    envMock.MINIMAX_MODEL = "MiniMax-M3";

    originalFetch = globalThis.fetch;
    fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "" }],
            usage: { input_tokens: 0, output_tokens: 0 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const k of Object.keys(envMock)) delete envMock[k];
  });

  function respondWith(text: string) {
    fetchStub.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
  }

  it("returns null when AI is disabled and no apiKey is supplied", async () => {
    envMock.MINIMAX_API_KEY = "";
    envMock.AI_FEATURE_ENABLED = false;
    const out = await generateFieldDraft({
      field: "caption",
      currentValue: "",
      title: "Spring drop",
      brief: "Reveal",
      format: "static_post",
    });
    expect(out).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("returns a text result for a plain text field", async () => {
    respondWith("Pre-order now — link in bio.");
    const out = await generateFieldDraft({
      field: "callToAction",
      currentValue: "",
      title: "Spring drop",
      brief: "Reveal",
      format: "static_post",
      apiKey: "test-key",
    });
    expect(out?.text).toBe("Pre-order now — link in bio.");
    expect(out?.parsed).toBeNull();
  });

  it("parses hashtags into a string[] when the field is hashtags", async () => {
    respondWith("#spring\n#drop\n#new");
    const out = await generateFieldDraft({
      field: "hashtags",
      currentValue: "",
      title: "Spring drop",
      brief: "Reveal",
      format: "static_post",
      apiKey: "test-key",
    });
    expect(out?.parsed).toEqual(["#spring", "#drop", "#new"]);
  });

  it("returns { text: '', parsed: null } when the model returns an empty draft", async () => {
    respondWith("   ");
    const out = await generateFieldDraft({
      field: "caption",
      currentValue: "",
      title: "x",
      brief: "x",
      format: "static_post",
      apiKey: "test-key",
    });
    expect(out).toEqual({ text: "", parsed: null });
  });

  it("rejects when fetch returns an error (the route catches)", async () => {
    fetchStub.mockImplementation(async () => new Response("boom", { status: 500 }));
    await expect(
      generateFieldDraft({
        field: "caption",
        currentValue: "",
        title: "x",
        brief: "x",
        format: "static_post",
        apiKey: "test-key",
      }),
    ).rejects.toThrow(/MiniMax API error/);
  });

  it("forwards the field name in the system + user message", async () => {
    let capturedSystem = "";
    let capturedUser = "";
    fetchStub.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const initObj = (init ?? {}) as { body?: string };
      const body = JSON.parse(initObj.body ?? "{}") as {
        system?: string;
        messages?: { role: string; content: string }[];
      };
      capturedSystem = body.system ?? "";
      const usr = (body.messages ?? []).find((m) => m.role === "user");
      if (usr) capturedUser = usr.content;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "draft" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await generateFieldDraft({
      field: "hook",
      currentValue: "",
      title: "Spring drop",
      brief: "Reveal",
      format: "static_post",
      apiKey: "test-key",
    });
    expect(capturedSystem).toMatch(/hook/i);
    expect(capturedUser).toMatch(/Field: hook/);
    expect(capturedUser).toMatch(/Title: Spring drop/);
  });

  it("forwards contentLanguage to the user message when set", async () => {
    let capturedUser = "";
    fetchStub.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const initObj = (init ?? {}) as { body?: string };
      const body = JSON.parse(initObj.body ?? "{}") as {
        messages?: { role: string; content: string }[];
      };
      const usr = (body.messages ?? []).find((m) => m.role === "user");
      if (usr) capturedUser = usr.content;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "draft" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await generateFieldDraft({
      field: "caption",
      currentValue: "",
      title: "Spring drop",
      brief: "Reveal",
      format: "static_post",
      contentLanguage: "ar",
      apiKey: "test-key",
    });
    expect(capturedUser).toMatch(/locale.*ar/i);
  });

  it("covers every documented field type without throwing", async () => {
    respondWith("ok");
    const fields: FormatPayloadField[] = [
      "caption",
      "hook",
      "mainMessage",
      "callToAction",
      "hashtags",
      "firstComment",
      "description",
      "visualDirection",
      "additionalNotes",
      "notes",
    ];
    for (const f of fields) {
      const out = await generateFieldDraft({
        field: f,
        currentValue: "",
        title: "x",
        brief: "x",
        format: "static_post",
        apiKey: "test-key",
      });
      expect(out).not.toBeNull();
    }
    expect(fetchStub).toHaveBeenCalledTimes(fields.length);
  });
});
