import { describe, expect, it } from "vitest";
import { sanitizeAdvertisingMetadata } from "@/lib/advertising/connection-service";

describe("advertising persistence boundary", () => {
  it("removes credential-like keys and bounds provider metadata", () => {
    const result = sanitizeAdvertisingMetadata({
      id: "act_1",
      name: "Food Game",
      access_token: "must-not-persist",
      nested: { app_secret: "must-not-persist", status: "ACTIVE" },
      long: "x".repeat(700),
    });
    expect(result).toEqual({
      id: "act_1",
      name: "Food Game",
      nested: { status: "ACTIVE" },
      long: "x".repeat(500),
    });
    expect(JSON.stringify(result)).not.toContain("must-not-persist");
  });
});
