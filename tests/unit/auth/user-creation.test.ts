import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for `createUserDirectly` (lib/auth/user-creation.ts).
 *
 * The service is integration-test-covered against a real Postgres
 * (tests/integration/auth/user-creation.integration.test.ts) for the
 * happy path + 3 conflict paths. This file adds fast unit-test
 * coverage for the same code paths so the `src/lib/auth/**` v8
 * coverage floor holds at 95% (vs the 85% temporary floor set in
 * 026301e).
 *
 * The pattern is the same as auth-password-hash.test.ts: a
 * hand-rolled Drizzle mock that returns itself for the chained
 * builder calls (`from`, `where`, `set`, `values`, `returning`)
 * and pops from `state.selectResults` when `limit()` is called.
 * `reserveCapacity` is mocked at the module level so the service's
 * DB-transaction call doesn't have to know the quota tables.
 */

// ────────────────────────────────────────────────────────────────────
// Mocks — hoist before the imports so vi.mock can reference them.
// ────────────────────────────────────────────────────────────────────

const dbState = {
  selectResults: [] as unknown[][],
  insertCalls: [] as { values: unknown }[],
  updateCalls: [] as { set: unknown }[],
  reserveCapacityCalls: 0,
};

const dbMock = vi.hoisted(() => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = dbState.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    // Mirror the top-level select chain with a thenable so direct
    // `await` of the chain (no terminator) resolves to the rows.
    chain.then = (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(dbState.selectResults.shift() ?? []).then(resolve);
    return chain;
  }
  const selectChain = makeChain();
  const select = vi.fn(() => selectChain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    dbState.insertCalls.push({ values });
    // The user insert has a `.returning()` chained on it (returns id);
    // the other inserts (agency_membership, workspace_membership,
    // audit) resolve directly. Return a chain that supports both.
    insertChain.returning = vi.fn(() => Promise.resolve([{ id: "u-new" }]));
    return insertChain;
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  updateChain.set = vi.fn((set: unknown) => {
    dbState.updateCalls.push({ set });
    updateChain.where = vi.fn(() => Promise.resolve());
    return updateChain;
  });
  const update = vi.fn(() => updateChain);

  // The transaction callback receives a `tx` with the same
  // shape as `db` (so the service's tx.select() / tx.update() /
  // tx.insert() all work). The mock maintains its OWN select result
  // queue for the duration of the transaction, so a single test
  // can set up the pre-arrival returns and then drive the rest of
  // the transaction.
  const transaction = vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
    return cb({
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.innerJoin = vi.fn(() => chain);
        chain.where = vi.fn(() => chain);
        chain.limit = vi.fn(() => {
          const rows = dbState.selectResults.shift() ?? [];
          return Promise.resolve(rows);
        });
        // Real Drizzle queries are thenable — `await chain` (no
        // terminator like .limit()) resolves to the rows array.
        // Mirror that here so the service's `await tx.select(...).where(...)`
        // call (used for the workspace-ownership check) works.
        chain.then = (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(dbState.selectResults.shift() ?? []).then(resolve);
        return chain;
      }),
      update: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.set = vi.fn((set: unknown) => {
          dbState.updateCalls.push({ set });
          chain.where = vi.fn(() => Promise.resolve());
          return chain;
        });
        return chain;
      }),
      insert: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.values = vi.fn((values: unknown) => {
          dbState.insertCalls.push({ values });
          chain.returning = vi.fn(() => Promise.resolve([{ id: "u-new" }]));
          // Multi-role grants now use `onConflictDoUpdate` on
          // workspace_memberships and `onConflictDoNothing` on
          // workspace_membership_role. Both return a thenable that
          // resolves to a row so the surrounding `.returning()` call
          // keeps working.
          chain.onConflictDoUpdate = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.returning = vi.fn(() => Promise.resolve([{ id: "m-new" }]));
            return inner;
          });
          chain.onConflictDoNothing = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.returning = vi.fn(() => Promise.resolve([{ id: "m-new" }]));
            return inner;
          });
          return chain;
        });
        return chain;
      }),
    });
  });

  return { select, insert, update, transaction };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));
// `reserveCapacity` is the only side-effect outside the transaction
// callback. We mock it at the module level so the service can call
// it without a real entitlement row.
vi.mock("@/lib/entitlements", () => ({
  reserveCapacity: vi.fn(async () => {
    dbState.reserveCapacityCalls += 1;
  }),
}));

// Imports AFTER the mocks are registered.
const {
  createUserDirectly,
  ActiveAgencyMemberError,
  UserAlreadyExistsError,
  InvalidPasswordError,
} = await import("@/lib/auth/user-creation");

beforeEach(() => {
  dbState.selectResults = [];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.reserveCapacityCalls = 0;
  // Reset the transaction spy so call counts are per-test.
  // (The mock is hoisted, so vi.clearAllMocks would also clear
  // the reserveCapacity mock — but that's a vi.fn too, so we'd
  // have to re-attach. Clearing the transaction spy specifically
  // is the narrow reset that doesn't break the mock chain.)
  dbMock.transaction.mockClear();
});

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe("createUserDirectly — pre-transaction error paths", () => {
  it("throws InvalidPasswordError when the supplied password is too weak (defensive: the form already validates)", async () => {
    await expect(
      createUserDirectly({
        agencyId: "a-1",
        email: "user@example.com",
        password: "short",
        grantsAgencyAdmin: false,
        workspaceRoles: [],
        createdBy: "u-admin",
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordError);
  });
});

describe("createUserDirectly — transaction error paths", () => {
  it("throws ActiveAgencyMemberError when the email belongs to an active member of the same agency", async () => {
    // First select (active member check) returns a row → throw
    dbState.selectResults = [[{ userId: "u-existing" }]];

    await expect(
      createUserDirectly({
        agencyId: "a-1",
        email: "member@example.com",
        password: "TempPass123",
        grantsAgencyAdmin: false,
        workspaceRoles: [],
        createdBy: "u-admin",
      }),
    ).rejects.toBeInstanceOf(ActiveAgencyMemberError);
  });

  it("throws UserAlreadyExistsError when a user row with this email already exists (and no active agency membership)", async () => {
    // First select (active member) returns nothing;
    // second select (user exists) returns a row → throw
    dbState.selectResults = [[], [{ id: "u-existing" }]];

    await expect(
      createUserDirectly({
        agencyId: "a-1",
        email: "taken@example.com",
        password: "TempPass123",
        grantsAgencyAdmin: false,
        workspaceRoles: [],
        createdBy: "u-admin",
      }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("throws 'Invalid workspace access selection' when a requested workspace belongs to a different agency", async () => {
    // active member → nothing, user exists → nothing, then
    // workspace ownership select returns nothing (the workspace
    // doesn't belong to the agency).
    dbState.selectResults = [[], [], []];

    await expect(
      createUserDirectly({
        agencyId: "a-1",
        email: "new@example.com",
        password: "TempPass123",
        grantsAgencyAdmin: false,
        workspaceRoles: [{ workspaceId: "00000000-0000-0000-0000-000000000001", role: "viewer" }],
        createdBy: "u-admin",
      }),
    ).rejects.toThrow("Invalid workspace access selection");
  });
});

describe("createUserDirectly — happy path", () => {
  it("creates the user + memberships + audit event in one transaction and returns the temp password", async () => {
    // Setup the select queue:
    // 1. active member check → []
    // 2. user exists check → []
    // 3. workspace ownership check → 1 row (workspace is in the agency)
    // 4. workspace_membership insert returning → [{ id: 'm-1' }] (via the
    //    insert chain's returning); no further selects.
    dbState.selectResults = [[], [], [{ id: "w-1" }]];

    const result = await createUserDirectly({
      agencyId: "a-1",
      email: "newcomer@example.com",
      name: "Newcomer Person",
      password: "TempPass123",
      grantsAgencyAdmin: false,
      workspaceRoles: [{ workspaceId: "00000000-0000-0000-0000-000000000001", role: "viewer" }],
      createdBy: "u-admin",
    });

    // Returned shape
    expect(result.email).toBe("newcomer@example.com");
    expect(result.userId).toBe("u-new");
    expect(result.tempPassword).toBe("TempPass123");
    expect(result.acceptedWorkspaceIds).toEqual(["00000000-0000-0000-0000-000000000001"]);

    // Capacity was reserved exactly once for this test
    expect(dbState.reserveCapacityCalls).toBe(1);

    // 4 inserts were made: users, agency_memberships,
    // workspace_memberships, workspace_membership_roles, security_audit_events
    // (the user insert + agency_membership + workspace_membership +
    // workspace_membership_role + audit = 5 inserts).
    expect(dbState.insertCalls.length).toBeGreaterThanOrEqual(5);

    // The user insert is the first one and carries the passwordHash +
    // mustChangePassword + emailVerified + displayName.
    const userInsert = dbState.insertCalls[0];
    expect(userInsert?.values).toMatchObject({
      email: "newcomer@example.com",
      mustChangePassword: true,
      displayName: "Newcomer Person",
    });
    // The passwordHash is a bcrypt hash, not the plaintext.
    const userValues = userInsert?.values as Record<string, unknown>;
    expect(userValues?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(userValues?.passwordHash).not.toBe("TempPass123");

    // The audit insert carries the actor + intent + must-change flag.
    const auditInsert = dbState.insertCalls.find(
      (c) => (c.values as Record<string, unknown>).action === "user_create",
    );
    expect(auditInsert).toBeDefined();
    const auditMeta = (auditInsert?.values as Record<string, unknown>).metadata as Record<
      string,
      unknown
    > | null;
    expect(auditMeta?.source).toBe("admin_direct");
    expect(auditMeta?.mustChangePassword).toBe(true);

    // 1 update was made: the pending-invitation revoke (no-op when
    // no rows match, but the UPDATE statement still fires).
    expect(dbState.updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects an invalid role enum (the explicit per-role validation after workspace ownership)", async () => {
    // active member + user + workspace ownership all return empty / valid
    dbState.selectResults = [[], [], [{ id: "w-1" }]];

    await expect(
      createUserDirectly({
        agencyId: "a-1",
        email: "rolecheck@example.com",
        password: "TempPass123",
        grantsAgencyAdmin: false,
        // The zod schema on the action layer would normally reject
        // this, but the service has a defense-in-depth check too.
        workspaceRoles: [
          { workspaceId: "00000000-0000-0000-0000-000000000001", role: "nope" as never },
        ],
        createdBy: "u-admin",
      }),
    ).rejects.toThrow("Invalid workspace access selection");
  });

  it("persists every selected role once and returns each workspace once", async () => {
    dbState.selectResults = [[], [], [{ id: "w-1" }]];

    const result = await createUserDirectly({
      agencyId: "a-1",
      email: "multi-role@example.com",
      password: "TempPass123",
      grantsAgencyAdmin: true,
      workspaceRoles: [
        {
          workspaceId: "00000000-0000-0000-0000-000000000001",
          roles: ["designer", "publisher", "designer"],
        },
      ],
      createdBy: "u-admin",
    });

    const roleInserts = dbState.insertCalls.filter((call) => {
      const values = call.values as Record<string, unknown>;
      return "workspaceMembershipId" in values;
    });
    expect(roleInserts.map((call) => (call.values as { role: string }).role)).toEqual([
      "designer",
      "publisher",
    ]);
    expect(result.acceptedWorkspaceIds).toEqual(["00000000-0000-0000-0000-000000000001"]);
    expect(
      dbState.insertCalls.find(
        (call) => (call.values as Record<string, unknown>).isAgencyAdmin === true,
      ),
    ).toBeDefined();
  });
});

describe("createUserDirectly — branch coverage for the optional inputs", () => {
  // The default happy-path test passes `password` and `name`. These
  // cases hit the remaining branches so the `src/lib/auth/**`
  // branch-coverage floor holds at 90%.

  it("accepts mustChangePassword=false (the explicit-false branch of `input.mustChangePassword !== false`)", async () => {
    dbState.selectResults = [[], [], []]; // active member, user, no workspace

    const result = await createUserDirectly({
      agencyId: "a-1",
      email: "no-must-change@example.com",
      password: "TempPass123",
      mustChangePassword: false, // <-- the branch under test
      grantsAgencyAdmin: false,
      workspaceRoles: [], // also exercises the `length > 0` false branch
      createdBy: "u-admin",
    });

    expect(result.userId).toBe("u-new");
    // The user row insert records `mustChangePassword: false` so
    // the next sign-in is NOT routed to /set-password.
    const userInsert = dbState.insertCalls[0];
    expect((userInsert?.values as Record<string, unknown>).mustChangePassword).toBe(false);
  });

  it("falls back to the email local-part for displayName when name is omitted", async () => {
    dbState.selectResults = [[], [], []];

    await createUserDirectly({
      agencyId: "a-1",
      email: "no.name@example.com",
      password: "TempPass123",
      // no name — displayName should default to "no.name"
      grantsAgencyAdmin: false,
      workspaceRoles: [],
      createdBy: "u-admin",
    });

    const userInsert = dbState.insertCalls[0];
    const values = userInsert?.values as Record<string, unknown>;
    expect(values?.displayName).toBe("no.name");
    // The `name` column is NOT set when input.name is undefined
    // (the spread `...(input.name ? { name: input.name } : {})`
    // omits the key entirely — Drizzle's `text("name")` is nullable).
    expect("name" in (values ?? {})).toBe(false);
  });
});
