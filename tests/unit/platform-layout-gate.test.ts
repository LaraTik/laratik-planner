import { describe, expect, it, vi, beforeEach } from "vitest";
import { PermissionDeniedError } from "@/lib/auth/policy";

/**
 * Platform-admin route gate (M1.8) — unit coverage of the
 * discriminated-union shape returned by `gatePlatformAdmin()`.
 *
 * The gate is the only piece of authorization logic in the
 * `/app/platform/*` tree that does NOT live inside a React component,
 * which makes it the unit-testable seam. The layout just renders the
 * result; the platform-admin check is exercised here, in isolation.
 *
 * We mock:
 *   - `@/lib/auth/config` so we can return any session shape (anon,
 *     signed-in, or arbitrary user id).
 *   - `@/lib/auth/platform-access` so we can flip the exact
 *     `platform.console.read` permission without seeding the DB.
 *
 * The `auth-policy.test.ts` file is the closest analog and uses the
 * same Drizzle chainable mock. We don't need DB here — the gate does
 * no DB access of its own; `requirePlatformAdmin` does, and we stub
 * that at its module boundary.
 */

const authMock = vi.hoisted(() => vi.fn());
const requirePlatformPermissionMock = vi.hoisted(() => vi.fn());
const legacyRequirePlatformAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/config", () => ({
  auth: authMock,
}));
vi.mock("@/lib/auth/platform-access", () => ({
  requirePlatformPermission: requirePlatformPermissionMock,
}));
vi.mock("@/lib/auth/platform-admin", () => ({
  requirePlatformAdmin: legacyRequirePlatformAdminMock,
}));

const { gatePlatformAdmin } = await import("@/lib/auth/platform-admin-gate");

beforeEach(() => {
  authMock.mockReset();
  requirePlatformPermissionMock.mockReset();
  legacyRequirePlatformAdminMock.mockReset();
});

describe("gatePlatformAdmin — session shape", () => {
  it("returns 'forbidden' with reason 'anonymous' when no session is present", async () => {
    authMock.mockResolvedValue(null);
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "anonymous" });
    // Must NOT consult the platform-admin check when there's no actor.
    expect(requirePlatformPermissionMock).not.toHaveBeenCalled();
  });

  it("returns 'forbidden' with reason 'anonymous' when the session lacks a user id", async () => {
    authMock.mockResolvedValue({ user: { id: undefined } });
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "anonymous" });
    expect(requirePlatformPermissionMock).not.toHaveBeenCalled();
  });
});

describe("gatePlatformAdmin — platform authority", () => {
  it("returns 'ok' with the principal when the console permission resolves", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    const principal = {
      actor: { id: "user-admin" },
      role: "platform_owner",
      permissions: new Set(["platform.console.read"]),
    };
    requirePlatformPermissionMock.mockResolvedValue(principal);
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "ok", principal });
    expect(requirePlatformPermissionMock).toHaveBeenCalledWith(
      { id: "user-admin" },
      "platform.console.read",
    );
    expect(legacyRequirePlatformAdminMock).not.toHaveBeenCalled();
  });

  it("returns 'forbidden' with reason 'not-platform-admin' when the permission check throws", async () => {
    authMock.mockResolvedValue({ user: { id: "user-not-admin" } });
    requirePlatformPermissionMock.mockRejectedValue(
      new PermissionDeniedError("platform-permission:platform.console.read"),
    );
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "not-platform-admin" });
    expect(requirePlatformPermissionMock).toHaveBeenCalledWith(
      { id: "user-not-admin" },
      "platform.console.read",
    );
  });

  it("collapses any thrown permission error into 'not-platform-admin' (defensive)", async () => {
    // A DB error inside `isPlatformAdmin` returns false (it's
    // try/caught there), but `requirePlatformAdmin` could in theory
    // throw something other than PermissionDeniedError if a caller
    // path changes. The gate must not let that propagate — it would
    // surface as a 500 instead of a clean Forbidden.
    authMock.mockResolvedValue({ user: { id: "user-x" } });
    requirePlatformPermissionMock.mockRejectedValue(new Error("connection reset"));
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "not-platform-admin" });
  });
});

describe("gatePlatformAdmin — error-vs-no-error invariants", () => {
  it("never throws (always returns a discriminated union)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-y" } });
    requirePlatformPermissionMock.mockRejectedValue(
      new PermissionDeniedError("platform-permission:platform.console.read"),
    );
    await expect(gatePlatformAdmin()).resolves.toBeDefined();
  });

  it("returns the same 'forbidden' shape whether auth() is null or session.user.id is missing", async () => {
    authMock.mockResolvedValueOnce(null);
    const r1 = await gatePlatformAdmin();
    authMock.mockResolvedValueOnce({ user: {} });
    const r2 = await gatePlatformAdmin();
    expect(r1).toEqual({ status: "forbidden", reason: "anonymous" });
    expect(r2).toEqual({ status: "forbidden", reason: "anonymous" });
  });
});
