import { describe, expect, it } from "vitest";
import { mergeAiDraftIntoBrief } from "@/lib/content/service";

/**
 * FEAT-04 (GAP-FULL-REVIEW-2026-08-25) — the AI Insert / Replace buttons
 * use this pure helper to assemble the new brief text before the
 * server action writes it. The merge contract is what the user sees in
 * the UI, so the test pins it explicitly:
 *  - `replace` overwrites.
 *  - `insert` appends below the existing brief with a blank line.
 *  - Empty inputs do not produce stray separators.
 *  - Output is capped at 2000 chars to match the brief column.
 */
describe("mergeAiDraftIntoBrief", () => {
  it("replaces the brief with the AI draft when mode=replace", () => {
    expect(mergeAiDraftIntoBrief("old text", "  fresh draft  ", "replace")).toBe("fresh draft");
  });

  it("appends the AI draft below the existing brief when mode=insert", () => {
    expect(mergeAiDraftIntoBrief("old text", "fresh draft", "insert")).toBe(
      "old text\n\nfresh draft",
    );
  });

  it("does not introduce a leading separator when the existing brief is empty", () => {
    expect(mergeAiDraftIntoBrief("", "fresh draft", "insert")).toBe("fresh draft");
  });

  it("does not introduce a trailing separator when the AI draft is empty", () => {
    expect(mergeAiDraftIntoBrief("old text", "   ", "insert")).toBe("old text");
  });

  it("trims whitespace from both sides of the inputs", () => {
    expect(mergeAiDraftIntoBrief("  old  ", "\n\nfresh\n\n", "insert")).toBe("old\n\nfresh");
  });

  it("caps the result at 2000 characters to match the brief column", () => {
    const huge = "a".repeat(3000);
    const out = mergeAiDraftIntoBrief("prefix", huge, "insert");
    expect(out.length).toBe(2000);
  });
});
