import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Deliveries service tests — exercise the schema, submitDelivery,
 * decideApproval, listApprovalsForItem, listDeliveriesForItem,
 * and the deriveCreativeApprovalOutcome helper.
 */

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  insertReturningIds: { id: string }[];
  updateCalls: { table: unknown; set: unknown; where: unknown }[];
  deleteCalls: { table: unknown; where: unknown }[];
  executeCalls: { sql: unknown }[];
  transactionCalls: number;
};

function makeDrizzleMock(state: DrizzleState) {
  function thenableProxy(target: Record<string, unknown>): Record<string, unknown> {
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(state.selectResults.shift() ?? []);
        }
        if (prop === "limit") return t.limit;
        if (prop === "for") return t.for;
        if (prop === "orderBy") return t.orderBy;
        return Reflect.get(t, prop, receiver);
      },
    });
  }
  function makeSelectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => thenableProxy(chain));
    chain.orderBy = vi.fn(() => thenableProxy(chain));
    chain.for = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    return chain;
  }
  const select = vi.fn(() => makeSelectChain());

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ table: "insert", values });
    const onConflictUpdateChain: Record<string, unknown> = {
      returning: vi.fn(() => {
        const row = state.insertReturningIds.shift() ?? { id: "default-id" };
        return Promise.resolve([row]);
      }),
    };
    const returningChain: Record<string, unknown> = {
      returning: vi.fn(() => {
        const row = state.insertReturningIds.shift() ?? { id: "default-id" };
        return Promise.resolve([row]);
      }),
      onConflictDoUpdate: vi.fn(() => onConflictUpdateChain),
      onConflictDoNothing: vi.fn(() => Promise.resolve()),
    };
    return returningChain;
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

  const deleteChain: Record<string, unknown> = {};
  deleteChain.where = vi.fn((where: unknown) => {
    state.deleteCalls.push({ table: "delete", where });
    return Promise.resolve();
  });
  const del = vi.fn(() => deleteChain);

  const execute = vi.fn((sqlArg: unknown) => {
    state.executeCalls.push({ sql: sqlArg });
    return Promise.resolve();
  });

  const transaction = vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
    state.transactionCalls += 1;
    const txSelect = vi.fn(() => makeSelectChain());
    const txInsert = vi.fn(() => insertChain);
    const txUpdate = vi.fn(() => updateChain);
    const txApi = {
      select: txSelect,
      insert: txInsert,
      update: txUpdate,
      execute: vi.fn(() => Promise.resolve()),
    };
    return cb(txApi);
  });

  return { select, insert, update, delete: del, transaction, execute, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    insertCalls: [],
    insertReturningIds: [],
    updateCalls: [],
    deleteCalls: [],
    executeCalls: [],
    transactionCalls: 0,
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
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
  return { ...actual, ...policyMock };
});

const {
  submitDelivery,
  decideApproval,
  listApprovalsForItem,
  listDeliveriesForItem,
  listDeliveryVersionsForItem,
  SubmitDeliverySchema,
  DecideApprovalSchema,
} = await import("@/lib/deliveries/service");
const { deriveCreativeApprovalOutcome } = await import("@/lib/deliveries/approval-workflow");

const actor = { id: "user-1" };
const contentItemId = "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa";

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.insertReturningIds = [];
  dbMock.state.updateCalls = [];
  dbMock.state.deleteCalls = [];
  dbMock.state.executeCalls = [];
  dbMock.state.transactionCalls = 0;
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

describe("SubmitDeliverySchema", () => {
  const baseInput = {
    contentItemId,
    description: "First delivery",
    links: [
      {
        provider: "google_drive" as const,
        label: "Drive folder",
        url: "https://drive.google.com/folder",
        isPreview: false,
      },
    ],
  };

  it("accepts a valid submission", () => {
    expect(SubmitDeliverySchema.safeParse(baseInput).success).toBe(true);
  });

  it("rejects non-https URLs", () => {
    const result = SubmitDeliverySchema.safeParse({
      ...baseInput,
      links: [{ ...baseInput.links[0], url: "http://example.com" }],
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one link", () => {
    const result = SubmitDeliverySchema.safeParse({ ...baseInput, links: [] });
    expect(result.success).toBe(false);
  });

  it("rejects unknown providers", () => {
    const result = SubmitDeliverySchema.safeParse({
      ...baseInput,
      links: [{ ...baseInput.links[0], provider: "ftp" }],
    });
    expect(result.success).toBe(false);
  });

  // P0a (2026-09-03, /ui-ux-pro-max): description is optional.
  // A designer submitting "the link *is* the deliverable" used to
  // have to invent a description to pass the schema.
  it("accepts a submission without a description", () => {
    const { description: _omit, ...withoutDescription } = baseInput;
    expect(_omit).toBe("First delivery");
    expect(SubmitDeliverySchema.safeParse(withoutDescription).success).toBe(true);
  });

  it("accepts an empty description string", () => {
    const result = SubmitDeliverySchema.safeParse({ ...baseInput, description: "" });
    expect(result.success).toBe(true);
  });
});

describe("submitDelivery", () => {
  const input = {
    contentItemId,
    description: "First delivery",
    links: [
      {
        provider: "google_drive" as const,
        label: "Drive folder",
        url: "https://drive.google.com/folder",
        isPreview: false,
      },
    ],
  };

  it("throws when the content item is missing", async () => {
    dbMock.state.selectResults.push([]);
    await expect(submitDelivery(actor, input)).rejects.toThrow(/not found/i);
  });

  it("rejects when the actor is not a designer/manager", async () => {
    dbMock.state.selectResults.push([
      { workspaceId: "ws-1", status: "in_design", changeRequestGate: null },
    ]);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(submitDelivery(actor, input)).rejects.toThrow(/permission denied/i);
  });

  it("rejects when the content is in a non-design status", async () => {
    dbMock.state.selectResults.push([
      { workspaceId: "ws-1", status: "draft", changeRequestGate: null },
    ]);
    await expect(submitDelivery(actor, input)).rejects.toThrow(/cannot submit a delivery/i);
  });

  it("submits a delivery version, cancels prior approval requests, and opens a new internal review", async () => {
    dbMock.state.selectResults.push([
      { workspaceId: "ws-1", status: "in_design", changeRequestGate: null },
    ]); // item
    // inside tx: max version query
    dbMock.state.selectResults.push([{ max: 2 }]);
    // insert returning
    dbMock.state.insertReturningIds.push({ id: "v-3" });

    const result = await submitDelivery(actor, input);

    expect(result).toEqual({ deliveryVersionId: "v-3", versionNumber: 3 });
    // Approval request was inserted for the internal creative review
    const approvalInsert = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["gate"] === "creative_internal",
    );
    expect(approvalInsert).toBeDefined();
  });

  it("accepts a creative revision when the content is in changes_requested with a creative gate", async () => {
    dbMock.state.selectResults.push([
      { workspaceId: "ws-1", status: "changes_requested", changeRequestGate: "creative_internal" },
    ]);
    dbMock.state.selectResults.push([{ max: 1 }]);
    dbMock.state.insertReturningIds.push({ id: "v-2" });

    const result = await submitDelivery(actor, input);
    expect(result.versionNumber).toBe(2);
  });

  it("accepts a creative revision when the change request gate is creative_client", async () => {
    dbMock.state.selectResults.push([
      { workspaceId: "ws-1", status: "changes_requested", changeRequestGate: "creative_client" },
    ]);
    dbMock.state.selectResults.push([{ max: 0 }]);
    dbMock.state.insertReturningIds.push({ id: "v-1" });

    const result = await submitDelivery(actor, input);
    expect(result.versionNumber).toBe(1);
  });
});

describe("DecideApprovalSchema", () => {
  it("accepts a valid input", () => {
    expect(
      DecideApprovalSchema.safeParse({
        approvalRequestId: contentItemId,
        decision: "approved",
        feedback: "Looks great",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown decisions", () => {
    expect(
      DecideApprovalSchema.safeParse({
        approvalRequestId: contentItemId,
        decision: "rejected",
      }).success,
    ).toBe(false);
  });
});

describe("decideApproval", () => {
  it("throws when feedback is missing for changes_requested", async () => {
    await expect(
      decideApproval(actor, { approvalRequestId: contentItemId, decision: "changes_requested" }),
    ).rejects.toThrow(/feedback/i);
  });

  it("throws when the approval request is not found", async () => {
    dbMock.state.selectResults.push([]);
    await expect(
      decideApproval(actor, { approvalRequestId: contentItemId, decision: "approved" }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws when the request is not pending", async () => {
    dbMock.state.selectResults.push([
      { id: contentItemId, status: "approved", contentItemId, gate: "creative_internal" },
    ]);
    await expect(
      decideApproval(actor, { approvalRequestId: contentItemId, decision: "approved" }),
    ).rejects.toThrow(/Request is/i);
  });

  it("records an approved decision and updates the content item to ready_to_publish", async () => {
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]); // outer select
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]); // content item workspace lookup
    // inside tx:
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]); // lockedRequest select
    dbMock.state.selectResults.push([{ approvalMode: "simple" }]); // settings
    // markDeliveryFinal updates: isFinalApproved: false + isFinalApproved: true

    const result = await decideApproval(actor, {
      approvalRequestId: contentItemId,
      decision: "approved",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects content gate decisions (must use the content workflow command)", async () => {
    dbMock.state.selectResults.push([
      { id: contentItemId, status: "pending", contentItemId, gate: "content" },
    ]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      { id: contentItemId, status: "pending", contentItemId, gate: "content" },
    ]);
    dbMock.state.selectResults.push([{ approvalMode: "simple" }]);
    await expect(
      decideApproval(actor, { approvalRequestId: contentItemId, decision: "approved" }),
    ).rejects.toThrow(/content workflow/i);
  });

  it("rejects the internal client when deliveryVersionId is missing for a client request", async () => {
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: null,
      },
    ]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: null,
      },
    ]);
    dbMock.state.selectResults.push([{ approvalMode: "internal_then_client" }]);
    await expect(
      decideApproval(actor, { approvalRequestId: contentItemId, decision: "approved" }),
    ).rejects.toThrow(/delivery version is required/i);
  });

  it("creates a client approval request in internal_then_client mode on internal approve", async () => {
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ approvalMode: "internal_then_client" }]);

    const result = await decideApproval(actor, {
      approvalRequestId: contentItemId,
      decision: "approved",
    });
    expect(result).toEqual({ ok: true });
    const clientReq = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["gate"] === "creative_client",
    );
    expect(clientReq).toBeDefined();
  });

  it("rejects when the approval request is no longer pending (race condition)", async () => {
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "approved",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]);
    await expect(
      decideApproval(actor, { approvalRequestId: contentItemId, decision: "approved" }),
    ).rejects.toThrow(/no longer pending/i);
  });

  it("rejects when the actor is not the right reviewer for the gate", async () => {
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      decideApproval(actor, { approvalRequestId: contentItemId, decision: "approved" }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("decideApproval maps creative_client gate to client_reviewer role", async () => {
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_client",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_client",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ approvalMode: "simple" }]);

    await decideApproval(actor, { approvalRequestId: contentItemId, decision: "approved" });
    // The role check should have been called with ["client_reviewer"].
    const calls = policyMock.hasWorkspaceRole.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const roleCall = calls[calls.length - 1] as unknown as [unknown, unknown, string[]];
    expect(roleCall[2]).toEqual(["client_reviewer"]);
  });

  it("decideApproval records changes_requested and invalidates the request", async () => {
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: contentItemId,
        status: "pending",
        contentItemId,
        gate: "creative_internal",
        deliveryVersionId: "v-1",
      },
    ]);
    dbMock.state.selectResults.push([{ approvalMode: "simple" }]);

    await decideApproval(actor, {
      approvalRequestId: contentItemId,
      decision: "changes_requested",
      feedback: "Branding off",
    });
    const decision = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["decision"] === "changes_requested",
    );
    expect(decision).toBeDefined();
    const update = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["status"] === "changes_requested",
    );
    expect(update).toBeDefined();
    expect((update?.set as Record<string, unknown>)["invalidatedAt"]).toBeInstanceOf(Date);
  });
});

describe("listDeliveriesForItem — version with no links", () => {
  it("returns versions with an empty links array when the version has no links", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: "v-1",
        versionNumber: 1,
        description: "V1",
        designerNote: null,
        submittedAt: new Date(),
        isFinalApproved: false,
        submittedBy: "u-1",
        submittedByName: "User",
      },
    ]);
    dbMock.state.selectResults.push([]); // no links for any version
    const rows = await listDeliveriesForItem(actor, contentItemId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.links).toEqual([]);
  });
});

describe("listApprovalsForItem", () => {
  it("throws when the content item is missing", async () => {
    dbMock.state.selectResults.push([]);
    await expect(listApprovalsForItem(actor, contentItemId)).rejects.toThrow(/not found/i);
  });

  it("returns the queued approvals for the item", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([{ id: "r-1", gate: "creative_internal", status: "pending" }]);
    const rows = await listApprovalsForItem(actor, contentItemId);
    expect(rows).toHaveLength(1);
  });
});

describe("listDeliveriesForItem", () => {
  it("returns [] when there are no delivery versions", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([]);
    const rows = await listDeliveriesForItem(actor, contentItemId);
    expect(rows).toEqual([]);
  });

  it("returns versions with their links", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: "v-1",
        versionNumber: 1,
        description: "V1",
        designerNote: null,
        submittedAt: new Date(),
        isFinalApproved: true,
        submittedBy: "u-1",
        submittedByName: "User",
      },
    ]);
    dbMock.state.selectResults.push([
      {
        id: "l-1",
        deliveryVersionId: "v-1",
        provider: "figma",
        label: "Figma",
        url: "https://figma.com/x",
        isPreview: false,
      },
    ]);
    const rows = await listDeliveriesForItem(actor, contentItemId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.links).toHaveLength(1);
  });
});

describe("deriveCreativeApprovalOutcome", () => {
  it("returns changes_requested when decision is changes_requested", () => {
    const out = deriveCreativeApprovalOutcome({
      gate: "creative_internal",
      decision: "changes_requested",
      approvalMode: "simple",
    });
    expect(out.contentStatus).toBe("changes_requested");
    expect(out.changeRequestGate).toBe("creative_internal");
    expect(out.statusReturnTarget).toBe("in_design");
  });

  it("creates a client request when internal approves in internal_then_client mode", () => {
    const out = deriveCreativeApprovalOutcome({
      gate: "creative_internal",
      decision: "approved",
      approvalMode: "internal_then_client",
    });
    expect(out.contentStatus).toBe("creative_review");
    expect(out.createClientRequest).toBe(true);
    expect(out.markDeliveryFinal).toBe(false);
  });

  it("marks the delivery final in simple mode", () => {
    const out = deriveCreativeApprovalOutcome({
      gate: "creative_internal",
      decision: "approved",
      approvalMode: "simple",
    });
    expect(out.contentStatus).toBe("ready_to_publish");
    expect(out.markDeliveryFinal).toBe(true);
  });

  it("uses the client gate to derive changes_requested's gate", () => {
    const out = deriveCreativeApprovalOutcome({
      gate: "creative_client",
      decision: "changes_requested",
      approvalMode: "internal_then_client",
    });
    expect(out.changeRequestGate).toBe("creative_client");
  });
});

describe("listDeliveryVersionsForItem", () => {
  it("throws when the content item is missing", async () => {
    dbMock.state.selectResults.push([]);
    await expect(listDeliveryVersionsForItem(actor, contentItemId)).rejects.toThrow(/not found/i);
  });

  it("throws PermissionDeniedError when the actor has no access to the workspace", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(listDeliveryVersionsForItem(actor, contentItemId)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("returns [] when there are no delivery versions", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([]);
    const rows = await listDeliveryVersionsForItem(actor, contentItemId);
    expect(rows).toEqual([]);
  });

  it("returns versions newest-first, each with its links ordered by createdAt", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    // 2 versions, returned by the DB in newest-first order
    dbMock.state.selectResults.push([
      {
        id: "v-2",
        versionNumber: 2,
        description: "V2",
        designerNote: "tweak",
        submittedAt: new Date("2026-08-20T10:00:00.000Z"),
        isFinalApproved: true,
        submittedBy: "u-1",
        submittedByName: "Maya",
        submittedByEmail: "maya@x",
      },
      {
        id: "v-1",
        versionNumber: 1,
        description: "V1",
        designerNote: null,
        submittedAt: new Date("2026-08-15T10:00:00.000Z"),
        isFinalApproved: false,
        submittedBy: "u-2",
        submittedByName: "Omar",
        submittedByEmail: "omar@x",
      },
    ]);
    // Links for the 2 versions, in createdAt ASC
    dbMock.state.selectResults.push([
      {
        id: "l-1",
        deliveryVersionId: "v-1",
        provider: "figma",
        label: "Figma",
        url: "https://figma.com/1",
        isPreview: false,
      },
      {
        id: "l-2",
        deliveryVersionId: "v-2",
        provider: "google_drive",
        label: "Drive",
        url: "https://drive.google.com/2",
        isPreview: true,
      },
    ]);
    const rows = await listDeliveryVersionsForItem(actor, contentItemId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.versionNumber).toBe(2);
    expect(rows[1]?.versionNumber).toBe(1);
    // isFinalApproved is exposed
    expect(rows[0]?.isFinalApproved).toBe(true);
    expect(rows[1]?.isFinalApproved).toBe(false);
    // Each version carries its own links
    expect(rows[0]?.links).toHaveLength(1);
    expect(rows[1]?.links).toHaveLength(1);
    expect(rows[0]?.links[0]?.url).toBe("https://drive.google.com/2");
    expect(rows[1]?.links[0]?.url).toBe("https://figma.com/1");
  });

  it("exposes the version number, description, designer note, submitter, and submitted timestamp", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: "v-1",
        versionNumber: 1,
        description: "Final creatives, v1",
        designerNote: "Headline needs tighter kerning",
        submittedAt: new Date("2026-08-15T10:00:00.000Z"),
        isFinalApproved: true,
        submittedBy: "u-1",
        submittedByName: "Maya",
        submittedByEmail: "maya@x",
      },
    ]);
    dbMock.state.selectResults.push([]);
    const rows = await listDeliveryVersionsForItem(actor, contentItemId);
    expect(rows[0]?.versionNumber).toBe(1);
    expect(rows[0]?.description).toBe("Final creatives, v1");
    expect(rows[0]?.designerNote).toBe("Headline needs tighter kerning");
    expect(rows[0]?.submittedBy).toEqual({ id: "u-1", name: "Maya" });
    expect(rows[0]?.submittedAt).toBeInstanceOf(Date);
  });

  it("client_reviewer actor: never returns internal-only fields (designerNote, submitterEmail)", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: "v-1",
        versionNumber: 1,
        description: "V1",
        designerNote: "Internal brand color tweak",
        submittedAt: new Date("2026-08-15T10:00:00.000Z"),
        isFinalApproved: false,
        submittedBy: "u-1",
        submittedByName: "Maya",
        submittedByEmail: "maya@x",
      },
    ]);
    dbMock.state.selectResults.push([]);
    const rows = await listDeliveryVersionsForItem({ id: "client-1" }, contentItemId, {
      isClientReviewer: true,
    });
    expect(rows[0]?.designerNote).toBeNull();
    // Submitter name is also redacted for client reviewers.
    expect(rows[0]?.submittedBy.name).toBe("");
    // The email field is never returned at all (client projection).
    expect((rows[0] as unknown as { submitterEmail?: string }).submitterEmail).toBeUndefined();
  });

  it("non-client actor: receives the full designer note and submitter name", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([
      {
        id: "v-1",
        versionNumber: 1,
        description: "V1",
        designerNote: "Internal note",
        submittedAt: new Date("2026-08-15T10:00:00.000Z"),
        isFinalApproved: false,
        submittedBy: "u-1",
        submittedByName: "Maya",
        submittedByEmail: "maya@x",
      },
    ]);
    dbMock.state.selectResults.push([]);
    const rows = await listDeliveryVersionsForItem({ id: "internal-1" }, contentItemId, {
      isClientReviewer: false,
    });
    expect(rows[0]?.designerNote).toBe("Internal note");
    expect(rows[0]?.submittedBy.name).toBe("Maya");
  });

  it("scopes authorization to the same role set as approvals (manager/planner/designer/reviewer/publisher/viewer/client_reviewer)", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([]);
    await listDeliveryVersionsForItem(actor, contentItemId);
    // The hasWorkspaceRole call must have been made with the same
    // inclusive role set as listApprovalsForItem / listDeliveriesForItem.
    const roleCall = policyMock.hasWorkspaceRole.mock.calls[0] as unknown as [
      unknown,
      unknown,
      string[],
    ];
    expect(roleCall[2]).toEqual([
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "client_reviewer",
      "publisher",
      "viewer",
    ]);
  });
});
