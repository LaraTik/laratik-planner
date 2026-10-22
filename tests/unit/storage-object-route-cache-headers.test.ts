import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canAccessWorkspace: vi.fn(),
  select: vi.fn(),
  fetchStorageObject: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/policy", () => ({ canAccessWorkspace: mocks.canAccessWorkspace }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/storage/read-service", () => ({ fetchStorageObject: mocks.fetchStorageObject }));
vi.mock("@/lib/storage/r2-adapter", () => ({ StorageConfigurationError: class extends Error {} }));

import { GET } from "@/app/api/storage/objects/[id]/route";

describe("GET /api/storage/objects/[id] cache policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.canAccessWorkspace.mockResolvedValue(true);
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { workspaceId: "workspace-1", agencyId: "agency-1", mimeType: "image/png" },
            ]),
        }),
      }),
    });
    mocks.fetchStorageObject.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      }),
      status: 200,
      headers: new Headers(),
    });
  });

  it("does not cache authorized object bytes in the browser", async () => {
    const response = await GET(new NextRequest("http://localhost/api/storage/objects/object-1"), {
      params: Promise.resolve({ id: "object-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBeNull();
  });
});
