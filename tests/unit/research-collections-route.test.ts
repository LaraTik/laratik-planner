import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  actor: { id: "11111111-1111-4111-8111-111111111111" },
  insert: vi.fn(),
  hasWorkspaceRole: vi.fn(async () => true),
}));

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: vi.fn(async () => mocks.actor) }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: vi.fn(async () => ({ agencyId: "agency-1" })),
}));
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: mocks.hasWorkspaceRole }));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: vi.fn(async () => ({ id: "workspace-1", slug: "acme" })),
}));
vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert } }));

import { POST } from "@/app/api/research/collections/route";

describe("POST /api/research/collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Q4 hooks",
              description: null,
              shareScope: "workspace",
              createdBy: mocks.actor.id,
            },
          ]),
        }),
      }),
    });
  });

  it("rejects an empty collection name before touching the database", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/research/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug: "acme", name: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates a workspace-visible collection for a planner", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/research/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceSlug: "acme",
          name: "Q4 hooks",
          shareScope: "workspace",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const values = mocks.insert.mock.results[0]?.value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        name: "Q4 hooks",
        shareScope: "workspace",
      }),
    );
  });
});
