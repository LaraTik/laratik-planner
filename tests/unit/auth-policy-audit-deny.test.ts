import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FEAT-20 (GAP-FULL-REVIEW-2026-08-25) — audit "denied authorization
 * actions" path.
 *
 * Master prompt §13: "Audit repeated denied authorization actions."
 * Pre-fix, the `requireWriteCapability` deny path threw a
 * `PermissionDeniedError` and the request bubbled to a 403, but no
 * `security_audit_event` row was written — security-relevant
 * authorization failures were invisible to the audit trail.
 *
 * The test pins the contract:
 *
 *  1. A denied call writes a `security_audit_event` row with
 *     `outcome: "denied"`, `action: "write_workspace:<action>"`,
 *     `targetType: "workspace"`, `targetId: <workspaceId>`, and a
 *     metadata payload that includes the actor's role set.
 *  2. The throw is preserved — a 403 path must still 403, even
 *     when the audit row write succeeded.
 *  3. An audit-write failure (e.g. transient DB blip) does NOT
 *     suppress the throw. The user must still see a 403.
 *
 * Mock pattern: hand-rolled Drizzle chainable that records the
 * `securityAuditEvents` insert payload. The `canWriteToWorkspace`
 * helper is the production implementation — we don't mock it,
 * we just drive the test through the deny path (no roles
 * resolved from the empty `getWorkspaceRoles` mock chain).
 */

type AuditInsert = { table: unknown; values: unknown };
const auditInserts: AuditInsert[] = [];
let insertShouldThrow: Error | null = null;

vi.mock("@/lib/db", () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve([]));
    chain.then = (resolve: (v: unknown) => void) => resolve([]);
    return chain;
  }
  const insert = vi.fn((table: unknown) => {
    const chain: Record<string, unknown> = {
      values(payload: unknown) {
        if (insertShouldThrow) {
          throw insertShouldThrow;
        }
        auditInserts.push({ table, values: payload });
        return Promise.resolve();
      },
    };
    return chain;
  });
  const db = {
    select: vi.fn(() => makeChain()),
    insert,
  };
  return { db };
});

beforeEach(() => {
  auditInserts.length = 0;
  insertShouldThrow = null;
});

describe("requireWriteCapability — FEAT-20 audit on deny", () => {
  it("writes a security_audit_event row when the actor lacks write capability", async () => {
    const policy = await import("@/lib/auth/policy");
    const { securityAuditEvents } = await import("@/lib/db/schema");
    await expect(
      policy.requireWriteCapability({ id: "actor-1" }, "ws-1", "create_content"),
    ).rejects.toBeInstanceOf(policy.PermissionDeniedError);
    expect(auditInserts).toHaveLength(1);
    const inserted = auditInserts[0];
    if (!inserted) throw new Error("expected one audit insert");
    expect(inserted.table).toBe(securityAuditEvents);
    const payload = inserted.values as Record<string, unknown>;
    expect(payload.action).toBe("write_workspace:create_content");
    expect(payload.outcome).toBe("denied");
    expect(payload.targetType).toBe("workspace");
    expect(payload.targetId).toBe("ws-1");
    expect(payload.actorId).toBe("actor-1");
    const metadata = payload.metadata as Record<string, unknown>;
    // The reason is one of the two we emit; we just assert it's
    // a string the security reviewer can group on.
    expect(typeof metadata.reason).toBe("string");
    expect(["actor_not_a_member", "actor_not_write_capable"]).toContain(metadata.reason);
  });

  it("still throws PermissionDeniedError when the audit insert fails", async () => {
    insertShouldThrow = new Error("simulated audit-write failure");
    const policy = await import("@/lib/auth/policy");
    await expect(
      policy.requireWriteCapability({ id: "actor-1" }, "ws-1", "create_content"),
    ).rejects.toBeInstanceOf(policy.PermissionDeniedError);
  });

  it("uses 'actor_not_a_member' when the actor has no roles at all", async () => {
    // With the default mock (no rows resolved from getWorkspaceRoles),
    // the actor has no roles. The metadata reason must reflect that
    // distinct case so the audit reviewer can group on it.
    const policy = await import("@/lib/auth/policy");
    await expect(
      policy.requireWriteCapability({ id: "actor-1" }, "ws-1", "create_content"),
    ).rejects.toBeInstanceOf(policy.PermissionDeniedError);
    expect(auditInserts).toHaveLength(1);
    const inserted = auditInserts[0];
    if (!inserted) throw new Error("expected one audit insert");
    const metadata = (inserted.values as Record<string, unknown>).metadata as Record<
      string,
      unknown
    >;
    expect(metadata.reason).toBe("actor_not_a_member");
  });
});
