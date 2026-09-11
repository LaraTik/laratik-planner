import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("planning edit page localization", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "src",
      "app",
      "(app)",
      "app",
      "w",
      "[slug]",
      "planning",
      "edit",
      "[id]",
      "page.tsx",
    ),
    "utf8",
  );

  it("uses the shared localized back-to-planning label", () => {
    expect(source).toContain('t("contentDetail.copy.backToPlanning")');
    expect(source).not.toContain("Back to idea");
  });

  it("localizes frozen status values instead of exposing the enum", () => {
    expect(source).toContain("t(`planningFilters.statusLabels.${item.status}`)");
    expect(source).not.toContain("humanStatus(item.status)");
  });
});
