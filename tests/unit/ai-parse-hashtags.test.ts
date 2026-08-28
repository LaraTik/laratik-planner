import { describe, expect, it } from "vitest";

import { parseHashtagsFromDraft } from "@/lib/ai/index";

describe("ai/parseHashtagsFromDraft", () => {
  it("parses a clean newline-separated list", () => {
    expect(parseHashtagsFromDraft("#spring\n#drop\n#new")).toEqual(["#spring", "#drop", "#new"]);
  });

  it("trims list markers (- * 1. ))", () => {
    expect(parseHashtagsFromDraft("- #spring\n* #drop\n1. #new\n) #launch")).toEqual([
      "#spring",
      "#drop",
      "#new",
      "#launch",
    ]);
  });

  it("drops lines that don't start with #", () => {
    expect(parseHashtagsFromDraft("#spring\nnot a tag\n#drop")).toEqual(["#spring", "#drop"]);
  });

  it("drops lines with only a single #", () => {
    expect(parseHashtagsFromDraft("#\n#spring\n#")).toEqual(["#spring"]);
  });

  it("drops lines longer than 31 chars (the per-format limit)", () => {
    const long = "#" + "x".repeat(40);
    expect(parseHashtagsFromDraft(`#spring\n${long}\n#drop`)).toEqual(["#spring", "#drop"]);
  });

  it("takes the first whitespace-delimited token on each line", () => {
    expect(parseHashtagsFromDraft("#spring count 5\n#drop — launch")).toEqual(["#spring", "#drop"]);
  });

  it("returns an empty array for empty / whitespace input", () => {
    expect(parseHashtagsFromDraft("")).toEqual([]);
    expect(parseHashtagsFromDraft("   \n\n   ")).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    expect(parseHashtagsFromDraft("#spring\r\n#drop")).toEqual(["#spring", "#drop"]);
  });
});
