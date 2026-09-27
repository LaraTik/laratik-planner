import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Workspace rename — command schema + service.
 *
 * The contract under test:
 *   - the command normalises before it validates, so the stored value
 *     is the value that was length-checked;
 *   - the policy gate runs before any write;
 *   - a rename that changes nothing is a no-op (no UPDATE, no audit
 *     row) rather than a duplicate event;
 *   - a real rename writes exactly one `workspace_rename` audit row
 *     carrying the before/after pair;
 *   - a workspace that vanished under us raises a typed error the
 *     action layer can map to a 404-shaped message.
 */

const serverEnvMock = vi.hoisted(() => ({}));
vi.mock("@/lib/validation/env", () => ({ serverEnv: serverEnvMock }));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown }[];
  executeCalls: unknown[];
};

function makeDrizzleMock(state: DrizzleState) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(state.selectResults.shift() ?? []));

  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
  // A thenable: the service awaits `tx.insert(...).values(...)`
  // directly, with no trailing `.onConflictDoUpdate()`.
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
    return Promise.resolve();
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn(() => {
    state.updateCalls.push({ set: lastSet });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const execute = vi.fn((sqlArg: unknown) => {
    state.executeCalls.push(sqlArg);
    return Promise.resolve();
  });

  const txApi = { execute, select, insert, update };
  const transaction = vi.fn(async (cb: (tx: typeof txApi) => Promise<unknown>) => cb(txApi));

  return { select, insert, update, transaction, execute, state };
}

const dbMock = vi.hoisted(() =>
  makeDrizzleMock({ selectResults: [], insertCalls: [], updateCalls: [], executeCalls: [] }),
);

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
  // Mirror the real requirePolicy: await the predicate; throw if false.
  requirePolicy: vi.fn(async (predicate: Promise<boolean>, action: string) => {
    if (!(await predicate)) {
      const err = new Error(`Permission denied: ${action}`);
      err.name = "PermissionDeniedError";
      throw err;
    }
  }),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return {
    ...actual,
    hasWorkspaceRole: policyMock.hasWorkspaceRole,
    requirePolicy: policyMock.requirePolicy,
  };
});

const { renameWorkspace, WorkspaceNotFoundError } = await import("@/lib/workspaces/rename-service");
const { workspaceRenameCommandSchema, nameFromForm, WORKSPACE_NAME_MAX_LENGTH } =
  await import("@/lib/workspaces/rename-command");

const actor = { id: "user-1" };
const workspaceId = "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa";

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.state.executeCalls = [];
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.requirePolicy.mockReset();
  policyMock.requirePolicy.mockImplementation(
    async (predicate: Promise<boolean>, action: string) => {
      if (!(await predicate)) {
        const err = new Error(`Permission denied: ${action}`);
        err.name = "PermissionDeniedError";
        throw err;
      }
    },
  );
});

describe("workspaceRenameCommandSchema", () => {
  it("trims and collapses internal whitespace before validating", () => {
    const parsed = workspaceRenameCommandSchema.parse({
      workspaceId,
      name: "  Lara   Tik \n Media  ",
    });
    expect(parsed.name).toBe("Lara Tik Media");
  });

  it("rejects an empty name", () => {
    expect(workspaceRenameCommandSchema.safeParse({ workspaceId, name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    const result = workspaceRenameCommandSchema.safeParse({ workspaceId, name: "   \t  " });
    expect(result.success).toBe(false);
  });

  it("accepts exactly the maximum length and rejects one more", () => {
    const atMax = "a".repeat(WORKSPACE_NAME_MAX_LENGTH);
    expect(workspaceRenameCommandSchema.safeParse({ workspaceId, name: atMax }).success).toBe(true);
    expect(workspaceRenameCommandSchema.safeParse({ workspaceId, name: `${atMax}a` }).success).toBe(
      false,
    );
  });

  it("measures length after collapsing, not before", () => {
    // 80 visible characters spread over 200 raw characters. If the
    // bounds were checked on the raw string this would be rejected.
    const half = WORKSPACE_NAME_MAX_LENGTH / 2;
    const padded = `${"a".repeat(half)}${" ".repeat(120)}${"b".repeat(half - 1)}`;
    expect(padded.length).toBeGreaterThan(WORKSPACE_NAME_MAX_LENGTH);
    const parsed = workspaceRenameCommandSchema.safeParse({ workspaceId, name: padded });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.name).toHaveLength(WORKSPACE_NAME_MAX_LENGTH);
  });

  it("requires a uuid workspaceId", () => {
    expect(workspaceRenameCommandSchema.safeParse({ workspaceId: "nope", name: "X" }).success).toBe(
      false,
    );
  });

  it("nameFromForm normalises the same way the schema does", () => {
    expect(nameFromForm("  Acme   Co  ")).toBe("Acme Co");
    expect(nameFromForm(null)).toBe("");
  });
});

describe("renameWorkspace", () => {
  it("requires the workspace_manager role", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(renameWorkspace(actor, { workspaceId, name: "New" })).rejects.toThrow(
      /permission denied: rename_workspace/i,
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("validates before it authorises or writes", async () => {
    await expect(renameWorkspace(actor, { workspaceId, name: "   " })).rejects.toThrow();
    expect(policyMock.hasWorkspaceRole).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("locks the workspace row before reading it", async () => {
    dbMock.state.selectResults = [[{ id: workspaceId, name: "Old" }]];
    await renameWorkspace(actor, { workspaceId, name: "New" });
    expect(dbMock.state.executeCalls).toHaveLength(1);
    expect(dbMock.transaction).toHaveBeenCalled();
  });

  it("is a no-op when the name is unchanged", async () => {
    dbMock.state.selectResults = [[{ id: workspaceId, name: "Lara Tik" }]];
    const result = await renameWorkspace(actor, { workspaceId, name: " Lara  Tik " });

    expect(result).toEqual({ ok: true, changed: false, name: "Lara Tik" });
    expect(dbMock.state.updateCalls).toHaveLength(0);
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("treats a case-only change as a real rename", async () => {
    dbMock.state.selectResults = [[{ id: workspaceId, name: "lara tik" }]];
    const result = await renameWorkspace(actor, { workspaceId, name: "Lara Tik" });

    expect(result.changed).toBe(true);
    expect(dbMock.state.updateCalls).toHaveLength(1);
  });

  it("updates the name and writes one audit row carrying from/to", async () => {
    dbMock.state.selectResults = [[{ id: workspaceId, name: "Old Name" }]];
    const result = await renameWorkspace(actor, { workspaceId, name: "New Name" });

    expect(result).toEqual({ ok: true, changed: true, name: "New Name" });
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ name: "New Name" });

    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      actorId: actor.id,
      action: "workspace_rename",
      targetType: "workspace",
      targetId: workspaceId,
      outcome: "success",
      metadata: { from: "Old Name", to: "New Name" },
    });
  });

  it("raises WorkspaceNotFoundError when the row is gone", async () => {
    dbMock.state.selectResults = [[]];
    await expect(renameWorkspace(actor, { workspaceId, name: "New" })).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    );
    expect(dbMock.state.updateCalls).toHaveLength(0);
  });

  it("never writes the slug", async () => {
    dbMock.state.selectResults = [[{ id: workspaceId, name: "Old" }]];
    await renameWorkspace(actor, { workspaceId, name: "New" });
    const written = dbMock.state.updateCalls[0]?.set as Record<string, unknown>;
    expect(Object.keys(written)).toEqual(["name", "updatedAt"]);
    expect(written).not.toHaveProperty("slug");
  });
});
