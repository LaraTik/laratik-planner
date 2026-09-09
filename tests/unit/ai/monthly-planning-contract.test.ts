import { describe, expect, it } from "vitest";
import manifest from "../../../docs/ai-planning/defaults/manifest.json";
import { PlanningInstructionPackManifestSchema } from "@/lib/ai/planning-contract";

describe("monthly planning default instruction pack", () => {
  it("has a valid structured manifest for every supplied source document", () => {
    const parsed = PlanningInstructionPackManifestSchema.parse(manifest);
    expect(parsed.sourceDocuments).toHaveLength(19);
    expect(parsed.requiredInputs).toEqual(
      expect.arrayContaining(["targetMonth", "monthlyObjective", "productionReality"]),
    );
    expect(parsed.riskHandling.conflictAction).toBe("pause_affected_decision");
  });

  it("keeps audience copy language separate from internal conversation language", () => {
    const parsed = PlanningInstructionPackManifestSchema.parse(manifest);
    expect(parsed.languageBehavior).toMatchObject({
      interface: "active_user_locale",
      internalConversation: "active_user_locale",
      audienceFacingCopy: "monthly_content_language",
    });
  });
});
