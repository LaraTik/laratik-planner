import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("setup route metadata", () => {
  it("resolves the page title through the active locale catalog", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/setup/page.tsx"), "utf8");

    expect(source).toMatch(/export async function generateMetadata/);
    expect(source).not.toMatch(/export const metadata\s*=\s*\{/);
  });
});
