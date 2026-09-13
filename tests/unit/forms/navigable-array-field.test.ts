import { describe, expect, it } from "vitest";
import {
  parseStructuredArrayPaste,
  type NavigableArrayColumn,
} from "@/components/forms/navigable-array-field";

const slideColumns: ReadonlyArray<NavigableArrayColumn> = [
  { key: "position", label: "#", kind: "number" },
  { key: "summary", label: "Summary", kind: "text" },
  { key: "visual", label: "Visual", kind: "text", optional: true },
];

describe("parseStructuredArrayPaste", () => {
  it("turns one summary per line into normalized positioned rows", () => {
    expect(parseStructuredArrayPaste("Hook\nMain point\nCTA", slideColumns)).toEqual([
      { position: 1, summary: "Hook" },
      { position: 2, summary: "Main point" },
      { position: 3, summary: "CTA" },
    ]);
  });

  it("supports optional columns and ignores stale pasted positions", () => {
    expect(
      parseStructuredArrayPaste("8 | Hook | Close-up\n12 | Main point | Wide shot", slideColumns),
    ).toEqual([
      { position: 1, summary: "Hook", visual: "Close-up" },
      { position: 2, summary: "Main point", visual: "Wide shot" },
    ]);
  });

  it("drops blank lines and respects the configured row limit", () => {
    expect(parseStructuredArrayPaste("A\n\nB\nC", slideColumns, 2)).toEqual([
      { position: 1, summary: "A" },
      { position: 2, summary: "B" },
    ]);
  });
});
