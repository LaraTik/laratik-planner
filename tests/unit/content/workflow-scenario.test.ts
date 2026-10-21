import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isWorkspaceManager: true,
  transactionCount: 0,
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      state.transactionCount += 1;
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn(async () => {
              state.updates.push(values);
            }),
          })),
        })),
      };
      return callback(tx);
    }),
  },
}));

vi.mock("@/lib/auth/policy", () => ({
  hasWorkspaceRole: vi.fn(async () => state.isWorkspaceManager),
}));

const { applyWorkflowScenario } = await import("@/features/content/server");
const actor = { id: "user-1" };

beforeEach(() => {
  state.isWorkspaceManager = true;
  state.transactionCount = 0;
  state.updates = [];
});

describe("applyWorkflowScenario", () => {
  it("persists the scenario and its required approval mode for the supplied actor", async () => {
    const result = await applyWorkflowScenario(actor, "workspace-1", "two_gate_client");

    expect(result).toMatchObject({
      ok: true,
      applied: 1,
      forcedApprovalMode: "internal_then_client",
    });
    expect(state.transactionCount).toBe(1);
    expect(state.updates[0]).toMatchObject({
      workflowScenario: "two_gate_client",
      approvalMode: "internal_then_client",
    });
  });

  it("denies non-managers before opening a transaction", async () => {
    state.isWorkspaceManager = false;

    await expect(applyWorkflowScenario(actor, "workspace-1", "standard")).resolves.toEqual({
      ok: false,
      error: "Workspace manager access is required.",
    });
    expect(state.transactionCount).toBe(0);
  });

  it("rejects an unknown scenario without writing", async () => {
    await expect(applyWorkflowScenario(actor, "workspace-1", "unknown")).resolves.toEqual({
      ok: false,
      error: "Unknown workflow scenario.",
    });
    expect(state.transactionCount).toBe(0);
  });
});
