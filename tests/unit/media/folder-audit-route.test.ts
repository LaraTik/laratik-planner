import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const currentActorMock = vi.fn();
const accessibleWorkspaceIdsForActorMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: currentActorMock }));
vi.mock("@/lib/media/accessible-workspaces", () => ({
  accessibleWorkspaceIdsForActor: accessibleWorkspaceIdsForActorMock,
}));
vi.mock("@/lib/db", () => ({ db: { select: selectMock } }));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/media/library/folder-audit/route");
}

function request(workspaceId: string) {
  return new NextRequest(
    `http://localhost/api/media/library/folder-audit?agencyId=11111111-1111-4111-8111-111111111111&workspaceId=${workspaceId}`,
  );
}

describe("GET /api/media/library/folder-audit — workspace access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    currentActorMock.mockResolvedValue({ id: "user-1" });
    accessibleWorkspaceIdsForActorMock.mockResolvedValue(["22222222-2222-4222-8222-222222222222"]);
  });

  it("denies agency members who cannot access the requested workspace before querying its audit log", async () => {
    const { GET } = await loadRoute();
    const response = await GET(request("33333333-3333-4333-8333-333333333333"));

    expect(response.status).toBe(403);
    expect(accessibleWorkspaceIdsForActorMock).toHaveBeenCalledWith(
      { id: "user-1" },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(selectMock).not.toHaveBeenCalled();
  });
});
