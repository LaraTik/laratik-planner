import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const currentActorMock = vi.fn();
const rateMock = vi.fn();
const runMediaFolderBatchMock = vi.fn();
const canWriteMock = vi.fn();
const dbMock = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: currentActorMock }));
vi.mock("@/lib/auth/policy", () => ({ canWriteToWorkspace: canWriteMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: rateMock }));
vi.mock("@/lib/media/folder-sources", () => ({ inspectMediaFolder: vi.fn() }));
vi.mock("@/features/media/server", () => ({ runMediaFolderBatch: runMediaFolderBatchMock }));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/media/import/folder/route");
}

function request() {
  return new NextRequest("http://localhost/api/media/import/folder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "import",
      folderId: "1ABCDEFGHIJKLMNOPQR0",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      items: [{ id: "file-1", title: "File one" }],
    }),
  });
}

describe("POST /api/media/import/folder failure responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    currentActorMock.mockResolvedValue({ id: "user-1" });
    rateMock.mockResolvedValue({ allowed: true });
    canWriteMock.mockResolvedValue(true);
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ agencyId: "11111111-1111-4111-8111-111111111111" }],
        }),
      }),
    });
  });

  it("returns a generic failure when an unexpected persistence error occurs", async () => {
    runMediaFolderBatchMock.mockRejectedValueOnce(new Error("private database details"));
    const { POST } = await loadRoute();

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Folder import could not complete. Please try again.",
    });
  });

  it("keeps a late workspace permission denial as a forbidden response", async () => {
    const { POST } = await loadRoute();
    const { MediaPermissionError } = await import("@/lib/media/errors");
    runMediaFolderBatchMock.mockRejectedValueOnce(new MediaPermissionError());

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You do not have permission to import media into this workspace.",
    });
  });
});
