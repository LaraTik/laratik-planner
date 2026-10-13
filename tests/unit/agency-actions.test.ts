import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setActiveAgencyCookie: vi.fn(),
  isActiveMember: vi.fn(),
  isAgencyAdmin: vi.fn(),
  // Rows for the agency-slug lookup, then rows for the workspace lookup.
  // `switchAgencyContext` issues both concurrently via `Promise.all`, so the
  // A single joined query for the landing workspace + its agency.
  // The landing workspace is now resolved in ONE query that joins the agency,
  // so the row carries both slugs. Previously this mock modelled two separate
  // queries and had to track which `limit()` call it was on.
  landingRows: [] as { slug: string; agencySlug: string }[],
}));

// `db` is a drizzle client. The action now issues ONE query — the landing
// workspace joined to its agency — so the chain's `limit()` just returns
// `landingRows`.
function buildDrizzleChain() {
  const chain: Record<string, unknown> = {};
  const limit = vi.fn(() => Promise.resolve(mocks.landingRows));
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  // The member path joins workspaceMemberships -> workspaces -> agencies, so
  // `innerJoin` must be callable on its own return value, repeatedly.
  const innerJoin = vi.fn(() => chain);
  const from = vi.fn().mockReturnValue(chain);
  const select = vi.fn().mockReturnValue({ from });
  Object.assign(chain, { select, from, innerJoin, where, orderBy, limit });
  return chain;
}

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
    mocks.landingRows = [{ slug: "food-game", agencySlug: "acme" }];

    // Canonical `/app/a/<agencySlug>/w/<slug>` — NOT the legacy
    // `/app/w/<slug>`. The legacy path lives inside the `(app)` route group,
    // so routing to it renders the entire authenticated app shell just to
    // answer `redirect()`, then the browser re-requests the real URL and
    // pays the whole shell cost a second time.
    await expect(switchActiveAgencyAndRedirect("agency-1")).rejects.toThrow(
      "NEXT_REDIRECT:/app/a/acme/w/food-game",
    );
  });

  it("never emits the legacy shape — the agency slug rides on the workspace row", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.landingRows = [{ slug: "food-game", agencySlug: "acme" }];

    // This used to degrade to `/app/w/<slug>` when the agency slug could not
    // be read from a SEPARATE query, costing a full app-shell re-render
    // inside the redirect (measured: +21 SQL statements, ~1.5-2x). The agency
    // is now JOINED onto the landing workspace, so there is no longer a
    // branch that can fall back.
    await expect(switchActiveAgencyAndRedirect("agency-1")).rejects.toThrow(
      "NEXT_REDIRECT:/app/a/acme/w/food-game",
    );
  });

  it("redirects to the app home when the new agency has no accessible workspace", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.landingRows = [];

    await expect(switchActiveAgencyAndRedirect("agency-2")).rejects.toThrow("NEXT_REDIRECT:/app");
  });

  it("lets an agency admin enter an active workspace without a workspace membership row", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isActiveMember.mockResolvedValue(true);
    mocks.isAgencyAdmin.mockResolvedValue(true);
    mocks.setActiveAgencyCookie.mockResolvedValue(true);
    mocks.landingRows = [{ slug: "admin-only-workspace", agencySlug: "acme" }];

    await expect(switchActiveAgencyAndRedirect("agency-1")).rejects.toThrow(
      "NEXT_REDIRECT:/app/a/acme/w/admin-only-workspace",
    );
  });
});
