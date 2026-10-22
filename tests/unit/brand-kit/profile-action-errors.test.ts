import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
const workspaceMock = vi.hoisted(() => ({ getAccessibleWorkspace: vi.fn() }));
const saveProfileMock = vi.hoisted(() => vi.fn());
const logFailureMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/config", () => ({ auth: authMock.auth }));
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/lib/brand/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brand/profile")>("@/lib/brand/profile");
  return { ...actual, saveBrandProfile: saveProfileMock };
});
vi.mock("@/features/brand-kit/server", () => ({
  logBrandKitActionFailure: logFailureMock,
}));

const { saveBrandProfileAction } =
  await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/brand-kit/profile-actions");

beforeEach(() => {
  authMock.auth.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  workspaceMock.getAccessibleWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
  saveProfileMock.mockReset();
  logFailureMock.mockReset();
});

describe("saveBrandProfileAction failures", () => {
  it("returns safe copy and records unexpected persistence details", async () => {
    const error = new Error(
      "postgres://planner:secret@example.test/planner_test: connection refused",
    );
    saveProfileMock.mockRejectedValue(error);

    const result = await saveBrandProfileAction("workspace", {} as never, new FormData());

    expect(result).toEqual({ error: "The profile could not be saved." });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(logFailureMock).toHaveBeenCalledWith("brand_kit.profile_save_failed", error);
  });
});
