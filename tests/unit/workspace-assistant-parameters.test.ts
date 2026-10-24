import { describe, expect, it } from "vitest";
import {
  AssistantPromptParametersSchema,
  expandAssistantPromptTemplate,
  resolveAssistantPromptParameters,
} from "@/features/workspace-assistant/parameters";

describe("workspace assistant prompt parameters", () => {
  it("validates required text, month and reference parameters with defaults", () => {
    const definitions = [
      { key: "plan_month", type: "month", label: "Plan month", required: true },
      {
        key: "plan_reference",
        type: "content_reference",
        label: "Plan reference",
        required: false,
        defaultValue: "November plan",
      },
      { key: "audience", type: "text", label: "Audience", required: true },
    ];

    expect(
      resolveAssistantPromptParameters(definitions, {
        plan_month: "2026-11",
        audience: "Founders",
      }),
    ).toEqual({
      ok: true,
      definitions,
      values: {
        plan_month: "2026-11",
        plan_reference: "November plan",
        audience: "Founders",
      },
    });
  });

  it("rejects missing required values, invalid months and unknown keys", () => {
    const definitions = [{ key: "month", type: "month", label: "Month", required: true }];
    expect(resolveAssistantPromptParameters(definitions, {})).toMatchObject({
      ok: false,
      missing: ["month"],
    });
    expect(resolveAssistantPromptParameters(definitions, { month: "November" })).toEqual({
      ok: false,
    });
    expect(
      resolveAssistantPromptParameters(definitions, { month: "2026-11", extra: "value" }),
    ).toEqual({
      ok: false,
    });
  });

  it("rejects duplicate keys and invalid month defaults", () => {
    expect(
      AssistantPromptParametersSchema.safeParse([
        { key: "month", type: "month", label: "Month", required: false, defaultValue: "2026-13" },
        { key: "month", type: "text", label: "Again", required: false },
      ]).success,
    ).toBe(false);
  });

  it("expands only declared, resolved placeholders and preserves ordinary braces", () => {
    expect(
      expandAssistantPromptTemplate("Review {{month}} for {{audience}}", {
        month: "2026-11",
        audience: "Founders",
      }),
    ).toBe("Review 2026-11 for Founders");
    expect(expandAssistantPromptTemplate("Review {{unknown}}", {})).toBeNull();
    expect(expandAssistantPromptTemplate("JSON object { answer: true }", {})).toBe(
      "JSON object { answer: true }",
    );
  });
});
