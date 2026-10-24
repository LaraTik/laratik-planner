import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ASSISTANT_PROMPTS,
  getBuiltInAssistantPrompt,
  getBuiltInAssistantPrompts,
} from "@/features/workspace-assistant/prompts";

describe("workspace assistant built-in prompt library", () => {
  it("has a reusable catalog with name, purpose, goal, instructions, and tags in both locales", () => {
    expect(BUILT_IN_ASSISTANT_PROMPTS.length).toBeGreaterThanOrEqual(20);
    expect(getBuiltInAssistantPrompts("en")).toHaveLength(BUILT_IN_ASSISTANT_PROMPTS.length);
    expect(getBuiltInAssistantPrompts("ar")).toHaveLength(BUILT_IN_ASSISTANT_PROMPTS.length);

    for (const localized of BUILT_IN_ASSISTANT_PROMPTS) {
      expect(localized.en.id).toBe(localized.ar.id);
      for (const prompt of [localized.en, localized.ar]) {
        expect(prompt.name.trim()).not.toBe("");
        expect(prompt.purpose.trim()).not.toBe("");
        expect(prompt.goal.trim()).not.toBe("");
        expect(prompt.instructions.trim()).not.toBe("");
        expect(prompt.tags.length).toBeGreaterThan(0);
      }
    }
  });

  it("localizes prompt execution instructions and falls back to English", () => {
    expect(getBuiltInAssistantPrompt("schedule-gap-review", "ar")?.instructions).toContain(
      "الفجوات",
    );
    expect(getBuiltInAssistantPrompt("schedule-gap-review", "fr")?.name).toBe("Find schedule gaps");
    expect(getBuiltInAssistantPrompt("unavailable", "en")).toBeNull();
  });

  it("offers a bilingual workload review grounded in assignments rather than guessed capacity", () => {
    expect(getBuiltInAssistantPrompt("team-workload-review", "en")?.instructions).toContain(
      "Do not infer available hours",
    );
    expect(getBuiltInAssistantPrompt("team-workload-review", "ar")?.instructions).toContain(
      "لا تستنتج ساعات العمل المتاحة",
    );
  });
});
