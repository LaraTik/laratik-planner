import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(app)/app/a/[agencySlug]/w/[slug]/engagement/[[...section]]/page.tsx",
  ),
  "utf8",
);

describe("Community & Inbox setup routing", () => {
  it("redirects an enabled workspace away from the setup wizard", () => {
    expect(pageSource).toContain('if (currentSection === "setup" && access.workspaceEnabled) {');
    expect(pageSource).toContain("redirect(basePath);");
  });

  it("keeps setup available while the workspace is disabled", () => {
    expect(pageSource).toContain("!access.workspaceEnabled && access.agencyEnabled");
  });

  it("does not redirect enabled workspaces from operational sections", () => {
    expect(pageSource).toContain('currentSection !== "setup"');
  });
});
