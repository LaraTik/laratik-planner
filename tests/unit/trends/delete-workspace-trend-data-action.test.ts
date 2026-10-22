import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  requirePlatformPermission: vi.fn(),
  getAccessibleWorkspace: vi.fn(),
  transaction: vi.fn(),
  auditRows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/platform-access", () => ({
  requirePlatformPermission: mocks.requirePlatformPermission,
}));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: mocks.getAccessibleWorkspace,
}));
vi.mock("@/lib/db", () => ({
  db: {
    transaction: mocks.transaction,
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        mocks.auditRows.push(row);
        return Promise.resolve();
      }),
    })),
  },
}));
vi.mock("@/lib/observability/sentry", () => ({ captureError: vi.fn() }));

const { deleteWorkspaceTrendDataAction } =
  await import("@/lib/trends/delete-workspace-trend-data-action");

beforeEach(() => {
  mocks.currentActor.mockResolvedValue({ id: "platform-user" });
  mocks.requirePlatformPermission.mockResolvedValue(undefined);
  mocks.getAccessibleWorkspace.mockResolvedValue({ id: "workspace-1", name: "Acme" });
  mocks.transaction.mockRejectedValue(
    new Error("postgres://planner:secret@example.test/planner_test: connection refused"),
  );
  mocks.auditRows.length = 0;
});

describe("deleteWorkspaceTrendDataAction failure audit privacy", () => {
  it("stores a stable code instead of raw persistence details", async () => {
    const form = new FormData();
    form.set("typedPhrase", "Acme");
    form.set("reason", "Privacy request from the workspace owner.");

    const result = await deleteWorkspaceTrendDataAction("acme", undefined, form);

    expect(result).toEqual({
      ok: false,
      error: "The trend data could not be deleted. Try again or contact platform support.",
    });
    expect(mocks.auditRows[0]).toMatchObject({
      outcome: "failed",
      metadata: { error_message: "persistence_failure" },
    });
    expect(JSON.stringify(mocks.auditRows)).not.toContain("secret");
  });
});
