import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * signOutAction in src/app/(app)/app/account/actions.ts calls
 * `setUser(null)` BEFORE invoking NextAuth's `signOut` so the
 * Sentry user context is cleared even when the redirect throws.
 *
 * The pre-fix code skipped this, so a customer who signed out and
 * then triggered an error on the /signin page (a real flow on
 * password-reset errors) had their events attributed to the user
 * who just left. This test pins the order:
 *   1. setUser(null) runs first
 *   2. signOut() runs second (and throws NEXT_REDIRECT in prod)
 */

const setUserMock = vi.fn();
const signOutMock = vi.fn(() => {
  // Mirrors NextAuth's real behaviour: signOut() throws
  // NEXT_REDIRECT, which the framework turns into a 307. The
  // throw is type `never` so the test sees it as a rejection.
  throw new Error("NEXT_REDIRECT");
});

// Call order: we want to assert setUser ran BEFORE signOut. A
// `vi.mocked` mock is a vi.fn; we record the call order via the
// global sequence counter.
const callOrder: string[] = [];
setUserMock.mockImplementation(() => {
  callOrder.push("setUser(null)");
});
signOutMock.mockImplementation(() => {
  callOrder.push("signOut()");
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/lib/observability/sentry", () => ({
  setUser: setUserMock,
}));

vi.mock("@/lib/auth/config", () => ({
  signOut: signOutMock,
  auth: vi.fn(),
}));

// The action also imports a handful of unrelated helpers
// (revalidatePath, changeOwnPassword, …). Mock the whole module
// surface so the import succeeds and we only need to assert what
// we care about.
vi.mock("@/lib/auth/profile", () => ({
  changeOwnPassword: vi.fn(),
  getPasswordState: vi.fn(),
  updateOwnProfile: vi.fn(),
}));
vi.mock("@/lib/notifications/service", () => ({
  setNotificationPreferencesForUser: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { signOutAction } = await import("@/app/(app)/app/account/actions");

beforeEach(() => {
  setUserMock.mockClear();
  signOutMock.mockClear();
  callOrder.length = 0;
});

describe("signOutAction", () => {
  it("clears the Sentry user context before invoking NextAuth's signOut", async () => {
    // The action throws NEXT_REDIRECT (mirroring prod). The test
    // catches and asserts the call order from the side-effect
    // log instead of the throw.
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(setUserMock).toHaveBeenCalledTimes(1);
    expect(setUserMock).toHaveBeenCalledWith(null);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/signin" });
    // The order is the real assertion: setUser must run BEFORE
    // signOut so the Sentry context is cleared even when the
    // redirect aborts the function.
    expect(callOrder).toEqual(["setUser(null)", "signOut()"]);
  });
});
