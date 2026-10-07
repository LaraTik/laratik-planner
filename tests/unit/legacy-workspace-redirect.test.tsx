import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const reachableMock = vi.hoisted(() => vi.fn());
const activeCtxMock = vi.hoisted(() => vi.fn());
const agencySlugMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/agency-context", () => ({ resolveActiveAgencyContext: activeCtxMock }));
vi.mock("@/lib/workspaces/context", () => ({
  findReachableWorkspacesBySlug: reachableMock,
  findAgencySlugById: agencySlugMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock, notFound: notFoundMock }));

const { default: LegacyWorkspaceRedirect } = await import("@/app/(app)/app/w/[...legacy]/page");

/**
 * Legacy `/app/w/<slug>` redirect behaviour.
 *
 * The bug: the old route carried only the workspace slug, so a shared link
 * resolved against the RECIPIENT's active-agency cookie. A colleague in a
 * second agency either 404'd or opened a different tenant's workspace.
 *
 * Three cases matter, and the middle one is the point:
 *   1. exactly one reachable workspace with that slug -> canonical URL;
 *   2. more than one -> DO NOT GUESS, send them to the switcher;
 *   3. none -> 404, preserving the anti-IDOR contract (an unreachable slug must
 *      be indistinguishable from a non-existent one, or slugs are enumerable).
 */
const redirectTo = async (path: string) => {
  try {
    await LegacyWorkspaceRedirect({ params: Promise.resolve({ legacy: path.split("/") }) });
  } catch (error) {
    return (error as Error).message;
  }
  return "NO_REDIRECT";
};

describe("legacy /app/w/ redirect", () => {
  beforeEach(() => {
    authMock.mockReset();
    reachableMock.mockReset();
    activeCtxMock.mockReset();
    agencySlugMock.mockReset();
    redirectMock.mockClear();
    notFoundMock.mockClear();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    activeCtxMock.mockResolvedValue({ agencyId: "agency-1", source: "cookie" });
    agencySlugMock.mockResolvedValue("agency-1");
  });

  it("rewrites to the canonical form when the slug is unambiguous for this user", async () => {
    reachableMock.mockResolvedValue([{ agencySlug: "acme", agencyId: "a1", workspaceId: "w1" }]);
    expect(await redirectTo("food-game")).toBe("NEXT_REDIRECT:/app/a/acme/w/food-game");
  });

  it("preserves the sub-path and query so deep links keep their state", async () => {
    reachableMock.mockResolvedValue([{ agencySlug: "acme", agencyId: "a1", workspaceId: "w1" }]);
    // The path arrives already encoded by the router; the helper re-encodes
    // segments, so the round trip is stable.
    expect(await redirectTo("food-game/planning")).toBe(
      "NEXT_REDIRECT:/app/a/acme/w/food-game/planning",
    );
  });

  it("REFUSES to guess when the slug is ambiguous across the user's agencies", async () => {
    // This is the regression the whole change exists to prevent. The old cookie
    // path picked one invisibly; sending them to the switcher makes the choice
    // explicit instead of wrong.
    reachableMock.mockResolvedValue([
      { agencySlug: "agency-one", agencyId: "a1", workspaceId: "w1" },
      { agencySlug: "agency-two", agencyId: "a2", workspaceId: "w2" },
    ]);
    expect(await redirectTo("food-game")).toBe("NEXT_REDIRECT:/app/workspaces");
  });

  it("falls back to the active agency rather than stranding a switch link", async () => {
    // No reachable workspace for this slug, but the visitor does have an active
    // agency. Sending them to the canonical URL keeps legacy "switch agency"
    // links working; the canonical page applies its own membership gate and 404s
    // if they still cannot see it. This is not a data-exposure path.
    reachableMock.mockResolvedValue([]);
    agencySlugMock.mockResolvedValue("agency-one");
    expect(await redirectTo("food-game")).toBe("NEXT_REDIRECT:/app/a/agency-one/w/food-game");
  });

  it("404s when there is neither a reachable workspace nor an active agency", async () => {
    // The true anti-IDOR terminal case: no tenant can be established, and the
    // route must be indistinguishable from a slug that never existed.
    reachableMock.mockResolvedValue([]);
    activeCtxMock.mockResolvedValue(null);
    expect(await redirectTo("nope")).toBe("NEXT_NOT_FOUND");
  });

  it("404s when the active agency cannot be turned into a slug", async () => {
    reachableMock.mockResolvedValue([]);
    agencySlugMock.mockResolvedValue(null);
    expect(await redirectTo("nope")).toBe("NEXT_NOT_FOUND");
  });

  it("404s without a session", async () => {
    authMock.mockResolvedValue(null);
    expect(await redirectTo("food-game")).toBe("NEXT_NOT_FOUND");
    expect(reachableMock).not.toHaveBeenCalled();
  });

  it("404s on an empty legacy path", async () => {
    expect(await redirectTo("")).toBe("NEXT_NOT_FOUND");
  });
});
