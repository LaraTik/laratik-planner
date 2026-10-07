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
      "a",
      "[agencySlug]",
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

  it("keeps the compatibility route on the full editor without status-lock copy", () => {
    expect(source).toContain('mode="all"');
    expect(source).not.toContain("UPDATEABLE_STATUSES");
    expect(source).not.toContain("humanStatus(item.status)");
  });
});
