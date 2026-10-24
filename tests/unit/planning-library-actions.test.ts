import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  getAccessibleWorkspace: vi.fn(),
  hasWorkspaceRole: vi.fn(),
  createPillar: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: mocks.getAccessibleWorkspace,
}));
vi.mock("@/lib/auth/policy", () => ({
  hasWorkspaceRole: mocks.hasWorkspaceRole,
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));
vi.mock("@/lib/planning/campaigns", () => ({ archiveCampaign: vi.fn(), createCampaign: vi.fn() }));
vi.mock("@/lib/planning/pillars", () => ({
  archivePillar: vi.fn(),
  createPillar: mocks.createPillar,
}));
vi.mock("@/lib/planning/templates", () => ({ archiveTemplate: vi.fn(), createTemplate: vi.fn() }));
vi.mock("@/lib/planning/content-clone", () => ({ duplicateContentItem: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logError: mocks.logError }));

const { createPillarAction } =
  await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/library/actions");

beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.currentActor.mockResolvedValue({ id: "user-1" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.getAccessibleWorkspace.mockResolvedValue({ id: "workspace-1" });
  mocks.hasWorkspaceRole.mockResolvedValue(true);
  mocks.createPillar.mockReset();
  mocks.logError.mockReset();
});

describe("planning-library action errors", () => {
  it("hides and logs unexpected persistence failures", async () => {
    const failure = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    mocks.createPillar.mockRejectedValueOnce(failure);
    const formData = new FormData();
    formData.set("name", "Editorial");

    const result = await createPillarAction("workspace", {}, formData);

    expect(result).toEqual({ errorCode: "save_failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(mocks.logError).toHaveBeenCalledWith("planning_library.pillar_create_failed", {
      err: failure,
    });
  });

  it("keeps the known duplicate-pillar outcome actionable", async () => {
    mocks.createPillar.mockRejectedValueOnce(
      new Error("A pillar with that name already exists in this workspace"),
    );
    const formData = new FormData();
    formData.set("name", "Editorial");

    const result = await createPillarAction("workspace", {}, formData);

    expect(result).toEqual({ errorCode: "duplicate_pillar" });
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});
