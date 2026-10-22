import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  isAgencyAdmin: vi.fn(),
  dbSelect: vi.fn(),
  loadEnabledCapabilities: vi.fn(),
  getTrendSourceAdminView: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.dbSelect } }));
vi.mock("@/lib/ai/governance", () => ({
  loadEnabledCapabilities: mocks.loadEnabledCapabilities,
}));
vi.mock("@/features/trends/server", () => ({
  getTrendSourceAdminView: mocks.getTrendSourceAdminView,
}));

const { default: TrendSourcesAdminPage } =
  await import("@/app/(app)/app/agency-settings/trend-sources/page");

describe("Trend source settings page authorization order", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: "member-1" } });
    mocks.currentActor.mockReset();
    mocks.currentActor.mockResolvedValue({ id: "member-1" });
    mocks.resolveActiveAgencyContext.mockReset();
    mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
    mocks.isAgencyAdmin.mockReset();
    mocks.isAgencyAdmin.mockResolvedValue(false);
    mocks.dbSelect.mockReset();
    mocks.loadEnabledCapabilities.mockReset();
    mocks.getTrendSourceAdminView.mockReset();
    mocks.redirect.mockClear();
  });

  it("denies a non-admin before reading agency AI or source configuration", async () => {
    await expect(TrendSourcesAdminPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.isAgencyAdmin).toHaveBeenCalledWith({ id: "member-1" }, "agency-1");
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.loadEnabledCapabilities).not.toHaveBeenCalled();
    expect(mocks.getTrendSourceAdminView).not.toHaveBeenCalled();
  });
});
