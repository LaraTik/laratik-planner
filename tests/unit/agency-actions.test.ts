import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setActiveAgencyCookie: vi.fn(),
  isActiveMember: vi.fn(),
  isAgencyAdmin: vi.fn(),
  // Rows for the agency-slug lookup, then rows for the workspace lookup.
  // `switchAgencyContext` issues both concurrently via `Promise.all`, so the
  // agency chain is CONSTRUCTED first and its `.limit(1)` runs first. Sharing
  // one row set between the two made the agency lookup return a workspace slug
  // and produced a nonsense destination.
  agencyRows: [] as { slug: string }[],
  workspaceRows: [] as { slug: string }[],
  // Which `limit()` call we are on: 0 = agency slug, 1 = workspace.
  queryIndex: 0,
}));

// `db` is a drizzle client. The action calls
// `db.select(...).from(...).innerJoin(...).where(...).orderBy(...).limit(1)`
// for the workspace, and `db.select(...).from(...).where(...).limit(1)` for
// the agency. We build a chain whose `limit` consumes `workspaceRows` first
// and `agencyRows` second, so each test can supply its own results without
// re-mocking the module.
function buildDrizzleChain() {
  const limit = vi.fn(() => {
    const rows = mocks.queryIndex++ === 0 ? mocks.agencyRows : mocks.workspaceRows;
    return Promise.resolve(rows);
  });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin, where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, innerJoin, where, orderBy, limit };
}

// `queryIndex` is a plain counter, not mock state, so `vi.clearAllMocks()`
// does not reset it. Without this the second test in the file consumed the
// first test's row slot and read the wrong fixture.
beforeEach(() => {
  mocks.queryIndex = 0;
});

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/agency-context", () => ({
  setActiveAgencyCookie: mocks.setActiveAgencyCookie,
  isActiveMember: mocks.isActiveMember,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/db", () => ({ db: buildDrizzleChain() }));

const { switchActiveAgency, switchActiveAgencyAndRedirect } =
  await import("@/lib/auth/agency-actions");

describe("switchActiveAgency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAgencyAdmin.mockResolvedValue(false);
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

  it("redirects to the CANONICAL workspace URL in the new agency", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.workspaceRows = [{ slug: "food-game" }];
    mocks.agencyRows = [{ slug: "acme" }];

    // Canonical `/app/a/<agencySlug>/w/<slug>` — NOT the legacy
    // `/app/w/<slug>`. The legacy path lives inside the `(app)` route group,
    // so routing to it renders the entire authenticated app shell just to
    // answer `redirect()`, then the browser re-requests the real URL and
    // pays the whole shell cost a second time.
    await expect(switchActiveAgencyAndRedirect("agency-1")).rejects.toThrow(
      "NEXT_REDIRECT:/app/a/acme/w/food-game",
    );
  });

  it("falls back to the legacy path when the agency slug cannot be read", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.workspaceRows = [{ slug: "food-game" }];
    mocks.agencyRows = [];

    // Degrades to the old shape rather than emitting `/app/a/undefined/...`.
    // The legacy route still resolves it, so the switch still lands.
    await expect(switchActiveAgencyAndRedirect("agency-1")).rejects.toThrow(
      "NEXT_REDIRECT:/app/w/food-game",
    );
  });

  it("redirects to the app home when the new agency has no accessible workspace", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.workspaceRows = [];
    mocks.agencyRows = [];

    await expect(switchActiveAgencyAndRedirect("agency-2")).rejects.toThrow("NEXT_REDIRECT:/app");
  });

  it("lets an agency admin enter an active workspace without a workspace membership row", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.isAgencyAdmin.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.workspaceRows = [{ slug: "admin-only-workspace" }];
    mocks.agencyRows = [{ slug: "acme" }];

    await expect(switchActiveAgencyAndRedirect("agency-1")).rejects.toThrow(
      "NEXT_REDIRECT:/app/a/acme/w/admin-only-workspace",
    );
  });
});
