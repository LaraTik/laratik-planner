import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enableAgencyDek: vi.fn(),
  logError: vi.fn(),
  isAgencyAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })) },
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/observability/logger", () => ({ logError: mocks.logError }));
vi.mock("@/lib/observability/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/social/key-management", () => {
  class MissingKekError extends Error {}
  class DekAlreadyEnabledError extends Error {}
  class DekNotEnabledError extends Error {}
  class DekRotationError extends Error {
    code = "unwrap_failed";
  }
  return {
    MissingKekError,
    DekAlreadyEnabledError,
    DekNotEnabledError,
    DekRotationError,
    enableAgencyDek: mocks.enableAgencyDek,
    disableAgencyDek: vi.fn(),
    getAgencySocialStatus: vi.fn(),
    isKekAvailable: vi.fn(),
    rotateAgencyDek: vi.fn(),
  };
});

import { SocialServiceError, enableSocial, toSocialFailureResponse } from "@/lib/social/service";

describe("social settings error boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAgencyAdmin.mockResolvedValue(true);
  });

  it("keeps safe typed domain errors and their established status", () => {
    const failure = new SocialServiceError("social.forbidden", "Agency admin required", 403);

    expect(toSocialFailureResponse(failure)).toEqual({
      body: { error: "Agency admin required", code: "social.forbidden" },
      status: 403,
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("logs unexpected route failures and returns generic copy", () => {
    const failure = new Error("postgres://planner:private-password@db.internal/planner");

    expect(toSocialFailureResponse(failure)).toEqual({
      body: { error: "Unexpected error" },
      status: 500,
    });
    expect(mocks.logError).toHaveBeenCalledWith("social.unexpected_failure", { err: failure });
  });

  it("does not place key-management exception details in service errors", async () => {
    const failure = new Error("postgres://planner:private-password@db.internal/planner");
    mocks.enableAgencyDek.mockRejectedValue(failure);

    await expect(enableSocial({ id: "user-1" } as never, "agency-1")).rejects.toMatchObject({
      name: "SocialServiceError",
      code: "social.dek-rotation-failed",
      status: 500,
      message: "Unable to complete the social encryption-key operation.",
    });
    expect(mocks.logError).toHaveBeenCalledWith("social.key_management_failed", { err: failure });
  });
});
