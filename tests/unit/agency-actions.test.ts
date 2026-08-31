import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setActiveAgencyCookie: vi.fn(),
  isActiveMember: vi.fn(),
  rows: [] as { slug: string }[],
}));

// `db` is a drizzle client. The action calls
// `db.select(...).from(...).innerJoin(...).where(...).orderBy(...).limit(1)`.
// We build a single chain whose `limit` reads the current value of
// `mocks.rows` at call time, so each test can supply its own result
// without re-mocking the module.
function buildDrizzleChain() {
  const limit = vi.fn(() => Promise.resolve(mocks.rows));
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, innerJoin, where, orderBy, limit };
}

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/agency-context", () => ({
  setActiveAgencyCookie: mocks.setActiveAgencyCookie,
  isActiveMember: mocks.isActiveMember,
}));
vi.mock("@/lib/db", () => ({ db: buildDrizzleChain() }));

const { switchActiveAgency, switchActiveAgencyAndRedirect } =
  await import("@/lib/auth/agency-actions");

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

/**
 * `switchActiveAgencyAndRedirect` is the agency switcher wire-up used
 * by the client (see `src/components/app-shell/agency-switcher.tsx`).
 * The contract: the action issues the cookie AND returns the first
 * accessible workspace in the new agency. The client uses that slug
 * to navigate atomically — the old (now invalid) workspace URL never
 * lingers in the address bar.
 *
 * These tests pin the four failure modes the agency switcher relies
 * on: unauthenticated, not-a-member, no-secret, and the happy path
 * with + without a workspace in the new agency.
 */
describe("switchActiveAgencyAndRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthenticated when there is no session", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(switchActiveAgencyAndRedirect("agency-1")).resolves.toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(mocks.setActiveAgencyCookie).not.toHaveBeenCalled();
  });

  it("returns not-a-member when the user is not an active member of the agency", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(false);

    await expect(switchActiveAgencyAndRedirect("agency-1")).resolves.toEqual({
      ok: false,
      reason: "not-a-member",
    });
    expect(mocks.setActiveAgencyCookie).not.toHaveBeenCalled();
  });

  it("returns no-secret when the cookie helper refuses to write", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(false);

    await expect(switchActiveAgencyAndRedirect("agency-1")).resolves.toEqual({
      ok: false,
      reason: "no-secret",
    });
  });

  it("returns the first accessible workspace in the new agency", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.rows = [{ slug: "food-game" }];

    await expect(switchActiveAgencyAndRedirect("agency-1")).resolves.toEqual({
      ok: true,
      agencyId: "agency-1",
      firstWorkspaceSlug: "food-game",
    });
  });

  it("returns firstWorkspaceSlug=null when the new agency has no accessible workspace", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.rows = [];

    await expect(switchActiveAgencyAndRedirect("agency-2")).resolves.toEqual({
      ok: true,
      agencyId: "agency-2",
      firstWorkspaceSlug: null,
    });
  });
});
