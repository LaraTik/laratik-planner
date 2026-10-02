import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  actor: { id: "11111111-1111-4111-8111-111111111111" },
  insert: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
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
vi.mock("@/lib/db", () => ({
  db: { insert: mocks.insert, select: mocks.select, delete: mocks.delete },
}));

import { POST as createWatchlist } from "@/app/api/research/watchlists/route";
import {
  DELETE as removeMember,
  POST as addMember,
} from "@/app/api/research/watchlists/[id]/members/route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/research/watchlists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("research watchlist routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasWorkspaceRole.mockResolvedValue(true);
  });

  it("creates a named watchlist in the resolved workspace", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        workspaceId: "workspace-1",
        createdBy: mocks.actor.id,
        name: "Halal grocery competitors",
        description: null,
        shareScope: "workspace",
        archivedAt: null,
      },
    ]);
    mocks.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
      }),
    });

    const response = await createWatchlist(
      request({
        workspaceSlug: "acme",
        name: "Halal grocery competitors",
        shareScope: "workspace",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(returning).toHaveBeenCalledOnce();
  });

  it("rejects duplicate watchlists without exposing database details", async () => {
    mocks.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    });

    const response = await createWatchlist(
      request({ workspaceSlug: "acme", name: "Halal grocery competitors" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "duplicate" });
  });

  it("adds and removes a membership only after both records pass workspace scope", async () => {
    const scopeChain = {
      limit: vi.fn().mockResolvedValue([
        {
          watchlistId: "33333333-3333-4333-8333-333333333333",
          accountId: "44444444-4444-4444-8444-444444444444",
        },
      ]),
    };
    const whereChain = { limit: scopeChain.limit };
    const joinChain = { where: vi.fn().mockReturnValue(whereChain) };
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ innerJoin: vi.fn().mockReturnValue(joinChain) }),
    });
    mocks.insert.mockReturnValue({
      values: vi
        .fn()
        .mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }),
    });
    mocks.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    const routeContext = {
      params: Promise.resolve({ id: "33333333-3333-4333-8333-333333333333" }),
    };
    const body = {
      workspaceSlug: "acme",
      accountId: "44444444-4444-4444-8444-444444444444",
    };
    const addResponse = await addMember(request(body), routeContext);
    const removeResponse = await removeMember(request(body), routeContext);

    expect(addResponse.status).toBe(200);
    expect(removeResponse.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
});
