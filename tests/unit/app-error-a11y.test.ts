import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/(app)/error.tsx"), "utf8");

describe("app error boundary accessibility contract", () => {
  it("announces the app-wide failure as an assertive alert", () => {
    expect(source).toContain('data-testid="app-error-page"');
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-live="assertive"');
  });
});
