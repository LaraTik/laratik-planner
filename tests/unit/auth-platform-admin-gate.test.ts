import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * TEST-09 (platform-admin-gate) — direct unit coverage of
 * `src/lib/auth/platform-admin-gate.ts`.
 *
 * The audit (`tmp/full-review/test-gaps.md`, finding TEST-09) called
 * out that the platform-admin gate helper is referenced by name in
 * existing tests but never directly covered. The helper bridges
 * NextAuth's session to the platform permission DAL and returns a
 * discriminated union the layout renders against.
 *
 * Mock pattern: mock `@/lib/auth/config` (the session) and
 * `@/lib/auth/platform-access` (the permission DAL).
 *
 * Branches:
 *   1. anonymous session → { status: "forbidden", reason: "anonymous" }
 *   2. signed-in but not a platform admin → "not-platform-admin"
 *   3. signed-in platform admin → { status: "ok", principal }
 */

const authMock = vi.hoisted(() => vi.fn());
const requirePlatformPermissionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/config", () => ({
  auth: authMock,
}));

vi.mock("@/lib/auth/platform-access", () => ({
  requirePlatformPermission: requirePlatformPermissionMock,
}));

const { gatePlatformAdmin } = await import("@/lib/auth/platform-admin-gate");

class PermissionDeniedError extends Error {
  constructor() {
    super("not allowed");
    this.name = "PermissionDeniedError";
  }
}

beforeEach(() => {
  authMock.mockReset();
  requirePlatformPermissionMock.mockReset();
});

describe("gatePlatformAdmin", () => {
  it("returns 'forbidden / anonymous' when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "anonymous" });
    // The permission DAL must NOT have been called.
    expect(requirePlatformPermissionMock).not.toHaveBeenCalled();
  });

  it("returns 'forbidden / anonymous' when the session has no user.id", async () => {
    authMock.mockResolvedValue({});
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "anonymous" });
    expect(requirePlatformPermissionMock).not.toHaveBeenCalled();
  });

  it("returns 'forbidden / not-platform-admin' when the permission DAL throws", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    requirePlatformPermissionMock.mockRejectedValue(new PermissionDeniedError());
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "not-platform-admin" });
  });

  it("returns 'forbidden / not-platform-admin' when the permission DAL throws a non-PermissionDeniedError", async () => {
    // Defensive: any throw from the DAL is collapsed into the
    // "not-platform-admin" reason. The gate is the single
    // security boundary; we must never leak the underlying error.
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    requirePlatformPermissionMock.mockRejectedValue(new Error("DB down"));
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "not-platform-admin" });
  });

  it("returns 'ok' with the principal for an active platform admin", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const principal = {
      actor: { id: "user-1" },
      role: "platform_owner" as const,
      permissions: new Set(["platform.console.read", "platform.agency.read"] as const),
    };
    requirePlatformPermissionMock.mockResolvedValue(principal);
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "ok", principal });
  });

  it("passes the actor + the exact 'platform.console.read' permission to the DAL", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const principal = {
      actor: { id: "user-1" },
      role: "platform_owner" as const,
      permissions: new Set(["platform.console.read"] as const),
    };
    requirePlatformPermissionMock.mockResolvedValue(principal);
    await gatePlatformAdmin();
    expect(requirePlatformPermissionMock).toHaveBeenCalledWith(
      { id: "user-1" },
      "platform.console.read",
    );
  });
});
