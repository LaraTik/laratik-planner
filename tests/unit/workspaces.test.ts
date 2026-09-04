import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Workspace settings service — tests the policy check, schema
 * validation, transaction shape, and "invalid assignment" guard.
 */

const serverEnvMock = vi.hoisted(() => ({}));

vi.mock("@/lib/validation/env", () => ({ serverEnv: serverEnvMock }));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  updateCalls: { table: unknown; set: unknown; where: unknown }[];
  executeCalls: { sql: unknown }[];
};

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ table: "insert", values });
    const chain2: Record<string, unknown> = {};
    chain2.onConflictDoUpdate = vi.fn(() => Promise.resolve());
    return chain2;
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn((where: unknown) => {
    state.updateCalls.push({ table: "update", set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const execute = vi.fn((sqlArg: unknown) => {
    state.executeCalls.push({ sql: sqlArg });
    return Promise.resolve();
  });

  const transaction = vi.fn(async (cb: (tx: typeof txApi) => Promise<unknown>) => {
    return cb(txApi);
  });

  const txApi = { execute, select, insert, update };

  return { select, insert, update, transaction, execute, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    insertCalls: [],
    updateCalls: [],
    executeCalls: [],
  };
  return makeDrizzleMock(state);
});

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

const { updateWorkspaceSettings } = await import("@/lib/workspaces/settings-service");
const { workspaceSettingsCommandSchema, nullableIdFromForm, nullableNumberFromForm } =
  await import("@/lib/workspaces/settings-command");

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

describe("workspaceSettingsCommandSchema", () => {
  const validInput = {
    workspaceId,
    timezone: "UTC",
    approvalMode: "simple" as const,
    monthlyTarget: null,
    contentApprovalLeadDays: 1,
    designCompleteLeadDays: 2,
    creativeApprovalLeadDays: 3,
    readyToPublishLeadDays: 1,
    defaultDesignerId: null,
    defaultContentReviewerId: null,
    defaultInternalCreativeReviewerId: null,
    defaultClientReviewerId: null,
  };

  it("accepts a valid command", () => {
    expect(workspaceSettingsCommandSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects an unknown timezone", () => {
    const result = workspaceSettingsCommandSchema.safeParse({
      ...validInput,
      timezone: "Pluto/Olympus",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown approval mode", () => {
    const result = workspaceSettingsCommandSchema.safeParse({
      ...validInput,
      approvalMode: "weird",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid workspaceId", () => {
    const result = workspaceSettingsCommandSchema.safeParse({ ...validInput, workspaceId: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects lead days out of range", () => {
    const result = workspaceSettingsCommandSchema.safeParse({
      ...validInput,
      contentApprovalLeadDays: 200,
    });
    expect(result.success).toBe(false);
  });

  it("rejects monthlyTarget out of range", () => {
    const result = workspaceSettingsCommandSchema.safeParse({
      ...validInput,
      monthlyTarget: 100_000,
    });
    expect(result.success).toBe(false);
  });
});

describe("nullableIdFromForm / nullableNumberFromForm", () => {
  it("returns null for an empty value (id)", () => {
    expect(nullableIdFromForm(null)).toBeNull();
    expect(nullableIdFromForm("")).toBeNull();
    expect(nullableIdFromForm("  ")).toBeNull();
  });

  it("returns the trimmed value when present (id)", () => {
    expect(nullableIdFromForm("  abc  ")).toBe("abc");
  });

  it("returns null for an empty value (number)", () => {
    expect(nullableNumberFromForm(null)).toBeNull();
    expect(nullableNumberFromForm("")).toBeNull();
  });

  it("returns a number when input is parseable", () => {
    expect(nullableNumberFromForm("42")).toBe(42);
  });
});

describe("updateWorkspaceSettings", () => {
  const baseInput = {
    workspaceId,
    timezone: "UTC",
    approvalMode: "simple" as const,
    monthlyTarget: 4,
    contentApprovalLeadDays: 1,
    designCompleteLeadDays: 2,
    creativeApprovalLeadDays: 3,
    readyToPublishLeadDays: 1,
    defaultDesignerId: null,
    defaultContentReviewerId: null,
    defaultInternalCreativeReviewerId: null,
    defaultClientReviewerId: null,
  };

  it("requires workspace_manager role", async () => {
    await updateWorkspaceSettings(actor, baseInput);
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
  });

  it("throws when actor is not a workspace manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(updateWorkspaceSettings(actor, baseInput)).rejects.toThrow(/permission denied/i);
  });

  it("inserts the workspaceSettings row with the provided values", async () => {
    await updateWorkspaceSettings(actor, baseInput);
    expect(dbMock.state.insertCalls.length).toBeGreaterThan(0);
    const settingsRow = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["approvalMode"] === "simple",
    );
    expect(settingsRow).toBeDefined();
    expect(settingsRow?.values).toMatchObject({
      workspaceId,
      approvalMode: "simple",
      monthlyTarget: 4,
    });
    expect(settingsRow?.values).not.toHaveProperty("metaPublishingEnabled");
  });

  it("changes Meta publishing only when the optional flag is supplied", async () => {
    await updateWorkspaceSettings(actor, { ...baseInput, metaPublishingEnabled: true });
    const settingsRow = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)?.["approvalMode"] === "simple",
    );
    expect(settingsRow?.values).toMatchObject({ metaPublishingEnabled: true });
  });

  it("updates the workspace row with the new timezone", async () => {
    await updateWorkspaceSettings(actor, { ...baseInput, timezone: "Europe/Stockholm" });
    const workspaceUpdate = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["timezone"] === "Europe/Stockholm",
    );
    expect(workspaceUpdate).toBeDefined();
  });

  it("rejects when an assigned designer is not a member of the workspace", async () => {
    // Membership check for defaultDesignerId returns empty
    dbMock.state.selectResults = [[]];

    await expect(
      updateWorkspaceSettings(actor, {
        ...baseInput,
        defaultDesignerId: "11111111-1111-1111-1111-111111111111",
      }),
    ).rejects.toThrow(/invalid defaultdesignerid/i);
  });

  it("accepts the input when each default-* userId matches a workspace member with the required role", async () => {
    // First the default designer membership check returns the row.
    dbMock.state.selectResults = [[{ id: "wm-1" }]];

    const result = await updateWorkspaceSettings(actor, {
      ...baseInput,
      defaultDesignerId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result).toEqual({ ok: true });
  });
});
