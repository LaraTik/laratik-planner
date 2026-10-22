import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getEffectiveEntitlement: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements", () => ({
  AgencyNotFoundError: class AgencyNotFoundError extends Error {},
  getEffectiveEntitlement: mocks.getEffectiveEntitlement,
}));

const { AgencyNotFoundError } = await import("@/lib/entitlements");
const { isCommunityInboxPlanIncluded } = await import("@/lib/community/plan-access");

beforeEach(() => vi.clearAllMocks());

describe("isCommunityInboxPlanIncluded", () => {
  it("returns true only when the resolved plan includes Community Inbox", async () => {
    mocks.getEffectiveEntitlement.mockResolvedValue({
      enabledModules: new Set(["community_inbox"]),
    });
    await expect(isCommunityInboxPlanIncluded("agency-1")).resolves.toBe(true);

    mocks.getEffectiveEntitlement.mockResolvedValue({ enabledModules: new Set() });
    await expect(isCommunityInboxPlanIncluded("agency-1")).resolves.toBe(false);

    mocks.getEffectiveEntitlement.mockResolvedValue({});
    await expect(isCommunityInboxPlanIncluded("agency-1")).resolves.toBe(false);
  });

  it("treats the typed missing-entitlement result as not included", async () => {
    mocks.getEffectiveEntitlement.mockRejectedValue(new AgencyNotFoundError("agency-1"));

    await expect(isCommunityInboxPlanIncluded("agency-1")).resolves.toBe(false);
  });

  it("propagates operational failures instead of reporting a false plan status", async () => {
    const failure = new Error("database unavailable");
    mocks.getEffectiveEntitlement.mockRejectedValue(failure);

    await expect(isCommunityInboxPlanIncluded("agency-1")).rejects.toBe(failure);
  });
});
