import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";

describe("safeCallbackUrl", () => {
  it("preserves a valid same-origin path and query", () => {
    expect(safeCallbackUrl("/app/workspaces?view=mine#recent")).toBe(
      "/app/workspaces?view=mine#recent",
    );
  });

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "\\\\evil.example/",
    "not-a-path",
    undefined,
  ])("falls back for an unsafe callback URL: %s", (value) => {
    expect(safeCallbackUrl(value)).toBe("/app");
  });
});
