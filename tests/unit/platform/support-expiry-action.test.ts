import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  auth: vi.fn(),
  requirePlatformPermission: vi.fn(),
  expireStaleSupportAccessGrants: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/platform-access", () => ({
  getPlatformPrincipal: vi.fn(),
  requirePlatformPermission: mocks.requirePlatformPermission,
}));
vi.mock("@/lib/support", () => ({
  createSupportAccessRequest: vi.fn(),
  decideSupportAccessRequest: vi.fn(),
  expireStaleSupportAccessGrants: mocks.expireStaleSupportAccessGrants,
  listActiveGrantsForActor: vi.fn(),
  listRecentAuditForActor: vi.fn(),
  listRecentSupportAuditAsPlatform: vi.fn(),
  listRecentRequestsByAgency: vi.fn(),
  revokeSupportAccessGrant: vi.fn(),
  SupportAccessError: class SupportAccessError extends Error {},
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { expireStaleSupportAccessGrantsAction } from "@/app/(app)/app/platform/security/actions";

describe("expireStaleSupportAccessGrantsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "actor-1" } });
    mocks.currentActor.mockResolvedValue({ id: "actor-1" });
    mocks.requirePlatformPermission.mockResolvedValue({});
    mocks.expireStaleSupportAccessGrants.mockResolvedValue({
      expiredRequests: 0,
      expiredGrants: 0,
    });
  });

  it("requires platform access management before changing global support state", async () => {
    mocks.requirePlatformPermission.mockRejectedValue(new Error("forbidden"));

    await expect(expireStaleSupportAccessGrantsAction()).rejects.toThrow("forbidden");

    expect(mocks.requirePlatformPermission).toHaveBeenCalledWith(
      { id: "actor-1" },
      "platform.access.manage",
    );
    expect(mocks.expireStaleSupportAccessGrants).not.toHaveBeenCalled();
  });
});
