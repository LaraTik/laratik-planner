import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Invitation service tests — exercise the major branches of
 * createInvitation, acceptInvitation, listInvitations, resendInvitation,
 * revokeInvitation, deactivateUser, reactivateUser, listAgencyMembers.
 *
 * The DB is mocked with a chainable that records calls and resolves
 * queued rows. Helper policy functions are mocked so the SUT is
 * exercised end-to-end.
 */

const serverEnvMock = vi.hoisted(() => ({
  AUTH_SECRET: "test-secret",
  AUTH_URL: "http://localhost:3000",
  BOOTSTRAP_SETUP_TOKEN: "test-bootstrap-token",
}));

vi.mock("@/lib/validation/env", () => ({
  serverEnv: serverEnvMock,
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: string; values: unknown }[];
  insertReturningIds: { id: string }[];
  updateCalls: { table: string; set: unknown; where: unknown }[];
  deleteCalls: { table: string; where: unknown }[];
  transactionCalls: number;
  executeCalls: { sql: unknown }[];
};

function makeDrizzleMock(state: DrizzleState) {
  // Both `.where()` and `.orderBy()` are thenable proxies:
  //   - If the caller awaits the result, the queued rows resolve.
  //   - If the caller chains `.limit(n)`, the chain's `.limit` resolves
  //     the queued rows instead (so `.where().limit(1)` and just
  //     `.where()` both work).
  function thenableProxy(target: Record<string, unknown>): Record<string, unknown> {
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(state.selectResults.shift() ?? []);
        }
        if (prop === "limit") {
          return t.limit;
        }
        if (prop === "for") {
          return t.for;
        }
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
    // `.for("update")` is chainable; the next terminator (`.limit()`) resolves.
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
    const returningChain: Record<string, unknown> = {
      returning: vi.fn(() => {
        const row = state.insertReturningIds.shift() ?? { id: "default-id" };
        return Promise.resolve([row]);
      }),
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
    const txInsertChain: Record<string, unknown> = {
      values: vi.fn((values: unknown) => {
        state.insertCalls.push({ table: "tx-insert", values });
        const onConflictUpdateChain: Record<string, unknown> = {
          returning: vi.fn(() => {
            const row = state.insertReturningIds.shift() ?? { id: "default-id" };
            return Promise.resolve([row]);
          }),
          onConflictDoNothing: vi.fn(() => Promise.resolve()),
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
      }),
    };
    const txInsert = vi.fn(() => txInsertChain);
    const txUpdateChain: Record<string, unknown> = {
      set: vi.fn((set: unknown) => {
        state.updateCalls.push({ table: "tx-update", set, where: undefined });
        return txUpdateChain;
      }),
      where: vi.fn(() => Promise.resolve()),
    };
    const txUpdate = vi.fn(() => txUpdateChain);
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
    transactionCalls: 0,
    executeCalls: [],
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const memberSafetyMock = vi.hoisted(() => ({
  assertCanDeactivateAgencyMember: vi.fn(),
}));

vi.mock("@/lib/auth/member-safety", () => memberSafetyMock);

const emailMock = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ id: "msg-1" }) as { id: string } | null),
}));

vi.mock("@/lib/email", () => emailMock);

const rateLimitMock = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(
    async () =>
      ({ allowed: true, remaining: 9 }) as
        { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number },
  ),
}));

vi.mock("@/lib/security/rate-limit", () => rateLimitMock);

const quotaMock = vi.hoisted(() => ({
  reserveCapacity: vi.fn(async () => undefined),
  releaseCapacity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/entitlements", () => quotaMock);

const {
  createInvitation,
  acceptInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  deactivateUser,
  reactivateUser,
  listAgencyMembers,
} = await import("@/lib/auth/invitations");

const actorId = "11111111-1111-1111-1111-111111111111";
const workspaceId = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.insertReturningIds = [];
  dbMock.state.updateCalls = [];
  dbMock.state.deleteCalls = [];
  dbMock.state.transactionCalls = 0;
  dbMock.state.executeCalls = [];
  memberSafetyMock.assertCanDeactivateAgencyMember.mockReset();
  emailMock.sendEmail.mockReset();
  emailMock.sendEmail.mockResolvedValue({ id: "msg-1" });
  rateLimitMock.enforceRateLimit.mockReset();
  rateLimitMock.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
  quotaMock.reserveCapacity.mockClear();
  quotaMock.releaseCapacity.mockClear();
});

describe("createInvitation", () => {
  it("throws when no agency is provided", async () => {
    await expect(
      createInvitation({
        agencyId: "",
        email: "x@example.com",
        grantsAgencyAdmin: false,
        workspaceRoles: [],
        invitedBy: actorId,
      }),
    ).rejects.toThrow(/agency not configured/i);
  });

  it("creates an invitation with the normalized email, generates a token, and emails the invitee", async () => {
    dbMock.state.insertReturningIds.push({ id: "inv-1" });

    const result = await createInvitation({
      agencyId: "agency-2",
      email: "  Alice@Example.COM ",
      grantsAgencyAdmin: false,
      workspaceRoles: [],
      invitedBy: actorId,
    });

    expect(result.id).toBe("inv-1");
    expect(result.acceptUrl).toMatch(/^http:\/\/localhost:3000\/accept-invitation\?token=/);
    expect(result.expiresAt).toBeInstanceOf(Date);

    // The invitation row was inserted with a normalized email and a hash, NOT a raw token.
    const inviteInsert = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["email"] === "alice@example.com",
    );
    expect(inviteInsert).toBeDefined();
    expect((inviteInsert?.values as Record<string, unknown>)["tokenHash"]).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect((inviteInsert?.values as Record<string, unknown>)["invitedBy"]).toBe(actorId);
    expect((inviteInsert?.values as Record<string, unknown>)["agencyId"]).toBe("agency-2");

    // The email was sent with the raw accept URL (from the returned acceptUrl, which includes the raw token).
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(1);
    const emailCalls = emailMock.sendEmail.mock.calls;
    expect(emailCalls.length).toBeGreaterThan(0);
    const firstCallArgs = emailCalls[0] as unknown as [{ to: string }];
    const emailTo = firstCallArgs[0];
    expect(emailTo.to).toBe("alice@example.com");
  });

  it("rejects when a requested workspace id is not owned by the agency", async () => {
    dbMock.state.selectResults.push([]); // no existing pending invitation
    // The workspace check returns fewer rows than requested → throw
    dbMock.state.selectResults.push([]);

    await expect(
      createInvitation({
        agencyId: "agency-1",
        email: "x@example.com",
        grantsAgencyAdmin: false,
        workspaceRoles: [{ workspaceId, role: "designer" }],
        invitedBy: actorId,
      }),
    ).rejects.toThrow(/invalid workspace access/i);
  });
});

describe("acceptInvitation", () => {
  it("returns 'invalid' when the rate limit denies the attempt", async () => {
    rateLimitMock.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const result = await acceptInvitation({ rawToken: "x".repeat(32), userId: actorId });
    expect(result).toEqual({ status: "invalid", workspaceIds: [] });
  });

  it("returns 'invalid' when no invitation matches the hashed token", async () => {
    dbMock.state.selectResults.push([]); // SELECT .for("update")
    const result = await acceptInvitation({ rawToken: "x".repeat(32), userId: actorId });
    expect(result.status).toBe("invalid");
    expect(result.workspaceIds).toEqual([]);
  });

  it("returns 'invalid' when the accepting user is not the invited email", async () => {
    dbMock.state.selectResults.push([
      {
        id: "inv-1",
        email: "alice@example.com",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000),
        agencyId: "agency-1",
        grantsAgencyAdmin: false,
      },
    ]);
    // Next select: accepting user
    dbMock.state.selectResults.push([
      { email: "mallory@example.com", emailVerifiedAt: new Date() },
    ]);

    const result = await acceptInvitation({ rawToken: "x".repeat(32), userId: actorId });
    expect(result.status).toBe("invalid");
  });

  it("returns 'expired' when the invitation is past its expiry", async () => {
    dbMock.state.selectResults.push([
      {
        id: "inv-1",
        email: "alice@example.com",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
        agencyId: "agency-1",
        grantsAgencyAdmin: false,
      },
    ]);
    dbMock.state.selectResults.push([{ email: "alice@example.com", emailVerifiedAt: new Date() }]);

    const result = await acceptInvitation({ rawToken: "x".repeat(32), userId: actorId });
    expect(result.status).toBe("expired");
  });

  it("returns 'invalid' for a revoked invitation", async () => {
    dbMock.state.selectResults.push([
      {
        id: "inv-1",
        email: "alice@example.com",
        status: "revoked",
        expiresAt: new Date(Date.now() + 1000),
        agencyId: "agency-1",
        grantsAgencyAdmin: false,
      },
    ]);
    const result = await acceptInvitation({ rawToken: "x".repeat(32), userId: actorId });
    expect(result.status).toBe("invalid");
  });

  it("accepts a valid invitation and returns the granted workspace ids", async () => {
    dbMock.state.selectResults.push([
      {
        id: "inv-1",
        email: "alice@example.com",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000),
        agencyId: "agency-1",
        grantsAgencyAdmin: false,
      },
    ]);
    dbMock.state.selectResults.push([{ email: "alice@example.com", emailVerifiedAt: new Date() }]);
    // grantRoles select
    dbMock.state.selectResults.push([{ workspaceId, role: "designer" }]);
    // workspaceMembership insert returning
    dbMock.state.insertReturningIds.push({ id: "wm-1" });

    const result = await acceptInvitation({ rawToken: "x".repeat(32), userId: actorId });

    expect(result.status).toBe("accepted");
    expect(result.workspaceIds).toContain(workspaceId);
  });

  it("returns 'accepted' idempotently for an already-accepted invitation", async () => {
    dbMock.state.selectResults.push([
      {
        id: "inv-1",
        email: "alice@example.com",
        status: "accepted",
        expiresAt: new Date(Date.now() + 1000),
        agencyId: "agency-1",
        grantsAgencyAdmin: false,
      },
    ]);
    dbMock.state.selectResults.push([{ email: "alice@example.com", emailVerifiedAt: new Date() }]);
    // workspaceIdsForInvitationInTx
    dbMock.state.selectResults.push([{ workspaceId }]);

    const result = await acceptInvitation({ rawToken: "x".repeat(32), userId: actorId });
    expect(result.status).toBe("accepted");
    expect(result.workspaceIds).toEqual([workspaceId]);
  });
});

describe("listInvitations", () => {
  it("returns [] when the selected agency has no invitations", async () => {
    expect(await listInvitations("agency-1")).toEqual([]);
  });

  it("returns the queued rows for the current agency", async () => {
    dbMock.state.selectResults.push([{ id: "inv-1", email: "x@example.com", status: "pending" }]);
    const rows = await listInvitations("agency-1");
    expect(rows).toHaveLength(1);
  });
});

describe("resendInvitation", () => {
  it("throws when the invitation is not found", async () => {
    dbMock.state.selectResults.push([]);
    await expect(
      resendInvitation({ invitationId: "inv-1", agencyId: "agency-1", invitedBy: actorId }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws when the invitation is not pending", async () => {
    dbMock.state.selectResults.push([{ id: "inv-1", email: "x", status: "accepted" }]);
    await expect(
      resendInvitation({ invitationId: "inv-1", agencyId: "agency-1", invitedBy: actorId }),
    ).rejects.toThrow(/cannot resend/i);
  });

  it("updates the token, resets expiry, and emails the new link", async () => {
    dbMock.state.selectResults.push([{ id: "inv-1", email: "x@example.com", status: "pending" }]);

    const acceptUrl = await resendInvitation({
      invitationId: "inv-1",
      agencyId: "agency-1",
      invitedBy: actorId,
    });
    expect(acceptUrl).toMatch(/accept-invitation/);
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(1);
    const updateCall = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["tokenHash"] !== undefined,
    );
    expect(updateCall).toBeDefined();
  });
});

describe("revokeInvitation", () => {
  it("updates the invitation to status=revoked", async () => {
    dbMock.state.selectResults.push([{ status: "pending" }]);
    await revokeInvitation({ invitationId: "inv-1", agencyId: "agency-1" });
    const call = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["status"] === "revoked",
    );
    expect(call).toBeDefined();
  });
});

describe("deactivateUser", () => {
  it("throws when no active agency member is found", async () => {
    dbMock.state.selectResults.push([]);
    await expect(
      deactivateUser({ actorUserId: "actor-1", targetUserId: "target-1", agencyId: "agency-1" }),
    ).rejects.toThrow(/active agency member/i);
  });

  it("calls assertCanDeactivateAgencyMember and updates rows on success", async () => {
    dbMock.state.selectResults.push([{ isAgencyAdmin: false }]); // target
    dbMock.state.selectResults.push([{ count: 1 }]); // admin count
    dbMock.state.selectResults.push([{ id: "ws-1" }]); // agency workspaces

    await deactivateUser({
      actorUserId: "actor-1",
      targetUserId: "target-1",
      agencyId: "agency-1",
    });

    expect(memberSafetyMock.assertCanDeactivateAgencyMember).toHaveBeenCalled();
    const deactivateUpdate = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["status"] === "deactivated",
    );
    expect(deactivateUpdate).toBeDefined();
  });
});

describe("reactivateUser", () => {
  it("reactivates the agency membership and inserts an audit event", async () => {
    dbMock.state.selectResults.push([{ status: "deactivated" }]);
    dbMock.state.selectResults.push([{ id: "ws-1" }]);

    await reactivateUser({ userId: "user-1", agencyId: "agency-1", actorUserId: "actor-1" });

    const reactivateUpdate = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["status"] === "active",
    );
    expect(reactivateUpdate).toBeDefined();
    const auditInsert = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["action"] === "member_reactivate",
    );
    expect(auditInsert).toBeDefined();
  });
});

describe("listAgencyMembers", () => {
  it("returns [] when the selected agency has no members", async () => {
    expect(await listAgencyMembers("agency-1")).toEqual([]);
  });

  it("returns the queued rows", async () => {
    dbMock.state.selectResults.push([{ userId: "u-1", email: "u@example.com" }]);
    const rows = await listAgencyMembers("agency-1");
    expect(rows).toHaveLength(1);
  });
});
