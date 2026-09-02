import { describe, expect, it } from "vitest";
import { platformPayloadErrorCode, readinessErrorCode } from "@/lib/publishing/action-errors";

describe("publish action error codes", () => {
  it("maps domain payload errors to stable UI codes", () => {
    expect(platformPayloadErrorCode("FORBIDDEN")).toBe("forbidden");
    expect(platformPayloadErrorCode("NOT_FOUND")).toBe("publishNotFound");
    expect(platformPayloadErrorCode("CROSS_CHANNEL")).toBe("crossChannel");
    expect(platformPayloadErrorCode("INVALID")).toBe("invalidPlatformPayload");
  });

  it("maps readiness errors to stable UI codes", () => {
    expect(readinessErrorCode("FORBIDDEN")).toBe("readinessForbidden");
    expect(readinessErrorCode("NOT_FOUND")).toBe("readinessNotFound");
    expect(readinessErrorCode("INVALID")).toBe("readinessInvalid");
  });
});
