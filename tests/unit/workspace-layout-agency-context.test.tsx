import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const resolveContextMock = vi.hoisted(() => vi.fn());
const getInternalMock = vi.hoisted(() => vi.fn());
const getClientMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: resolveContextMock,
}));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: getInternalMock,
  getClientWorkspace: getClientMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

const { default: WorkspaceLayout } = await import("@/app/(app)/app/w/[slug]/layout");

describe("workspace layout agency context", () => {
  beforeEach(() => {
    authMock.mockReset();
    resolveContextMock.mockReset();
    getInternalMock.mockReset();
    getClientMock.mockReset();
    notFoundMock.mockClear();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    resolveContextMock.mockResolvedValue({
      actor: { id: "user-1" },
      agencyId: "agency-b",
      source: "cookie",
    });
    getInternalMock.mockResolvedValue({ id: "workspace-b" });
    getClientMock.mockResolvedValue(null);
  });

  it("passes the resolved agency id into the workspace lookup", async () => {
    await WorkspaceLayout({
      children: <div>child</div>,
      params: Promise.resolve({ slug: "shared-slug" }),
    });

    expect(getInternalMock).toHaveBeenCalledWith({ id: "user-1" }, "shared-slug", "agency-b");
  });
});
