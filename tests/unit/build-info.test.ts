import { describe, expect, it } from "vitest";
import { createBuildInfo } from "@/lib/build-info";

const SHA = "A1B2C3D4E5F678901234567890ABCDEF12345678";

describe("createBuildInfo", () => {
  it("normalizes a full Git SHA and creates the support-ready copy value", () => {
    expect(createBuildInfo({ version: SHA, environment: "production" })).toEqual({
      fullSha: SHA.toLowerCase(),
      shortSha: "a1b2c3d",
      builtAt: null,
      builtAtLabel: null,
      environment: "production",
      environmentLabel: "Production",
      displayLabel: "Build a1b2c3d",
      detailsLabel: "Build a1b2c3d",
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
      builtAt: null,
      builtAtLabel: null,
      environmentLabel: "Development",
      displayLabel: "Local development",
      copyText: "StudioFlow build: local | Environment: development",
    });
  });

  it("surfaces the build-time stamp when an ISO 8601 UTC string is supplied", () => {
    const result = createBuildInfo({
      version: SHA,
      builtAt: "2026-09-25T09:42:11Z",
      environment: "production",
      locale: "en-US",
      timeZone: "UTC",
    });
    expect(result.builtAt).toBe("2026-09-25T09:42:11Z");
    expect(result.builtAtLabel).toBeTruthy();
    expect(result.detailsLabel).toBe("Build a1b2c3d · Built 2026-09-25 09:42 UTC");
    expect(result.copyText).toBe(
      `StudioFlow build: ${SHA.toLowerCase()} | Environment: production | Built: 2026-09-25 09:42 UTC`,
    );
  });

  it("collapses an empty or malformed build stamp to null (no `Invalid Date` UI)", () => {
    expect(
      createBuildInfo({ version: SHA, builtAt: "", environment: "production" }).builtAt,
    ).toBeNull();
    expect(
      createBuildInfo({ version: SHA, builtAt: "  ", environment: "production" }).builtAt,
    ).toBeNull();
    expect(
      createBuildInfo({
        version: SHA,
        builtAt: "tomorrow at 9",
        environment: "production",
      }).builtAt,
    ).toBeNull();
    expect(
      createBuildInfo({
        version: SHA,
        builtAt: "2026-09-25", // missing time component
        environment: "production",
      }).builtAt,
    ).toBeNull();
  });

  it("preserves a UTC fallback label when no locale or timezone is supplied", () => {
    const result = createBuildInfo({
      version: SHA,
      builtAt: "2026-09-25T09:42:11Z",
      environment: "production",
    });
    expect(result.builtAt).toBe("2026-09-25T09:42:11Z");
    expect(result.builtAtLabel).toBeTruthy();
  });
});
