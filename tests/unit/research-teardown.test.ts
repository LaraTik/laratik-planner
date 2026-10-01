import { describe, expect, it } from "vitest";
import {
  hasAuthorizedTeardownSource,
  applyResearchTeardownToPayload,
  parseResearchTeardown,
  ResearchTeardownSchema,
  type ResearchTeardown,
} from "@/lib/research/teardown";

const validTeardown: ResearchTeardown = {
  schemaVersion: 1 as const,
  hook: "A direct question opens the first second.",
  promise: "The viewer will learn one concrete improvement.",
  format: "short_form_video",
  beats: [
    { label: "Hook", description: "Question on screen", startSecond: 0, endSecond: 2 },
    { label: "Proof", description: "The creator demonstrates the change", startSecond: 2 },
  ],
  pacing: "Fast opening, one proof beat, then a short close.",
  callToAction: "Save this for the next edit.",
  evidence: [
    { field: "hook", observation: "The question appears immediately.", source: "Transcript 0–2s" },
  ],
  uncertainty: ["Exact visual framing was not available in the supplied notes."],
};

describe("research teardown contract", () => {
  it("accepts only explicit source evidence", () => {
    expect(
      hasAuthorizedTeardownSource({
        kind: "planner_notes",
        notes: "Transcript and editor notes supplied by the planner.",
      }),
    ).toBe(true);
    expect(
      hasAuthorizedTeardownSource({ kind: "permalink", url: "https://example.test/video" }),
    ).toBe(false);
  });

  it("parses a JSON response wrapped in a model code fence", () => {
    const result = parseResearchTeardown(`\`\`\`json\n${JSON.stringify(validTeardown)}\n\`\`\``);
    expect(result).toEqual({ ok: true, data: validTeardown });
  });

  it("rejects malformed JSON and incomplete shapes", () => {
    expect(parseResearchTeardown("not json")).toEqual({ ok: false, error: "invalid_json" });
    expect(parseResearchTeardown(JSON.stringify({ schemaVersion: 1 }))).toEqual({
      ok: false,
      error: "invalid_shape",
    });
  });

  it("keeps the output shape compatible with the shared schema", () => {
    expect(ResearchTeardownSchema.safeParse(validTeardown).success).toBe(true);
  });

  it("fills only blank format fields and preserves existing planner copy", () => {
    const result = applyResearchTeardownToPayload({
      format: "short_form_video",
      current: { schemaVersion: 1, hook: "Planner-owned hook" },
      teardown: validTeardown,
    });

    expect(result.fields).toEqual(["mainMessage", "callToAction", "scenes", "additionalNotes"]);
    expect(result.payload.hook).toBe("Planner-owned hook");
    expect(result.payload.mainMessage).toBe(validTeardown.promise);
    expect(result.payload.scenes).toHaveLength(2);
  });
});
