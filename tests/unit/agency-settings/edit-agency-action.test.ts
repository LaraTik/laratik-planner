import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  isAgencyAdmin: vi.fn(),
  updateAgency: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/agencies/command", () => ({
  updateAgency: mocks.updateAgency,
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

const { editAgencyAction } = await import("@/app/(app)/app/agency-settings/actions");

beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { id: "agency-admin" } });
  mocks.currentActor.mockResolvedValue({ id: "agency-admin" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.isAgencyAdmin.mockResolvedValue(true);
  mocks.updateAgency.mockReset();
  mocks.logError.mockReset();
});

describe("agency edit action", () => {
  it("uses the shared safe failure mapper for unexpected persistence errors", async () => {
    const failure = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    mocks.updateAgency.mockRejectedValueOnce(failure);
    const formData = new FormData();

    const result = await editAgencyAction({}, formData);

    expect(result).toEqual({ error: "Could not save the agency settings." });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(mocks.logError).toHaveBeenCalledWith("agency.settings_update_failed", { err: failure });
  });
});
