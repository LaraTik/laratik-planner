import { describe, expect, it } from "vitest";
import { publicProviderError } from "@/lib/security/public-error";

describe("public provider errors", () => {
  it("never exposes upstream bodies, credentials, or exception details", () => {
    const error = new Error("MiniMax 401: invalid api_key sk-secret upstream-body");
    expect(publicProviderError("ai", error)).toEqual({
      code: "provider_unavailable",
      message: "AI generation is temporarily unavailable. Please try again.",
    });
  });
});
