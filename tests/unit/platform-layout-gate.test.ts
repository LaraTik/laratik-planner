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
 *   - `@/lib/auth/platform-admin` so we can flip `requirePlatformAdmin`
 *     between "throws" and "resolves" without seeding the DB.
 *
 * The `auth-policy.test.ts` file is the closest analog and uses the
 * same Drizzle chainable mock. We don't need DB here — the gate does
 * no DB access of its own; `requirePlatformAdmin` does, and we stub
 * that at its module boundary.
 */

const authMock = vi.hoisted(() => vi.fn());
const requirePlatformAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/config", () => ({
  auth: authMock,
}));
vi.mock("@/lib/auth/platform-admin", () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

const { gatePlatformAdmin } = await import("@/lib/auth/platform-admin-gate");

beforeEach(() => {
  authMock.mockReset();
  requirePlatformAdminMock.mockReset();
});

describe("gatePlatformAdmin — session shape", () => {
  it("returns 'forbidden' with reason 'anonymous' when no session is present", async () => {
    authMock.mockResolvedValue(null);
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "anonymous" });
    // Must NOT consult the platform-admin check when there's no actor.
    expect(requirePlatformAdminMock).not.toHaveBeenCalled();
  });

  it("returns 'forbidden' with reason 'anonymous' when the session lacks a user id", async () => {
    authMock.mockResolvedValue({ user: { id: undefined } });
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "anonymous" });
    expect(requirePlatformAdminMock).not.toHaveBeenCalled();
  });
});

describe("gatePlatformAdmin — platform-admin authority", () => {
  it("returns 'ok' with the actor when requirePlatformAdmin resolves", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    requirePlatformAdminMock.mockResolvedValue(undefined);
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "ok", actor: { id: "user-admin" } });
    expect(requirePlatformAdminMock).toHaveBeenCalledWith({ id: "user-admin" });
  });

  it("returns 'forbidden' with reason 'not-platform-admin' when requirePlatformAdmin throws PermissionDeniedError", async () => {
    authMock.mockResolvedValue({ user: { id: "user-not-admin" } });
    requirePlatformAdminMock.mockRejectedValue(
      new PermissionDeniedError("platform-admin-required"),
    );
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "not-platform-admin" });
    expect(requirePlatformAdminMock).toHaveBeenCalledWith({ id: "user-not-admin" });
  });

  it("collapses any thrown error from requirePlatformAdmin into 'not-platform-admin' (defensive)", async () => {
    // A DB error inside `isPlatformAdmin` returns false (it's
    // try/caught there), but `requirePlatformAdmin` could in theory
    // throw something other than PermissionDeniedError if a caller
    // path changes. The gate must not let that propagate — it would
    // surface as a 500 instead of a clean Forbidden.
    authMock.mockResolvedValue({ user: { id: "user-x" } });
    requirePlatformAdminMock.mockRejectedValue(new Error("connection reset"));
    const result = await gatePlatformAdmin();
    expect(result).toEqual({ status: "forbidden", reason: "not-platform-admin" });
  });
});

describe("gatePlatformAdmin — error-vs-no-error invariants", () => {
  it("never throws (always returns a discriminated union)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-y" } });
    requirePlatformAdminMock.mockRejectedValue(
      new PermissionDeniedError("platform-admin-required"),
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
