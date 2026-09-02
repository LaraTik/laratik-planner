import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(process.cwd(), "src/app");

const intentionalExceptions = new Set([
  "(app)/app/w/[slug]/settings/approvals/page.tsx",
  "(app)/app/w/[slug]/settings/defaults/page.tsx",
  "(app)/app/w/[slug]/settings/lead-times/page.tsx",
  "(app)/app/w/[slug]/settings/lifecycle/page.tsx",
  "(app)/app/w/[slug]/planning/[id]/publish/page.tsx",
]);

function collectPageFiles(directory: string, relativeDirectory = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

    if (entry.isDirectory()) return collectPageFiles(absolutePath, relativePath);
    return entry.name === "page.tsx" ? [relativePath] : [];
  });
}

describe("app route metadata coverage", () => {
  it("declares metadata for every page or documents a compatibility exception", () => {
    const pages = collectPageFiles(appRoot);
    const missing = pages.filter((relativePath) => {
      if (intentionalExceptions.has(relativePath)) return false;
      const source = readFileSync(resolve(appRoot, relativePath), "utf8");
      return !/export (?:async )?function generateMetadata|export const metadata/.test(source);
    });

    expect(missing).toEqual([]);
  });

  it("keeps the exception list limited to redirect or absorbed routes", () => {
    const pages = new Set(collectPageFiles(appRoot));
    for (const relativePath of intentionalExceptions) {
      expect(pages.has(relativePath), relativePath).toBe(true);
      const source = readFileSync(resolve(appRoot, relativePath), "utf8");
      expect(source, relativePath).toMatch(/redirect\(/);
    }
  });
});
