import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const currentActorMock = vi.fn();
const feature = vi.hoisted(() => ({
  getMediaLibraryFilters: vi.fn(),
  MediaPermissionError: class MediaPermissionError extends Error {},
}));

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: currentActorMock }));
vi.mock("@/features/media/server", () => feature);

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/media/library/filters/route");
}

function request(workspaceId?: string) {
  const query = new URLSearchParams({ agencyId: "11111111-1111-4111-8111-111111111111" });
  if (workspaceId) query.set("workspaceId", workspaceId);
  return new NextRequest(`http://localhost/api/media/library/filters?${query}`);
}

describe("GET /api/media/library/filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    currentActorMock.mockResolvedValue({ id: "user-1" });
  });

  it("forwards the actor and validated scope and preserves the response contract", async () => {
    const filters = {
      tags: [{ name: "launch", count: 3 }],
      uploaders: [{ id: "user-2", name: "Designer", count: 4 }],
    };
    feature.getMediaLibraryFilters.mockResolvedValue(filters);
    const { GET } = await loadRoute();

    const response = await GET(request("22222222-2222-4222-8222-222222222222"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(filters);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(feature.getMediaLibraryFilters).toHaveBeenCalledWith(
      { id: "user-1" },
      {
        agencyId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
      },
    );
  });

  it("maps the feature permission error to the established forbidden response", async () => {
    feature.getMediaLibraryFilters.mockRejectedValue(new feature.MediaPermissionError());
    const { GET } = await loadRoute();

    const response = await GET(request("33333333-3333-4333-8333-333333333333"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
  });
});
