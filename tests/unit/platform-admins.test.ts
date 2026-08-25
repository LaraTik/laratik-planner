import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type DrizzleState = {
  selectResults: unknown[][];
  executeResults: unknown[][];
  insertCalls: unknown[];
  updateCalls: unknown[];
};

function dequeue(state: DrizzleState): unknown[] {
  return state.selectResults.shift() ?? [];
}

function makeDrizzleMock(state: DrizzleState) {
  function selectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(dequeue(state)));
    chain.then = (resolve: (value: unknown[]) => void) => resolve(dequeue(state));
    return chain;
  }

  const select = vi.fn(() => selectChain());
  const insert = vi.fn(() => ({
    values: vi.fn((values: unknown) => {
      state.insertCalls.push(values);
      return Promise.resolve();
    }),
  }));
  const update = vi.fn(() => ({
    set: vi.fn((values: unknown) => ({
      where: vi.fn(() => {
        state.updateCalls.push(values);
        return Promise.resolve();
      }),
    })),
  }));
  const execute = vi.fn(() => Promise.resolve({ rows: state.executeResults.shift() ?? [] }));
  const mock = { select, insert, update, execute };
  const transaction = vi.fn(async (callback: (tx: typeof mock) => unknown) => callback(mock));
  return { ...mock, transaction, state };
}

const dbMock = vi.hoisted(() =>
  makeDrizzleMock({
    selectResults: [],
    executeResults: [],
    insertCalls: [],
    updateCalls: [],
  }),
);

vi.mock("@/lib/db", () => ({ db: dbMock }));

const accessMock = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/auth/platform-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/platform-access")>(
    "@/lib/auth/platform-access",
  );
  return { ...actual, requirePlatformPermission: accessMock.requirePermission };
});

const service = await import("@/lib/platform/access");

const ACTOR_ID = "00000000-0000-4000-8000-00000000a001";
const TARGET_ID = "00000000-0000-4000-8000-00000000a002";
const actor = { id: ACTOR_ID };

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.executeResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.execute.mockClear();
  dbMock.transaction.mockClear();
  accessMock.requirePermission.mockReset();
  accessMock.requirePermission.mockResolvedValue({
    actor,
    role: "platform_owner",
    permissions: new Set(),
  });
});

describe("platform access schemas", () => {
  it.each([
    "platform_owner",
    "agency_operator",
    "platform_auditor",
    "support_operator",
  ] as const)("accepts the closed %s role", (role) => {
    expect(
      service.GrantPlatformAccessSchema.parse({
        email: "person@example.com",
        role,
        reason: "Operational need",
      }).role,
    ).toBe(role);
  });

  it("normalizes email and rejects unknown roles or weak reasons", () => {
    expect(
      service.GrantPlatformAccessSchema.parse({
        email: " Person@Example.COM ",
        role: "platform_owner",
        reason: "Emergency owner",
      }).email,
    ).toBe("person@example.com");
    expect(() =>
      service.GrantPlatformAccessSchema.parse({
        email: "person@example.com",
        role: "super_admin",
        reason: "No",
      }),
    ).toThrow();
  });
});

describe("platform access reads", () => {
  it("requires access-read and maps only active assignments", async () => {
    dbMock.state.executeResults.push([
      {
        user_id: TARGET_ID,
        email: "operator@example.com",
        display_name: "Operator",
        role: "agency_operator",
        granted_by: ACTOR_ID,
        granted_at: new Date("2026-08-25T08:00:00Z"),
        updated_at: new Date("2026-08-25T09:00:00Z"),
        reason: "Operations",
        grantor_email: "owner@example.com",
      },
    ]);

    const rows = await service.listPlatformAccess(actor);

    expect(accessMock.requirePermission).toHaveBeenCalledWith(actor, "platform.access.read");
    expect(rows).toEqual([
      expect.objectContaining({
        userId: TARGET_ID,
        role: "agency_operator",
        grantedByEmail: "owner@example.com",
      }),
    ]);
  });

  it("requires access-read for the audit timeline", async () => {
    dbMock.state.selectResults.push([]);
    await service.listPlatformAccessAudit(actor, 10);
    expect(accessMock.requirePermission).toHaveBeenCalledWith(actor, "platform.access.read");
  });
});

describe("grantPlatformAccess", () => {
  it("requires manage permission and writes an explicit role plus atomic audit", async () => {
    dbMock.state.selectResults.push([{ id: TARGET_ID, email: "person@example.com" }], []);

    const result = await service.grantPlatformAccess(actor, {
      email: "person@example.com",
      role: "support_operator",
      reason: "Support rotation",
    });

    expect(accessMock.requirePermission).toHaveBeenCalledWith(actor, "platform.access.manage");
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
    expect(dbMock.state.insertCalls[0]).toMatchObject({
      userId: TARGET_ID,
      role: "support_operator",
      grantedBy: ACTOR_ID,
    });
    expect(dbMock.state.insertCalls[1]).toMatchObject({
      action: "platform_access.grant",
      metadata: {
        previousRole: null,
        newRole: "support_operator",
        reason: "Support rotation",
      },
    });
    expect(result).toEqual({ userId: TARGET_ID, role: "support_operator", unchanged: false });
  });

  it("reactivates a revoked assignment with the submitted role", async () => {
    dbMock.state.selectResults.push(
      [{ id: TARGET_ID, email: "person@example.com" }],
      [{ userId: TARGET_ID, role: "platform_auditor", revokedAt: new Date() }],
    );

    await service.grantPlatformAccess(actor, {
      email: "person@example.com",
      role: "agency_operator",
      reason: "Return to operations",
    });

    expect(dbMock.state.updateCalls[0]).toMatchObject({
      role: "agency_operator",
      revokedAt: null,
      grantedBy: ACTOR_ID,
    });
    expect(dbMock.state.insertCalls[0]).toMatchObject({
      action: "platform_access.grant",
      metadata: {
        previousRole: "platform_auditor",
        newRole: "agency_operator",
      },
    });
  });

  it("is idempotent for an already-active assignment with the same role", async () => {
    dbMock.state.selectResults.push(
      [{ id: TARGET_ID, email: "person@example.com" }],
      [{ userId: TARGET_ID, role: "support_operator", revokedAt: null }],
    );

    const result = await service.grantPlatformAccess(actor, {
      email: "person@example.com",
      role: "support_operator",
      reason: "Duplicate submission",
    });

    expect(result.unchanged).toBe(true);
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

describe("changePlatformRole", () => {
  it("is idempotent when the role is unchanged", async () => {
    dbMock.state.selectResults.push([
      { userId: TARGET_ID, role: "platform_auditor", revokedAt: null },
    ]);
    const result = await service.changePlatformRole(actor, {
      userId: TARGET_ID,
      role: "platform_auditor",
      reason: "No effective change",
    });
    expect(result.unchanged).toBe(true);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("blocks downgrading the final active Owner", async () => {
    dbMock.state.selectResults.push(
      [{ userId: TARGET_ID, role: "platform_owner", revokedAt: null }],
      [{ value: 1 }],
    );
    await expect(
      service.changePlatformRole(actor, {
        userId: TARGET_ID,
        role: "platform_auditor",
        reason: "Reduce privileges",
      }),
    ).rejects.toMatchObject({ code: service.PlatformAccessErrorCode.LastOwner });
  });

  it("changes role and records old/new role metadata", async () => {
    dbMock.state.selectResults.push([
      { userId: TARGET_ID, role: "agency_operator", revokedAt: null },
    ]);
    await service.changePlatformRole(actor, {
      userId: TARGET_ID,
      role: "platform_auditor",
      reason: "Move to assurance",
    });
    expect(dbMock.state.updateCalls[0]).toMatchObject({ role: "platform_auditor" });
    expect(dbMock.state.insertCalls[0]).toMatchObject({
      action: "platform_access.role_change",
      metadata: {
        previousRole: "agency_operator",
        newRole: "platform_auditor",
        reason: "Move to assurance",
      },
    });
  });
});

describe("revokePlatformAccess", () => {
  it("blocks revoking the final active Owner", async () => {
    dbMock.state.selectResults.push(
      [{ userId: TARGET_ID, role: "platform_owner", revokedAt: null }],
      [{ value: 1 }],
    );
    await expect(
      service.revokePlatformAccess(actor, { userId: TARGET_ID, reason: "Offboarding" }),
    ).rejects.toMatchObject({ code: service.PlatformAccessErrorCode.LastOwner });
  });

  it("soft-revokes and audits a non-final assignment", async () => {
    dbMock.state.selectResults.push([
      { userId: TARGET_ID, role: "support_operator", revokedAt: null },
    ]);
    const result = await service.revokePlatformAccess(actor, {
      userId: TARGET_ID,
      reason: "Rotation ended",
    });
    expect(dbMock.state.updateCalls[0]).toMatchObject({ reason: "Rotation ended" });
    expect(dbMock.state.updateCalls[0]).toHaveProperty("revokedAt");
    expect(dbMock.state.insertCalls[0]).toMatchObject({
      action: "platform_access.revoke",
      metadata: {
        previousRole: "support_operator",
        newRole: null,
        reason: "Rotation ended",
      },
    });
    expect(result).toEqual({ userId: TARGET_ID, role: "support_operator", unchanged: false });
  });
});
