import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("planning library user-facing labels", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "w", "[slug]", "library", "page.tsx"),
    "utf8",
  );

  it("localizes template formats through the shared format catalog", () => {
    expect(source).toContain("t(`planningFilters.formatLabels.${row.format}`)");
    expect(source).not.toContain("humanFormat(row.format)");
  });

  it("localizes campaign status instead of exposing the storage enum", () => {
    expect(source).toContain("t(`users.library.statusLabels.${row.status}`)");
    expect(source).not.toContain(">{row.status}</");
  });
});
