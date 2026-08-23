import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setActiveAgencyCookie: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/agency-context", () => ({
  setActiveAgencyCookie: mocks.setActiveAgencyCookie,
}));

const { switchActiveAgency } = await import("@/lib/auth/agency-actions");

describe("switchActiveAgency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed without an authenticated user", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(switchActiveAgency("agency-1")).resolves.toBe(false);
    expect(mocks.setActiveAgencyCookie).not.toHaveBeenCalled();
  });

  it("uses the authenticated actor and returns the cookie helper result", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.setActiveAgencyCookie.mockResolvedValue(true);

    await expect(switchActiveAgency("agency-1")).resolves.toBe(true);
    expect(mocks.setActiveAgencyCookie).toHaveBeenCalledWith({ id: "user-1" }, "agency-1");
  });

  it("propagates a membership refusal without changing identity", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.setActiveAgencyCookie.mockResolvedValue(false);

    await expect(switchActiveAgency("agency-2")).resolves.toBe(false);
    expect(mocks.setActiveAgencyCookie).toHaveBeenCalledWith({ id: "user-1" }, "agency-2");
  });
});
