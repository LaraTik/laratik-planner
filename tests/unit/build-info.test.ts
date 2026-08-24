import { describe, expect, it } from "vitest";
import { createBuildInfo } from "@/lib/build-info";

const SHA = "A1B2C3D4E5F678901234567890ABCDEF12345678";

describe("createBuildInfo", () => {
  it("normalizes a full Git SHA and creates the support-ready copy value", () => {
    expect(createBuildInfo({ version: SHA, environment: "production" })).toEqual({
      fullSha: SHA.toLowerCase(),
      shortSha: "a1b2c3d",
      environment: "production",
      environmentLabel: "Production",
      displayLabel: "Build a1b2c3d",
      copyText: `StudioFlow build: ${SHA.toLowerCase()} | Environment: production`,
    });
  });

  it.each(["latest", "dev", "unknown", "abc1234", "", "not-a-sha"])(
    "does not present %s as a production Git build",
    (version) => {
      const result = createBuildInfo({ version, environment: "production" });
      expect(result.fullSha).toBeNull();
      expect(result.shortSha).toBeNull();
      expect(result.displayLabel).toBe("Build unavailable");
      expect(result.copyText).toBe("StudioFlow build: unavailable | Environment: production");
    },
  );

  it("uses an explicit local-development fallback", () => {
    expect(createBuildInfo({ version: "dev", environment: "development" })).toMatchObject({
      fullSha: null,
      shortSha: null,
      environmentLabel: "Development",
      displayLabel: "Local development",
      copyText: "StudioFlow build: local | Environment: development",
    });
  });
});
