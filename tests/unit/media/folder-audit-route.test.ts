import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const currentActorMock = vi.fn();
const feature = vi.hoisted(() => ({
  getMediaFolderAudit: vi.fn(),
  MediaPermissionError: class MediaPermissionError extends Error {},
}));

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: currentActorMock }));
vi.mock("@/features/media/server", () => feature);

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/media/library/folder-audit/route");
}

function request(workspaceId: string) {
  return new NextRequest(
    `http://localhost/api/media/library/folder-audit?agencyId=11111111-1111-4111-8111-111111111111&workspaceId=${workspaceId}`,
  );
}

describe("GET /api/media/library/folder-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    currentActorMock.mockResolvedValue({ id: "user-1" });
  });

  it("forwards the actor and validated query to the feature and preserves the response contract", async () => {
    const events = [
      {
        id: "event-1",
        reason: "content_moved",
        fromFolderId: null,
        toFolderId: "folder-1",
        contentItemId: "content-1",
        mediaAssetId: "asset-1",
        reconciledAt: "2026-10-21T10:00:00.000Z",
        actorName: "Planner",
      },
    ];
    feature.getMediaFolderAudit.mockResolvedValue(events);
    const { GET } = await loadRoute();

    const response = await GET(request("22222222-2222-4222-8222-222222222222"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events });
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30");
    expect(feature.getMediaFolderAudit).toHaveBeenCalledWith(
      { id: "user-1" },
      {
        agencyId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
      },
    );
  });

  it("maps the feature permission error to the established forbidden response", async () => {
    feature.getMediaFolderAudit.mockRejectedValue(new feature.MediaPermissionError());
    const { GET } = await loadRoute();

    const response = await GET(request("33333333-3333-4333-8333-333333333333"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
  });
});
