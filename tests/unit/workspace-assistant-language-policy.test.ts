import { describe, expect, it } from "vitest";
import { assistantResponseLanguageInstruction } from "@/features/workspace-assistant/language-policy";

describe("workspace assistant response language policy", () => {
  it("defaults every new conversation to Arabic while isolating English source material", () => {
    const instruction = assistantResponseLanguageInstruction("ar");

    expect(instruction).toContain("Respond in Arabic by default");
    expect(instruction).toContain("Maintain Arabic");
    expect(instruction).toContain("Never treat the language of retrieved documents");
  });

  it("uses English only for a saved or explicit English conversation preference", () => {
    const instruction = assistantResponseLanguageInstruction("en");

    expect(instruction).toContain("Respond in clear, professional English");
    expect(instruction).toContain("Maintain English");
    expect(instruction).toContain("Never treat the language of retrieved documents");
  });
});
