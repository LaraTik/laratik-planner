import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for `src/lib/platform/admins.ts` (superadmin-clarity).
 *
 * The service contract is:
 *   - `listPlatformAdmins()` — read every live grant with the grantor
 *     email joined for display.
 *   - `grantPlatformAdmin(actor, { email, reason })` — upsert a
 *     platform_administrator row keyed by the user's id (looked up
 *     by lower-cased email). Refuses to auto-create users.
 *   - `revokePlatformAdmin(actor, { userId, reason })` — soft-revoke
 *     (set `revoked_at`); refuses to revoke the last live admin.
 *   - `listPlatformAdminAudit(limit)` — last N audit rows for
 *     grant / revoke actions.
 *
 * DB is mocked at the chainable Drizzle surface. The policy module
 * is partially stubbed: `isPlatformAdmin` is flipped via
 * `policyOverrides`, the rest of the helpers come from the real
 * module (so the SUT's actual flow is exercised).
 */

vi.mock("server-only", () => ({}));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
  executeResults: unknown[][];
};

function dequeue(state: DrizzleState): unknown[] {
  return state.selectResults.shift() ?? [];
}

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(dequeue(state)));
    const thenable = (next: () => Record<string, unknown>) =>
      new Proxy(next(), {
        get(target, prop, receiver) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(dequeue(state));
          }
          if (prop === "limit") {
            return target.limit;
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    chain.where = vi.fn(() => thenable(() => chain));
    chain.orderBy = vi.fn(() => thenable(() => chain));
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
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
  updateChain.where = vi.fn((where: unknown) => {
    state.updateCalls.push({ set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  // `db.transaction(async (tx) => ...)` — give the test a callback
  // that re-uses the same mocked db shape inside the transaction
  // (the test suite doesn't exercise inside-tx branch variants).
  const transaction = vi.fn(async (cb: (tx: typeof dbMock) => unknown) => cb(dbMock));
  const execute = vi.fn(() => {
    const result = state.executeResults.shift() ?? [];
    return Promise.resolve({ rows: result });
  });

  return { select, insert, update, transaction, execute, state };
}

const dbMock = vi.hoisted(() =>
  makeDrizzleMock({
    selectResults: [],
    insertCalls: [],
    updateCalls: [],
    executeResults: [],
  }),
);

vi.mock("@/lib/db", () => ({
  db: {
    ...dbMock,
    transaction: (...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dbMock.transaction as any)(...args),
    execute: (...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dbMock.execute as any)(...args),
  },
}));

const policyOverrides = vi.hoisted(() => ({
  isPlatformAdminResult: true as boolean,
}));

vi.mock("@/lib/auth/platform-admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/platform-admin")>(
    "@/lib/auth/platform-admin",
  );
  return {
    ...actual,
    requirePlatformAdmin: vi.fn(async () => {
      if (!policyOverrides.isPlatformAdminResult) {
        const { PermissionDeniedError } = await import("@/lib/auth/policy");
        throw new PermissionDeniedError("platform-admin-required");
      }
    }),
  };
});

const {
  grantPlatformAdmin,
  revokePlatformAdmin,
  listPlatformAdmins,
  listPlatformAdminAudit,
  GrantPlatformAdminSchema,
  RevokePlatformAdminSchema,
  PlatformAdminErrorCode,
  PlatformAdminServiceError,
} = await import("@/lib/platform/admins");

const ACTOR_ID = "00000000-0000-4000-8000-00000000a001";
const GRANTEE_ID = "00000000-0000-4000-8000-00000000a002";

const actor = { id: ACTOR_ID };
const grantee = { id: GRANTEE_ID, email: "GRANTEE@example.com" };

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.state.executeResults = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.execute.mockClear();
  dbMock.transaction.mockClear();
  policyOverrides.isPlatformAdminResult = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GrantPlatformAdminSchema / RevokePlatformAdminSchema", () => {
  it("accepts a valid email + reason", () => {
    const parsed = GrantPlatformAdminSchema.parse({
      email: "person@example.com",
      reason: "onboarding operator",
    });
    expect(parsed.email).toBe("person@example.com");
    expect(parsed.reason).toBe("onboarding operator");
  });

  it("rejects an invalid email", () => {
    expect(() =>
      GrantPlatformAdminSchema.parse({ email: "not-an-email", reason: "abc" }),
    ).toThrow();
  });

  it("rejects a too-short reason", () => {
    expect(() =>
      GrantPlatformAdminSchema.parse({ email: "person@example.com", reason: "ab" }),
    ).toThrow();
  });

  it("requires a non-empty uuid for revoke", () => {
    expect(() =>
      RevokePlatformAdminSchema.parse({ userId: "not-a-uuid", reason: "abc" }),
    ).toThrow();
  });
});

describe("listPlatformAdmins", () => {
  it("returns an empty array when no rows exist", async () => {
    dbMock.state.executeResults.push([]);
    const rows = await listPlatformAdmins();
    expect(rows).toEqual([]);
  });

  it("maps the raw rows into the typed shape", async () => {
    dbMock.state.executeResults.push([
      {
        user_id: grantee.id,
        email: "grantee@example.com",
        display_name: "Grantee",
        granted_by: actor.id,
        granted_at: new Date("2026-08-24T10:00:00Z"),
        revoked_at: null,
        reason: "first grant",
        grantor_email: "actor@example.com",
      },
    ]);
    const rows = await listPlatformAdmins();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(grantee.id);
    expect(rows[0]?.email).toBe("grantee@example.com");
    expect(rows[0]?.grantedByEmail).toBe("actor@example.com");
  });
});

describe("grantPlatformAdmin", () => {
  it("rejects when the actor is not a platform admin", async () => {
    policyOverrides.isPlatformAdminResult = false;
    await expect(
      grantPlatformAdmin(actor, { email: "x@example.com", reason: "ops" }),
    ).rejects.toThrow();
  });

  it("throws UserNotFound when no user row matches the email", async () => {
    dbMock.state.selectResults.push([]); // user lookup
    try {
      await grantPlatformAdmin(actor, { email: "ghost@example.com", reason: "ops" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PlatformAdminServiceError);
      expect((e as InstanceType<typeof PlatformAdminServiceError>).code).toBe(
        PlatformAdminErrorCode.UserNotFound,
      );
    }
  });

  it("is idempotent when the user already has a live grant", async () => {
    // user lookup → existing row with revoked_at null
    dbMock.state.selectResults.push([{ id: grantee.id, email: grantee.email }]);
    dbMock.state.selectResults.push([{ userId: grantee.id, revokedAt: null }]);
    const result = await grantPlatformAdmin(actor, {
      email: grantee.email,
      reason: "duplicate grant",
    });
    expect(result.alreadyGranted).toBe(true);
    expect(result.userId).toBe(grantee.id);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("re-activates a soft-revoked grant instead of inserting a duplicate", async () => {
    dbMock.state.selectResults.push([{ id: grantee.id, email: grantee.email }]);
    dbMock.state.selectResults.push([{ userId: grantee.id, revokedAt: new Date() }]);
    const result = await grantPlatformAdmin(actor, {
      email: grantee.email,
      reason: "re-activation",
    });
    expect(result.alreadyGranted).toBe(false);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.insert).toHaveBeenCalledTimes(1); // the audit row
  });

  it("inserts a new grant + audit row when no row exists", async () => {
    dbMock.state.selectResults.push([{ id: grantee.id, email: grantee.email }]);
    dbMock.state.selectResults.push([]); // no existing row
    const result = await grantPlatformAdmin(actor, {
      email: grantee.email,
      reason: "first grant",
    });
    expect(result.userId).toBe(grantee.id);
    expect(result.alreadyGranted).toBe(false);
    // One insert for the grant row, one insert for the audit row.
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
    const insertValues = dbMock.state.insertCalls.map((c) => c.values);
    expect(insertValues[0]).toMatchObject({ userId: grantee.id, grantedBy: actor.id });
    expect(insertValues[1]).toMatchObject({
      action: "platform_admin.grant",
      targetType: "user",
      targetId: grantee.id,
      outcome: "success",
    });
  });
});

describe("revokePlatformAdmin", () => {
  it("rejects when the actor is not a platform admin", async () => {
    policyOverrides.isPlatformAdminResult = false;
    await expect(
      revokePlatformAdmin(actor, { userId: grantee.id, reason: "left team" }),
    ).rejects.toThrow();
  });

  it("throws NotFound when no grant exists for the user", async () => {
    dbMock.state.selectResults.push([]); // no target row
    try {
      await revokePlatformAdmin(actor, { userId: grantee.id, reason: "left team" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PlatformAdminServiceError);
      expect((e as InstanceType<typeof PlatformAdminServiceError>).code).toBe(
        PlatformAdminErrorCode.NotFound,
      );
    }
  });

  it("is idempotent when the grant is already revoked", async () => {
    dbMock.state.selectResults.push([
      { userId: grantee.id, revokedAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    const result = await revokePlatformAdmin(actor, {
      userId: grantee.id,
      reason: "already revoked",
    });
    expect(result.userId).toBe(grantee.id);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("refuses to revoke the last live platform admin (lockout guard)", async () => {
    dbMock.state.selectResults.push([{ userId: grantee.id, revokedAt: null }]);
    dbMock.state.selectResults.push([{ value: 1 }]); // live count = 1
    try {
      await revokePlatformAdmin(actor, { userId: grantee.id, reason: "lockout guard" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PlatformAdminServiceError);
      expect((e as InstanceType<typeof PlatformAdminServiceError>).code).toBe(
        PlatformAdminErrorCode.LastAdmin,
      );
    }
  });

  it("soft-revokes + appends audit when more than one admin is live", async () => {
    dbMock.state.selectResults.push([{ userId: grantee.id, revokedAt: null }]);
    dbMock.state.selectResults.push([{ value: 2 }]); // live count = 2
    const result = await revokePlatformAdmin(actor, {
      userId: grantee.id,
      reason: "role change",
    });
    expect(result.userId).toBe(grantee.id);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const updateCall = dbMock.state.updateCalls[0];
    expect(updateCall?.set).toMatchObject({ reason: "role change" });
    expect(updateCall?.set).toHaveProperty("revokedAt");
    expect(dbMock.insert).toHaveBeenCalledTimes(1); // audit row
    const auditRow = dbMock.state.insertCalls[0]?.values;
    expect(auditRow).toMatchObject({
      action: "platform_admin.revoke",
      targetType: "user",
      targetId: grantee.id,
      outcome: "success",
    });
  });
});

describe("listPlatformAdminAudit", () => {
  it("returns the rows the SUT selects, newest first", async () => {
    const rows = [
      {
        id: 1,
        actorId: actor.id,
        action: "platform_admin.grant",
        targetType: "user",
        targetId: grantee.id,
        outcome: "success",
        metadata: { reason: "x" },
        createdAt: new Date(),
      },
    ];
    dbMock.state.selectResults.push(rows);
    const out = await listPlatformAdminAudit(20);
    expect(out).toEqual(rows);
  });
});
