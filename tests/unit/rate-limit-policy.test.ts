import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { hashRateLimitSubject, rateLimitRuleFor } from "@/lib/security/rate-limit";

describe("rate-limit policy", () => {
  it("defines bounded limits for sensitive operations", () => {
    expect(rateLimitRuleFor("bootstrap")).toEqual({ limit: 5, windowSeconds: 900 });
    expect(rateLimitRuleFor("invitation_accept")).toEqual({ limit: 10, windowSeconds: 900 });
    expect(rateLimitRuleFor("ai_generation")).toEqual({ limit: 30, windowSeconds: 60 });
    expect(rateLimitRuleFor("magic_link_request")).toEqual({ limit: 5, windowSeconds: 3600 });
  });

  it("hashes normalized subjects with the application secret", () => {
    const expected = createHash("sha256").update("secret:person@example.com").digest("hex");
    expect(hashRateLimitSubject(" Person@Example.com ", "secret")).toBe(expected);
    expect(hashRateLimitSubject("person@example.com", "different-secret")).not.toBe(expected);
  });
});
