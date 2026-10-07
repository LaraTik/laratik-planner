import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const getInternalMock = vi.hoisted(() => vi.fn());
const getClientMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

const activeAgencyResolverMustNotRun = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
// The layout must never read the active-agency cookie: that was the bug. The
// mock is a spy so the "never called" contract is observable, not assumed.
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: activeAgencyResolverMustNotRun,
}));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspaceAtPath: getInternalMock,
  getClientWorkspaceAtPath: getClientMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

const { default: WorkspaceLayout } = await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/layout");

/**
 * Workspace layout tenancy contract.
 *
 * This test previously asserted that the layout resolved the agency from
 * `resolveActiveAgencyContext` (the signed cookie) and passed the resulting id
 * into the workspace lookup. That behaviour is exactly what the canonical URL
 * removed: a workspace's identity is `(agencyId, slug)`, so a URL carrying only
 * the slug resolved against whichever agency the *visitor* currently had active.
 * A link shared between colleagues then opened a different tenant's workspace,
 * or 404'd.
 *
 * The contract now is the opposite, and worth pinning hard:
 *   - the tenant comes from the URL, not from recipient-side state;
 *   - the layout does not consult the active-agency cookie at all.
 */
describe("workspace layout resolves the tenant from the URL", () => {
  beforeEach(() => {
    authMock.mockReset();
    getInternalMock.mockReset();
    getClientMock.mockReset();
    notFoundMock.mockClear();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getInternalMock.mockResolvedValue({ id: "workspace-b" });
    getClientMock.mockResolvedValue(null);
  });

  it("resolves the workspace from (agencySlug, slug) — both taken from params", async () => {
    await WorkspaceLayout({
      children: <div>child</div>,
      params: Promise.resolve({ agencySlug: "agency-one", slug: "shared-slug" }),
    });

    expect(getInternalMock).toHaveBeenCalledWith({ id: "user-1" }, "agency-one", "shared-slug");
  });

  it("does NOT fall back to the active-agency cookie when the URL says otherwise", async () => {
    // The regression that motivated the change: the same slug under a different
    // agency in the URL must resolve to a different pair, never to "whatever the
    // visitor last switched to". Both calls carry the URL's agency.
    await WorkspaceLayout({
      children: <div>child</div>,
      params: Promise.resolve({ agencySlug: "agency-one", slug: "shared-slug" }),
    });
    await WorkspaceLayout({
      children: <div>child</div>,
      params: Promise.resolve({ agencySlug: "agency-two", slug: "shared-slug" }),
    });

    expect(getInternalMock).toHaveBeenNthCalledWith(
      1,
      { id: "user-1" },
      "agency-one",
      "shared-slug",
    );
    expect(getInternalMock).toHaveBeenNthCalledWith(
      2,
      { id: "user-1" },
      "agency-two",
      "shared-slug",
    );
  });

  it("404s when neither the internal nor the client role resolves", async () => {
    getInternalMock.mockResolvedValue(null);
    await expect(
      WorkspaceLayout({
        children: <div>child</div>,
        params: Promise.resolve({ agencySlug: "agency-one", slug: "missing" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("tries the client role with the same URL-derived agency", async () => {
    getInternalMock.mockResolvedValue(null);
    getClientMock.mockResolvedValue({ id: "workspace-client" });
    await WorkspaceLayout({
      children: <div>child</div>,
      params: Promise.resolve({ agencySlug: "agency-one", slug: "client-slug" }),
    });

    expect(getClientMock).toHaveBeenCalledWith({ id: "user-1" }, "agency-one", "client-slug");
  });

  it("404s without a session (defence in depth behind the proxy)", async () => {
    authMock.mockResolvedValue(null);
    await expect(
      WorkspaceLayout({
        children: <div>child</div>,
        params: Promise.resolve({ agencySlug: "agency-one", slug: "shared-slug" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getInternalMock).not.toHaveBeenCalled();
  });

  it("never consults the active-agency cookie resolver", async () => {
    // Structural guard, expressed as a behaviour that cannot be faked: the
    // module is mocked so the layout CANNOT call it without the test noticing.
    // If someone re-adds `resolveActiveAgencyContext` here — which would let the
    // cookie steer which tenant the URL resolves to — this fails.
    await WorkspaceLayout({
      children: <div>child</div>,
      params: Promise.resolve({ agencySlug: "agency-one", slug: "shared-slug" }),
    });
    expect(activeAgencyResolverMustNotRun).not.toHaveBeenCalled();
  });
});
