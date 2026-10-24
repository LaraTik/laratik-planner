import { beforeEach, describe, expect, it, vi } from "vitest";

const { getContentItem, listWorkspaceContent } = vi.hoisted(() => ({
  getContentItem: vi.fn(),
  listWorkspaceContent: vi.fn(),
}));

vi.mock("@/features/content/server", () => ({ getContentItem, listWorkspaceContent }));
vi.mock("@/lib/auth/policy", () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));

import {
  parseWorkspaceContentReference,
  resolveWorkspaceContentReference,
} from "@/features/workspace-assistant/reference-resolver";

const itemId = "d5d998ef-5fef-497a-8a7c-3c6a0f36f025";
const actor = { id: "actor-1" };
const resolvedItem = {
  id: itemId,
  workspaceId: "workspace-1",
  title: "November launch",
  brief: "Prepare launch copy",
  format: "post",
  status: "draft",
  plannedPublishAt: new Date("2026-11-05T10:00:00.000Z"),
  revision: 4,
  formatPayload: { caption: "Launch soon", internalNote: "Do not expose" },
  channels: [],
};

describe("workspace assistant content references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an item UUID and Planner URLs for the active workspace", () => {
    expect(parseWorkspaceContentReference(itemId, "brand")).toEqual({ kind: "id", id: itemId });
    expect(
      parseWorkspaceContentReference(
        `https://planner.example/app/a/agency/w/brand/planning/${itemId}?tab=copy`,
        "brand",
      ),
    ).toEqual({ kind: "workspace_item_url", id: itemId });
    expect(parseWorkspaceContentReference(`/app/w/brand/planning/${itemId}`, "brand")).toEqual({
      kind: "workspace_item_url",
      id: itemId,
    });
  });

  it("rejects a Planner URL that names a different workspace", () => {
    expect(parseWorkspaceContentReference(`/app/w/other/planning/${itemId}`, "brand")).toEqual({
      kind: "invalid_url",
    });
  });

  it("resolves calendar and planning URLs as the selected workspace plan period", () => {
    expect(
      parseWorkspaceContentReference(
        "https://planner.example/app/a/agency/w/brand/calendar?month=2026-11",
        "brand",
      ),
    ).toEqual({ kind: "plan_url", month: "2026-11" });
    expect(parseWorkspaceContentReference("plan for 2026-12", "brand")).toEqual({
      kind: "plan_url",
      month: "2026-12",
    });
    expect(parseWorkspaceContentReference("November 2026 plan", "brand")).toEqual({
      kind: "plan_url",
      month: "2026-11",
    });
    expect(parseWorkspaceContentReference("نوفمبر 2026", "brand")).toEqual({
      kind: "plan_url",
      month: "2026-11",
    });
    expect(parseWorkspaceContentReference("current plan", "brand")).toEqual({
      kind: "selected_plan",
    });
  });

  it("resolves a unique title through the authorized content service", async () => {
    listWorkspaceContent.mockResolvedValueOnce([
      {
        id: itemId,
        title: "November launch",
        format: "post",
        status: "draft",
        plannedPublishAt: resolvedItem.plannedPublishAt,
        revision: 4,
      },
    ]);
    getContentItem.mockResolvedValueOnce(resolvedItem);

    await expect(
      resolveWorkspaceContentReference(actor, "workspace-1", "brand", "November launch"),
    ).resolves.toMatchObject({ status: "resolved", item: { id: itemId, revision: 4 } });
    expect(listWorkspaceContent).toHaveBeenCalledWith(actor, "workspace-1", {
      search: "November launch",
      limit: 10,
    });
  });

  it("returns bounded candidates when a title is ambiguous", async () => {
    listWorkspaceContent.mockResolvedValueOnce([
      {
        id: itemId,
        title: "Launch teaser",
        format: "post",
        status: "draft",
        plannedPublishAt: resolvedItem.plannedPublishAt,
        revision: 1,
      },
      {
        id: "4a6c2d93-bb23-44e9-b8f7-62cc337b28f5",
        title: "Launch announcement",
        format: "story",
        status: "draft",
        plannedPublishAt: resolvedItem.plannedPublishAt,
        revision: 2,
      },
    ]);

    await expect(
      resolveWorkspaceContentReference(actor, "workspace-1", "brand", "Launch"),
    ).resolves.toMatchObject({
      status: "ambiguous",
      candidates: [{ id: itemId }, { title: "Launch announcement" }],
    });
    expect(getContentItem).not.toHaveBeenCalled();
  });

  it("does not resolve an ID from another workspace", async () => {
    getContentItem.mockResolvedValueOnce({ ...resolvedItem, workspaceId: "workspace-2" });

    await expect(
      resolveWorkspaceContentReference(actor, "workspace-1", "brand", itemId),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("uses the existing month-bound calendar instead of inventing a plan entity", async () => {
    await expect(
      resolveWorkspaceContentReference(actor, "workspace-1", "brand", "plan for 2026-12"),
    ).resolves.toEqual({ status: "plan", month: "2026-12" });
  });
});
