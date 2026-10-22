import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAccessibleWorkspace: vi.fn(),
  hasWorkspaceRole: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  linkProfile: vi.fn(),
  setConnectionStatus: vi.fn(),
  disconnectProfile: vi.fn(),
  revokeConnectionAndDetach: vi.fn(),
  transaction: vi.fn(),
}));

const selectChain = {
  from: vi.fn(() => selectChain),
  where: vi.fn(() => selectChain),
  then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
};

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: mocks.getAccessibleWorkspace,
}));
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: mocks.hasWorkspaceRole }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/social/repository", () => ({
  linkProfile: mocks.linkProfile,
  setConnectionStatus: mocks.setConnectionStatus,
  disconnectProfile: mocks.disconnectProfile,
  revokeConnectionAndDetach: mocks.revokeConnectionAndDetach,
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => selectChain),
    transaction: mocks.transaction,
  },
}));

const { finalizeMetaSelectionAction } =
  await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/channels/actions");

beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getAccessibleWorkspace.mockResolvedValue({ id: "workspace-1" });
  mocks.hasWorkspaceRole.mockResolvedValue(true);
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.linkProfile.mockRejectedValue(
    new Error("postgres://planner:secret@example.test/planner_test: connection refused"),
  );
  mocks.transaction.mockImplementation((callback: (tx: object) => unknown) => callback({}));
});

describe("finalizeMetaSelectionAction failure mapping", () => {
  it("returns safe copy for unexpected persistence errors", async () => {
    const result = await finalizeMetaSelectionAction(
      "workspace",
      {},
      {
        connectionId: "00000000-0000-4000-8000-000000000001",
        profiles: [
          {
            providerAccountId: "page-1",
            platform: "facebook",
            accountName: "Page",
          },
        ],
      },
    );

    expect(result).toEqual({ error: "Failed to link profiles." });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
