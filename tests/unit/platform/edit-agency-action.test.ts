import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  updateAgencyAsPlatform: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/agencies/command", () => ({
  updateAgencyAsPlatform: mocks.updateAgencyAsPlatform,
  UpdateAgencySchema: {
    safeParse: vi.fn(() => ({
      success: true,
      data: { name: "Agency", slug: "agency", locale: "en", timezone: "UTC" },
    })),
  },
  AgencyUpdateError: class AgencyUpdateError extends Error {
    code = "invalid_update";
  },
}));
vi.mock("@/lib/observability/logger", () => ({ logError: mocks.logError }));

const { platformEditAgencyAction } =
  await import("@/app/(app)/app/platform/agencies/[agencyId]/actions");

beforeEach(() => {
  mocks.currentActor.mockResolvedValue({ id: "platform-owner" });
  mocks.updateAgencyAsPlatform.mockReset();
  mocks.logError.mockReset();
});

describe("platform agency edit action", () => {
  it("hides and logs unexpected persistence failures", async () => {
    const failure = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    mocks.updateAgencyAsPlatform.mockRejectedValueOnce(failure);
    const formData = new FormData();
    formData.set("agencyId", "00000000-0000-4000-8000-000000000001");

    const result = await platformEditAgencyAction({}, formData);

    expect(result).toEqual({ error: "Could not save the agency settings." });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(mocks.logError).toHaveBeenCalledWith("platform.agency_update_failed", { err: failure });
  });
});
